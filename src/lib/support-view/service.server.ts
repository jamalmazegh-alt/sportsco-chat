// SERVER-ONLY — never import from client bundles.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { createLogger } from "@/lib/logger.server";
import type { SupportViewPersona } from "@/lib/support-view/schemas";

const log = createLogger("support-view");

export type ValidatedSession = {
  id: string;
  superadmin_id: string;
  target_user_id: string;
  club_id: string;
  persona: SupportViewPersona;
  reason: string;
  started_at: string;
  expires_at: string;
};

export type TargetPermissions = {
  club_id: string;
  is_club_admin: boolean;
  coach_team_ids: string[];
  player_ids: string[];
  child_player_ids: string[];
};

/**
 * DEFENSE-IN-DEPTH: fetch session via SECURITY DEFINER RPC using the
 * superadmin's JWT-scoped client, so Postgres re-verifies:
 * caller = superadmin, session belongs to caller, not ended, not expired.
 * ALL server-fns MUST call this first (also protects against a client-sleep
 * timer that never fires — expiration is server-enforced on every read).
 */
// Widened type: rpc names for the support-view feature may not yet be in
// the generated types.ts; accept any RPC-shaped client.
type RpcClient = { rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }> };

export async function loadValidatedSession(
  userSupabase: unknown,
  callerId: string,
  sessionId: string,
): Promise<ValidatedSession> {
  const c = userSupabase as RpcClient;
  const { data, error } = await c.rpc("get_active_support_view_session", {
    _session_id: sessionId,
  });
  if (error || !data) {
    log.warn("session_invalid", { callerId, sessionId, error });
    throw new Response("Support session not found or expired", { status: 404 });
  }
  const row = data as ValidatedSession;
  if (row.superadmin_id !== callerId) {
    log.error("session_owner_mismatch", { callerId, rowOwner: row.superadmin_id });
    throw new Response("Forbidden", { status: 403 });
  }
  return row;
}

/**
 * Reads the TARGET user's real roles from DB (via admin bypass), scoped to
 * the session's club. This is the truth source — never trust the persona alone.
 */
export async function computeTargetPermissions(
  session: ValidatedSession,
): Promise<TargetPermissions> {
  const { target_user_id, club_id } = session;

  const [cm, tm, pl, pp] = await Promise.all([
    supabaseAdmin
      .from("club_members")
      .select("role")
      .eq("club_id", club_id)
      .eq("user_id", target_user_id),
    supabaseAdmin
      .from("team_members")
      .select("team_id, role, teams!inner(club_id)")
      .eq("user_id", target_user_id)
      .eq("teams.club_id", club_id),
    supabaseAdmin
      .from("players")
      .select("id")
      .eq("club_id", club_id)
      .eq("user_id", target_user_id),
    supabaseAdmin
      .from("player_parents")
      .select("player_id, players!inner(club_id)")
      .eq("parent_user_id", target_user_id)
      .eq("players.club_id", club_id),
  ]);

  const is_club_admin = (cm.data ?? []).some(
    (r) => r.role === "admin" || r.role === "dirigeant",
  );
  const coach_team_ids = (tm.data ?? [])
    .filter((r) => r.role === "coach")
    .map((r) => r.team_id as string);
  const player_ids = (pl.data ?? []).map((r) => r.id);
  const child_player_ids = (pp.data ?? []).map((r) => r.player_id as string);

  return { club_id, is_club_admin, coach_team_ids, player_ids, child_player_ids };
}

/** PHASE 1: any mutation from a support-view branch is forbidden. */
export function assertSupportMutationAllowed(): never {
  throw new Response("Mutations are disabled in support-view mode", { status: 403 });
}

/** Best-effort audit. Never throws. */
export async function logSupportAction(
  userSupabase: unknown,
  sessionId: string,
  action: string,
  target_kind?: string,
  target_id?: string,
  metadata?: Record<string, unknown>,
) {
  try {
    const c = userSupabase as RpcClient;
    await c.rpc("log_support_view_action", {
      _session_id: sessionId,
      _action: action,
      _target_kind: target_kind ?? null,
      _target_id: target_id ?? null,
      _metadata: metadata ?? {},
    });
  } catch (err) {
    log.warn("audit_failed", { sessionId, action, err });
  }
}

// =========================================================================
// Read-only, expurgated DTOs.
// =========================================================================

