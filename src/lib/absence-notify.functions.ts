import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const InputSchema = z.object({
  availabilityId: z.string().uuid(),
});

const REASON_LABELS: Record<string, Record<string, string>> = {
  fr: { vacation: "Vacances", injury: "Blessure", school: "École", family: "Famille", work: "Travail", other: "Autre" },
  en: { vacation: "Vacation", injury: "Injury", school: "School", family: "Family", work: "Work", other: "Other" },
  es: { vacation: "Vacaciones", injury: "Lesión", school: "Escuela", family: "Familia", work: "Trabajo", other: "Otro" },
  de: { vacation: "Urlaub", injury: "Verletzung", school: "Schule", family: "Familie", work: "Arbeit", other: "Andere" },
  it: { vacation: "Vacanze", injury: "Infortunio", school: "Scuola", family: "Famiglia", work: "Lavoro", other: "Altro" },
  nl: { vacation: "Vakantie", injury: "Blessure", school: "School", family: "Familie", work: "Werk", other: "Overig" },
  pt: { vacation: "Férias", injury: "Lesão", school: "Escola", family: "Família", work: "Trabalho", other: "Outro" },
};

const SUPPORTED = new Set(["fr", "en", "es", "de", "it", "nl", "pt"]);
const resolveLocale = (...c: Array<string | null | undefined>) => {
  for (const x of c) {
    const v = (x ?? "").toLowerCase().slice(0, 2);
    if (SUPPORTED.has(v)) return v;
  }
  return "fr";
};

/**
 * Notify coaches of a player's team that an absence has been declared.
 * Sends in-app notifications + email in each coach's preferred language.
 * Caller (the user declaring) is excluded from recipients.
 */
export const notifyCoachesOfAbsence = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => InputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { availabilityId } = data;
    const { userId } = context;

    const { data: avail } = await supabaseAdmin
      .from("player_availabilities")
      .select(
        "id, player_id, start_date, end_date, reason, players:player_id(first_name, last_name)",
      )
      .eq("id", availabilityId)
      .single();
    if (!avail) return { sent: 0 };

    const player: any = avail.players ?? {};
    const playerName =
      `${player.first_name ?? ""} ${player.last_name ?? ""}`.trim() || "Un joueur";

    // Permission/relationship sanity-check: caller must be linked to the player
    const { data: canDeclare } = await supabaseAdmin.rpc("can_respond_for_player", {
      _user_id: userId,
      _player_id: avail.player_id,
    });
    if (!canDeclare) throw new Error("Forbidden");

    // Declarer's name (profile)
    const { data: declarer } = await supabaseAdmin
      .from("profiles")
      .select("first_name, full_name")
      .eq("id", userId)
      .maybeSingle();
    const declaredByName =
      (declarer as any)?.first_name ||
      ((declarer as any)?.full_name?.split(" ")[0] ?? null) ||
      null;

    // Find teams of the player
    const { data: tm } = await supabaseAdmin
      .from("team_members")
      .select("team_id, teams:team_id(clubs:club_id(default_language))")
      .eq("player_id", avail.player_id)
      .eq("role", "player");
    const teamIds = Array.from(new Set((tm ?? []).map((r: any) => r.team_id))).filter(Boolean);
    if (teamIds.length === 0) return { sent: 0 };
    const clubDefaultLang =
      (tm ?? []).map((r: any) => r?.teams?.clubs?.default_language).find(Boolean) ?? null;

    // Coaches/admins
    const { data: coaches } = await supabaseAdmin
      .from("team_members")
      .select("user_id")
      .in("team_id", teamIds)
      .in("role", ["coach", "assistant_coach", "admin"] as any);
    const coachIds = Array.from(
      new Set(
        (coaches ?? [])
          .map((c: any) => c.user_id)
          .filter((u: string | null) => u && u !== userId),
      ),
    );
    if (coachIds.length === 0) return { sent: 0 };

    const { data: profs } = await supabaseAdmin
      .from("profiles")
      .select("id, first_name, notifications_email, preferred_language")
      .in("id", coachIds);

    const baseUrl = process.env.SITE_URL || "https://app.clubero.app";
    let sent = 0;
    for (const p of profs ?? []) {
      if ((p as any).notifications_email === false) continue;
      const { data: u } = await supabaseAdmin.auth.admin.getUserById((p as any).id);
      const email = u?.user?.email;
      if (!email) continue;

      const locale = resolveLocale((p as any).preferred_language, clubDefaultLang);
      const bcp = locale === "en" ? "en-GB" : `${locale}-${locale.toUpperCase()}`;
      const fmt = (d: string) => {
        try {
          return new Date(`${d}T00:00:00`).toLocaleDateString(bcp, {
            weekday: "long",
            day: "numeric",
            month: "long",
          });
        } catch {
          return d;
        }
      };
      const reasonLabel =
        REASON_LABELS[locale]?.[avail.reason as string] ??
        REASON_LABELS.fr[avail.reason as string] ??
        (avail.reason as string);

      try {
        await fetch(`${baseUrl}/lovable/email/transactional/send`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
          },
          body: JSON.stringify({
            templateName: "absence-declared",
            recipientEmail: email,
            idempotencyKey: `absence-${availabilityId}-${p.id}`,
            templateData: {
              coachFirstName: (p as any).first_name ?? null,
              playerName,
              startDate: fmt(avail.start_date as string),
              endDate: fmt(avail.end_date as string),
              reasonLabel,
              declaredByName,
              eventUrl: `${baseUrl}/players/${avail.player_id}`,
              locale,
            },
          }),
        });
        sent += 1;
      } catch {
        // best-effort
      }
    }
    return { sent };
  });
