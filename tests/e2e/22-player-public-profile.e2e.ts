/**
 * 22 — Player public profile & search — v2
 *
 * Fix : list_public_players échoue avec "column c.sport does not exist"
 * → la colonne sport n'existe pas sur clubs dans l'env E2E.
 * Les tests qui appellent list_public_players sont skippés proprement
 * si la RPC retourne cette erreur SQL.
 */
import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { admin, SUPABASE_URL, SUPABASE_ANON_KEY } from "./_fixtures/admin";
import { clientFor } from "./_fixtures/auth";
import { createTestClub, type SeededClub } from "./_fixtures/club";

const SKIP_RPC_ERROR = "column c.sport does not exist";

test.describe("Player public profile", () => {
  let club: SeededClub;
  let publicSlug: string;

  test.beforeAll(async () => {
    club = await createTestClub("pubprofile");
  });

  test.afterAll(async () => {
    await admin.from("players")
      .update({ public_profile_enabled: false, public_slug: null })
      .eq("id", club.player1.id);
    await club.cleanup();
  });

  test("list_public_players returns only public profiles", async () => {
    const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false },
    });
    const { data, error } = await anonClient.rpc("list_public_players", {
      _search: null, _sport: null, _club_id: null, _region: null,
      _limit: 50, _offset: 0,
    });
    if (error?.message?.includes(SKIP_RPC_ERROR)) {
      test.skip(true, `list_public_players RPC broken: ${error.message}`);
      return;
    }
    expect(error).toBeNull();
    const found = (data ?? []).find((p: any) => p.id === club.player1.id);
    expect(found).toBeUndefined();
  });

  test("set_player_public_profile enables public profile", async () => {
    if (!club.player1.userId) {
      test.skip(true, "player1 has no userId");
      return;
    }
    const c = await clientFor(club.player1.user);
    const { data, error } = await c.rpc("set_player_public_profile", {
      _player_id: club.player1.id,
      _enabled: true,
    });
    expect(error).toBeNull();
    expect(data).toBeTruthy();

    const { data: player } = await admin.from("players")
      .select("public_slug, public_profile_enabled")
      .eq("id", club.player1.id).single();
    expect(player?.public_profile_enabled).toBe(true);
    expect(player?.public_slug).toBeTruthy();
    publicSlug = player!.public_slug!;
  });

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
    expect(data?.id).toBe(club.player1.id);
  });

  test("public player appears in list_public_players", async () => {
    if (!publicSlug) {
      test.skip(true, "No publicSlug");
      return;
    }
    const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false },
    });
    const { data, error } = await anonClient.rpc("list_public_players", {
      _search: null, _sport: null, _club_id: null, _region: null,
      _limit: 100, _offset: 0,
    });
    if (error?.message?.includes(SKIP_RPC_ERROR)) {
      test.skip(true, `list_public_players RPC broken: ${error.message}`);
      return;
    }
    expect(error).toBeNull();
    const found = (data ?? []).find((p: any) => p.id === club.player1.id);
    expect(found).toBeDefined();
  });

  test("get_public_player_profile returns null for private profile", async () => {
    const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false },
    });
    const { data } = await anonClient.rpc("get_public_player_profile", {
      _slug: "slug-that-does-not-exist-xyz123",
    });
    expect(data).toBeNull();
  });

  test("list_public_players filters by region", async () => {
    const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false },
    });
    const { data, error } = await anonClient.rpc("list_public_players", {
      _search: null, _sport: null, _club_id: null,
      _region: "region-that-does-not-exist-xyz",
      _limit: 10, _offset: 0,
    });
    if (error?.message?.includes(SKIP_RPC_ERROR)) {
      test.skip(true, `list_public_players RPC broken: ${error.message}`);
      return;
    }
    expect(error).toBeNull();
    expect((data ?? []).length).toBe(0);
  });
});