export type EventDTO = {
  id: string;
  team_id: string | null;
  type: string;
  status: string;
  title: string;
  starts_at: string;
  ends_at: string | null;
  opponent: string | null;
  is_home: boolean | null;
};
export type TeamDTO = {
  id: string;
  name: string;
  sport: string | null;
  age_group: string | null;
};
export type PlayerDTO = {
  id: string;
  first_name: string;
  last_name: string;
  birth_date: string | null;
};
/**
 * Expurgated payment DTO. Status-only exposure per spec — NEVER include:
 * stripe_payment_intent_id / stripe_charge_id / external_reference /
 * payer_user_id / exempted_reason / attachment_url / IBAN / bank data /
 * comments. Amount + currency + item title + due date are kept so support
 * can eyeball "why is X pending" without seeing PII or provider tokens.
 */
export type PaymentObligationDTO = {
  id: string;
  status: string;
  amount_due_cents: number;
  currency: string;
  player_id: string | null;
  item_title: string | null;
  due_date: string | null;
};
/**
 * Expurgated convocation DTO. NEVER include response_token (secret, grants
 * write access) nor comment (free-form PII).
 */
export type ConvocationDTO = {
  id: string;
  event_id: string;
  player_id: string;
  status: string;
  responded_at: string | null;
};


export type ContextSummary = {
  club: { id: string; name: string | null };
  target: { id: string; full_name: string | null };
  persona: SupportViewPersona;
  permissions: TargetPermissions;
  expires_at: string;
  reason: string;
};

async function teamsInScope(session: ValidatedSession, perms: TargetPermissions): Promise<string[]> {
  if (perms.is_club_admin) {
    const { data } = await supabaseAdmin.from("teams").select("id").eq("club_id", session.club_id);
    return (data ?? []).map((t) => t.id);
  }
  const playerScope = [...perms.player_ids, ...perms.child_player_ids];
  const teamsFromPlayers: string[] = [];
  if (playerScope.length > 0) {
    const { data } = await supabaseAdmin
      .from("team_members")
      .select("team_id")
      .in("player_id", playerScope);
    for (const r of data ?? []) if (r.team_id) teamsFromPlayers.push(r.team_id);
  }
  return Array.from(new Set([...perms.coach_team_ids, ...teamsFromPlayers]));
}

/**
 * DEFENSE-IN-DEPTH — belt against a forgotten `.eq("club_id", ...)` on the
 * supabaseAdmin (RLS bypass) client. Every row returned by supportDataService
 * MUST pass this guard: if any row's scoping key falls outside the session's
 * known-good invariant, we throw 500 rather than leak. This is the correction
 * n°1 the reviewer asked for — wired on every method exit, not only DTOs.
 */
export function assertRowsBelongToSession<T>(
  rows: T[],
  key: (r: T) => string | null | undefined,
  allowed: Set<string> | string,
  what: string,
): T[] {
  const allowedSet = typeof allowed === "string" ? new Set([allowed]) : allowed;
  for (const r of rows) {
    const v = key(r);
    if (!v || !allowedSet.has(v)) {
      log.error("support_view_scope_leak", { what, offending: v });
      throw new Response("Support view scope violation", { status: 500 });
    }
  }
  return rows;
}

type EventRow = EventDTO & { club_id?: string | null };
type TeamRow = TeamDTO & { club_id?: string | null };
type PlayerRow = PlayerDTO & { club_id?: string | null };

