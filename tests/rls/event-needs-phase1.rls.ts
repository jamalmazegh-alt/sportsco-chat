/**
 * LOT 1 — Phase 1 backend : gardes des 4 nouvelles RPC + correctif ON CONFLICT.
 *
 * Motivation : le correctif M2 (apply_to_event_need_atomic sur ON CONFLICT
 * (need_id, member_id) au lieu de (need_id, user_id)) prouve qu'une fonction
 * SECURITY DEFINER peut être livrée non-exécutable. On teste ici *par
 * exécution réelle* toutes les nouvelles RPC + le chemin nominal du apply.
 *
 *  T1  declare_unavailable_atomic : owner-only (self OK, autre user → forbidden)
 *  T2  publish_event_need_atomic : exclut les 'unavailable' lors de la relance
 *  T3  apply_to_event_need_atomic : transition 'unavailable' → 'applied'/'confirmed'
 *  T4  update_event_need_atomic : capacity_below_confirmed refusée
 *  T5  update_event_need_atomic : manual → auto n'auto-confirme PAS les applied
 *  T6  delete_event_need_draft : draft vierge OK, refus si signup / publication / status
 *  T7  apply_to_event_need_atomic : NON-RÉGRESSION — majeur, mode auto → 'confirmed'
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { admin } from "./_admin";
import { signInAs } from "./_clients";
import { getFixtures } from "./_setup";

describe("event_needs — Phase 1 backend (RPCs + apply regression)", () => {
  const createdNeeds: string[] = [];

  async function insertNeed(overrides: Record<string, unknown>): Promise<string> {
    const fx = getFixtures();
    const { data, error } = await admin
      .from("event_needs")
      .insert({
        event_id: fx.eventA,
        club_id: fx.clubA,
        team_id: fx.teamA,
        role_key: "custom",
        label: `__rls_${fx.runId}_phase1`,
        capacity: 1,
        validation_mode: "manual",
        status: "draft",
        created_by: fx.users.adminA.userId,
        ...overrides,
      })
      .select("id")
      .single();
    if (error || !data) throw new Error(`need insert: ${error?.message}`);
    createdNeeds.push(data.id as string);
    return data.id as string;
  }

  async function publishRecipient(needId: string, memberId: string, userId: string) {
    const { data, error } = await admin
      .from("event_need_publications")
      .insert({ need_id: needId, recipients_count: 1 })
      .select("id")
      .single();
    if (error || !data) throw new Error(`pub insert: ${error?.message}`);
    const { error: rErr } = await admin
      .from("event_need_publication_recipients")
      .insert({ publication_id: data.id, member_id: memberId, user_id: userId });
    if (rErr) throw new Error(`recipient insert: ${rErr.message}`);
  }

  let cmPlayerA: string;
  let cmParentA: string;

  beforeAll(async () => {
    const fx = getFixtures();
    const { data: cms } = await admin
      .from("club_members")
      .select("id, user_id")
      .eq("club_id", fx.clubA);
    cmPlayerA = cms!.find((r) => r.user_id === fx.users.playerA.userId)!.id;
    cmParentA = cms!.find((r) => r.user_id === fx.users.parentA.userId)!.id;
  });

  afterAll(async () => {
    if (createdNeeds.length) {
      await admin.from("event_needs").delete().in("id", createdNeeds);
    }
  });

  // ==================================================================
  it("T1 declare_unavailable_atomic — owner OK, autre user refusé", async () => {
    const fx = getFixtures();
    const needId = await insertNeed({
      status: "open",
      first_published_at: new Date().toISOString(),
      last_published_at: new Date().toISOString(),
    });
    await publishRecipient(needId, cmPlayerA, fx.users.playerA.userId);

    // playerA se déclare indisponible pour lui-même → OK
    const clientPlayer = await signInAs("playerA");
    const okRes = await clientPlayer.rpc("declare_unavailable_atomic", {
      _need_id: needId,
      _user_id: fx.users.playerA.userId,
    });
    expect(okRes.error, `self-call should succeed: ${okRes.error?.message}`).toBeNull();
    const row = Array.isArray(okRes.data) ? okRes.data[0] : okRes.data;
    expect((row as any)?.status).toBe("unavailable");

    // parentA tente de déclarer indispo POUR playerA → forbidden
    const clientParent = await signInAs("parentA");
    const koRes = await clientParent.rpc("declare_unavailable_atomic", {
      _need_id: needId,
      _user_id: fx.users.playerA.userId,
    });
    expect(koRes.error, "cross-user call must be rejected").not.toBeNull();
    expect(koRes.error!.message).toMatch(/forbidden/i);
  });

  // ==================================================================
  it("T2 publish/relance exclut les signups 'unavailable'", async () => {
    const fx = getFixtures();
    const needId = await insertNeed({
      capacity: 5,
      validation_mode: "manual",
      status: "draft",
    });

    // Premier publish : audience = team_parents(teamA) → doit inclure parentA.
    const audiences = [{ type: "team_parents", team_id: fx.teamA }];
    const p1 = await admin.rpc("publish_event_need_atomic", {
      _need_id: needId,
      _actor: fx.users.adminA.userId,
      _audiences: audiences,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    expect(p1.error, `publish#1: ${p1.error?.message}`).toBeNull();
    const row1 = Array.isArray(p1.data) ? p1.data[0] : p1.data;
    expect((row1 as any).recipient_user_ids).toContain(fx.users.parentA.userId);

    // parentA se déclare indisponible.
    const clientParent = await signInAs("parentA");
    const uRes = await clientParent.rpc("declare_unavailable_atomic", {
      _need_id: needId,
      _user_id: fx.users.parentA.userId,
    });
    expect(uRes.error, `declare unavailable: ${uRes.error?.message}`).toBeNull();

    // On force le besoin hors de la fenêtre d'idempotence (15s) pour tester
    // la relance sans attendre.
    await admin
      .from("event_needs")
      .update({ last_published_at: new Date(Date.now() - 60_000).toISOString() })
      .eq("id", needId);

    // Relance avec la même audience → parentA doit être exclu.
    const p2 = await admin.rpc("publish_event_need_atomic", {
      _need_id: needId,
      _actor: fx.users.adminA.userId,
      _audiences: audiences,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    expect(p2.error, `publish#2: ${p2.error?.message}`).toBeNull();
    const row2 = Array.isArray(p2.data) ? p2.data[0] : p2.data;
    expect((row2 as any).was_idempotent_skip).toBe(false);
    expect((row2 as any).recipient_user_ids ?? []).not.toContain(fx.users.parentA.userId);
  });

  // ==================================================================
  it("T3 transition 'unavailable' → 'applied' via apply_to_event_need_atomic", async () => {
    const fx = getFixtures();
    const needId = await insertNeed({
      capacity: 2,
      validation_mode: "manual",
      status: "open",
      first_published_at: new Date().toISOString(),
      last_published_at: new Date().toISOString(),
    });
    await publishRecipient(needId, cmPlayerA, fx.users.playerA.userId);

    // Étape 1 : playerA se déclare indisponible.
    const clientPlayer = await signInAs("playerA");
    const uRes = await clientPlayer.rpc("declare_unavailable_atomic", {
      _need_id: needId,
      _user_id: fx.users.playerA.userId,
    });
    expect(uRes.error, `declare_unavailable: ${uRes.error?.message}`).toBeNull();

    // Étape 2 : il revient sur sa décision → apply doit passer (ON CONFLICT
    // sur (need_id, member_id) prouvé exécutable par le correctif M2).
    const aRes = await clientPlayer.rpc("apply_to_event_need_atomic", {
      _need_id: needId,
      _user_id: fx.users.playerA.userId,
      _comment: null,
    });
    expect(aRes.error, `apply after unavailable: ${aRes.error?.message}`).toBeNull();
    const arow = Array.isArray(aRes.data) ? aRes.data[0] : aRes.data;
    // Mode manual → 'applied' (pas d'auto-confirm).
    expect((arow as any).status).toBe("applied");

    // Vérif DB : une seule ligne signup (l'ON CONFLICT a bien fait un UPDATE).
    const { count } = await admin
      .from("event_need_signups")
      .select("*", { count: "exact", head: true })
      .eq("need_id", needId);
    expect(count).toBe(1);
  });

  // ==================================================================
  it("T4 update_event_need_atomic — capacity < confirmed refusé", async () => {
    const fx = getFixtures();
    const needId = await insertNeed({
      capacity: 3,
      validation_mode: "manual",
      status: "open",
      first_published_at: new Date().toISOString(),
      last_published_at: new Date().toISOString(),
    });
    // Deux signups confirmés.
    await admin.from("event_need_signups").insert([
      {
        need_id: needId,
        member_id: cmPlayerA,
        user_id: fx.users.playerA.userId,
        status: "confirmed",
        confirmed_at: new Date().toISOString(),
      },
      {
        need_id: needId,
        member_id: cmParentA,
        user_id: fx.users.parentA.userId,
        status: "confirmed",
        confirmed_at: new Date().toISOString(),
      },
    ]);

    const bad = await admin.rpc("update_event_need_atomic", {
      _need_id: needId,
      _actor: fx.users.adminA.userId,
      _label: null,
      _description: null,
      _capacity: 1,
      _validation_mode: null,
      _has_description: false,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    expect(bad.error, "update below confirmed must fail").not.toBeNull();
    expect(bad.error!.message).toMatch(/capacity_below_confirmed/);

    // Capacité identique / supérieure → OK
    const ok = await admin.rpc("update_event_need_atomic", {
      _need_id: needId,
      _actor: fx.users.adminA.userId,
      _label: null,
      _description: null,
      _capacity: 4,
      _validation_mode: null,
      _has_description: false,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    expect(ok.error, `raise capacity: ${ok.error?.message}`).toBeNull();
  });

  // ==================================================================
  it("T5 update_event_need_atomic — manual→auto n'auto-confirme pas les applied", async () => {
    const fx = getFixtures();
    const needId = await insertNeed({
      capacity: 5,
      validation_mode: "manual",
      status: "open",
      first_published_at: new Date().toISOString(),
      last_published_at: new Date().toISOString(),
    });
    await admin.from("event_need_signups").insert([
      {
        need_id: needId,
        member_id: cmPlayerA,
        user_id: fx.users.playerA.userId,
        status: "applied",
        applied_at: new Date().toISOString(),
      },
      {
        need_id: needId,
        member_id: cmParentA,
        user_id: fx.users.parentA.userId,
        status: "applied",
        applied_at: new Date().toISOString(),
      },
    ]);

    const r = await admin.rpc("update_event_need_atomic", {
      _need_id: needId,
      _actor: fx.users.adminA.userId,
      _label: null,
      _description: null,
      _capacity: null,
      _validation_mode: "auto",
      _has_description: false,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    expect(r.error, `switch to auto: ${r.error?.message}`).toBeNull();

    // Les 'applied' restent 'applied' (aucune bascule rétroactive).
    const { data: rows } = await admin
      .from("event_need_signups")
      .select("status")
      .eq("need_id", needId);
    const statuses = (rows ?? []).map((r) => r.status).sort();
    expect(statuses).toEqual(["applied", "applied"]);
  });

  // ==================================================================
  it("T6 delete_event_need_draft — draft vierge OK, refus sinon", async () => {
    const fx = getFixtures();

    // (a) draft vierge → OK
    const draftId = await insertNeed({ status: "draft" });
    const okRes = await admin.rpc("delete_event_need_draft", {
      _need_id: draftId,
      _actor: fx.users.adminA.userId,
    });
    expect(okRes.error, `delete draft empty: ${okRes.error?.message}`).toBeNull();
    // Il n'est plus en base → on le retire de la liste de cleanup.
    const idx = createdNeeds.indexOf(draftId);
    if (idx >= 0) createdNeeds.splice(idx, 1);
    const { data: gone } = await admin.from("event_needs").select("id").eq("id", draftId);
    expect(gone ?? []).toHaveLength(0);

    // (b) draft avec un signup → refus 'need_has_signups'
    const withSigId = await insertNeed({ status: "draft" });
    await admin.from("event_need_signups").insert({
      need_id: withSigId,
      member_id: cmPlayerA,
      user_id: fx.users.playerA.userId,
      status: "applied",
      applied_at: new Date().toISOString(),
    });
    const koSig = await admin.rpc("delete_event_need_draft", {
      _need_id: withSigId,
      _actor: fx.users.adminA.userId,
    });
    expect(koSig.error).not.toBeNull();
    expect(koSig.error!.message).toMatch(/need_has_signups/);

    // (c) draft avec une publication → refus 'need_has_publications'
    const withPubId = await insertNeed({ status: "draft" });
    await admin
      .from("event_need_publications")
      .insert({ need_id: withPubId, recipients_count: 0 });
    const koPub = await admin.rpc("delete_event_need_draft", {
      _need_id: withPubId,
      _actor: fx.users.adminA.userId,
    });
    expect(koPub.error).not.toBeNull();
    expect(koPub.error!.message).toMatch(/need_has_publications/);

    // (d) besoin déjà publié (status='open') → refus 'need_not_draft'
    const openId = await insertNeed({
      status: "open",
      first_published_at: new Date().toISOString(),
      last_published_at: new Date().toISOString(),
    });
    const koOpen = await admin.rpc("delete_event_need_draft", {
      _need_id: openId,
      _actor: fx.users.adminA.userId,
    });
    expect(koOpen.error).not.toBeNull();
    expect(koOpen.error!.message).toMatch(/need_not_draft/);
  });

  // ==================================================================
  it("T7 apply_to_event_need_atomic — majeur en mode auto → 'confirmed' (NON-RÉGRESSION)", async () => {
    // Ce test cible EXACTEMENT le chemin qui a été cassé par le bug
    // ON CONFLICT (need_id, user_id) : le "Je me propose" nominal.
    const fx = getFixtures();
    const needId = await insertNeed({
      capacity: 3,
      validation_mode: "auto",
      status: "open",
      first_published_at: new Date().toISOString(),
      last_published_at: new Date().toISOString(),
    });
    await publishRecipient(needId, cmPlayerA, fx.users.playerA.userId);

    const clientPlayer = await signInAs("playerA");
    const res = await clientPlayer.rpc("apply_to_event_need_atomic", {
      _need_id: needId,
      _user_id: fx.users.playerA.userId,
      _comment: null,
    });
    expect(
      res.error,
      `apply nominal (bug ON CONFLICT) — must succeed: ${res.error?.message}`,
    ).toBeNull();
    const row = Array.isArray(res.data) ? res.data[0] : res.data;
    expect((row as any).status).toBe("confirmed");
    expect((row as any).auto_confirmed).toBe(true);
    expect((row as any).is_minor).toBe(false);
  });
});
