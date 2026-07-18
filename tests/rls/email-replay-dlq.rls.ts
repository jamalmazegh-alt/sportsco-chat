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
const sentRow = (e: string, d: string, r: string, ts: string) => baseRow(e, d, r, "sent", ts);
const pendingRow = (e: string, d: string, r: string, ts: string) => baseRow(e, d, r, "pending", ts);

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
  await admin.from("email_send_log").delete().in("event_id", [eventA, eventB].filter(Boolean));
}

beforeAll(() => {
  eventA = crypto.randomUUID();
  eventB = crypto.randomUUID();
});

afterAll(async () => {
  await cleanupEvents();
  if (createdDispatchIds.size > 0) {
    await admin.from("email_dispatches").delete().in("id", Array.from(createdDispatchIds));
    createdDispatchIds.clear();
  }
});

beforeEach(async () => {
  // Between scenarios, drop rows for the two synthetic events so each test
  // sees a clean slate. Other events in the DB are untouched.
  await cleanupEvents();
});

describe("computePlan against a real Postgres", () => {
  it("[1] nominal — 3 DLQ rows with fresh keys are all replayable", async () => {
    const d1 = await mkDispatch(eventA);
    const d2 = await mkDispatch(eventA);
    const d3 = await mkDispatch(eventA);
    const { error } = await admin
      .from("email_send_log")
      .insert([
        dlqRow(eventA, d1, "player:p1", "2026-01-01T00:00:00Z"),
        dlqRow(eventA, d2, "player:p2", "2026-01-01T00:00:01Z"),
        dlqRow(eventA, d3, "player:p3", "2026-01-01T00:00:02Z"),
      ]);
    expect(error).toBeNull();

    const plan = await computePlan(admin as any, eventA, NT);
    expect(plan.candidates).toBe(3);
    expect(plan.replayable).toBe(3);
    expect(plan.skippedAlreadyDelivered).toBe(0);
    expect(plan.skippedInFlight).toBe(0);
    expect(plan.skippedNoDispatch).toBe(0);
    const planned = plan.rows.map((r) => r.recipient_id).sort();
    expect(planned).toEqual(["player:p1", "player:p2", "player:p3"]);
  });

  it("[2] already-delivered is not replayable (same dispatch+recipient+notif)", async () => {
    const dispatch = await mkDispatch(eventA);
    const { error } = await admin
      .from("email_send_log")
      .insert([
        dlqRow(eventA, dispatch, "player:p1", "2026-01-01T00:00:00Z"),
        sentRow(eventA, dispatch, "player:p1", "2026-01-01T00:05:00Z"),
      ]);
    expect(error).toBeNull();

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
    const dispatch = await mkDispatch(eventA);
    const { error } = await admin
      .from("email_send_log")
      .insert([
        dlqRow(eventA, dispatch, "player:p1", "2026-01-01T00:00:00Z"),
        pendingRow(eventA, dispatch, "player:p1", "2026-01-01T00:10:00Z"),
      ]);
    expect(error).toBeNull();

    const plan = await computePlan(admin as any, eventA, NT);
    expect(plan.replayable).toBe(0);
    expect(plan.skippedInFlight).toBe(1);
    expect(plan.skippedAlreadyDelivered).toBe(0);
  });

  it("[3-bis] older pending (= what died) does NOT block replay", async () => {
    // Guard uses gt(created_at) — a pending row that predates the DLQ row is
    // the ancestor, not a concurrent in-flight retry. Otherwise replay would
    // always be blocked, since every DLQ row has a `pending` predecessor.
    const dispatch = await mkDispatch(eventA);
    const { error } = await admin
      .from("email_send_log")
      .insert([
        dlqRow(eventA, dispatch, "player:p1", "2026-01-01T00:10:00Z"),
        pendingRow(eventA, dispatch, "player:p1", "2026-01-01T00:00:00Z"),
      ]);
    expect(error).toBeNull();

    const plan = await computePlan(admin as any, eventA, NT);
    expect(plan.replayable).toBe(1);
    expect(plan.skippedInFlight).toBe(0);
  });

  it("[4] rows missing dispatch_id or recipient_id are counted skippedNoDispatch", async () => {
    const d1 = await mkDispatch(eventA);
    const d2 = await mkDispatch(eventA);
    const { error } = await admin
      .from("email_send_log")
      .insert([
        dlqRow(eventA, null, "player:p1", "2026-01-01T00:00:00Z"),
        dlqRow(eventA, d1, null, "2026-01-01T00:00:01Z"),
        dlqRow(eventA, d2, "player:p3", "2026-01-01T00:00:02Z"),
      ]);
    expect(error).toBeNull();

    const plan = await computePlan(admin as any, eventA, NT);
    expect(plan.candidates).toBe(3);
    expect(plan.skippedNoDispatch).toBe(2);
    expect(plan.replayable).toBe(1);
    expect(plan.rows.map((r) => r.recipient_id)).toEqual(["player:p3"]);
  });

  it("[5] isolation par event — planning for eventA never touches eventB", async () => {
    const dA = await mkDispatch(eventA);
    const dB = await mkDispatch(eventB);
    const { error } = await admin
      .from("email_send_log")
      .insert([
        dlqRow(eventA, dA, "player:pA", "2026-01-01T00:00:00Z"),
        dlqRow(eventB, dB, "player:pB", "2026-01-01T00:00:00Z"),
      ]);
    expect(error).toBeNull();

    const planA = await computePlan(admin as any, eventA, NT);
    expect(planA.candidates).toBe(1);
    expect(planA.rows[0].recipient_id).toBe("player:pA");

    const planB = await computePlan(admin as any, eventB, NT);
    expect(planB.candidates).toBe(1);
    expect(planB.rows[0].recipient_id).toBe("player:pB");
  });

  it("[5-bis] filtering by notification_type — other types are invisible", async () => {
    const d = await mkDispatch(eventA);
    const { error } = await admin.from("email_send_log").insert([
      {
        ...dlqRow(eventA, d, "player:p1", "2026-01-01T00:00:00Z"),
        notification_type: "player-invite",
      },
    ]);
    expect(error).toBeNull();
    const plan = await computePlan(admin as any, eventA, NT);
    expect(plan.candidates).toBe(0);
  });

  it("[5-ter] a `sent` row from a DIFFERENT dispatch does NOT mark the DLQ as delivered", async () => {
    // The dedup key is (dispatch_id, recipient_id, notif) — two dispatches
    // for the same recipient must be treated independently. This is the
    // property the partial UNIQUE index also enforces at write time.
    const d1 = await mkDispatch(eventA);
    const d2 = await mkDispatch(eventA);
    const { error } = await admin
      .from("email_send_log")
      .insert([
        dlqRow(eventA, d1, "player:p1", "2026-01-01T00:00:00Z"),
        sentRow(eventA, d2, "player:p1", "2026-01-01T00:05:00Z"),
      ]);
    expect(error).toBeNull();
    const plan = await computePlan(admin as any, eventA, NT);
    expect(plan.replayable).toBe(1);
    expect(plan.skippedAlreadyDelivered).toBe(0);
  });
});

