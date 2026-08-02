import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { inviteMatchesEmail, isEmailAlreadyExistsError } from "@/lib/invite-signup";
import { findUserByEmail } from "@/lib/invite.server";

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
  | {
      valid: true;
      source: "club";
      role: string;
      teamId: string | null;
      teamName: string | null;
      teamAgeGroup: string | null;
    };

/** Public: validate an invite token before showing the signup form. */
export const validateInviteToken = createServerFn({ method: "POST" })
  .inputValidator((input: { token: string }) => z.object({ token: z.string().min(1) }).parse(input))
  .handler(async ({ data }): Promise<InviteValidationResult> => {
    const token = data.token.trim();

    const { data: memberRows, error: memberErr } = await supabaseAdmin.rpc(
      "get_member_invite_info",
      { _token: token },
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
      .select("role, expires_at, max_uses, uses_count, team_id")
      .eq("token", token)
      .maybeSingle();
    if (clubErr) throw new Response(clubErr.message, { status: 500 });

    if (clubInvite) {
      const expired =
        !!clubInvite.expires_at && new Date(clubInvite.expires_at).getTime() < Date.now();
      const exhausted = clubInvite.max_uses != null && clubInvite.uses_count >= clubInvite.max_uses;
      if (expired) return { valid: false, reason: "expired" };
      if (exhausted) return { valid: false, reason: "used" };
      const teamId = (clubInvite as { team_id?: string | null }).team_id ?? null;
      let teamName: string | null = null;
      if (teamId) {
        const { data: team } = await supabaseAdmin
          .from("teams")
          .select("name")
          .eq("id", teamId)
          .maybeSingle();
        teamName = team?.name ?? null;
      }
      return { valid: true, source: "club", role: clubInvite.role, teamId, teamName };
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
    z.object({ token: z.string().min(1), email: z.string().email() }).parse(input),
  )
  .handler(async ({ data }) => {
    const token = data.token.trim();
    const email = data.email.trim().toLowerCase();

    // Only member invites with an email bound to them can confirm an email.
    // Club invites are link-based (anyone with the link) and are NOT proof
    // of email ownership — those must go through Supabase's standard
    // email-confirmation flow.
    const { data: memberRows } = await supabaseAdmin.rpc("get_member_invite_info", {
      _token: token,
    });
    const member = Array.isArray(memberRows) ? memberRows[0] : null;
    const ok =
      !!member &&
      !member.used &&
      !member.expired &&
      !!member.email &&
      member.email.toLowerCase() === email;

    if (!ok) throw new Response("Invalid invite", { status: 400 });

    const user = await findUserByEmail(email);
    if (!user) throw new Response("User not found", { status: 404 });

    if (!user.email_confirmed_at) {
      const { error: updErr } = await supabaseAdmin.auth.admin.updateUserById(user.id, {
        email_confirm: true,
      });
      if (updErr) throw new Response(updErr.message, { status: 500 });
    }
    return { ok: true };
  });

/**
 * Public: create an account for a NOMINATIVE (email-bound) invitation.
 *
 * The invite e-mail was delivered to one exact address, so opening its link is
 * already proof of ownership. We therefore create the user server-side with
 * `email_confirm: true`, which means Supabase never sends a (redundant)
 * verification e-mail. The client then signs in with the password the user
 * just chose.
 *
 * Security: the account is only created when the token is still valid AND
 * bound to exactly the requested e-mail (see `inviteMatchesEmail`). Without
 * that check anyone could mint a pre-confirmed account for an arbitrary
 * address.
 *
 * Idempotence: if the address already has an account (parent already invited
 * for another child/club), we do NOT recreate it and we never touch the
 * existing password — we just make sure the e-mail is confirmed and let the
 * client sign in normally.
 */
export const createInvitedAccount = createServerFn({ method: "POST" })
  .inputValidator(
    (input: {
      token: string;
      email: string;
      password: string;
      firstName?: string;
      lastName?: string;
      language?: string;
      signupRole?: string;
    }) =>
      z
        .object({
          token: z.string().min(1),
          email: z.string().email(),
          password: z.string().min(8),
          firstName: z.string().optional(),
          lastName: z.string().optional(),
          language: z.string().optional(),
          signupRole: z.string().optional(),
        })
        .parse(input),
  )
  .handler(async ({ data }): Promise<{ ok: true; created: boolean; alreadyExisted: boolean }> => {
    const token = data.token.trim();
    const email = data.email.trim().toLowerCase();

    const { data: memberRows, error: infoErr } = await supabaseAdmin.rpc("get_member_invite_info", {
      _token: token,
    });
    if (infoErr) throw new Response(infoErr.message, { status: 500 });
    const member = Array.isArray(memberRows) ? memberRows[0] : null;
    if (!inviteMatchesEmail(member, email)) {
      throw new Response("Invalid invite", { status: 400 });
    }

    const existing = await findUserByEmail(email);
    if (existing) {
      // Never recreate / never overwrite the password. Just make sure the
      // account is usable, the client will sign in with its own credentials.
      if (!existing.email_confirmed_at) {
        const { error: updErr } = await supabaseAdmin.auth.admin.updateUserById(existing.id, {
          email_confirm: true,
        });
        if (updErr) throw new Response(updErr.message, { status: 500 });
      }
      return { ok: true, created: false, alreadyExisted: true };
    }

    const firstName = (data.firstName ?? "").trim();
    const lastName = (data.lastName ?? "").trim();
    const fullName = `${firstName} ${lastName}`.trim();

    const { error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: data.password,
      email_confirm: true,
      user_metadata: {
        full_name: fullName,
        first_name: firstName,
        last_name: lastName,
        preferred_language: (data.language ?? "en").slice(0, 2),
        signup_role: data.signupRole ?? "player",
        invite_token: token,
      },
    });

    if (createErr) {
      // Race: the account appeared between our lookup and the create call.
      if (isEmailAlreadyExistsError(createErr.message)) {
        return { ok: true, created: false, alreadyExisted: true };
      }
      throw new Response(createErr.message, { status: 400 });
    }

    return { ok: true, created: true, alreadyExisted: false };
  });
