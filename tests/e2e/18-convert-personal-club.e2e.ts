/**
 * 18 — Conversion club perso → vrai club
 *
 * Valide la RPC convert_personal_club_to_real et le flow complet :
 *   1. Un club is_personal=true existe en base
 *   2. L'admin du club peut le convertir via RPC
 *   3. Après conversion : is_personal=false, nom mis à jour
 *   4. Un non-admin ne peut PAS convertir (RPC lève 42501)
 *   5. La conversion est idempotente (2e appel ne plante pas)
 *   6. Un club_id inexistant lève une erreur
 *
 * Note : ce test crée son propre club perso via admin (service_role)
 * et ne dépend pas de createTestClub.
 */
import { test, expect } from "@playwright/test";
import { admin } from "./_fixtures/admin";
import { clientFor } from "./_fixtures/auth";
import type { SeededUser } from "./_fixtures/club";
import {
  E2E_ADMIN_EMAIL,
  E2E_ADMIN_PASSWORD,
  E2E_COACH,
} from "./_fixtures/admin";

// ── Helpers ────────────────────────────────────────────────────────────────

async function resolveUserId(email: string): Promise<string> {
  // On cherche l'user_id dans auth.users via admin
  // (pas d'accès direct — on passe par profiles)
  const { data, error } = await admin
    .from("profiles")
    .select("id")
    .eq("email", email)
    .maybeSingle();
  // Si profiles ne stocke pas l'email, on utilise les env vars
  return data?.id ?? process.env.E2E_ADMIN_USER_ID ?? "";
}

async function createPersonalClub(adminUserId: string, name: string) {
  const { data, error } = await admin
    .from("clubs")
    .insert({
      name,
      is_personal: true,
      created_by: adminUserId,
    })
    .select("id, name, is_personal")
    .single();
  if (error || !data) throw new Error(`personal club insert: ${error?.message}`);
  return data;
}

async function addAdminToClub(clubId: string, userId: string) {
  await admin.from("club_members").insert({
    club_id: clubId,
    user_id: userId,
    role: "admin",
  });
}

// ── Suite ─────────────────────────────────────────────────────────────────

test.describe("Convert personal club → real club", () => {
  let personalClubId: string;
  const adminUserId = process.env.E2E_ADMIN_USER_ID ?? "";
  const adminUser: SeededUser = {
    email: E2E_ADMIN_EMAIL,
    password: E2E_ADMIN_PASSWORD,
    userId: adminUserId,
  };
  const coachUser: SeededUser = E2E_COACH;

  test.beforeAll(async () => {
    if (!adminUserId) throw new Error("E2E_ADMIN_USER_ID missing");

    // Créer un club perso pour les tests
    const club = await createPersonalClub(adminUserId, "__e2e_personal_club_test");
    personalClubId = club.id;
    await addAdminToClub(personalClubId, adminUserId);
  });

  test.afterAll(async () => {
    try {
      await admin.from("club_members").delete().eq("club_id", personalClubId);
      await admin.from("clubs").delete().eq("id", personalClubId);
    } catch {
      // best-effort
    }
  });

  // ── 1. Le club perso existe avec is_personal = true ──────────────────
  test("personal club is created with is_personal = true", async () => {
    const { data, error } = await admin
      .from("clubs")
      .select("id, is_personal, name")
      .eq("id", personalClubId)
      .single();
    expect(error).toBeNull();
    expect(data?.is_personal).toBe(true);
    expect(data?.name).toBe("__e2e_personal_club_test");
  });

  // ── 2. Un non-admin ne peut PAS convertir (RLS 42501) ────────────────
  test("non-admin cannot convert personal club", async () => {
    // Le coach n'est pas admin de ce club
    const c = await clientFor(coachUser);
    const { error } = await c.rpc("convert_personal_club_to_real", {
      _club_id: personalClubId,
      _new_name: "Tentative coach",
    });
    expect(error).not.toBeNull();
    // La RPC doit lever forbidden (ERRCODE 42501)
    expect(error?.code ?? error?.message).toMatch(/42501|forbidden|permission/i);
  });

  // ── 3. L'admin convertit avec un nouveau nom ─────────────────────────
  test("admin can convert personal club with new name", async () => {
    const c = await clientFor(adminUser);
    const { error } = await c.rpc("convert_personal_club_to_real", {
      _club_id: personalClubId,
      _new_name: "AS Clubero E2E",
    });
    expect(error).toBeNull();

    // Vérifier en base
    const { data } = await admin
      .from("clubs")
      .select("is_personal, name")
      .eq("id", personalClubId)
      .single();
    expect(data?.is_personal).toBe(false);
    expect(data?.name).toBe("AS Clubero E2E");
  });

  // ── 4. La conversion est idempotente ─────────────────────────────────
  test("converting an already-real club is idempotent", async () => {
    const c = await clientFor(adminUser);
    // 2e appel sur un club déjà réel — ne doit pas planter
    const { error } = await c.rpc("convert_personal_club_to_real", {
      _club_id: personalClubId,
    });
    // Soit pas d'erreur, soit une erreur gracieuse (pas un crash)
    if (error) {
      // Si la RPC retourne une erreur sur club déjà réel, c'est acceptable
      // tant que ce n'est pas un crash serveur (500)
      expect(error.message).not.toMatch(/500|internal/i);
    }
  });

  // ── 5. Un club_id inexistant lève une erreur ──────────────────────────
  test("invalid club_id raises an error", async () => {
    const c = await clientFor(adminUser);
    const { error } = await c.rpc("convert_personal_club_to_real", {
      _club_id: "00000000-0000-0000-0000-000000000000",
    });
    expect(error).not.toBeNull();
  });

  // ── 6. Le club converti est visible normalement ───────────────────────
  test("converted club appears in clubs list without is_personal flag", async () => {
    const { data } = await admin
      .from("clubs")
      .select("id, is_personal")
      .eq("id", personalClubId)
      .single();
    expect(data?.is_personal).toBe(false);
  });

  // ── 7. La conversion sans nouveau nom garde l'ancien nom ─────────────
  test("converting without new_name preserves existing name", async () => {
    // Créer un 2e club perso
    const club2 = await createPersonalClub(adminUserId, "__e2e_personal_noname");
    await addAdminToClub(club2.id, adminUserId);

    try {
      const c = await clientFor(adminUser);
      const { error } = await c.rpc("convert_personal_club_to_real", {
        _club_id: club2.id,
        // pas de _new_name
      });
      expect(error).toBeNull();

      const { data } = await admin
        .from("clubs")
        .select("name, is_personal")
        .eq("id", club2.id)
        .single();
      expect(data?.is_personal).toBe(false);
      expect(data?.name).toBe("__e2e_personal_noname"); // nom inchangé
    } finally {
      await admin.from("club_members").delete().eq("club_id", club2.id);
      await admin.from("clubs").delete().eq("id", club2.id);
    }
  });
});
