/**
 * Signalement d'un membre du club (en complément du signalement de contenu).
 *
 * - `reportUser` : tout membre du club peut signaler un autre membre du même
 *   club (jamais soi-même — contrainte DB). Insert via `context.supabase`
 *   (RLS), puis fan-out notification / push / e-mail vers les admins +
 *   dirigeants du club, en excluant le signaleur ET la personne visée (un
 *   responsable n'est pas notifié de son propre signalement).
 * - `listUserReports` / `resolveUserReport` : réservés aux admins/dirigeants.
 *   Aucune action automatique : les responsables agissent via les outils
 *   existants (masquer/supprimer des contenus, retirer le membre du club).
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { WALL_REPORT_REASONS, type WallReportReason } from "@/lib/wall/moderation.functions";
import { pickModeratorIds } from "@/lib/moderation-helpers";

const ReportSchema = z.object({
  clubId: z.string().uuid(),
  reportedUserId: z.string().uuid(),
  reason: z.enum(WALL_REPORT_REASONS),
  details: z.string().trim().max(500).optional(),
});

const ListSchema = z.object({
  clubId: z.string().uuid(),
  status: z.enum(["pending", "reviewing", "dismissed", "actioned", "all"]).default("pending"),
});

const ResolveSchema = z.object({
  reportId: z.string().uuid(),
  action: z.enum(["dismiss", "reviewing", "actioned"]),
  note: z.string().trim().max(500).optional(),
});

const REASON_LABELS: Record<string, Record<WallReportReason, string>> = {
  fr: {
    inappropriate: "Comportement inapproprié",
    harassment: "Harcèlement",
    spam: "Spam",
    misinformation: "Désinformation",
    privacy: "Atteinte à la vie privée",
    other: "Autre",
  },
  en: {
    inappropriate: "Inappropriate behaviour",
    harassment: "Harassment",
    spam: "Spam",
    misinformation: "Misinformation",
    privacy: "Privacy issue",
    other: "Other",
  },
};

const PUSH_I18N: Record<string, { title: string; body: (r: string, m: string) => string }> = {
  fr: { title: "🚩 Membre signalé", body: (r, m) => `${r} a signalé un membre — ${m}` },
  en: { title: "🚩 Member reported", body: (r, m) => `${r} reported a member — ${m}` },
};

function displayName(
  p: {
    first_name?: string | null;
    last_name?: string | null;
    full_name?: string | null;
  } | null,
): string {
  return (
    [p?.first_name, p?.last_name].filter(Boolean).join(" ").trim() || p?.full_name || "Un membre"
  );
}

export const reportUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => ReportSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (data.reportedUserId === userId) throw new Error("cannot_report_self");

    // Insert via la session de l'appelant : la RLS garantit qu'il est membre
    // du club et que la personne visée l'est aussi.
    const { error: insertErr } = await supabase.from("user_reports").insert({
      club_id: data.clubId,
      reported_user_id: data.reportedUserId,
      reporter_user_id: userId,
      reason: data.reason,
      details: data.details || null,
    } as never);
    if (insertErr) {
      if (insertErr.code === "23505") return { ok: true, duplicate: true as const, notified: 0 };
      throw new Error(insertErr.message);
    }

    // ---- Fan-out vers les modérateurs (best-effort) -------------------------
    let notified = 0;
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { sendPushToUser } = await import("@/lib/push-send.server");
      const { enqueueTransactionalEmailServer } = await import("@/lib/email/send.server");

      const [{ data: reporter }, { data: reported }, { data: club }, { data: mods }] =
        await Promise.all([
          supabaseAdmin
            .from("profiles")
            .select("first_name, last_name, full_name")
            .eq("id", userId)
            .maybeSingle(),
          supabaseAdmin
            .from("profiles")
            .select("first_name, last_name, full_name")
            .eq("id", data.reportedUserId)
            .maybeSingle(),
          supabaseAdmin
            .from("clubs")
            .select("name, default_language")
            .eq("id", data.clubId)
            .maybeSingle(),
          supabaseAdmin
            .from("club_members")
            .select("user_id, role, roles")
            .eq("club_id", data.clubId),
        ]);

      const reporterName = displayName(reporter as never);
      const reportedName = displayName(reported as never);
      const clubName = (club as { name?: string | null } | null)?.name ?? null;
      const clubLang = (club as { default_language?: string | null } | null)?.default_language;

      // Exclut le signaleur et la personne visée du fan-out.
      const modIds = pickModeratorIds((mods ?? []) as never, [userId, data.reportedUserId]);
      if (modIds.length === 0) return { ok: true, notified: 0 };

      const { data: profs } = await supabaseAdmin
        .from("profiles")
        .select("id, first_name, preferred_language, notifications_push, notifications_email")
        .in("id", modIds);
      const profById = new Map(
        ((profs ?? []) as Array<Record<string, unknown>>).map((p) => [p.id as string, p]),
      );

      const link = "/admin/moderation";
      const baseUrl = process.env.SITE_URL || "https://www.clubero.app";

      for (const uid of modIds) {
        const prof = profById.get(uid) ?? {};
        const lang = ((prof.preferred_language as string) || clubLang || "fr").slice(0, 2);
        const i18n = PUSH_I18N[lang] ?? PUSH_I18N.fr;
        const label = (REASON_LABELS[lang === "fr" ? "fr" : "en"] ?? REASON_LABELS.fr)[data.reason];
        const bodyText = i18n.body(reporterName, label);

        await supabaseAdmin.from("notifications").insert({
          user_id: uid,
          type: "user_report",
          title: i18n.title,
          body: bodyText,
          link,
        } as never);
        notified += 1;

        if (prof.notifications_push !== false) {
          await sendPushToUser(uid, {
            title: i18n.title,
            body: bodyText,
            url: `${link}?from=push`,
            tag: `user-report-${data.reportedUserId}`,
          }).catch(() => ({ sent: 0, pruned: 0 }));
        }

        if (prof.notifications_email !== false) {
          const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(uid);
          const email = authUser?.user?.email;
          if (email) {
            await enqueueTransactionalEmailServer({
              templateName: "user-reported",
              recipientEmail: email,
              idempotencyKey: `user-report-${data.clubId}-${data.reportedUserId}-${userId}-${uid}`,
              recipientId: uid,
              notificationType: "user_report",
              fromName: clubName ? `${clubName} via Clubero` : undefined,
              templateData: {
                moderatorFirstName: (prof.first_name as string) ?? undefined,
                reporterName,
                reportedName,
                reasonLabel: label,
                details: data.details || null,
                moderationUrl: `${baseUrl}${link}`,
                locale: lang,
              },
            }).catch(() => undefined);
          }
        }
      }
    } catch (e) {
      console.error("[user-report] fan-out failed", (e as Error).message);
    }

    return { ok: true, notified };
  });

export const listUserReports = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => ListSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { assertClubRole } = await import("@/lib/authz.server");
    await assertClubRole({
      supabase: context.supabase,
      userId: context.userId,
      clubId: data.clubId,
      allowedRoles: ["admin", "dirigeant"],
    });
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let q = supabaseAdmin
      .from("user_reports")
      .select(
        "id, reported_user_id, reporter_user_id, reason, details, status, resolution_note, reviewed_at, created_at",
      )
      .eq("club_id", data.clubId)
      .order("created_at", { ascending: false })
      .limit(200);
    if (data.status !== "all") q = q.eq("status", data.status);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    const reports = (rows ?? []) as Array<{
      id: string;
      reported_user_id: string;
      reporter_user_id: string;
      reason: WallReportReason;
      details: string | null;
      status: string;
      resolution_note: string | null;
      reviewed_at: string | null;
      created_at: string;
    }>;
    if (reports.length === 0) return { reports: [] };

    const userIds = Array.from(
      new Set(reports.flatMap((r) => [r.reported_user_id, r.reporter_user_id])),
    );
    const { data: profs } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name, first_name, last_name")
      .in("id", userIds);
    const nameById = new Map(
      ((profs ?? []) as Array<Record<string, unknown>>).map((p) => [
        p.id as string,
        displayName(p as never),
      ]),
    );

    return {
      reports: reports.map((r) => ({
        ...r,
        reportedName: nameById.get(r.reported_user_id) ?? "—",
        reporterName: nameById.get(r.reporter_user_id) ?? "—",
      })),
    };
  });

export const resolveUserReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => ResolveSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: report } = await supabaseAdmin
      .from("user_reports")
      .select("id, club_id, reported_user_id")
      .eq("id", data.reportId)
      .maybeSingle();
    if (!report) throw new Error("not_found");
    const rep = report as { club_id: string; reported_user_id: string };

    const { assertClubRole } = await import("@/lib/authz.server");
    await assertClubRole({
      supabase: context.supabase,
      userId: context.userId,
      clubId: rep.club_id,
      allowedRoles: ["admin", "dirigeant"],
    });

    const status =
      data.action === "dismiss"
        ? "dismissed"
        : data.action === "reviewing"
          ? "reviewing"
          : "actioned";

    const { error } = await supabaseAdmin
      .from("user_reports")
      .update({
        status,
        reviewed_by: context.userId,
        reviewed_at: new Date().toISOString(),
        resolution_note: data.note || null,
      } as never)
      .eq("id", data.reportId);
    if (error) throw new Error(error.message);

    try {
      await supabaseAdmin.from("audit_logs").insert({
        user_id: context.userId,
        action: `user.moderation.${data.action}`,
        entity_type: "user_report",
        entity_id: data.reportId,
        metadata: {
          club_id: rep.club_id,
          reported_user_id: rep.reported_user_id,
          note: data.note ?? null,
        },
      } as never);
    } catch {
      /* best-effort */
    }

    return { ok: true, status };
  });
