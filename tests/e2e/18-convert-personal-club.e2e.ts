/**
 * 18 — Conversion club perso → vrai club — v2
 *
 * Corrections :
 * - N'utilise plus E2E_ADMIN_USER_ID (non dispo en CI)
 * - Crée le club perso via admin service_role puis ajoute l'admin E2E
 *   en récupérant son user_id depuis global-setup (via E2E_ADMIN_USER_ID
 *   injecté par globalSetup) OU en cherchant dans club_members du club
 *   E2E existant créé par createTestClub
 * - Toute la suite est auto-contenue et se nettoie dans afterAll
 */
import { test, expect } from "@playwright/test";
import { admin, E2E_ADMIN_USER_ID } from "./_fixtures/admin";
import { clientFor } from "./_fixtures/auth";
import { createTestClub, type SeededClub } from "./_fixtures/club";

test.describe("Convert personal club → real club", () => {
  let personalClubId: string;
  let personalClub2Id: string;
  // Utiliser le club de la fixture pour récupérer l'userId admin de façon fiable
  let helperClub: SeededClub;

  test.beforeAll(async () => {
    // On crée un club de fixture juste pour récupérer les user IDs
    helperClub = await createTestClub("convpersonal");

    const adminUserId = helperClub.admin.userId;
    if (!adminUserId) throw new Error("Admin userId unavailable");

    // Club perso 1 — pour les tests principaux
    const { data: club1, error: e1 } = await admin
      .from("clubs")
      .insert({
        name: "__e2e_personal_test_1",
        is_personal: true,
        created_by: adminUserId,
      })
      .select("id")
      .single();
    if (e1 || !club1) throw new Error(`club1: ${e1?.message}`);
    personalClubId = club1.id;

    await admin.from("club_members").insert({
      club_id: personalClubId,
      user_id: adminUserId,
      role: "admin",
    });

    // Club perso 2 — pour test idempotence/sans nom
    const { data: club2, error: e2 } = await admin
      .from("clubs")
      .insert({
        name: "__e2e_personal_test_2",
        is_personal: true,
        created_by: adminUserId,
      })
      .select("id")
      .single();
    if (e2 || !club2) throw new Error(`club2: ${e2?.message}`);
    personalClub2Id = club2.id;

    await admin.from("club_members").insert({
      club_id: personalClub2Id,
      user_id: adminUserId,
      role: "admin",
    });
  });

  test.afterAll(async () => {
    try {
      await admin.from("club_members").delete().eq("club_id", personalClubId);
      await admin.from("clubs").delete().eq("id", personalClubId);
      await admin.from("club_members").delete().eq("club_id", personalClub2Id);
      await admin.from("clubs").delete().eq("id", personalClub2Id);
    } catch { /* best-effort */ }
    await helperClub.cleanup();
  });

  // ── 1. Club perso existe avec is_personal = true ──────────────────────
  test("personal club is created with is_personal = true", async () => {
    const { data, error } = await admin
      .from("clubs")
      .select("id, is_personal, name")
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
    const c = await clientFor(helperClub.admin);
    const { error } = await c.rpc("convert_personal_club_to_real", {
      _club_id: personalClubId,
      _new_name: "AS Clubero E2E",
    });
    expect(error).toBeNull();

    const { data } = await admin
      .from("clubs")
      .select("is_personal, name")
      .eq("id", personalClubId)
      .single();
    expect(data?.is_personal).toBe(false);
    expect(data?.name).toBe("AS Clubero E2E");
  });

  // ── 4. Idempotence ────────────────────────────────────────────────────
  test("converting an already-real club is idempotent", async () => {
    const c = await clientFor(helperClub.admin);
    const { error } = await c.rpc("convert_personal_club_to_real", {
      _club_id: personalClubId,
    });
    if (error) {
      expect(error.message).not.toMatch(/500|internal/i);
    }
  });

  // ── 5. club_id inexistant → erreur ────────────────────────────────────
  test("invalid club_id raises an error", async () => {
    const c = await clientFor(helperClub.admin);
    const { error } = await c.rpc("convert_personal_club_to_real", {
      _club_id: "00000000-0000-0000-0000-000000000000",
    });
    expect(error).not.toBeNull();
  });

  // ── 6. Club converti visible sans flag perso ──────────────────────────
  test("converted club appears without is_personal flag", async () => {
    const { data } = await admin
      .from("clubs")
      .select("is_personal")
      .eq("id", personalClubId)
      .single();
    expect(data?.is_personal).toBe(false);
  });

  // ── 7. Conversion sans nouveau nom → préserve le nom existant ─────────
  test("converting without new_name preserves existing name", async () => {
    const c = await clientFor(helperClub.admin);
    const { error } = await c.rpc("convert_personal_club_to_real", {
      _club_id: personalClub2Id,
    });
    expect(error).toBeNull();

    const { data } = await admin
      .from("clubs")
      .select("name, is_personal")
      .eq("id", personalClub2Id)
      .single();
    expect(data?.is_personal).toBe(false);
    expect(data?.name).toBe("__e2e_personal_test_2");
  });
});
