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

/**
 * Public: confirm an invited user's email right after signup.
 *
 * Receiving + clicking the invite link is proof of email ownership, so we
 * flip `email_confirmed_at` only when the token matches a still-valid invite
 * for that exact email.
 */
export const confirmInvitedUserEmail = createServerFn({ method: "POST" })
  .inputValidator((input: { token: string; email: string }) =>
    z
      .object({ token: z.string().min(1), email: z.string().email() })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const token = data.token.trim();
    const email = data.email.trim().toLowerCase();

    // Only member invites with an email bound to them can confirm an email.
    // Club invites are link-based (anyone with the link) and are NOT proof
    // of email ownership — those must go through Supabase's standard
    // email-confirmation flow.
    const { data: memberRows } = await supabaseAdmin.rpc(
      "get_member_invite_info",
      { _token: token },
    );
    const member = Array.isArray(memberRows) ? memberRows[0] : null;
    const ok =
      !!member &&
      !member.used &&
      !member.expired &&
      !!member.email &&
      member.email.toLowerCase() === email;

    if (!ok) throw new Response("Invalid invite", { status: 400 });

    // Paginate through users to find the exact email match (avoids the
    // silent 200-user cap of a single listUsers page).
    let user: { id: string; email_confirmed_at: string | null } | null = null;
    for (let page = 1; page <= 50 && !user; page++) {
      const { data: userList, error: listErr } =
        await supabaseAdmin.auth.admin.listUsers({ page, perPage: 200 });
      if (listErr) throw new Response(listErr.message, { status: 500 });
      const found = userList.users.find(
        (u) => (u.email ?? "").toLowerCase() === email,
      );
      if (found) user = found as typeof user;
      if (userList.users.length < 200) break;
    }
    if (!user) throw new Response("User not found", { status: 404 });
    if (!user.email_confirmed_at) {
      const { error: updErr } = await supabaseAdmin.auth.admin.updateUserById(
        user.id,
        { email_confirm: true },
      );
      if (updErr) throw new Response(updErr.message, { status: 500 });
    }
    return { ok: true };
  });
