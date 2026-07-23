/**
 * 06 — Lineup (football formation)
 *
 * Crée une compo via upsert RLS et vérifie qu'un joueur de l'équipe la lit
 * une fois publiée + liste des convoqués visible.
 *
 * Serial: coach upsert + player read partagent le même event. Sans serial,
 * un retry Playwright rejoue only le 2e test après un nouveau beforeAll
 * (nouveau eventId sans lineup) → formation undefined à coup sûr.
 */
import { test, expect } from "@playwright/test";

import { clientFor } from "./_fixtures/auth";
import { createTestClub, type SeededClub } from "./_fixtures/club";

test.describe("Lineup", () => {
  test.describe.configure({ mode: "serial" });

  let club: SeededClub;

  test.beforeAll(async () => {
    club = await createTestClub("lineup");

    // event_lineups_visibility_gate (RESTRICTIVE) requires call_up_list_visible
    // OR staff. Force the event cascade to "visible" so player SELECT is
    // deterministic even if the club default was flipped on bughunt.
    const coach = await clientFor(club.coach);
    const { error: visErr } = await coach.rpc("set_call_up_visibility", {
      _scope: "event",
      _id: club.eventId,
      _choice: "visible",
    });
    if (visErr) {
      throw new Error(`set_call_up_visibility: ${visErr.message}`);
    }
  });

  test.afterAll(async () => {
    if (!club) return;
    await club.cleanup();
  });

  test("coach creates and publishes a 4-4-2 lineup", async () => {
    const c = await clientFor(club.coach);
    const slots = Array.from({ length: 11 }, (_, i) => ({
      id: `s${i}`,
      role: i === 0 ? "GK" : i < 5 ? "DEF" : i < 9 ? "MID" : "FWD",
      x: 10 + i * 8,
      y: 10 + i * 7,
      player_id: i === 0 ? club.player1.id : i === 1 ? club.player2WithParent.id : null,
    }));
    const { data, error } = await c
      .from("event_lineups")
      .upsert(
        {
          event_id: club.eventId,
          team_id: club.teamId,
          club_id: club.clubId,
          formation: "4-4-2",
          slots,
          bench: [],
          visibility: "team",
          published_at: new Date().toISOString(),
          created_by: club.coach.userId,
        },
        { onConflict: "event_id" },
      )
      .select("*")
      .single();
    expect(error).toBeNull();
    expect(data?.formation).toBe("4-4-2");
    expect(data?.published_at).not.toBeNull();
    expect(data?.visibility).toBe("team");
  });

  test("player can read published lineup", async () => {
    const c = await clientFor(club.player1.user);

    const { data: gate, error: gateErr } = await c.rpc("call_up_list_visible", {
      p_event_id: club.eventId,
    });
    expect(gateErr).toBeNull();
    expect(gate, "call_up_list_visible must be true for player lineup SELECT").toBe(true);

    const { data, error } = await c
      .from("event_lineups")
      .select("formation, visibility, published_at")
      .eq("event_id", club.eventId)
      .maybeSingle();
    expect(error).toBeNull();
    expect(data?.formation).toBe("4-4-2");
    expect(data?.visibility).toBe("team");
    expect(data?.published_at).not.toBeNull();
  });
});
