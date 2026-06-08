/**
 * Privacy worker — processes GDPR export & deletion requests.
 * Server-only: uses supabaseAdmin (service role). Never import from client code.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { enqueueTransactionalEmailServer } from "@/lib/email/send.server";

const BUCKET = "privacy-exports";
const SIGNED_URL_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

// Tables to export for a given user_id. Each entry: select + filter column.
const USER_TABLES: Array<{ table: string; column: string }> = [
  { table: "profiles", column: "id" },
  { table: "user_consents", column: "user_id" },
  { table: "data_export_requests", column: "user_id" },
  { table: "account_deletion_requests", column: "user_id" },
  { table: "notifications", column: "user_id" },
  { table: "follows", column: "follower_id" },
  { table: "coach_profiles", column: "user_id" },
  { table: "coach_diplomas", column: "user_id" },
  { table: "player_parents", column: "user_id" },
  { table: "player_guardians", column: "guardian_user_id" },
  { table: "event_messages", column: "sender_user_id" },
  { table: "wall_posts", column: "author_id" },
  { table: "wall_comments", column: "author_id" },
  { table: "support_tickets", column: "user_id" },
  { table: "support_messages", column: "user_id" },
];

async function fetchUserProfile(userId: string) {
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("first_name, last_name, preferred_language")
    .eq("id", userId)
    .maybeSingle();
  const { data: authRes } = await supabaseAdmin.auth.admin.getUserById(userId);
  return {
    firstName: profile?.first_name ?? null,
    locale: profile?.preferred_language ?? "fr",
    email: authRes?.user?.email ?? null,
  };
}

async function buildExportBundle(userId: string): Promise<{ bytes: Uint8Array; filename: string }> {
  const bundle: Record<string, any> = {
    _meta: {
      generated_at: new Date().toISOString(),
      user_id: userId,
      kind: "gdpr_export_v1",
    },
  };

  // Player rows linked to this user (and child via player_parents)
  const { data: directPlayers } = await supabaseAdmin
    .from("players")
    .select("*")
    .eq("user_id", userId);
  bundle.players = directPlayers ?? [];

  const { data: parentLinks } = await supabaseAdmin
    .from("player_parents")
    .select("player_id")
    .eq("user_id", userId);
  const childIds = (parentLinks ?? []).map((r: any) => r.player_id);
  if (childIds.length) {
    const { data: children } = await supabaseAdmin
      .from("players")
      .select("*")
      .in("id", childIds);
    bundle.children_players = children ?? [];
  }

  // Convocations + availabilities for the player ids
  const allPlayerIds = [
    ...(directPlayers ?? []).map((p: any) => p.id),
    ...childIds,
  ];
  if (allPlayerIds.length) {
    const [conv, avail, feedback, achievements] = await Promise.all([
      supabaseAdmin.from("convocations").select("*").in("player_id", allPlayerIds),
      supabaseAdmin.from("player_availabilities").select("*").in("player_id", allPlayerIds),
      supabaseAdmin.from("player_feedback").select("*").in("player_id", allPlayerIds),
      supabaseAdmin.from("player_achievements").select("*").in("player_id", allPlayerIds),
    ]);
    bundle.convocations = conv.data ?? [];
    bundle.player_availabilities = avail.data ?? [];
    bundle.player_feedback = feedback.data ?? [];
    bundle.player_achievements = achievements.data ?? [];
  }

  // Generic per-user tables
  for (const { table, column } of USER_TABLES) {
    const { data } = await supabaseAdmin.from(table as any).select("*").eq(column, userId);
    bundle[table] = data ?? [];
  }

  // Payment obligations and transactions
  const [obls, txs] = await Promise.all([
    supabaseAdmin.from("payment_obligations").select("*").eq("user_id", userId),
    supabaseAdmin.from("payment_transactions").select("*").eq("user_id", userId),
  ]);
  bundle.payment_obligations = obls.data ?? [];
  bundle.payment_transactions = txs.data ?? [];

  const json = JSON.stringify(bundle, null, 2);
  const bytes = new TextEncoder().encode(json);
  const filename = `gdpr-export-${userId}-${Date.now()}.json`;
  return { bytes, filename };
}

export async function processExportRequest(requestId: string, processedBy: string | null = null) {
  const { data: req, error: rErr } = await supabaseAdmin
    .from("data_export_requests")
    .select("id, user_id, status")
    .eq("id", requestId)
    .single();
  if (rErr || !req) throw new Error(`Export request ${requestId} not found`);
  if (req.status === "completed") return { ok: true, skipped: true as const };

  await supabaseAdmin
    .from("data_export_requests")
    .update({ status: "processing", processed_by: processedBy })
    .eq("id", requestId);

  try {
    const { bytes, filename } = await buildExportBundle(req.user_id);
    const path = `${req.user_id}/${filename}`;
    const { error: upErr } = await supabaseAdmin.storage
      .from(BUCKET)
      .upload(path, bytes, { contentType: "application/json", upsert: true });
    if (upErr) throw upErr;
    const { data: signed, error: sErr } = await supabaseAdmin.storage
      .from(BUCKET)
      .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
    if (sErr || !signed?.signedUrl) throw sErr || new Error("Failed to sign URL");

    const profile = await fetchUserProfile(req.user_id);
    if (profile.email) {
      await enqueueTransactionalEmailServer({
        templateName: "data-export-ready",
        recipientEmail: profile.email,
        idempotencyKey: `data-export-${requestId}`,
        templateData: {
          firstName: profile.firstName ?? undefined,
          downloadUrl: signed.signedUrl,
          expiresInDays: 7,
          locale: profile.locale,
        },
      });
    }

    await supabaseAdmin
      .from("data_export_requests")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        file_url: signed.signedUrl,
        file_path: path,
        error: null,
      })
      .eq("id", requestId);
    return { ok: true };
  } catch (e: any) {
    await supabaseAdmin
      .from("data_export_requests")
      .update({ status: "failed", error: e?.message ?? String(e) })
      .eq("id", requestId);
    throw e;
  }
}

export async function processDeletionRequest(
  requestId: string,
  opts: { processedBy: string; hardDelete?: boolean },
) {
  const { data: req, error: rErr } = await supabaseAdmin
    .from("account_deletion_requests")
    .select("id, user_id, status, approved_at")
    .eq("id", requestId)
    .single();
  if (rErr || !req) throw new Error(`Deletion request ${requestId} not found`);
  if (req.status !== "pending" && req.status !== "processing")
    throw new Error(`Deletion not in a processable state (status=${req.status})`);
  if (!req.approved_at) throw new Error("Deletion not approved yet");

  const profile = await fetchUserProfile(req.user_id);
  const hardDelete = !!opts.hardDelete;

  await supabaseAdmin
    .from("account_deletion_requests")
    .update({ status: "processing", processed_by: opts.processedBy, hard_delete: hardDelete })
    .eq("id", requestId);

  try {
    if (hardDelete) {
      // Cascade via FKs (profiles, players, etc.)
      const { error } = await supabaseAdmin.auth.admin.deleteUser(req.user_id);
      if (error) throw error;
    } else {
      // Anonymize first, then revoke auth access (ban + sign out)
      const { error: anonErr } = await supabaseAdmin.rpc("privacy_anonymize_user", {
        _user_id: req.user_id,
      });
      if (anonErr) throw anonErr;
      // Ban the user so they can no longer authenticate. Profile row remains.
      await supabaseAdmin.auth.admin.updateUserById(req.user_id, {
        ban_duration: "876000h", // ~100 years
        email: `deleted+${req.user_id}@clubero.app`,
        phone: null,
        user_metadata: { deleted: true },
      } as any);
    }

    // Notify the user (before they lose access — email is sent to their saved address)
    if (profile.email) {
      await enqueueTransactionalEmailServer({
        templateName: "account-deleted",
        recipientEmail: profile.email,
        idempotencyKey: `account-deleted-${requestId}`,
        templateData: {
          firstName: profile.firstName ?? undefined,
          hardDelete,
          locale: profile.locale,
        },
      });
    }

    await supabaseAdmin
      .from("account_deletion_requests")
      .update({ status: "completed", processed_at: new Date().toISOString(), error: null })
      .eq("id", requestId);
    return { ok: true };
  } catch (e: any) {
    await supabaseAdmin
      .from("account_deletion_requests")
      .update({ status: "failed", error: e?.message ?? String(e) })
      .eq("id", requestId);
    throw e;
  }
}

export async function processAllPendingExports(limit = 10) {
  const { data: pending } = await supabaseAdmin
    .from("data_export_requests")
    .select("id")
    .eq("status", "pending")
    .order("requested_at", { ascending: true })
    .limit(limit);
  const ids = (pending ?? []).map((r: any) => r.id);
  const results: Array<{ id: string; ok: boolean; error?: string }> = [];
  for (const id of ids) {
    try {
      await processExportRequest(id, null);
      results.push({ id, ok: true });
    } catch (e: any) {
      results.push({ id, ok: false, error: e?.message ?? String(e) });
    }
  }
  return { processed: results.length, results };
}
