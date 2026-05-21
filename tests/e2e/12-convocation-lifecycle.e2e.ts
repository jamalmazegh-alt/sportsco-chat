/**
 * 12 — Convocation lifecycle: cancel, resend, reschedule event
 */
import { test, expect } from "@playwright/test";
import { admin } from "./_fixtures/admin";
import { clientFor } from "./_fixtures/auth";
import { createTestClub, type SeededClub } from "./_fixtures/club";

test.describe("Convocation lifecycle", () => {
  let club: SeededClub;
  let convId: string;

  test.beforeAll(async () => {
    club = await createTestClub("lifecycle");
    const { data } = await admin
      .from("convocations")
      .insert({ event_id: club.eventId, player_id: club.player1.id })
      .select("id")
      .single();
    convId = data!.id;
  });
  test.afterAll(async () => { await club.cleanup(); });

  test("coach cancels a player convocation", async () => {
    const c = await clientFor(club.coach);
    const { error } = await c
      .from("convocations")
      .delete()
      .eq("id", convId);
    expect(error).toBeNull();
  });

  test("coach resends convocation", async () => {
    // Confirm the previous one is really gone (avoid unique-constraint races).
    const { data: gone } = await admin
      .from("convocations")
      .select("id")
      .eq("id", convId)
      .maybeSingle();
    expect(gone).toBeNull();

    const c = await clientFor(club.coach);
    const { data, error } = await c
      .from("convocations")
      .insert({ event_id: club.eventId, player_id: club.player1.id })
      .select("id")
      .single();
    expect(error).toBeNull();
    expect(data?.id).toBeTruthy();
  });

  test("coach reschedules the event", async () => {
    const c = await clientFor(club.coach);
    const newDate = new Date(Date.now() + 14 * 86400000).toISOString();
    const { error } = await c
      .from("events")
      .update({ starts_at: newDate })
      .eq("id", club.eventId);
    expect(error).toBeNull();
    const { data } = await admin
      .from("events")
      .select("starts_at")
      .eq("id", club.eventId)
      .single();
    expect(new Date(data!.starts_at).getTime()).toBeGreaterThan(
      Date.now() + 10 * 86400000,
    );
  });
});
