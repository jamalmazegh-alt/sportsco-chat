/**
 * 09 — Event chat
 */
import { test, expect } from "@playwright/test";
import { admin } from "./_fixtures/admin";
import { clientFor } from "./_fixtures/auth";
import { createTestClub, type SeededClub } from "./_fixtures/club";

test.describe("Event chat", () => {
  let club: SeededClub;
  test.beforeAll(async () => { club = await createTestClub("chat"); });
  test.afterAll(async () => { await club.cleanup(); });

  test("coach posts a message", async () => {
    const c = await clientFor(club.coach);
    const { error } = await c.from("event_messages").insert({
      event_id: club.eventId,
      author_user_id: club.coach.userId,
      body: `Hello ${club.prefix}`,
    });
    expect(error).toBeNull();
  });

  test("player reads the chat", async () => {
    const c = await clientFor(club.player1.user);
    const { data } = await c
      .from("event_messages")
      .select("body")
      .eq("event_id", club.eventId);
    expect(data?.length).toBeGreaterThan(0);
    expect(data![0].body).toContain(club.prefix);
  });

  test("player replies", async () => {
    const c = await clientFor(club.player1.user);
    const { error } = await c.from("event_messages").insert({
      event_id: club.eventId,
      author_user_id: club.player1.user.userId,
      body: "Présent coach !",
    });
    expect(error).toBeNull();
  });
});
