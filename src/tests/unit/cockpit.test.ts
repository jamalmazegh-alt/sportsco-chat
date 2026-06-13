import { describe, it, expect } from "vitest";
import {
  computeEstimatedEnd,
  computeAverageDelay,
  computeAlerts,
} from "@/modules/tournaments/lib/control-center";

const NOW = new Date("2026-06-13T14:00:00Z");

function m(
  id: string,
  patch: Partial<{
    status: string;
    round: string;
    scheduled_at: string | null;
    field: string | null;
    referee_user_id: string | null;
    referee_name: string | null;
  }> = {},
) {
  return {
    id,
    round: patch.round ?? "group",
    status: patch.status ?? "scheduled",
    scheduled_at: patch.scheduled_at ?? null,
    score_a: null,
    score_b: null,
    field: patch.field ?? null,
    referee_user_id: patch.referee_user_id ?? null,
    referee_name: patch.referee_name ?? null,
  };
}

describe("computeEstimatedEnd", () => {
  it("returns null when no scheduled_at on unfinished matches", () => {
    expect(computeEstimatedEnd([m("a", { status: "completed" })], 30)).toBeNull();
    expect(computeEstimatedEnd([m("a", { scheduled_at: null })], 30)).toBeNull();
  });

  it("returns latest scheduled_at + duration", () => {
    const out = computeEstimatedEnd(
      [
        m("a", { scheduled_at: "2026-06-13T14:00:00Z" }),
        m("b", { scheduled_at: "2026-06-13T15:30:00Z" }),
      ],
      30,
    );
    expect(out?.toISOString()).toBe("2026-06-13T16:00:00.000Z");
  });

  it("ignores finished matches", () => {
    const out = computeEstimatedEnd(
      [
        m("a", { status: "completed", scheduled_at: "2026-06-13T18:00:00Z" }),
        m("b", { scheduled_at: "2026-06-13T15:00:00Z" }),
      ],
      45,
    );
    expect(out?.toISOString()).toBe("2026-06-13T15:45:00.000Z");
  });
});

describe("computeAverageDelay", () => {
  it("returns null when no overdue match", () => {
    expect(computeAverageDelay([m("a", { scheduled_at: null })], NOW)).toBeNull();
    expect(
      computeAverageDelay([m("a", { scheduled_at: "2026-06-13T15:00:00Z" })], NOW),
    ).toBeNull();
  });

  it("computes average of overdue delays in minutes", () => {
    const out = computeAverageDelay(
      [
        m("a", { scheduled_at: "2026-06-13T13:50:00Z" }), // 10
        m("b", { scheduled_at: "2026-06-13T13:40:00Z" }), // 20
      ],
      NOW,
    );
    expect(out).toBe(15);
  });

  it("excludes finished matches", () => {
    const out = computeAverageDelay(
      [
        m("a", { status: "completed", scheduled_at: "2026-06-13T13:00:00Z" }),
        m("b", { scheduled_at: "2026-06-13T13:50:00Z" }),
      ],
      NOW,
    );
    expect(out).toBe(10);
  });
});

describe("computeAlerts", () => {
  const t = { status: "in_progress", format: "groups_knockout" };

  it("returns empty when everything is fine", () => {
    const out = computeAlerts({
      tournament: t,
      matches: [m("a", { scheduled_at: "2026-06-13T15:00:00Z", referee_name: "Bob" })],
      flightsCount: 0,
      now: NOW,
    });
    expect(out).toEqual([]);
  });

  it("detects late match beyond threshold", () => {
    const out = computeAlerts({
      tournament: t,
      matches: [m("a", { scheduled_at: "2026-06-13T13:40:00Z", referee_name: "Bob" })],
      flightsCount: 0,
      now: NOW,
    });
    expect(out.some((x) => x.kind === "late_match")).toBe(true);
  });

  it("detects missing referee in soon window", () => {
    const out = computeAlerts({
      tournament: t,
      matches: [m("a", { scheduled_at: "2026-06-13T14:20:00Z" })],
      flightsCount: 0,
      now: NOW,
    });
    expect(out.some((x) => x.kind === "missing_referee")).toBe(true);
  });

  it("detects finals not generated when pools done", () => {
    const out = computeAlerts({
      tournament: t,
      matches: [
        m("a", { status: "completed", round: "group" }),
        m("b", { status: "completed", round: "group" }),
      ],
      flightsCount: 0,
      now: NOW,
    });
    expect(out.some((x) => x.kind === "finals_not_generated")).toBe(true);
  });

  it("sorts by severity (high → low)", () => {
    const out = computeAlerts({
      tournament: t,
      matches: [
        m("a", { status: "completed", round: "group" }),
        m("b", { status: "completed", round: "group" }),
        m("c", { scheduled_at: "2026-06-13T13:40:00Z", referee_name: "Bob" }), // late
        m("d", { scheduled_at: "2026-06-13T14:20:00Z" }), // ref missing
      ],
      flightsCount: 0,
      now: NOW,
    });
    expect(out[0].severity).toBe("high");
    expect(out[out.length - 1].severity).toBe("low");
  });
});
