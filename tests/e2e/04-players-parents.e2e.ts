/**
 * 04 — Players & parents
 *
 * - Ajoute joueurs avec / sans parents
 * - Vérifie que le parent peut voir le joueur (RLS)
 */
import { test, expect } from "@playwright/test";
import { admin } from "./_fixtures/admin";
import { clientFor } from "./_fixtures/auth";
import { createTestClub, type SeededClub } from "./_fixtures/club";

test.describe("Players & parents", () => {
  let club: SeededClub;
  test.beforeAll(async () => { club = await createTestClub("players"); });
  test.afterAll(async () => { await club.cleanup(); });

  test("admin adds player without parent", async () => {
    const c = await clientFor(club.admin);
    const { data, error } = await c
      .from("players")
      .insert({ club_id: club.clubId, first_name: "Solo", last_name: club.prefix })
      .select("id")
      .single();
    expect(error).toBeNull();
    expect(data?.id).toBeTruthy();
    await admin.from("players").delete().eq("id", data!.id);
  });

  test("admin adds player with parent record", async () => {
    const c = await clientFor(club.admin);
    const { data: p, error } = await c
      .from("players")
      .insert({ club_id: club.clubId, first_name: "Avec", last_name: "Parent" })
      .select("id")
      .single();
    expect(error).toBeNull();
    const { error: ppErr } = await c.from("player_parents").insert({
      player_id: p!.id,
      full_name: "Maman Test",
      email: `parent_${club.prefix}@clubero-e2e.test`,
      can_respond: true,
    });
    expect(ppErr).toBeNull();
    await admin.from("player_parents").delete().eq("player_id", p!.id);
    await admin.from("players").delete().eq("id", p!.id);
  });

  test("parent user can view their child", async () => {
    const c = await clientFor(club.player2WithParent.parent);
    const { data } = await c
      .from("players")
      .select("id")
      .eq("id", club.player2WithParent.id)
      .maybeSingle();
    expect(data?.id).toBe(club.player2WithParent.id);
  });
});
