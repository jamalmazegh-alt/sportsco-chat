import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Superadmin: monitoring des envois d'emails groupés (dispatches).
 *
 * Un `email_dispatch` regroupe tous les emails d'une même campagne
 * (envoi initial, renvoi manuel, replay DLQ). Chaque envoi produit une ou
 * plusieurs lignes dans `email_send_log` — on ne garde que la dernière
 * (statut final courant) par `message_id`.
 */

async function assertSuperAdmin(userId: string) {
  const { data } = await supabaseAdmin
    .from("super_admins")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (!data) throw new Response("Forbidden", { status: 403 });
}

export type DispatchStatusCounts = {
  total: number;
  sent: number;
  pending: number;
  suppressed: number;
  failed: number;
  bounced: number;
  complained: number;
  dlq: number;
};

export type EmailDispatchSummary = {
  id: string;
  created_at: string;
  template_name: string;
  dispatch_type: string;
  event_id: string | null;
  event_title: string | null;
  event_starts_at: string | null;
  club_id: string | null;
  club_name: string | null;
  team_name: string | null;
  created_by: string | null;
  created_by_name: string | null;
  counts: DispatchStatusCounts;
  is_settled: boolean;
};

const FINAL_STATUSES = new Set([
  "sent",
  "suppressed",
  "failed",
  "bounced",
  "complained",
  "dlq",
]);

function emptyCounts(): DispatchStatusCounts {
  return {
    total: 0,
    sent: 0,
    pending: 0,
    suppressed: 0,
    failed: 0,
    bounced: 0,
    complained: 0,
    dlq: 0,
  };
}

/** Latest row per message_id, plus rows without message_id kept as-is. */
function dedupByMessage<T extends { message_id: string | null; created_at: string }>(rows: T[]): T[] {
  const seen = new Map<string, T>();
  const orphans: T[] = [];
  // rows are pre-sorted DESC by created_at
  for (const r of rows) {
    if (!r.message_id) {
      orphans.push(r);
      continue;
    }
    if (!seen.has(r.message_id)) seen.set(r.message_id, r);
  }
  return [...seen.values(), ...orphans];
}

export const listEmailDispatches = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        limit: z.number().int().min(1).max(200).default(50),
        clubId: z.string().uuid().nullable().optional(),
        templateName: z.string().max(120).nullable().optional(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.userId);

    let query = supabaseAdmin
      .from("email_dispatches")
      .select("id, event_id, template_name, dispatch_type, created_by, created_at")
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (data.templateName) query = query.eq("template_name", data.templateName);

    const { data: dispatches, error: dErr } = await query;
    if (dErr) throw new Error(dErr.message);
    if (!dispatches || dispatches.length === 0) return { rows: [] as EmailDispatchSummary[] };

    const dispatchIds = dispatches.map((d) => d.id);
    const eventIds = Array.from(
      new Set(dispatches.map((d) => d.event_id).filter((x): x is string => !!x)),
    );
    const userIds = Array.from(
      new Set(dispatches.map((d) => d.created_by).filter((x): x is string => !!x)),
    );

    // Emails
    const { data: logRows } = await supabaseAdmin
      .from("email_send_log")
      .select("dispatch_id, message_id, status, created_at")
      .in("dispatch_id", dispatchIds)
      .order("created_at", { ascending: false });

    // Group by dispatch, then dedup by message_id
    const perDispatch = new Map<string, DispatchStatusCounts>();
    const grouped = new Map<string, Array<{ message_id: string | null; status: string; created_at: string }>>();
    for (const r of logRows ?? []) {
      if (!r.dispatch_id) continue;
      const arr = grouped.get(r.dispatch_id) ?? [];
      arr.push({ message_id: r.message_id, status: r.status, created_at: r.created_at });
      grouped.set(r.dispatch_id, arr);
    }
    for (const [dId, arr] of grouped) {
      const latest = dedupByMessage(arr);
      const c = emptyCounts();
      for (const r of latest) {
        c.total += 1;
        if (r.status in c) (c as Record<string, number>)[r.status] += 1;
      }
      perDispatch.set(dId, c);
    }

    // Events → clubs / teams
    const eventsById = new Map<
      string,
      { title: string | null; starts_at: string | null; club_id: string | null; club_name: string | null; team_name: string | null }
    >();
    if (eventIds.length > 0) {
      const { data: events } = await supabaseAdmin
        .from("events")
        .select("id, title, starts_at, team_id, teams:team_id(name, club_id, clubs:club_id(name))")
        .in("id", eventIds);
      for (const e of events ?? []) {
        const team = (e as { teams: { name: string | null; club_id: string | null; clubs: { name: string | null } | null } | null }).teams ?? null;
        eventsById.set(e.id as string, {
          title: (e as { title: string | null }).title,
          starts_at: (e as { starts_at: string | null }).starts_at,
          club_id: team?.club_id ?? null,
          club_name: team?.clubs?.name ?? null,
          team_name: team?.name ?? null,
        });
      }
    }

    // Actor names
    const usersById = new Map<string, string | null>();
    if (userIds.length > 0) {
      const { data: profs } = await supabaseAdmin
        .from("profiles")
        .select("id, full_name")
        .in("id", userIds);
      for (const p of profs ?? []) usersById.set(p.id as string, (p as { full_name: string | null }).full_name);
    }

    const rows: EmailDispatchSummary[] = dispatches
      .filter((d) => !data.clubId || (d.event_id && eventsById.get(d.event_id)?.club_id === data.clubId))
      .map((d) => {
        const ev = d.event_id ? eventsById.get(d.event_id) : null;
        const counts = perDispatch.get(d.id) ?? emptyCounts();
        const settled = counts.total > 0 && counts.pending === 0;
        return {
          id: d.id,
          created_at: d.created_at,
          template_name: d.template_name,
          dispatch_type: d.dispatch_type,
          event_id: d.event_id,
          event_title: ev?.title ?? null,
          event_starts_at: ev?.starts_at ?? null,
          club_id: ev?.club_id ?? null,
          club_name: ev?.club_name ?? null,
          team_name: ev?.team_name ?? null,
          created_by: d.created_by,
          created_by_name: d.created_by ? usersById.get(d.created_by) ?? null : null,
          counts,
          is_settled: settled,
        };
      });

    return { rows };
  });

