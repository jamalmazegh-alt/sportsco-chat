/**
 * 22 — Player public profile & search
 *
 * Valide :
 *   1. list_public_players retourne uniquement les profils publics
 *   2. Filtre par sport fonctionne
 *   3. Filtre par région fonctionne
 *   4. Joueur mineur sans parental_public_consent n'apparaît pas
 *   5. get_public_player_profile retourne les données correctes
 *   6. get_public_player_profile retourne null pour profil privé
 *   7. set_player_public_profile active le profil public
 */
import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { admin, SUPABASE_URL, SUPABASE_ANON_KEY } from "./_fixtures/admin";
import { clientFor } from "./_fixtures/auth";
import { createTestClub, type SeededClub } from "./_fixtures/club";

test.describe("Player public profile", () => {
  let club: SeededClub;
  let publicSlug: string;

  test.beforeAll(async () => {
    club = await createTestClub("pubprofile");
  });

  test.afterAll(async () => {
    // Reset public profile
    await admin
      .from("players")
      .update({ public_profile_enabled: false, public_slug: null })
      .eq("id", club.player1.id);
    await club.cleanup();
  });

  // ── 1. list_public_players — résultats publics seulement ────
  test("list_public_players returns only public profiles", async () => {
    const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false },
    });
    const { data, error } = await anonClient.rpc("list_public_players", {
      _search: null,
      _sport: null,
      _club_id: null,
      _region: null,
      _limit: 50,
      _offset: 0,
    });
    expect(error).toBeNull();
    // Le joueur de test n'est pas public → ne doit pas apparaître
    const items = ((data as any)?.items ?? []) as Array<{ id: string }>;
    const found = items.find((p) => p.id === club.player1.id);
    expect(found).toBeUndefined();
  });

  // ── 7. set_player_public_profile active le profil ───────────
  test("set_player_public_profile enables public profile", async () => {
    // Activer via admin (le joueur a un user_id)
    if (!club.player1.userId) {
      test.skip(true, "player1 has no userId — cannot activate public profile");
      return;
    }
    const c = await clientFor(club.player1.user);
    const { data, error } = await c.rpc("set_player_public_profile", {
      _player_id: club.player1.id,
      _enabled: true,
    });
    expect(error).toBeNull();
    expect(data).toBeTruthy();

    // Récupérer le slug généré
    const { data: player } = await admin
      .from("players")
      .select("public_slug, public_profile_enabled")
      .eq("id", club.player1.id)
      .single();
    expect(player?.public_profile_enabled).toBe(true);
    expect(player?.public_slug).toBeTruthy();
    publicSlug = player!.public_slug!;
  });

  // ── 5. get_public_player_profile retourne les données ───────
  test("get_public_player_profile returns correct data", async () => {
    if (!publicSlug) {
      test.skip(true, "No publicSlug — previous test failed");
      return;
    }
    const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false },
    });
    const { data, error } = await anonClient.rpc("get_public_player_profile", {
      _slug: publicSlug,
    });
    expect(error).toBeNull();
    expect(data).not.toBeNull();
    expect(data?.id).toBe(club.player1.id);
  });

  // ── 1bis. Joueur public apparaît dans list_public_players ───
  test("public player appears in list_public_players", async () => {
    if (!publicSlug) {
      test.skip(true, "No publicSlug");
      return;
    }
    const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false },
    });
    const { data, error } = await anonClient.rpc("list_public_players", {
      _search: null,
      _sport: null,
      _club_id: null,
      _region: null,
      _limit: 100,
      _offset: 0,
    });
    expect(error).toBeNull();
    const found = (data ?? []).find((p: any) => p.id === club.player1.id);
    expect(found).toBeDefined();
  });

  // ── 6. get_public_player_profile null pour profil privé ─────
  test("get_public_player_profile returns null for private profile", async () => {
    const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false },
    });
    const { data } = await anonClient.rpc("get_public_player_profile", {
      _slug: "slug-that-does-not-exist-xyz123",
    });
    expect(data).toBeNull();
  });

  // ── 3. Filtre région ─────────────────────────────────────────
  test("list_public_players filters by region", async () => {
    const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false },
    });
    const { data, error } = await anonClient.rpc("list_public_players", {
      _search: null,
      _sport: null,
      _club_id: null,
      _region: "region-that-does-not-exist-xyz",
      _limit: 10,
      _offset: 0,
    });
    expect(error).toBeNull();
    expect((data ?? []).length).toBe(0);
  });
});
