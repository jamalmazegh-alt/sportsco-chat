import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type InviteValidationResult =
  | { valid: false; reason: "invalid" | "expired" | "used" }
  | {
      valid: true;
      source: "member";
      kind: string;
      email: string | null;
      suggestedFirstName: string | null;
      suggestedLastName: string | null;
    }
  | { valid: true; source: "club"; role: string };

/** Public: validate an invite token before showing the signup form. */
export const validateInviteToken = createServerFn({ method: "POST" })
  .inputValidator((input: { token: string }) =>
    z.object({ token: z.string().min(1) }).parse(input)
  )
  .handler(async ({ data }): Promise<InviteValidationResult> => {
    const token = data.token.trim();

    const { data: memberRows, error: memberErr } = await supabaseAdmin.rpc(
      "get_member_invite_info",
      { _token: token }
    );
    if (memberErr) throw new Response(memberErr.message, { status: 500 });

    const member = Array.isArray(memberRows) ? memberRows[0] : null;
    if (member) {
      if (member.used) return { valid: false, reason: "used" };
      if (member.expired) return { valid: false, reason: "expired" };
      return {
        valid: true,
        source: "member",
        kind: member.kind ?? "member",
        email: member.email ?? null,
        suggestedFirstName: member.suggested_first_name ?? null,
        suggestedLastName: member.suggested_last_name ?? null,
      };
    }

    const { data: clubInvite, error: clubErr } = await supabaseAdmin
      .from("club_invites")
      .select("role, expires_at, max_uses, uses_count")
      .eq("token", token)
      .maybeSingle();
    if (clubErr) throw new Response(clubErr.message, { status: 500 });

    if (clubInvite) {
      const expired =
        !!clubInvite.expires_at &&
        new Date(clubInvite.expires_at).getTime() < Date.now();
      const exhausted =
        clubInvite.max_uses != null &&
        clubInvite.uses_count >= clubInvite.max_uses;
      if (expired) return { valid: false, reason: "expired" };
      if (exhausted) return { valid: false, reason: "used" };
      return { valid: true, source: "club", role: clubInvite.role };
    }

    return { valid: false, reason: "invalid" };
  });
