/**
 * 08 — Convocations: respond (player, parent, coach override)
 */
import { test, expect } from "@playwright/test";
import { admin } from "./_fixtures/admin";
import { clientFor } from "./_fixtures/auth";
import { createTestClub, type SeededClub } from "./_fixtures/club";

test.describe("Convocations — respond", () => {
  let club: SeededClub;
  let conv1: string;
  let conv2: string;

  test.beforeAll(async () => {
    club = await createTestClub("convresp");
    const { data } = await admin
      .from("convocations")
      .insert([
        { event_id: club.eventId, player_id: club.player1.id },
        { event_id: club.eventId, player_id: club.player2WithParent.id },
      ])
      .select("id, player_id");
    conv1 = data!.find((d) => d.player_id === club.player1.id)!.id;
    conv2 = data!.find((d) => d.player_id === club.player2WithParent.id)!.id;
  });
  test.afterAll(async () => { await club.cleanup(); });

  test("player responds present", async () => {
    const c = await clientFor(club.player1.user);
    const { error } = await c
      .from("convocations")
      .update({ status: "present", responded_at: new Date().toISOString() })
      .eq("id", conv1);
    expect(error).toBeNull();
  });

  test("parent responds absent for child", async () => {
    const c = await clientFor(club.player2WithParent.parent);
    const { error } = await c
      .from("convocations")
      .update({
        status: "absent",
        comment: "Malade",
        responded_at: new Date().toISOString(),
      })
      .eq("id", conv2);
    expect(error).toBeNull();
  });

  test("coach overrides player1 to absent", async () => {
    const c = await clientFor(club.coach);
    const { error } = await c
      .from("convocations")
      .update({ status: "absent" })
      .eq("id", conv1);
    expect(error).toBeNull();
    const { data } = await admin
      .from("convocations")
      .select("status")
      .eq("id", conv1)
      .single();
    expect(data?.status).toBe("absent");
  });
});
