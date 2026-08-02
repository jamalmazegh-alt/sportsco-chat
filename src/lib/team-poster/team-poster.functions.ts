/**
 * Server-side PDF generation for the "Join our team" QR poster.
 *
 * Authorization model: the caller must be a club admin of the target club.
 * The client also computes the invite URL, but we trust nothing — we re-derive
 * (or re-use) a `club_invites` row with role='player' for the given club/team, and
 * build the URL ourselves to prevent injection of arbitrary URLs into the
 * generated PDF (which would otherwise let an admin print a poster pointing
 * to anywhere).
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const InputSchema = z.object({
  clubId: z.string().uuid(),
  teamId: z.string().uuid().optional(),
  teamName: z.string().min(1).max(120),
  lang: z.string().min(2).max(8).optional(),
});

export const generateTeamPoster = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { clubId, teamId, teamName } = data;

    // 1. Authorize: caller must be admin of the club.
    const { data: membership, error: memberErr } = await supabase
      .from("club_members")
      .select("role")
      .eq("user_id", userId)
      .eq("club_id", clubId)
      .maybeSingle();
    if (memberErr) throw new Error(memberErr.message);
    if (!membership || membership.role !== "admin") {
      throw new Error("Forbidden");
    }

    // 2. Team-scoped posters must point at a team that belongs to this club —
    //    otherwise a crafted teamId could mint an invite for another club's team.
    if (teamId) {
      const { data: team, error: teamErr } = await supabase
        .from("teams")
        .select("id")
        .eq("id", teamId)
        .eq("club_id", clubId)
        .maybeSingle();
      if (teamErr) throw new Error(teamErr.message);
      if (!team) throw new Error("Team not found");
    }

    // 3. Reuse or create a player invite scoped like the share dialog: same team
    //    (or explicitly club-wide when teamId is omitted). Reusing a club-wide
    //    token for a team poster would drop the team link on redeem.
    let query = supabase
      .from("club_invites")
      .select("token, expires_at, max_uses, uses_count")
      .eq("club_id", clubId)
      .eq("role", "player");
    query = teamId ? query.eq("team_id", teamId) : query.is("team_id", null);
    const { data: existing, error: existingErr } = await query
      .order("created_at", { ascending: false })
      .limit(1);
    if (existingErr) throw new Error(existingErr.message);

    let token: string | undefined = existing?.[0]?.token as string | undefined;
    const row = existing?.[0];
    const expired = !!row?.expires_at && new Date(row.expires_at).getTime() < Date.now();
    const usedUp = row?.max_uses != null && (row.uses_count ?? 0) >= (row.max_uses ?? 0);
    if (!token || expired || usedUp) {
      token = (crypto.randomUUID() + crypto.randomUUID()).replace(/-/g, "");
      const { error } = await supabase.from("club_invites").insert({
        club_id: clubId,
        team_id: teamId ?? null,
        role: "player",
        token,
        created_by: userId,
      });
      if (error) throw new Error(error.message);
    }

    // 4. Fetch club display data (name + logo) — admin RLS lets this through.
    const { data: club } = await supabase
      .from("clubs")
      .select("name, logo_url")
      .eq("id", clubId)
      .maybeSingle();

    // 5. Build PDF.
    const { buildTeamPosterPdf, posterFilename, pickPosterLang } =
      await import("./team-poster.server");
    const inviteUrl = `https://clubero.app/register?invite=${encodeURIComponent(token!)}`;
    const bytes = await buildTeamPosterPdf({
      inviteUrl,
      teamName,
      clubName: club?.name ?? null,
      clubLogoUrl: club?.logo_url ?? null,
      lang: pickPosterLang(data.lang),
    });

    // 6. Base64 transport.
    let bin = "";
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    const base64 = btoa(bin);
    return { base64, filename: posterFilename(teamName) };
  });
