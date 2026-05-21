/**
 * 13 — Player profile update
 */
import { test, expect } from "@playwright/test";
import { admin } from "./_fixtures/admin";
import { clientFor } from "./_fixtures/auth";
import { createTestClub, type SeededClub } from "./_fixtures/club";

test.describe("Player profile", () => {
  let club: SeededClub;
  test.beforeAll(async () => { club = await createTestClub("playerprof"); });
  test.afterAll(async () => { await club.cleanup(); });

  test("coach updates player position + jersey", async () => {
    const c = await clientFor(club.coach);
    const { error } = await c
      .from("players")
      .update({ position: "Attaquant", jersey_number: 9, preferred_position: "ST" })
      .eq("id", club.player1.id);
    expect(error).toBeNull();
    const { data } = await admin
      .from("players")
      .select("position, jersey_number")
      .eq("id", club.player1.id)
      .single();
    expect(data?.position).toBe("Attaquant");
    expect(data?.jersey_number).toBe(9);
  });

  test("parent updates media consent for child", async () => {
    const c = await clientFor(club.player2WithParent.parent);
    const { error } = await c
      .from("players")
      .update({ media_consent_status: "granted" })
      .eq("id", club.player2WithParent.id);
    expect(error).toBeNull();
  });
});
