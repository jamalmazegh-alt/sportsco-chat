/**
 * 18 — Conversion club perso → vrai club — final
 *
 * Fix : vérifier explicitement que l'insert club_members réussit.
 * Si ça échoue, lever une erreur claire plutôt que de laisser
 * la RPC échouer avec "forbidden" sans explication.
 *
 * La RLS convert_personal_club_to_real vérifie :
 *   has_club_role(auth.uid(), _club_id, 'admin') → club_members
 * L'admin E2E doit donc être dans club_members avec role='admin'
 * AVANT d'appeler la RPC.
 */
import { test, expect } from "@playwright/test";
import { clientFor } from "./_fixtures/auth";
import { createTestClub, type SeededClub } from "./_fixtures/club";

test.describe("Convert personal club → real club", () => {
  let personalClubId: string;
  let personalClub2Id: string;
  let helperClub: SeededClub;
  let adminClient: Awaited<ReturnType<typeof clientFor>>;

  test.beforeAll(async () => {
    helperClub = await createTestClub("convpersonal");
    adminClient = await clientFor(helperClub.admin);

    // ── Club 1 ──────────────────────────────────────────────────────────
    const { data: club1, error: e1 } = await adminClient
      .from("clubs")
      .insert({
        name: "__e2e_personal_test_1",
        is_personal: true,
        created_by: helperClub.admin.userId,
      })
      .select("id")
      .single();
    if (e1 || !club1) throw new Error(`club1 insert: ${e1?.message}`);
    personalClubId = club1.id;

    // Insérer l'admin dans club_members et vérifier que ça passe
    const { error: cm1Err } = await adminClient
      .from("club_members")
      .insert({
        club_id: personalClubId,
        user_id: helperClub.admin.userId,
        role: "admin",
      });
    if (cm1Err) throw new Error(`club_members insert club1: ${cm1Err.message}`);

    // ── Club 2 ──────────────────────────────────────────────────────────
    const { data: club2, error: e2 } = await adminClient
      .from("clubs")
      .insert({
        name: "__e2e_personal_test_2",
        is_personal: true,
        created_by: helperClub.admin.userId,
      })
      .select("id")
      .single();
    if (e2 || !club2) throw new Error(`club2 insert: ${e2?.message}`);
    personalClub2Id = club2.id;

    const { error: cm2Err } = await adminClient
      .from("club_members")
      .insert({
        club_id: personalClub2Id,
        user_id: helperClub.admin.userId,
        role: "admin",
      });
    if (cm2Err) throw new Error(`club_members insert club2: ${cm2Err.message}`);
  });

  test.afterAll(async () => {
    try {
      if (personalClubId) {
        await adminClient.from("club_members").delete().eq("club_id", personalClubId);
        await adminClient.from("clubs").delete().eq("id", personalClubId);
      }
      if (personalClub2Id) {
        await adminClient.from("club_members").delete().eq("club_id", personalClub2Id);
        await adminClient.from("clubs").delete().eq("id", personalClub2Id);
      }
    } catch { /* best-effort */ }
    await helperClub.cleanup();
  });

  // ── 1. Club perso créé avec is_personal = true ────────────────────────
  test("personal club is created with is_personal = true", async () => {
    const { data, error } = await adminClient
      .from("clubs")
      .select("is_personal, name")
      .eq("id", personalClubId)
      .single();
    expect(error).toBeNull();
    expect(data?.is_personal).toBe(true);
  });

  // ── 2. Non-admin ne peut pas convertir ────────────────────────────────
  test("non-admin cannot convert personal club", async () => {
    const c = await clientFor(helperClub.coach);
    const { error } = await c.rpc("convert_personal_club_to_real", {
      _club_id: personalClubId,
      _new_name: "Tentative coach",
    });
    expect(error).not.toBeNull();
    expect(error?.code ?? error?.message).toMatch(/42501|forbidden|permission/i);
  });

  // ── 3. L'admin convertit avec un nouveau nom ─────────────────────────
  test("admin can convert personal club with new name", async () => {
    const { error } = await adminClient.rpc("convert_personal_club_to_real", {
      _club_id: personalClubId,
      _new_name: "AS Clubero E2E",
    });
    expect(error).toBeNull();

    const { data } = await adminClient
      .from("clubs")
      .select("is_personal, name")
      .eq("id", personalClubId)
      .single();
    expect(data?.is_personal).toBe(false);
    expect(data?.name).toBe("AS Clubero E2E");
  });

  // ── 4. Idempotence ────────────────────────────────────────────────────
  test("converting an already-real club is idempotent", async () => {
    const { error } = await adminClient.rpc("convert_personal_club_to_real", {
      _club_id: personalClubId,
    });
    if (error) {
      expect(error.message).not.toMatch(/500|internal/i);
    }
  });

  // ── 5. club_id inexistant → erreur ────────────────────────────────────
  test("invalid club_id raises an error", async () => {
    const { error } = await adminClient.rpc("convert_personal_club_to_real", {
      _club_id: "00000000-0000-0000-0000-000000000000",
    });
    expect(error).not.toBeNull();
  });

  // ── 6. Club converti sans flag perso ─────────────────────────────────
  test("converted club appears without is_personal flag", async () => {
    const { data } = await adminClient
      .from("clubs")
      .select("is_personal")
      .eq("id", personalClubId)
      .single();
    expect(data?.is_personal).toBe(false);
  });

  // ── 7. Sans nouveau nom → préserve le nom ────────────────────────────
  test("converting without new_name preserves existing name", async () => {
    const { error } = await adminClient.rpc("convert_personal_club_to_real", {
      _club_id: personalClub2Id,
    });
    expect(error).toBeNull();

    const { data } = await adminClient
      .from("clubs")
      .select("name, is_personal")
      .eq("id", personalClub2Id)
      .single();
    expect(data?.is_personal).toBe(false);
    expect(data?.name).toBe("__e2e_personal_test_2");
  });
});
