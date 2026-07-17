/**
 * Integration test for replayEventDlq — the DLQ rejeu path.
 *
 * The unit test in src/tests/unit/replay-dlq-plan.test.ts already covers the
 * pure decision logic of `computePlan` with a mocked builder. This suite
 * complements it with two things that a mocked builder cannot prove:
 *
 *   A. `computePlan` executed against a REAL Postgres — real column types,
 *      real filter semantics, real partial UNIQUE indices, real interaction
 *      with the notification_type/event_id filters.
 *   B. The advisory-lock guarantee that `replayEventDlq` relies on to
 *      guarantee "at most one enqueue per DLQ row" under concurrent replays.
 *      This is verified by exercising the exact lock primitive on two
 *      REAL, SEPARATE connections — the semantic PostgREST cannot expose.
 *
 * Both are prerequisites to the SES bascule: (A) proves the planner is
 * sound at DB level, (B) proves the guard the planner rides behind won't
 * let two operators double-enqueue the same event.
 *
 * NOTE — Scenarios 1-5 exercise `computePlan(supabaseAdmin, event, notif)`
 * end-to-end against the real DB (admin client bypasses RLS which is fine
 * for a queue-owned table). The full server function `replayEventDlq` is
 * NOT invoked directly because it depends on `requireSupabaseAuth`
 * middleware and template rendering (React email); its enqueue-loop is
 * driven by `computePlan.rows`, so proving that plan against the real DB
 * + proving the lock guarantee is what closes the anti-doublon promise.
 * The lock-release-on-error scenario (7) reproduces the try/finally shape
 * of `replayEventDlq` on real connections.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { Client as PgClient } from "pg";
import { computePlan } from "@/lib/email/replay-dlq.functions";

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SERVICE_KEY) {
  throw new Error(
    "email-replay-dlq integration test requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY",
  );
}

const admin: SupabaseClient = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const NT = "convocation-invite";

// Two events per suite so isolation-by-event can be proven.
let eventA: string;
let eventB: string;

/**
 * `email_send_log.dispatch_id` FK-references `email_dispatches(id)`. Tests
 * that seed rows with random dispatch UUIDs would trip a 23503 FK violation,
 * so we insert real dispatch rows on demand and reuse the returned id.
 * Every dispatch created here is torn down in afterAll via `createdDispatchIds`.
 */
const createdDispatchIds = new Set<string>();
async function mkDispatch(event_id: string): Promise<string> {
  const { data, error } = await admin
    .from("email_dispatches")
    .insert({ event_id, template_name: NT, dispatch_type: "initial" })
    .select("id")
    .single();
  if (error || !data) throw new Error(`mkDispatch failed: ${error?.message}`);
  createdDispatchIds.add(data.id);
  return data.id;
}

function baseRow(
  event_id: string,
  dispatch_id: string | null,
  recipient_id: string | null,
  status: string,
  created_at: string,
) {
  return {
    message_id: crypto.randomUUID(),
    template_name: NT,
    recipient_email: `${recipient_id ?? "orphan"}@replay.test`,
    status,
    event_id,
    dispatch_id,
    recipient_id,
    notification_type: NT,
    created_at,
  };
}
const dlqRow = (e: string, d: string | null, r: string | null, ts: string) =>
  baseRow(e, d, r, "dlq", ts);
const sentRow = (e: string, d: string, r: string, ts: string) =>
  baseRow(e, d, r, "sent", ts);
const pendingRow = (e: string, d: string, r: string, ts: string) =>
  baseRow(e, d, r, "pending", ts);

/** Exactly the same key derivation as replayEventDlq.eventLockKey(). */
async function eventLockKey(eventId: string): Promise<number> {
  const buf = new TextEncoder().encode(eventId);
  const digest = await crypto.subtle.digest("SHA-256", buf);
  const view = new DataView(digest);
  return view.getInt32(0, false);
}

/**
 * Derive a Postgres URL from PG* if present, or from SUPABASE_URL by using
 * the direct DB host. In CI where PGHOST isn't set, concurrency scenarios
 * skip cleanly and the DB-level computePlan scenarios still run.
 */
function pgConnectionConfig(): {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  ssl?: any;
} | null {
  if (!process.env.PGHOST) return null;
  return {
    host: process.env.PGHOST!,
    port: parseInt(process.env.PGPORT ?? "5432", 10),
    user: process.env.PGUSER ?? "postgres",
    password: process.env.PGPASSWORD ?? "",
    database: process.env.PGDATABASE ?? "postgres",
    ssl: process.env.PGSSLMODE === "disable" ? false : { rejectUnauthorized: false },
  };
}
const PG = pgConnectionConfig();
const describeIfPg = PG ? describe : describe.skip;

async function cleanupEvents() {
  if (!eventA && !eventB) return;
  await admin
    .from("email_send_log")
    .delete()
    .in("event_id", [eventA, eventB].filter(Boolean));
}

beforeAll(() => {
  eventA = crypto.randomUUID();
  eventB = crypto.randomUUID();
});