export const supportDataService = {
  async getContextSummary(session: ValidatedSession): Promise<ContextSummary> {
    const perms = await computeTargetPermissions(session);
    const [club, target] = await Promise.all([
      supabaseAdmin.from("clubs").select("id, name").eq("id", session.club_id).maybeSingle(),
      supabaseAdmin
        .from("profiles")
        .select("id, full_name")
        .eq("id", session.target_user_id)
        .maybeSingle(),
    ]);
    if (club.data && club.data.id !== session.club_id) {
      throw new Response("Support view scope violation", { status: 500 });
    }
    if (target.data && target.data.id !== session.target_user_id) {
      throw new Response("Support view scope violation", { status: 500 });
    }
    return {
      club: { id: session.club_id, name: club.data?.name ?? null },
      target: { id: session.target_user_id, full_name: target.data?.full_name ?? null },
      persona: session.persona,
      permissions: perms,
      expires_at: session.expires_at,
      reason: session.reason,
    };
  },

  async listEvents(session: ValidatedSession): Promise<{ events: EventDTO[] }> {
    const perms = await computeTargetPermissions(session);
    const teamIds = await teamsInScope(session, perms);
    if (teamIds.length === 0) return { events: [] };
    const { data, error } = await supabaseAdmin
      .from("events")
      .select("id, team_id, type, status, title, starts_at, ends_at, opponent, is_home")
      .in("team_id", teamIds)
      .is("deleted_at", null)
      .order("starts_at", { ascending: false })
      .limit(100);
    if (error) throw new Response(error.message, { status: 500 });
    const rows = (data ?? []) as unknown as EventRow[];
    assertRowsBelongToSession(rows, (r) => r.team_id, new Set(teamIds), "events.team_id");
    return { events: rows as EventDTO[] };
  },

  async listTeams(session: ValidatedSession): Promise<{ teams: TeamDTO[] }> {
    const perms = await computeTargetPermissions(session);
    let q = supabaseAdmin
      .from("teams")
      .select("id, name, sport, age_group, club_id")
      .eq("club_id", session.club_id);
    const coachScope = Array.from(new Set(perms.coach_team_ids));
    if (!perms.is_club_admin) {
      if (coachScope.length === 0) return { teams: [] };
      q = q.in("id", coachScope);
    }
    const { data, error } = await q.order("name");
    if (error) throw new Response(error.message, { status: 500 });
    const rows = (data ?? []) as unknown as TeamRow[];
    assertRowsBelongToSession(rows, (r) => r.club_id, session.club_id, "teams.club_id");
    if (!perms.is_club_admin) {
      assertRowsBelongToSession(rows, (r) => r.id, new Set(coachScope), "teams.id");
    }
    return { teams: rows.map(({ club_id: _c, ...rest }) => rest) as TeamDTO[] };
  },


  async listPlayers(session: ValidatedSession): Promise<{ players: PlayerDTO[] }> {
    const perms = await computeTargetPermissions(session);
    const results = new Map<string, PlayerDTO>();
    const allowedPlayerIds = perms.is_club_admin
      ? null
      : new Set<string>();
    const collect = (rows: PlayerRow[]) => {
      assertRowsBelongToSession(rows, (r) => r.club_id, session.club_id, "players.club_id");
      if (allowedPlayerIds) {
        assertRowsBelongToSession(rows, (r) => r.id, allowedPlayerIds, "players.id");
      }
      for (const r of rows) {
        const { club_id: _c, ...dto } = r;
        results.set(r.id, sanitizePlayer(dto as PlayerDTO));
      }
    };

    if (perms.is_club_admin) {
      const { data, error } = await supabaseAdmin
        .from("players")
        .select("id, first_name, last_name, birth_date, club_id")
        .eq("club_id", session.club_id)
        .is("deleted_at", null)
        .order("last_name")
        .limit(500);
      if (error) throw new Response(error.message, { status: 500 });
      collect((data ?? []) as unknown as PlayerRow[]);
    } else {
      if (perms.coach_team_ids.length > 0) {
        const { data: tms } = await supabaseAdmin
          .from("team_members")
          .select("player_id")
          .in("team_id", perms.coach_team_ids)
          .not("player_id", "is", null);
        const pids = Array.from(
          new Set((tms ?? []).map((t) => t.player_id as string).filter(Boolean)),
        );
        pids.forEach((id) => allowedPlayerIds!.add(id));
        if (pids.length > 0) {
          const { data } = await supabaseAdmin
            .from("players")
            .select("id, first_name, last_name, birth_date, club_id")
            .in("id", pids)
            .is("deleted_at", null);
          collect((data ?? []) as unknown as PlayerRow[]);
        }
      }
      const own = [...perms.player_ids, ...perms.child_player_ids];
      if (own.length > 0) {
        own.forEach((id) => allowedPlayerIds!.add(id));
        const { data } = await supabaseAdmin
          .from("players")
          .select("id, first_name, last_name, birth_date, club_id")
          .in("id", own)
          .is("deleted_at", null);
        collect((data ?? []) as unknown as PlayerRow[]);
      }
    }
    return { players: Array.from(results.values()) };
  },


  /**
   * Read-only payments view. Scope:
   *  - is_club_admin → all obligations for session.club_id
   *  - player/parent  → obligations where player_id ∈ own+child players
   *  - coach-only     → empty (payments are not in coach scope)
   * Only status + amount + item title + due date are exposed. No stripe
   * fields, no external references, no comments, no PII.
   */
  async listPayments(session: ValidatedSession): Promise<{ payments: PaymentObligationDTO[] }> {
    const perms = await computeTargetPermissions(session);

    let q = supabaseAdmin
      .from("payment_obligations")
      .select(
        "id, status, amount_due_cents, currency, player_id, club_id, payment_item_id, payment_items(title, due_date)",
      )
      .eq("club_id", session.club_id);

    if (!perms.is_club_admin) {
      const playerScope = Array.from(new Set([...perms.player_ids, ...perms.child_player_ids]));
      if (playerScope.length === 0) return { payments: [] };
      q = q.in("player_id", playerScope);
    }

    const { data, error } = await q.order("created_at", { ascending: false }).limit(200);
    if (error) throw new Response(error.message, { status: 500 });

    type Row = {
      id: string;
      status: string;
      amount_due_cents: number;
      currency: string;
      player_id: string | null;
      club_id: string;
      payment_items: { title: string | null; due_date: string | null } | null;
    };
    const rows = (data ?? []) as unknown as Row[];
    assertRowsBelongToSession(rows, (r) => r.club_id, session.club_id, "payments.club_id");
    if (!perms.is_club_admin) {
      const allowed = new Set([...perms.player_ids, ...perms.child_player_ids]);
      assertRowsBelongToSession(rows, (r) => r.player_id, allowed, "payments.player_id");
    }
    return {
      payments: rows.map((r) => ({
        id: r.id,
        status: r.status,
        amount_due_cents: r.amount_due_cents,
        currency: r.currency,
        player_id: r.player_id,
        item_title: r.payment_items?.title ?? null,
        due_date: r.payment_items?.due_date ?? null,
      })),
    };
  },

  /**
   * Read-only convocations view. Scope-gated the same way as events:
   *  - is_club_admin → all convocations for events in the club's teams
   *  - coach         → convocations for events in coach_team_ids
   *  - player/parent → convocations where player_id ∈ own+child players
   * response_token and free-form comment are NEVER exposed.
   */
  async listConvocations(session: ValidatedSession): Promise<{ convocations: ConvocationDTO[] }> {
    const perms = await computeTargetPermissions(session);
    const teamIds = await teamsInScope(session, perms);
    if (teamIds.length === 0) return { convocations: [] };

    // Fetch events in scope first, then convocations by event_id. This double
    // filter (event_id ∈ scope-events + guard on team_id) is the belt against
    // a forgotten WHERE — supabaseAdmin bypasses RLS.
    const { data: evs, error: evErr } = await supabaseAdmin
      .from("events")
      .select("id, team_id")
      .in("team_id", teamIds)
      .is("deleted_at", null)
      .limit(500);
    if (evErr) throw new Response(evErr.message, { status: 500 });
    const eventRows = (evs ?? []) as { id: string; team_id: string }[];
    assertRowsBelongToSession(
      eventRows,
      (r) => r.team_id,
      new Set(teamIds),
      "convocations.event.team_id",
    );
    const eventIds = eventRows.map((e) => e.id);
    if (eventIds.length === 0) return { convocations: [] };
    const eventSet = new Set(eventIds);

    let cq = supabaseAdmin
      .from("convocations")
      .select("id, event_id, player_id, status, responded_at")
      .in("event_id", eventIds);

    let parentPlayerScope: Set<string> | null = null;
    if (!perms.is_club_admin) {
      const playerScope = Array.from(new Set([...perms.player_ids, ...perms.child_player_ids]));
      // Coach without any own/child players still sees team convocations.
      // Coach with players → union: player_id in scope OR event in coach team.
      // Simpler + safer: coach case uses team scope alone (already applied
      // via eventIds); player/parent case restricts by player_id.
      if (perms.coach_team_ids.length === 0) {
        if (playerScope.length === 0) return { convocations: [] };
        cq = cq.in("player_id", playerScope);
        parentPlayerScope = new Set(playerScope);
      }
    }

    const { data, error } = await cq.order("created_at", { ascending: false }).limit(300);
    if (error) throw new Response(error.message, { status: 500 });
    type ConvRow = ConvocationDTO;
    const rows = (data ?? []) as unknown as ConvRow[];
    assertRowsBelongToSession(rows, (r) => r.event_id, eventSet, "convocations.event_id");
    if (parentPlayerScope) {
      assertRowsBelongToSession(
        rows,
        (r) => r.player_id,
        parentPlayerScope,
        "convocations.player_id",
      );
    }
    return { convocations: rows };

  },
};


function sanitizePlayer(p: PlayerDTO): PlayerDTO {
  if (p.birth_date) {
    const age = yearsSince(p.birth_date);
    if (age !== null && age < 18) {
      return { ...p, last_name: (p.last_name?.[0] ?? "") + "." };
    }
  }
  return p;
}

function yearsSince(iso: string): number | null {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return Math.floor((Date.now() - d.getTime()) / (365.25 * 24 * 3600 * 1000));
}
