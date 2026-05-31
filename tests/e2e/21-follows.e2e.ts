/**
 * 21 — Follows (système d'abonnement)
 *
 * Valide :
 *   1. User authentifié peut suivre un joueur
 *   2. User authentifié peut suivre un club
 *   3. Impossible de suivre deux fois le même joueur (UNIQUE)
 *   4. followers_count incrémenté après follow (trigger)
 *   5. User peut se désabonner (DELETE)
 *   6. followers_count décrémenté après unfollow (trigger)
 *   7. Anon ne peut pas insérer dans follows (RLS)
 *   8. CHECK constraint : une seule cible par follow
 *   9. target_type invalide rejeté
 */
import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import {
  admin,
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  E2E_COACH,
} from "./_fixtures/admin";
import { clientFor } from "./_fixtures/auth";
import { createTestClub, type SeededClub } from "./_fixtures/club";

test.describe("Follows", () => {
  let club: SeededClub;
  let followId: string;
  let clubFollowId: string;

  test.describe.configure({ mode: "serial" });

  test.beforeAll(async () => {
    club = await createTestClub("follows");
  });

  test.afterAll(async () => {
    try {
      await admin.from("follows").delete()
        .eq("follower_id", E2E_COACH.userId);
    } catch { /* best-effort */ }
    await club.cleanup();
  });

  // ── 1. Suivre un joueur ─────────────────────────────────────
  test("authenticated user can follow a player", async () => {
    const c = await clientFor(club.coach);
    const { data, error } = await c
      .from("follows")
      .insert({
        follower_id: club.coach.userId,
        target_type: "player",
        followed_player_id: club.player1.id,
      })
      .select("id, target_type")
      .single();
    expect(error).toBeNull();
    expect(data?.target_type).toBe("player");
    followId = data!.id;
  });

  // ── 2. Suivre un club ───────────────────────────────────────
  test("authenticated user can follow a club", async () => {
    const c = await clientFor(club.coach);
    const { data, error } = await c
      .from("follows")
      .insert({
        follower_id: club.coach.userId,
        target_type: "club",
        followed_club_id: club.clubId,
      })
      .select("id")
      .single();
    expect(error).toBeNull();
    clubFollowId = data!.id;
  });

  // ── 3. Double follow rejeté (UNIQUE) ────────────────────────
  test("cannot follow the same player twice", async () => {
    const c = await clientFor(club.coach);
    const { error } = await c.from("follows").insert({
      follower_id: club.coach.userId,
      target_type: "player",
      followed_player_id: club.player1.id,
    });
    expect(error).not.toBeNull();
  });

  // ── 4. followers_count incrémenté (trigger sur profiles) ────
  test("followers_count is incremented after follow", async () => {
    const { data } = await admin
      .from("profiles")
      .select("followers_count")
      .eq("id", club.player1.user.userId)
      .single();
    expect((data?.followers_count ?? 0)).toBeGreaterThan(0);
  });

  // ── 5. Se désabonner ────────────────────────────────────────
  test("user can unfollow a player", async () => {
    const c = await clientFor(club.coach);
    const { error } = await c
      .from("follows")
      .delete()
      .eq("id", followId);
    expect(error).toBeNull();
  });

  // ── 6. followers_count décrémenté (trigger sur profiles) ────
  test("followers_count is decremented after unfollow", async () => {
    const { data } = await admin
      .from("profiles")
      .select("followers_count")
      .eq("id", club.player1.user.userId)
      .single();
    expect(data?.followers_count ?? 0).toBe(0);
  });

  // ── 7. Anon ne peut pas insérer (RLS) ───────────────────────
  test("anonymous user cannot insert follows (RLS)", async () => {
    const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false },
    });
    const { error } = await anonClient.from("follows").insert({
      follower_id: "00000000-0000-0000-0000-000000000000",
      target_type: "player",
      followed_player_id: club.player1.id,
    });
    expect(error).not.toBeNull();
  });

  // ── 8. target_type invalide rejeté (CHECK) ──────────────────
  test("invalid target_type is rejected", async () => {
    const c = await clientFor(club.coach);
    const { error } = await c.from("follows").insert({
      follower_id: club.coach.userId,
      target_type: "tournament", // pas dans le CHECK
      followed_player_id: club.player1.id,
    });
    expect(error).not.toBeNull();
  });

  // ── 9. Deux cibles simultanées rejetées (CHECK) ─────────────
  test("follow with two targets is rejected", async () => {
    const c = await clientFor(club.coach);
    const { error } = await c.from("follows").insert({
      follower_id: club.coach.userId,
      target_type: "player",
      followed_player_id: club.player1.id,
      followed_club_id: club.clubId, // deux cibles
    });
    expect(error).not.toBeNull();
  });
});