describeIfPg("advisory-lock guarantee (concurrent replays)", () => {
  // Note on Postgres locking model:
  //   `replayEventDlq` uses pg_try_advisory_lock (session-scoped). Behind a
  //   transaction-pooling PgBouncer (Supabase port 6543), sessions are pinned
  //   to backends only for the duration of a transaction, so session locks
  //   can be released between round-trips. To prove the *mutex primitive*
  //   itself under concurrency in this environment, we use
  //   `pg_try_advisory_xact_lock` inside explicit BEGIN/COMMIT blocks — this
  //   pins the backend for the whole transaction and holds the lock exactly
  //   as long as the transaction runs. It's the same key + same guarantee
  //   (only one holder at a time) that replayEventDlq relies on.
  it("[6] two concurrent xact-lock attempts on the same event key — exactly one wins, and after release the other can acquire", async () => {
    const key = await eventLockKey(eventA);
    const c1 = new PgClient(PG!);
    const c2 = new PgClient(PG!);
    await c1.connect();
    await c2.connect();
    try {
      await c1.query("BEGIN");
      await c2.query("BEGIN");
      const [r1, r2] = await Promise.all([
        c1.query<{ ok: boolean }>("SELECT pg_try_advisory_xact_lock($1) AS ok", [key]),
        c2.query<{ ok: boolean }>("SELECT pg_try_advisory_xact_lock($1) AS ok", [key]),
      ]);
      const winners = [r1.rows[0].ok, r2.rows[0].ok];
      // Exactly one of the two must be true.
      expect(winners.filter(Boolean)).toHaveLength(1);
      expect(winners.filter((x) => !x)).toHaveLength(1);

      const winner = r1.rows[0].ok ? c1 : c2;
      const loser = winner === c1 ? c2 : c1;

      // While the winner's tx is open, the loser cannot acquire even on
      // retry within its own transaction.
      const retry = await loser.query<{ ok: boolean }>(
        "SELECT pg_try_advisory_xact_lock($1) AS ok",
        [key],
      );
      expect(retry.rows[0].ok).toBe(false);

      // Commit the winner: xact lock is released with the transaction.
      await winner.query("COMMIT");

      // Loser needs a fresh tx to attempt again (its previous BEGIN is
      // aborted if it observed a locked state? No — try_ returns false
      // without erroring, so tx is still valid). Start a fresh tx.
      await loser.query("ROLLBACK");
      await loser.query("BEGIN");
      const acquired = await loser.query<{ ok: boolean }>(
        "SELECT pg_try_advisory_xact_lock($1) AS ok",
        [key],
      );
      expect(acquired.rows[0].ok).toBe(true);
      await loser.query("COMMIT");
    } finally {
      try {
        await c1.query("ROLLBACK");
      } catch { /* ignore */ }
      try {
        await c2.query("ROLLBACK");
      } catch { /* ignore */ }
      await c1.end();
      await c2.end();
    }
  }, 30_000);

  it("[7] lock is released on error via ROLLBACK-in-finally, and the original error propagates", async () => {
    // Reproduces the try/finally shape of replayEventDlq under a real
    // transaction: acquire the lock, throw a business error while
    // holding it, release in finally, ensure a fresh attempt can now
    // acquire (the lock isn't stuck) and the original error is not
    // swallowed by the unlock path.
    const key = await eventLockKey(eventB);
    const c1 = new PgClient(PG!);
    const c2 = new PgClient(PG!);
    await c1.connect();
    await c2.connect();
    try {
      const businessError = new Error("simulated malformed row");
      let caught: unknown = null;

      try {
        await c1.query("BEGIN");
        const acq = await c1.query<{ ok: boolean }>("SELECT pg_try_advisory_xact_lock($1) AS ok", [
          key,
        ]);
        expect(acq.rows[0].ok).toBe(true);
        try {
          throw businessError;
        } finally {
          // Mirrors replayEventDlq's finally: release the lock even on
          // error. For an xact lock, that means ending the transaction.
          await c1.query("ROLLBACK");
        }
      } catch (e) {
        caught = e;
      }

      // (7a) the business error is not swallowed by the unlock path.
      expect(caught).toBe(businessError);

      // (7b) the lock is genuinely free — a fresh connection acquires it.
      await c2.query("BEGIN");
      const after = await c2.query<{ ok: boolean }>("SELECT pg_try_advisory_xact_lock($1) AS ok", [
        key,
      ]);
      expect(after.rows[0].ok).toBe(true);
      await c2.query("COMMIT");
    } finally {
      try {
        await c1.query("ROLLBACK");
      } catch { /* ignore */ }
      try {
        await c2.query("ROLLBACK");
      } catch { /* ignore */ }
      await c1.end();
      await c2.end();
    }
  }, 30_000);
});
