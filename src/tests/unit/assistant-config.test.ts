import { describe, expect, it } from "vitest";
import {
  assistantStepOrder,
  configToCreatePayload,
  configToWizardFormat,
  configUsesFlights,
  emptyConfig,
  isConfigComplete,
  legacyAnswersToConfig,
} from "@/modules/tournaments/lib/assistant-config";
import { nearestSupportedTeams } from "@/modules/tournaments/lib/planner";

describe("assistant-config", () => {
  it("orders steps with flights follow-ups only for pools+continue", () => {
    const base = emptyConfig({ scheduleFormat: "pools_finals", eliminatedContinue: true });
    const steps = assistantStepOrder(base);
    expect(steps).toContain("eliminatedContinue");
    expect(steps).toContain("flightsTemplate");
    expect(steps.indexOf("flightsTemplate")).toBeGreaterThan(steps.indexOf("eliminatedContinue"));

    const noFlights = emptyConfig({
      scheduleFormat: "pools_finals",
      eliminatedContinue: false,
    });
    expect(assistantStepOrder(noFlights)).not.toContain("flightsTemplate");

    const elim = emptyConfig({ scheduleFormat: "single_elim" });
    expect(assistantStepOrder(elim)).not.toContain("eliminatedContinue");
  });

  it("maps flights ON to flighted_finals wizard format", () => {
    const cfg = emptyConfig({
      scheduleFormat: "pools_finals",
      eliminatedContinue: true,
      flightsTemplate: "champions",
      numTeams: 16,
    });
    expect(configUsesFlights(cfg)).toBe(true);
    expect(configToWizardFormat(cfg)).toEqual({ format: "flighted_finals", numTeams: 16 });
  });

  it("maps flights OFF pools to mixed format", () => {
    const cfg = emptyConfig({
      scheduleFormat: "pools_finals",
      eliminatedContinue: false,
      numTeams: 12,
    });
    expect(configToWizardFormat(cfg)).toEqual({ format: "mixed", numTeams: 12 });
  });

  it("builds create payload with terrains and roster", () => {
    const cfg = emptyConfig({
      name: "Test Cup",
      startsOn: "2026-06-15",
      location: "Stade A",
      sport: "football",
      playersPerTeam: 7,
      numTeams: 16,
      terrains: 3,
      matchDurationMin: 15,
    });
    const payload = configToCreatePayload("00000000-0000-0000-0000-000000000001", cfg);
    expect(payload.create.name).toBe("Test Cup");
    expect(payload.create.format).toBe("flighted_finals");
    expect(payload.update.match_duration_min).toBe(15);
    expect(payload.update.fields).toEqual(["Terrain 1", "Terrain 2", "Terrain 3"]);
    expect(payload.update.settings.roster.playersPerTeam).toBe(7);
    expect(payload.payment).toBeNull();
  });

  it("includes payment when paid", () => {
    const cfg = emptyConfig({
      name: "Paid Cup",
      startsOn: "2026-06-15",
      location: "Arena",
      paid: true,
      registrationFeeCents: 2500,
    });
    expect(isConfigComplete(cfg)).toBe(true);
    const payload = configToCreatePayload("00000000-0000-0000-0000-000000000001", cfg);
    expect(payload.payment).toEqual({
      registration_fee: 2500,
      registration_currency: "eur",
    });
  });

  it("rejects incomplete config", () => {
    expect(isConfigComplete(emptyConfig())).toBe(false);
  });

  it("legacy answers map to eliminatedContinue", () => {
    expect(legacyAnswersToConfig({ teams: 16, allDay: true, multipleTrophies: false, paid: false })).toMatchObject({
      eliminatedContinue: true,
    });
    expect(
      legacyAnswersToConfig({ teams: 16, allDay: false, multipleTrophies: false, paid: false }),
    ).toMatchObject({
      scheduleFormat: "single_elim",
      eliminatedContinue: false,
    });
  });

  it("builds create payload with break_min from pause", () => {
    const cfg = emptyConfig({
      name: "Test Cup",
      startsOn: "2026-06-15",
      location: "Stade A",
      pauseMin: 5,
    });
    const payload = configToCreatePayload("00000000-0000-0000-0000-000000000001", cfg);
    expect(payload.update.break_min).toBe(5);
  });

  it("persists lunch settings in tournament settings", () => {
    const cfg = emptyConfig({
      name: "Lunch Cup",
      startsOn: "2026-06-15",
      location: "Stade A",
      lunchDurationMin: 45,
      lunchStart: "12:30",
    });
    const payload = configToCreatePayload("00000000-0000-0000-0000-000000000001", cfg);
    expect((payload.update.settings as unknown as Record<string, unknown>).lunch_start).toBe("12:30");
    expect((payload.update.settings as unknown as Record<string, unknown>).lunch_end).toBe("13:15");
  });

  it("clears lunch settings when duration is zero", () => {
    const cfg = emptyConfig({
      name: "No Lunch Cup",
      startsOn: "2026-06-15",
      location: "Stade A",
      lunchDurationMin: 0,
    });
    const payload = configToCreatePayload("00000000-0000-0000-0000-000000000001", cfg);
    expect((payload.update.settings as unknown as Record<string, unknown>).lunch_start).toBeNull();
    expect((payload.update.settings as unknown as Record<string, unknown>).lunch_end).toBeNull();
  });

  it("uses nearestSupportedTeams for wizard num_teams", () => {
    expect(nearestSupportedTeams(10)).toBe(8);
    expect(nearestSupportedTeams(20)).toBe(16);
  });
});