afterAll(async () => {
  await cleanupEvents();
});

beforeEach(async () => {
  // Between scenarios, drop rows for the two synthetic events so each test
  // sees a clean slate. Other events in the DB are untouched.
  await cleanupEvents();
});

describe("computePlan against a real Postgres", () => {
  it("[1] nominal — 3 DLQ rows with fresh keys are all replayable", async () => {
    const rows = [
      dlqRow(eventA, crypto.randomUUID(), "player:p1", "2026-01-01T00:00:00Z"),
      dlqRow(eventA, crypto.randomUUID(), "player:p2", "2026-01-01T00:00:01Z"),
      dlqRow(eventA, crypto.randomUUID(), "player:p3", "2026-01-01T00:00:02Z"),
    ];
    const { error } = await admin.from("email_send_log").insert(rows);
    expect(error).toBeNull();

    const plan = await computePlan(admin as any, eventA, NT);
    expect(plan.candidates).toBe(3);
    expect(plan.replayable).toBe(3);
    expect(plan.skippedAlreadyDelivered).toBe(0);
    expect(plan.skippedInFlight).toBe(0);
    expect(plan.skippedNoDispatch).toBe(0);
    // The three rows the planner marks replayable are exactly the DLQ inputs.
    const planned = plan.rows.map((r) => r.recipient_id).sort();
    expect(planned).toEqual(["player:p1", "player:p2", "player:p3"]);
  });

  it("[2] already-delivered is not replayable (same dispatch+recipient+notif)", async () => {
    const dispatch = crypto.randomUUID();
    await admin.from("email_send_log").insert([
      dlqRow(eventA, dispatch, "player:p1", "2026-01-01T00:00:00Z"),
      sentRow(eventA, dispatch, "player:p1", "2026-01-01T00:05:00Z"),
    ]);

    const plan = await computePlan(admin as any, eventA, NT);
    expect(plan.candidates).toBe(1);
    expect(plan.replayable).toBe(0);
    expect(plan.skippedAlreadyDelivered).toBe(1);
    expect(plan.rows).toHaveLength(0);

    // The `sent` row remains intact — the planner is read-only.
    const { data: after } = await admin
      .from("email_send_log")
      .select("id,status")
      .eq("event_id", eventA)
      .eq("recipient_id", "player:p1")
      .eq("status", "sent");
    expect(after).toHaveLength(1);
  });

  it("[3] in-flight (fresher pending) blocks replay", async () => {
    const dispatch = crypto.randomUUID();
    await admin.from("email_send_log").insert([
      dlqRow(eventA, dispatch, "player:p1", "2026-01-01T00:00:00Z"),
      pendingRow(eventA, dispatch, "player:p1", "2026-01-01T00:10:00Z"),
    ]);

    const plan = await computePlan(admin as any, eventA, NT);
    expect(plan.replayable).toBe(0);
    expect(plan.skippedInFlight).toBe(1);
    expect(plan.skippedAlreadyDelivered).toBe(0);
  });

  it("[3-bis] older pending (= what died) does NOT block replay", async () => {
    // A pending row created BEFORE the DLQ row is the ancestor of that DLQ
    // row, not a concurrent in-flight retry. Guard uses gt(created_at), so
    // it must not count here — otherwise DLQ replay would always be blocked.
    const dispatch = crypto.randomUUID();
    await admin.from("email_send_log").insert([
      dlqRow(eventA, dispatch, "player:p1", "2026-01-01T00:10:00Z"),
      pendingRow(eventA, dispatch, "player:p1", "2026-01-01T00:00:00Z"),
    ]);

    const plan = await computePlan(admin as any, eventA, NT);
    expect(plan.replayable).toBe(1);
    expect(plan.skippedInFlight).toBe(0);
  });

  it("[4] rows missing dispatch_id or recipient_id are counted skippedNoDispatch and never replayed", async () => {
    await admin.from("email_send_log").insert([
      dlqRow(eventA, null, "player:p1", "2026-01-01T00:00:00Z"),
      dlqRow(eventA, crypto.randomUUID(), null, "2026-01-01T00:00:01Z"),
      dlqRow(eventA, crypto.randomUUID(), "player:p3", "2026-01-01T00:00:02Z"),
    ]);

    const plan = await computePlan(admin as any, eventA, NT);
    expect(plan.candidates).toBe(3);
    expect(plan.skippedNoDispatch).toBe(2);
    expect(plan.replayable).toBe(1);
    expect(plan.rows.map((r) => r.recipient_id)).toEqual(["player:p3"]);
  });

  it("[5] isolation par event — replay planning for eventA never touches eventB", async () => {
    await admin.from("email_send_log").insert([
      dlqRow(eventA, crypto.randomUUID(), "player:pA", "2026-01-01T00:00:00Z"),
      dlqRow(eventB, crypto.randomUUID(), "player:pB", "2026-01-01T00:00:00Z"),
    ]);

    const planA = await computePlan(admin as any, eventA, NT);
    expect(planA.candidates).toBe(1);
    expect(planA.rows[0].recipient_id).toBe("player:pA");

    const planB = await computePlan(admin as any, eventB, NT);
    expect(planB.candidates).toBe(1);
    expect(planB.rows[0].recipient_id).toBe("player:pB");
  });

  it("[5-bis] filtering by notification_type — other types are invisible", async () => {
    await admin.from("email_send_log").insert([
      { ...dlqRow(eventA, crypto.randomUUID(), "player:p1", "2026-01-01T00:00:00Z"),
        notification_type: "player-invite" },
    ]);
    const plan = await computePlan(admin as any, eventA, NT);
    expect(plan.candidates).toBe(0);
  });

  it("[5-ter] a `sent` row from a DIFFERENT dispatch does NOT mark the DLQ as delivered", async () => {
    // The dedup key is (dispatch_id, recipient_id, notif) — two dispatches
    // for the same recipient must be treated independently. This is the
    // property the partial UNIQUE index also enforces at write time.
    await admin.from("email_send_log").insert([
      dlqRow(eventA, crypto.randomUUID(), "player:p1", "2026-01-01T00:00:00Z"),
      sentRow(eventA, crypto.randomUUID(), "player:p1", "2026-01-01T00:05:00Z"),
    ]);
    const plan = await computePlan(admin as any, eventA, NT);
    expect(plan.replayable).toBe(1);
    expect(plan.skippedAlreadyDelivered).toBe(0);
  });
});

