import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  CreateSupportViewSessionInput,
  EndSupportViewSessionInput,
  ReadSupportViewInput,
  type SupportViewSessionDTO,
} from "@/lib/support-view/schemas";

async function assertSuperAdmin(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("super_admins")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Response("Internal error", { status: 500 });
  if (!data) throw new Response("Forbidden", { status: 403 });
}

export const createSupportViewSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => CreateSupportViewSessionInput.parse(input))
  .handler(async ({ data, context }): Promise<SupportViewSessionDTO> => {
    await assertSuperAdmin(context.userId);
    const { data: row, error } = await (
      context.supabase as unknown as {
        rpc: (
          fn: string,
          args: Record<string, unknown>,
        ) => Promise<{ data: unknown; error: { message: string } | null }>;
      }
    ).rpc("create_support_view_session", {
      _target_user_id: data.target_user_id,
      _club_id: data.club_id,
      _persona: data.persona,
      _reason: data.reason,
      _duration_minutes: data.duration_minutes ?? 30,
    });
    if (error || !row) {
      throw new Response(error?.message ?? "Failed to create session", { status: 400 });
    }
    const session = row as {
      id: string;
      superadmin_id: string;
      target_user_id: string;
      club_id: string;
      persona: SupportViewSessionDTO["persona"];
      reason: string;
      started_at: string;
      expires_at: string;
    };
    const [club, profile] = await Promise.all([
      supabaseAdmin.from("clubs").select("name").eq("id", session.club_id).maybeSingle(),
      supabaseAdmin
        .from("profiles")
        .select("full_name")
        .eq("id", session.target_user_id)
        .maybeSingle(),
    ]);
    return {
      ...session,
      club_name: club.data?.name ?? null,
      target_full_name: profile.data?.full_name ?? null,
    };
  });

export const endSupportViewSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => EndSupportViewSessionInput.parse(input))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    await assertSuperAdmin(context.userId);
    const { error } = await (
      context.supabase as unknown as {
        rpc: (
          fn: string,
          args: Record<string, unknown>,
        ) => Promise<{ data: unknown; error: { message: string } | null }>;
      }
    ).rpc("end_support_view_session", {
      _session_id: data.session_id,
    });
    if (error) throw new Response(error.message, { status: 400 });
    return { ok: true };
  });

export const getSupportViewSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => ReadSupportViewInput.parse(input))
  .handler(async ({ data, context }): Promise<SupportViewSessionDTO> => {
    await assertSuperAdmin(context.userId);
    const { data: row, error } = await (
      context.supabase as unknown as {
        rpc: (
          fn: string,
          args: Record<string, unknown>,
        ) => Promise<{ data: unknown; error: { message: string } | null }>;
      }
    ).rpc("get_active_support_view_session", {
      _session_id: data.session_id,
    });
    if (error || !row) {
      throw new Response("Support session not found or expired", { status: 404 });
    }
    const session = row as {
      id: string;
      superadmin_id: string;
      target_user_id: string;
      club_id: string;
      persona: SupportViewSessionDTO["persona"];
      reason: string;
      started_at: string;
      expires_at: string;
    };
    if (session.superadmin_id !== context.userId) {
      throw new Response("Forbidden", { status: 403 });
    }
    const [club, profile] = await Promise.all([
      supabaseAdmin.from("clubs").select("name").eq("id", session.club_id).maybeSingle(),
      supabaseAdmin
        .from("profiles")
        .select("full_name")
        .eq("id", session.target_user_id)
        .maybeSingle(),
    ]);
    return {
      ...session,
      club_name: club.data?.name ?? null,
      target_full_name: profile.data?.full_name ?? null,
    };
  });
