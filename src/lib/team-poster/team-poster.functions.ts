/**
 * Server-side PDF generation for the "Join our team" QR poster.
 *
 * Authorization model: the caller must be a club admin of the target club.
 * The client also computes the invite URL, but we trust nothing — we re-derive
 * (or re-use) a `club_invites` row with role='player' for the given club, and
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
    const { clubId, teamName } = data;

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

    // 2. Reuse or create a player invite for the club (same logic as the share
    //    dialog — kept here to NOT trust a client-supplied URL).
    const { data: existing } = await supabase
      .from("club_invites")
      .select("token, expires_at, max_uses, uses_count")
      .eq("club_id", clubId)
      .eq("role", "player")
      .order("created_at", { ascending: false })
      .limit(1);

    let token: string | undefined = existing?.[0]?.token as string | undefined;
    const row = existing?.[0];
    const expired = !!row?.expires_at && new Date(row.expires_at).getTime() < Date.now();
    const usedUp = row?.max_uses != null && (row.uses_count ?? 0) >= (row.max_uses ?? 0);
    if (!token || expired || usedUp) {
      token = (crypto.randomUUID() + crypto.randomUUID()).replace(/-/g, "");
      const { error } = await supabase.from("club_invites").insert({
        club_id: clubId,
        role: "player",
        token,
        created_by: userId,
      });
      if (error) throw new Error(error.message);
    }

    // 3. Fetch club display data (name + logo) — admin RLS lets this through.
    const { data: club } = await supabase
      .from("clubs")
      .select("name, logo_url")
      .eq("id", clubId)
      .maybeSingle();

    // 4. Build PDF.
    const { buildTeamPosterPdf, posterFilename, pickPosterLang } = await import(
      "./team-poster.server"
    );
    const inviteUrl = `https://clubero.app/register?invite=${encodeURIComponent(token!)}`;
    const bytes = await buildTeamPosterPdf({
      inviteUrl,
      teamName,
      clubName: club?.name ?? null,
      clubLogoUrl: club?.logo_url ?? null,
      lang: pickPosterLang(data.lang),
    });

    // 5. Base64 transport.
    let bin = "";
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    const base64 = btoa(bin);
    return { base64, filename: posterFilename(teamName) };
  });