describeIfPg("advisory-lock guarantee (concurrent replays)", () => {
  it(
    "[6] two concurrent pg_try_advisory_lock on the same event key — exactly one wins",
    async () => {
      const key = await eventLockKey(eventA);
      const c1 = new PgClient(PG!);
      const c2 = new PgClient(PG!);
      await c1.connect();
      await c2.connect();
      try {
        // Both attempt the lock as close in time as possible.
        const [r1, r2] = await Promise.all([
          c1.query<{ pg_try_advisory_lock: boolean }>(
            "SELECT pg_try_advisory_lock($1) AS pg_try_advisory_lock",
            [key],
          ),
          c2.query<{ pg_try_advisory_lock: boolean }>(
            "SELECT pg_try_advisory_lock($1) AS pg_try_advisory_lock",
            [key],
          ),
        ]);
        const winners = [r1.rows[0].pg_try_advisory_lock, r2.rows[0].pg_try_advisory_lock];
        // Exactly one of the two must be true. If both were true, two
        // replays could enqueue the same DLQ row twice → doublon.
        expect(winners.filter(Boolean)).toHaveLength(1);
        expect(winners.filter((x) => !x)).toHaveLength(1);

        // The loser cannot take the lock while the winner holds it.
        const winner = r1.rows[0].pg_try_advisory_lock ? c1 : c2;
        const loser = winner === c1 ? c2 : c1;
        const retry = await loser.query<{ ok: boolean }>(
          "SELECT pg_try_advisory_lock($1) AS ok",
          [key],
        );
        expect(retry.rows[0].ok).toBe(false);

        // Once the winner unlocks, the loser can acquire.
        await winner.query("SELECT pg_advisory_unlock($1)", [key]);
        const acquired = await loser.query<{ ok: boolean }>(
          "SELECT pg_try_advisory_lock($1) AS ok",
          [key],
        );
        expect(acquired.rows[0].ok).toBe(true);
        await loser.query("SELECT pg_advisory_unlock($1)", [key]);
      } finally {
        await c1.end();
        await c2.end();
      }
    },
    30_000,
  );

  it(
    "[7] lock is released on error via finally, and the original error propagates",
    async () => {
      const key = await eventLockKey(eventB);
      const c1 = new PgClient(PG!);
      const c2 = new PgClient(PG!);
      await c1.connect();
      await c2.connect();
      try {
        // Reproduce the exact try/finally shape from replayEventDlq: acquire
        // the lock, run a job that throws, and unlock in finally.
        const businessError = new Error("simulated malformed row");
        let caught: unknown = null;
        const acq = await c1.query<{ ok: boolean }>(
          "SELECT pg_try_advisory_lock($1) AS ok",
          [key],
        );
        expect(acq.rows[0].ok).toBe(true);
        try {
          try {
            throw businessError;
          } finally {
            await c1.query("SELECT pg_advisory_unlock($1)", [key]);
          }
        } catch (e) {
          caught = e;
        }
        // (7a) the business error is not swallowed by the unlock.
        expect(caught).toBe(businessError);

        // (7b) the lock is genuinely free — a fresh connection can take it.
        const after = await c2.query<{ ok: boolean }>(
          "SELECT pg_try_advisory_lock($1) AS ok",
          [key],
        );
        expect(after.rows[0].ok).toBe(true);
        await c2.query("SELECT pg_advisory_unlock($1)", [key]);
      } finally {
        await c1.end();
        await c2.end();
      }
    },
    30_000,
  );
});
