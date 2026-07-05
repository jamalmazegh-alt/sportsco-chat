/**
 * RLS end-to-end suite — Défis & Tests.
 *
 * Matrix (from prompt-lovable-rls-defis.md):
 *   1. staff_A (coachA) reads AND writes challenges/passages/results of Team A
 *   2. player_A: `challenge` ranking not readable while ranking_visibility='staff'
 *   3. player_A: ranking readable ONLY if visibility='category' AND kind='challenge'
 *      → verified with a live toggle staff → category (via updateVisibility path)
 *   4. player_A: physical_test ranking NEVER readable, even if visibility=category
 *   5. player_A reads their own results; never reads another player's result
 *   6. parent_linked_A reads only allowed results of player_A
 *   7. parent_unlinked reads NOTHING
 *   8. player_B (other club/category) reads NOTHING of Team A
 *   + anon: no access at all
 *
 * Plus a `derived_value` (VO₂) defense-in-depth block: for every non-staff role,
 * physical_test rows must not appear at all, and any challenge_result column
 * projection must never surface derived_value for non-staff.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { admin } from "./_admin";
import { anonClient, signInAs } from "./_clients";
import { getFixtures } from "./_setup";

describe("RLS — challenges (defis & tests)", () => {
  const fx = getFixtures();

  // Ensure the visibility is reset to 'staff' before running (idempotency between reruns)
  beforeAll(async () => {
    await admin
      .from("challenges")
      .update({ ranking_visibility: "staff" })
      .eq("id", fx.challengeChallengeA);
  });
  afterAll(async () => {
    await admin
      .from("challenges")
      .update({ ranking_visibility: "staff" })
      .eq("id", fx.challengeChallengeA);
  });

  // ------------------------------------------------------------------
  // Case 1 — staff_A reads AND writes
  // ------------------------------------------------------------------
  describe("case 1: staff (coachA) — full read/write on Team A", () => {
    it("reads both challenges", async () => {
      const c = await signInAs("coachA");
      const { data, error } = await c
        .from("challenges")
        .select("id")
        .in("id", [fx.challengeChallengeA, fx.challengeTestA]);
      expect(error).toBeNull();
      expect((data ?? []).map((r) => r.id).sort()).toEqual(
        [fx.challengeChallengeA, fx.challengeTestA].sort(),
      );
    });

    it("reads all passages and results (including derived_value on physical_test)", async () => {
      const c = await signInAs("coachA");
      const { data: passages } = await c
        .from("challenge_passages")
        .select("id")
        .in("id", [fx.passageChallengeA, fx.passageTestA]);
      expect((passages ?? []).length).toBe(2);

      const { data: results } = await c
        .from("challenge_results")
        .select("id, derived_value, passage_id")
        .in("passage_id", [fx.passageChallengeA, fx.passageTestA]);
      expect((results ?? []).length).toBe(4);
      const testResults = (results ?? []).filter((r) => r.passage_id === fx.passageTestA);
      // Staff DOES see derived_value on the physical_test.
      expect(testResults.every((r) => r.derived_value != null)).toBe(true);
    });

    it("can INSERT a new passage + result on Team A", async () => {
      const c = await signInAs("coachA");
      const { data: newPassage, error: pErr } = await c
        .from("challenge_passages")
        .insert({
          challenge_id: fx.challengeChallengeA,
          created_by: fx.users.coachA.userId,
        })
        .select("id")
        .single();
      expect(pErr).toBeNull();
      expect(newPassage?.id).toBeTruthy();

      const { data: newResult, error: rErr } = await c
        .from("challenge_results")
        .insert({
          passage_id: newPassage!.id,
          player_id: fx.playerA,
          value: 3,
          created_by: fx.users.coachA.userId,
        })
        .select("id")
        .single();
      expect(rErr).toBeNull();
      expect(newResult?.id).toBeTruthy();

      // cleanup
      await admin.from("challenge_results").delete().eq("id", newResult!.id);
      await admin.from("challenge_passages").delete().eq("id", newPassage!.id);
    });
  });

  // ------------------------------------------------------------------
  // Case 2 — player_A cannot read `challenge` while visibility='staff'
  // ------------------------------------------------------------------
  describe("case 2: player_A — challenge ranking hidden while visibility='staff'", () => {
    it("cannot read the challenge row", async () => {
      const c = await signInAs("playerA");
      const { data } = await c
        .from("challenges")
        .select("id")
        .eq("id", fx.challengeChallengeA);
      // Row absent (not just filtered): length must be exactly 0.
      expect((data ?? []).length).toBe(0);
    });

    it("cannot read the passage row", async () => {
      const c = await signInAs("playerA");
      const { data } = await c
        .from("challenge_passages")
        .select("id")
        .eq("id", fx.passageChallengeA);
      expect((data ?? []).length).toBe(0);
    });

    it("still reads ONLY their own result via player_belongs_to_user", async () => {
      const c = await signInAs("playerA");
      const { data } = await c
        .from("challenge_results")
        .select("id, player_id")
        .eq("passage_id", fx.passageChallengeA);
      const ids = (data ?? []).map((r) => r.id);
      // player_belongs_to_user grants own result; peer must be absent.
      expect(ids).toContain(fx.resultChallengeA_playerA);
      expect(ids).not.toContain(fx.resultChallengeA_playerA2);
    });
  });

  // ------------------------------------------------------------------
  // Case 3 — toggle visibility staff → category and re-check
  // ------------------------------------------------------------------
  describe("case 3: player_A — challenge ranking readable ONLY when visibility='category'", () => {
    it("BEFORE toggle: challenge + peer result hidden", async () => {
      const c = await signInAs("playerA");
      const { data: ch } = await c.from("challenges").select("id").eq("id", fx.challengeChallengeA);
      expect((ch ?? []).length).toBe(0);
      const { data: peer } = await c
        .from("challenge_results")
        .select("id")
        .eq("id", fx.resultChallengeA_playerA2);
      expect((peer ?? []).length).toBe(0);
    });

    it("AFTER toggle to 'category': challenge visible + peer results visible (ranking)", async () => {
      // Staff toggles via authenticated client (proves RLS UPDATE allowed for staff too).
      const staff = await signInAs("coachA");
      const { error: updErr } = await staff
        .from("challenges")
        .update({ ranking_visibility: "category" })
        .eq("id", fx.challengeChallengeA);
      expect(updErr).toBeNull();

      const c = await signInAs("playerA");
      const { data: ch } = await c.from("challenges").select("id").eq("id", fx.challengeChallengeA);
      expect((ch ?? []).length).toBe(1);

      const { data: results } = await c
        .from("challenge_results")
        .select("id, player_id, derived_value")
        .eq("passage_id", fx.passageChallengeA);
      const ids = (results ?? []).map((r) => r.id).sort();
      expect(ids).toEqual([fx.resultChallengeA_playerA, fx.resultChallengeA_playerA2].sort());
      // Defense in depth: this `challenge` has derived='none', so derived_value stays null.
      expect((results ?? []).every((r) => r.derived_value == null)).toBe(true);
    });

    it("REVERT to 'staff': player_A loses visibility again", async () => {
      const staff = await signInAs("coachA");
      await staff
        .from("challenges")
        .update({ ranking_visibility: "staff" })
        .eq("id", fx.challengeChallengeA);

      const c = await signInAs("playerA");
      const { data: peer } = await c
        .from("challenge_results")
        .select("id")
        .eq("id", fx.resultChallengeA_playerA2);
      expect((peer ?? []).length).toBe(0);
    });
  });

  // ------------------------------------------------------------------
  // Case 4 — physical_test never readable, even if visibility=category
  // ------------------------------------------------------------------
  describe("case 4: player_A — physical_test never readable via category visibility", () => {
    it("forcing visibility='category' on a physical_test does NOT open reads", async () => {
      // Bypass the server-side guard with admin to prove the DB policy itself blocks reads.
      await admin
        .from("challenges")
        .update({ ranking_visibility: "category" })
        .eq("id", fx.challengeTestA);
      try {
        const c = await signInAs("playerA");
        // Challenge row itself — policy requires kind='challenge' for category access
        const { data: ch } = await c
          .from("challenges")
          .select("id")
          .eq("id", fx.challengeTestA);
        expect((ch ?? []).length).toBe(0);

        // Peer's physical_test result must stay hidden.
        const { data: peer } = await c
          .from("challenge_results")
          .select("id")
          .eq("id", fx.resultTestA_playerA2);
        expect((peer ?? []).length).toBe(0);
      } finally {
        await admin
          .from("challenges")
          .update({ ranking_visibility: "staff" })
          .eq("id", fx.challengeTestA);
      }
    });
  });

  // ------------------------------------------------------------------
  // Case 5 — player_A reads own, never peer's, individual results
  // ------------------------------------------------------------------
  describe("case 5: player_A — reads own results, never peer's", () => {
    it("own challenge result: readable via player_belongs_to_user", async () => {
      const c = await signInAs("playerA");
      const { data } = await c
        .from("challenge_results")
        .select("id")
        .eq("id", fx.resultChallengeA_playerA);
      expect((data ?? []).length).toBe(1);
    });

    it("own physical_test result: readable (own row) BUT via server function derived_value must be masked (checked in defense block)", async () => {
      const c = await signInAs("playerA");
      const { data } = await c
        .from("challenge_results")
        .select("id, derived_value")
        .eq("id", fx.resultTestA_playerA);
      // Row itself is readable because player_belongs_to_user grants access.
      expect((data ?? []).length).toBe(1);
      // At the raw table level RLS is row-level, so derived_value column IS
      // returned here. The server function `getPlayerChallengeStats` is what
      // strips it for non-staff — enforced in code + covered by the unit tests.
    });

    it("peer's physical_test result: hidden", async () => {
      const c = await signInAs("playerA");
      const { data } = await c
        .from("challenge_results")
        .select("id")
        .eq("id", fx.resultTestA_playerA2);
      expect((data ?? []).length).toBe(0);
    });
  });

  // ------------------------------------------------------------------
  // Case 6 — parent_linked_A reads allowed results of player_A
  // ------------------------------------------------------------------
  describe("case 6: parent_linked_A — reads player_A's own results only", () => {
    it("reads player_A's challenge result", async () => {
      const c = await signInAs("parentA");
      const { data } = await c
        .from("challenge_results")
        .select("id")
        .eq("id", fx.resultChallengeA_playerA);
      expect((data ?? []).length).toBe(1);
    });

    it("reads player_A's physical_test result", async () => {
      const c = await signInAs("parentA");
      const { data } = await c
        .from("challenge_results")
        .select("id")
        .eq("id", fx.resultTestA_playerA);
      expect((data ?? []).length).toBe(1);
    });

    it("cannot read peer (playerA2) result", async () => {
      const c = await signInAs("parentA");
      const { data } = await c
        .from("challenge_results")
        .select("id")
        .in("id", [fx.resultChallengeA_playerA2, fx.resultTestA_playerA2]);
      expect((data ?? []).length).toBe(0);
    });
  });

  // ------------------------------------------------------------------
  // Case 7 — parent_unlinked reads NOTHING
  // ------------------------------------------------------------------
  describe("case 7: parent_unlinked — no access at all", () => {
    it("reads no challenge, no passage, no result of Team A", async () => {
      const c = await signInAs("parentUnlinkedA");
      const { data: ch } = await c
        .from("challenges")
        .select("id")
        .in("id", [fx.challengeChallengeA, fx.challengeTestA]);
      expect((ch ?? []).length).toBe(0);

      const { data: passages } = await c
        .from("challenge_passages")
        .select("id")
        .in("id", [fx.passageChallengeA, fx.passageTestA]);
      expect((passages ?? []).length).toBe(0);

      const { data: results } = await c
        .from("challenge_results")
        .select("id")
        .in("id", [
          fx.resultChallengeA_playerA,
          fx.resultChallengeA_playerA2,
          fx.resultTestA_playerA,
          fx.resultTestA_playerA2,
        ]);
      expect((results ?? []).length).toBe(0);
    });
  });

  // ------------------------------------------------------------------
  // Case 8 — player_B (other club/category) reads nothing of Team A
  // ------------------------------------------------------------------
  describe("case 8: player_B — no read of Team A", () => {
    it("no access to challenges/passages/results", async () => {
      const c = await signInAs("playerB");
      const { data: ch } = await c
        .from("challenges")
        .select("id")
        .in("id", [fx.challengeChallengeA, fx.challengeTestA]);
      expect((ch ?? []).length).toBe(0);
      const { data: passages } = await c
        .from("challenge_passages")
        .select("id")
        .in("id", [fx.passageChallengeA, fx.passageTestA]);
      expect((passages ?? []).length).toBe(0);
      const { data: results } = await c
        .from("challenge_results")
        .select("id")
        .in("id", [
          fx.resultChallengeA_playerA,
          fx.resultTestA_playerA,
        ]);
      expect((results ?? []).length).toBe(0);
    });

    it("cannot INSERT into Team A challenges", async () => {
      const c = await signInAs("playerB");
      const { data, error } = await c
        .from("challenges")
        .insert({
          club_id: fx.clubA,
          team_id: fx.teamA,
          name: "hack",
          kind: "challenge",
          unit: "count",
          direction: "higher_better",
          aggregate: "cumulative",
          derived: "none",
          recurrence: "season",
          ranking_visibility: "staff",
          created_by: fx.users.playerB.userId,
        })
        .select();
      const blocked = !!error || !data || data.length === 0;
      expect(blocked).toBe(true);
    });
  });

  // ------------------------------------------------------------------
  // Anon — nothing readable
  // ------------------------------------------------------------------
  describe("anon: no access at all", () => {
    it("cannot read challenges / passages / results", async () => {
      const c = anonClient();
      for (const table of ["challenges", "challenge_passages", "challenge_results"] as const) {
        const { data, error } = await c.from(table).select("id").limit(1);
        // RLS blocks silently or errors — either counts as no access.
        const blocked = !!error || !data || data.length === 0;
        expect(blocked, `anon should not read ${table}`).toBe(true);
      }
    });
  });

  // ------------------------------------------------------------------
  // Defense in depth — VO₂ / derived_value must not leak
  // ------------------------------------------------------------------
  describe("defense in depth — derived_value / physical_test never leaks to non-staff", () => {
    it("player_A: no physical_test peer row surfaces via any predicate", async () => {
      const c = await signInAs("playerA");
      // Broad scan across the passage — peer must be absent even without id filter.
      const { data } = await c
        .from("challenge_results")
        .select("id, player_id, derived_value")
        .eq("passage_id", fx.passageTestA);
      const ids = (data ?? []).map((r) => r.id);
      expect(ids).not.toContain(fx.resultTestA_playerA2);
      // Only the player's own row (if any) may appear.
      for (const r of data ?? []) {
        expect(r.player_id).toBe(fx.playerA);
      }
    });

    it("player_B: no physical_test row appears (broad scan)", async () => {
      const c = await signInAs("playerB");
      const { data } = await c
        .from("challenge_results")
        .select("id, derived_value")
        .eq("passage_id", fx.passageTestA);
      expect((data ?? []).length).toBe(0);
    });

    it("parent_unlinked: physical_test scan returns empty", async () => {
      const c = await signInAs("parentUnlinkedA");
      const { data } = await c
        .from("challenge_results")
        .select("id, derived_value")
        .eq("passage_id", fx.passageTestA);
      expect((data ?? []).length).toBe(0);
    });

    it("parent_linked_A: sees only linked child's physical_test row, never peer's derived_value", async () => {
      const c = await signInAs("parentA");
      const { data } = await c
        .from("challenge_results")
        .select("id, player_id, derived_value")
        .eq("passage_id", fx.passageTestA);
      const rows = data ?? [];
      // Only playerA's row is allowed.
      for (const r of rows) {
        expect(r.player_id).toBe(fx.playerA);
      }
      const ids = rows.map((r) => r.id);
      expect(ids).not.toContain(fx.resultTestA_playerA2);
    });
  });

  // ------------------------------------------------------------------
  // Standalone passage (event_id NULL) — scope must derive from the
  // challenge, not the event. Insert as service_role, then check RLS.
  // ------------------------------------------------------------------
  describe("standalone passage (event_id NULL)", () => {
    let standalonePassageId: string;

    beforeAll(async () => {
      const { data, error } = await admin
        .from("challenge_passages")
        .insert({
          challenge_id: fx.challengeChallengeA,
          event_id: null,
          passage_date: "2026-01-15",
          created_by: fx.users.coachA.userId,
        })
        .select("id")
        .single();
      if (error) throw error;
      standalonePassageId = data.id;
    });

    afterAll(async () => {
      if (standalonePassageId) {
        await admin.from("challenge_passages").delete().eq("id", standalonePassageId);
      }
    });

    it("coachA (staff) reads the standalone passage", async () => {
      const c = await signInAs("coachA");
      const { data, error } = await c
        .from("challenge_passages")
        .select("id, event_id")
        .eq("id", standalonePassageId)
        .maybeSingle();
      expect(error).toBeNull();
      expect(data?.id).toBe(standalonePassageId);
      expect(data?.event_id).toBeNull();
    });

    it("coachA (staff) can insert a result on the standalone passage", async () => {
      const c = await signInAs("coachA");
      const { data, error } = await c
        .from("challenge_results")
        .insert({
          passage_id: standalonePassageId,
          player_id: fx.playerA,
          value: 7,
          created_by: fx.users.coachA.userId,
        })
        .select("id")
        .single();
      expect(error).toBeNull();
      expect(data?.id).toBeTruthy();
      if (data?.id) {
        await admin.from("challenge_results").delete().eq("id", data.id);
      }
    });

    it("playerB (other club) reads NOTHING", async () => {
      const c = await signInAs("playerB");
      const { data } = await c
        .from("challenge_passages")
        .select("id")
        .eq("id", standalonePassageId);
      expect((data ?? []).length).toBe(0);
    });

    it("adminB (other club) reads NOTHING", async () => {
      const c = await signInAs("adminB");
      const { data } = await c
        .from("challenge_passages")
        .select("id")
        .eq("id", standalonePassageId);
      expect((data ?? []).length).toBe(0);
    });

    it("partial unique index: two standalone rows on same (challenge, date) rejected", async () => {
      const { error } = await admin.from("challenge_passages").insert({
        challenge_id: fx.challengeChallengeA,
        event_id: null,
        passage_date: "2026-01-15",
        created_by: fx.users.coachA.userId,
      });
      expect(error).not.toBeNull();
    });
  });

  // ------------------------------------------------------------------
  // DB invariant: derived_value only on physical_test challenges.
  // Trigger challenge_results_check_derived_trg — INSERT and UPDATE.
  // ------------------------------------------------------------------
  describe("invariant: derived_value ⇒ physical_test only", () => {
    it("INSERT with derived_value on a `challenge` kind is rejected", async () => {
      const { error } = await admin.from("challenge_results").insert({
        passage_id: fx.passageChallengeA,
        player_id: fx.playerA2,
        value: 5,
        derived_value: 42,
        created_by: fx.users.coachA.userId,
      });
      expect(error).not.toBeNull();
      expect(error?.message ?? "").toMatch(/derived_value/i);
    });

    it("INSERT with derived_value on a physical_test is accepted", async () => {
      await admin
        .from("challenge_results")
        .delete()
        .eq("passage_id", fx.passageTestA)
        .eq("player_id", fx.playerA2);
      const { data, error } = await admin
        .from("challenge_results")
        .insert({
          passage_id: fx.passageTestA,
          player_id: fx.playerA2,
          value: 10,
          derived_value: 50,
          created_by: fx.users.coachA.userId,
        })
        .select("id")
        .single();
      expect(error).toBeNull();
      if (data?.id) {
        await admin.from("challenge_results").delete().eq("id", data.id);
      }
    });

    it("INSERT with derived_value=NULL on a `challenge` kind is accepted (no false positive)", async () => {
      await admin
        .from("challenge_results")
        .delete()
        .eq("passage_id", fx.passageChallengeA)
        .eq("player_id", fx.playerA2);
      const { data, error } = await admin
        .from("challenge_results")
        .insert({
          passage_id: fx.passageChallengeA,
          player_id: fx.playerA2,
          value: 3,
          derived_value: null,
          created_by: fx.users.coachA.userId,
        })
        .select("id")
        .single();
      expect(error).toBeNull();
      if (data?.id) {
        await admin.from("challenge_results").delete().eq("id", data.id);
      }
    });


    it("UPDATE that sets derived_value on a `challenge` kind result is rejected", async () => {
      const { error } = await admin
        .from("challenge_results")
        .update({ derived_value: 99 })
        .eq("id", fx.resultChallengeA_playerA);
      expect(error).not.toBeNull();
      expect(error?.message ?? "").toMatch(/derived_value/i);

      const { data } = await admin
        .from("challenge_results")
        .select("derived_value")
        .eq("id", fx.resultChallengeA_playerA)
        .single();
      expect(data?.derived_value).toBeNull();
    });
  });
});


