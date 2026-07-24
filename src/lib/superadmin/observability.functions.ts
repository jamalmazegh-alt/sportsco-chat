import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertSuperAdmin } from "@/lib/authz.server";

type JsonValue = string | number | boolean | null | JsonValue[] | { [k: string]: JsonValue };

// ---------- Invite batches ----------
const BatchesInput = z.object({
  template: z.string().nullable().optional(),
  clubId: z.string().uuid().nullable().optional(),
  from: z.string().nullable().optional(),
  to: z.string().nullable().optional(),
  limit: z.number().int().min(1).max(500).default(100),
});

export type InviteBatchRow = {
  batch_id: string;
  bucket_start: string;
  template_name: string;
  club_id: string | null;
  club_name: string | null;
  total: number;
  sent: number;
  failed: number;
  pending: number;
  suppressed: number;
};

export const listInviteBatches = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => BatchesInput.parse(input ?? {}))
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.userId);
    const { data: rows, error } = await context.supabase.rpc("superadmin_invite_batches", {
      _template: data.template ?? null,
      _club_id: data.clubId ?? null,
      _from: data.from ?? null,
      _to: data.to ?? null,
      _limit: data.limit,
    } as never);
    if (error) throw new Error(error.message);
    return { rows: (rows ?? []) as InviteBatchRow[] };
  });

export type BatchDetailRow = {
  id: string;
  created_at: string;
  template_name: string;
  recipient_email: string;
  status: string;
  error_message: string | null;
  attempt_count: number;
  message_id: string;
  dispatch_id: string | null;
  metadata: JsonValue;
};

export const getInviteBatchRows = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ batchId: z.string() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.userId);
    const { data: rows, error } = await context.supabase.rpc("superadmin_invite_batch_rows", {
      _batch_id: data.batchId,
    } as never);
    if (error) throw new Error(error.message);
    return { rows: (rows ?? []) as BatchDetailRow[] };
  });

// ---------- Notifications (email + push) ----------
const EmailsInput = z.object({
  template: z.string().nullable().optional(),
  status: z.string().nullable().optional(),
  from: z.string().nullable().optional(),
  to: z.string().nullable().optional(),
  search: z.string().nullable().optional(),
  limit: z.number().int().min(1).max(500).default(100),
  offset: z.number().int().min(0).default(0),
});

export type EmailNotificationRow = {
  id: string;
  created_at: string;
  template_name: string;
  recipient_email: string;
  status: string;
  error_message: string | null;
  attempt_count: number;
  message_id: string;
  metadata: JsonValue;
};

export const listNotificationEmails = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => EmailsInput.parse(input ?? {}))
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.userId);
    const { data: rows, error } = await context.supabase.rpc("superadmin_notifications_emails", {
      _template: data.template ?? null,
      _status: data.status ?? null,
      _from: data.from ?? null,
      _to: data.to ?? null,
      _search: data.search ?? null,
      _limit: data.limit,
      _offset: data.offset,
    } as never);
    if (error) throw new Error(error.message);
    return { rows: (rows ?? []) as EmailNotificationRow[] };
  });

const PushInput = z.object({
  kind: z.string().nullable().optional(),
  from: z.string().nullable().optional(),
  to: z.string().nullable().optional(),
  limit: z.number().int().min(1).max(500).default(100),
  offset: z.number().int().min(0).default(0),
});

export type PushNotificationRow = {
  id: string;
  dispatched_at: string;
  kind: string;
  ref_id: string;
  targets_count: number;
  sent_count: number;
  opened_count: number;
  first_opened_at: string | null;
};

export const listNotificationPush = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => PushInput.parse(input ?? {}))
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.userId);
    const { data: rows, error } = await context.supabase.rpc("superadmin_notifications_push", {
      _kind: data.kind ?? null,
      _from: data.from ?? null,
      _to: data.to ?? null,
      _limit: data.limit,
      _offset: data.offset,
    } as never);
    if (error) throw new Error(error.message);
    return { rows: (rows ?? []) as PushNotificationRow[] };
  });

// ---------- Club roster ----------
export type ClubRosterParent = {
  id: string;
  parent_user_id: string | null;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  last_sign_in_at: string | null;
  account_active: boolean;
  account_created_at: string | null;
  last_invite_at: string | null;
};
export type ClubRosterRow = {
  team_id: string;
  team_name: string;
  team_age_group: string | null;
  player_id: string;
  player_first_name: string;
  player_last_name: string;
  player_birth_date: string | null;
  player_email: string | null;
  player_phone: string | null;
  player_user_id: string | null;
  player_last_sign_in_at: string | null;
  player_last_invite_at: string | null;
  player_child_platform_access: boolean;
  parents: ClubRosterParent[];
};

export const getClubRoster = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ clubId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.userId);
    const { data: rows, error } = await context.supabase.rpc("superadmin_club_roster", {
      _club_id: data.clubId,
    } as never);
    if (error) throw new Error(error.message);
    return { rows: (rows ?? []) as ClubRosterRow[] };
  });

// ---------- Player audit ----------
export type PlayerAuditRow = {
  occurred_at: string;
  source: string;
  action: string;
  actor_user_id: string | null;
  actor_name: string | null;
  details: JsonValue;
};

export const getPlayerAudit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        playerId: z.string().uuid(),
        limit: z.number().int().min(1).max(2000).default(500),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.userId);
    const { data: rows, error } = await context.supabase.rpc("superadmin_player_audit", {
      _player_id: data.playerId,
      _limit: data.limit,
    } as never);
    if (error) throw new Error(error.message);
    return { rows: (rows ?? []) as PlayerAuditRow[] };
  });
