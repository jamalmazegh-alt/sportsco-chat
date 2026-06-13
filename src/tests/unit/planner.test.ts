import { describe, expect, it } from "vitest";
import {
  computeSchedule,
  recommendFormat,
  recommendationToWizardFormat,
} from "@/modules/tournaments/lib/planner";

describe("computeSchedule", () => {
  it("computes the canonical 16-team / 3-terrain / no-flights schedule", () => {
    const r = computeSchedule({
      teams: 16,
      terrains: 3,
      durationMin: 20,
      flights: false,
    });
    // 4 pools of 4 → poolMatches = 4 * 6 = 24
    expect(r.pools).toBe(4);
    expect(r.perPool).toBe(4);
    expect(r.poolMatches).toBe(24);
    expect(r.finalMatches).toBe(4); // no flights → 1 final bracket = pools matches
    expect(r.total).toBe(28);
    // slot = 23, rounds = ceil(28/3) = 10, end = 9*60 + 10*23 + 45 = 815 → 13:35
    expect(r.endHHMM).toBe("13:35");
  });

  it.each([8, 12, 16, 24, 32])("supports %i teams", (teams) => {
    const r = computeSchedule({ teams, terrains: 4, durationMin: 20, flights: false });
    expect(r.total).toBeGreaterThan(0);
    expect(r.endHHMM).toMatch(/^\d{2}:\d{2}$/);
  });

  it("monotonic: more terrains → earlier or equal end", () => {
    const base = computeSchedule({ teams: 24, terrains: 3, durationMin: 20, flights: true });
    const more = computeSchedule({ teams: 24, terrains: 6, durationMin: 20, flights: true });
    expect(more.rounds).toBeLessThanOrEqual(base.rounds);
  });

  it("monotonic: longer matches → later or equal end", () => {
    const short = computeSchedule({ teams: 16, terrains: 4, durationMin: 15, flights: false });
    const long = computeSchedule({ teams: 16, terrains: 4, durationMin: 30, flights: false });
    expect(long.slotMin).toBeGreaterThan(short.slotMin);
  });

  it("verdict ok when margin ≥ 60, warn ≥ 0, bad otherwise", () => {
    const tight = computeSchedule({
      teams: 32,
      terrains: 2,
      durationMin: 30,
      flights: true,
    });
    expect(tight.verdict).toBe("bad");
    const easy = computeSchedule({
      teams: 8,
      terrains: 4,
      durationMin: 15,
      flights: false,
    });
    expect(easy.verdict).toBe("ok");
  });

  it("flights adds final matches", () => {
    const no = computeSchedule({ teams: 16, terrains: 4, durationMin: 20, flights: false });
    const yes = computeSchedule({ teams: 16, terrains: 4, durationMin: 20, flights: true });
    expect(yes.total).toBeGreaterThan(no.total);
  });
});

describe("recommendFormat", () => {
  it("recommends a generable format for every supported team count", () => {
    for (const teams of [8, 12, 16, 24, 32]) {
      const reco = recommendFormat({
        teams,
        allDay: true,
        multipleTrophies: false,
        paid: false,
      });
      expect(["pools_finals", "round_robin", "single_elim"]).toContain(reco.format);
      expect(reco.totalMatches).toBeGreaterThan(0);
      expect(reco.terrainsSuggested).toBeGreaterThan(0);
    }
  });

  it("multipleTrophies → flights=champions + pools_finals", () => {
    const reco = recommendFormat({
      teams: 16,
      allDay: true,
      multipleTrophies: true,
      paid: false,
    });
    expect(reco.flights).toBe("champions");
    expect(reco.format).toBe("pools_finals");
  });

  it("not allDay + small → single_elim", () => {
    const reco = recommendFormat({
      teams: 8,
      allDay: false,
      multipleTrophies: false,
      paid: false,
    });
    expect(reco.format).toBe("single_elim");
  });

  it("maps cleanly to wizard format enum", () => {
    const reco = recommendFormat({
      teams: 16,
      allDay: true,
      multipleTrophies: true,
      paid: true,
    });
    const wiz = recommendationToWizardFormat(reco);
    expect(["mixed", "round_robin", "knockout"]).toContain(wiz.format);
    expect(wiz.numTeams).toBe(16);
  });
});