export type DispatchRecipientRow = {
  id: string;
  recipient_email: string;
  recipient_id: string | null;
  notification_type: string | null;
  status: string;
  error_message: string | null;
  attempt_count: number;
  mismatch_count: number;
  worker_build: string | null;
  message_id: string | null;
  created_at: string;
  is_final: boolean;
};

export const getEmailDispatchDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ dispatchId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.userId);

    const { data: dispatch, error: dErr } = await supabaseAdmin
      .from("email_dispatches")
      .select("id, event_id, template_name, dispatch_type, created_by, created_at, metadata")
      .eq("id", data.dispatchId)
      .maybeSingle();
    if (dErr) throw new Error(dErr.message);
    if (!dispatch) throw new Response("Not found", { status: 404 });

    const { data: logRows } = await supabaseAdmin
      .from("email_send_log")
      .select(
        "id, message_id, recipient_email, recipient_id, notification_type, status, error_message, attempt_count, mismatch_count, worker_build, created_at",
      )
      .eq("dispatch_id", data.dispatchId)
      .order("created_at", { ascending: false });

    const latest = dedupByMessage(logRows ?? []);

    // Event / club header info
    let event: {
      id: string;
      title: string | null;
      starts_at: string | null;
      club_name: string | null;
      team_name: string | null;
    } | null = null;
    if (dispatch.event_id) {
      const { data: ev } = await supabaseAdmin
        .from("events")
        .select("id, title, starts_at, team_id, teams:team_id(name, clubs:club_id(name))")
        .eq("id", dispatch.event_id)
        .maybeSingle();
      if (ev) {
        const team = (ev as { teams: { name: string | null; clubs: { name: string | null } | null } | null }).teams ?? null;
        event = {
          id: ev.id as string,
          title: (ev as { title: string | null }).title,
          starts_at: (ev as { starts_at: string | null }).starts_at,
          team_name: team?.name ?? null,
          club_name: team?.clubs?.name ?? null,
        };
      }
    }

    let creatorName: string | null = null;
    if (dispatch.created_by) {
      const { data: p } = await supabaseAdmin
        .from("profiles")
        .select("full_name")
        .eq("id", dispatch.created_by)
        .maybeSingle();
      creatorName = (p as { full_name: string | null } | null)?.full_name ?? null;
    }

    const counts = emptyCounts();
    const recipients: DispatchRecipientRow[] = latest.map((r) => {
      counts.total += 1;
      if (r.status in counts) (counts as Record<string, number>)[r.status] += 1;
      return {
        id: r.id as string,
        recipient_email: r.recipient_email as string,
        recipient_id: (r as { recipient_id: string | null }).recipient_id,
        notification_type: (r as { notification_type: string | null }).notification_type,
        status: r.status as string,
        error_message: (r as { error_message: string | null }).error_message,
        attempt_count: (r as { attempt_count: number }).attempt_count ?? 0,
        mismatch_count: (r as { mismatch_count: number }).mismatch_count ?? 0,
        worker_build: (r as { worker_build: string | null }).worker_build,
        message_id: r.message_id,
        created_at: r.created_at as string,
        is_final: FINAL_STATUSES.has(r.status as string),
      };
    });

    recipients.sort((a, b) => a.recipient_email.localeCompare(b.recipient_email));

    return {
      dispatch: {
        id: dispatch.id as string,
        created_at: dispatch.created_at as string,
        template_name: dispatch.template_name as string,
        dispatch_type: dispatch.dispatch_type as string,
        event_id: dispatch.event_id as string | null,
        created_by: dispatch.created_by as string | null,
        created_by_name: creatorName,
        metadata: (dispatch.metadata ?? {}) as Record<string, unknown>,
      },
      event,
      counts,
      is_settled: counts.total > 0 && counts.pending === 0,
      recipients,
    };
  });
