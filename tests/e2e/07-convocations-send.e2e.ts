/**
 * 07 — Convocations: send (email + WhatsApp link)
 */
import { test, expect } from "@playwright/test";
import { admin } from "./_fixtures/admin";
import { clientFor } from "./_fixtures/auth";
import { createTestClub, type SeededClub } from "./_fixtures/club";
import { waShareUrl } from "@/lib/whatsapp";

test.describe("Convocations — send", () => {
  let club: SeededClub;
  test.beforeAll(async () => { club = await createTestClub("convsend"); });
  test.afterAll(async () => { await club.cleanup(); });

  test("coach creates convocations for both players", async () => {
    const c = await clientFor(club.coach);
    const { data, error } = await c
      .from("convocations")
      .insert([
        { event_id: club.eventId, player_id: club.player1.id, status: "pending" },
        { event_id: club.eventId, player_id: club.player2WithParent.id, status: "pending" },
      ])
      .select("id");
    expect(error).toBeNull();
    expect(data?.length).toBe(2);
  });

  test("whatsapp share URL is well-formed", async () => {
    const link = waShareUrl(`Convocation ${club.prefix}`);
    expect(link).toMatch(/^https:\/\/(api\.whatsapp\.com|wa\.me)\//);
    expect(decodeURIComponent(link)).toContain(club.prefix);
  });
});
