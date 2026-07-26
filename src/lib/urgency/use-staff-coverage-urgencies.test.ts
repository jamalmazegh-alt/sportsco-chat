import { describe, it, expect } from "vitest";
import {
  computeCoverage,
  computeStaffCoverageUrgencies,
  MIN_COVERED_STAFF,
  type CoverageEventInput,
} from "./use-staff-coverage-urgencies";

const NOW = new Date("2026-01-10T08:00:00.000Z");
const IN_2D = new Date(NOW.getTime() + 2 * 86_400_000).toISOString();
const DATE_IN_2D = IN_2D.slice(0, 10);

function base(overrides: Partial<CoverageEventInput> = {}): CoverageEventInput {
  return {
    eventId: "E1",
    title: "Match",
    startsAt: IN_2D,
    teamId: "T1",
    teamName: "U15",
    teamStaffUserIds: ["u-coach-1"],
    availabilities: [],
    assignmentsCount: 0,
    ...overrides,
  };
}

describe("computeCoverage — Lot 4b", () => {
  it("MIN_COVERED_STAFF est exposé et vaut 1 par défaut", () => {
    expect(MIN_COVERED_STAFF).toBe(1);
  });

  it("assignation présente ⇒ couvert (même sans staff équipe dispo)", () => {
    const d = computeCoverage(base({ teamStaffUserIds: [], assignmentsCount: 1 }));
    expect(d.covered).toBe(true);
    expect(d.reason).toBe("has-assignment");
  });

  it("staff équipe non-absent ⇒ couvert", () => {
    const d = computeCoverage(base());
    expect(d.covered).toBe(true);
    expect(d.reason).toBe("team-staff-available");
  });

  it("tous les staff absents (confirmed) sans assignation ⇒ non couvert", () => {
    const d = computeCoverage(
      base({
        availabilities: [
          {
            user_id: "u-coach-1",
            start_date: DATE_IN_2D,
            end_date: DATE_IN_2D,
            certainty: "confirmed",
            status: "active",
          },
        ],
      }),
    );
    expect(d.covered).toBe(false);
    expect(d.reason).toBe("no-staff-available");
  });

  it("indispo tentative compte aussi comme absent (spec: aucune indispo active)", () => {
    const d = computeCoverage(
      base({
        availabilities: [
          {
            user_id: "u-coach-1",
            start_date: DATE_IN_2D,
            end_date: DATE_IN_2D,
            certainty: "tentative",
            status: "active",
          },
        ],
      }),
    );
    expect(d.covered).toBe(false);
  });

  it("indispo hors intervalle ⇒ couvert", () => {
    const d = computeCoverage(
      base({
        availabilities: [
          {
            user_id: "u-coach-1",
            start_date: "2020-01-01",
            end_date: "2020-01-02",
            certainty: "confirmed",
            status: "active",
          },
        ],
      }),
    );
    expect(d.covered).toBe(true);
  });

  it("staff vide sans assignation ⇒ non couvert", () => {
    const d = computeCoverage(base({ teamStaffUserIds: [] }));
    expect(d.covered).toBe(false);
  });

  it("assignation prime sur l'absence complète", () => {
    const d = computeCoverage(
      base({
        assignmentsCount: 1,
        availabilities: [
          {
            user_id: "u-coach-1",
            start_date: DATE_IN_2D,
            end_date: DATE_IN_2D,
            certainty: "confirmed",
            status: "active",
          },
        ],
      }),
    );
    expect(d.covered).toBe(true);
    expect(d.reason).toBe("has-assignment");
  });
});

describe("computeStaffCoverageUrgencies — mapping", () => {
  const args = {
    formatWhen: (_: string) => "sam. 12 janv., 10:00",
    uncoveredLabel: (n: string | null) => (n ? `Aucun coach — ${n}` : "Aucun coach"),
    fallbackTitle: "Événement",
    now: NOW,
  };

  it("ne remonte que les non couverts, avec source & role corrects", () => {
    const items = computeStaffCoverageUrgencies({
      ...args,
      events: [
        base({ eventId: "OK", assignmentsCount: 1 }),
        base({
          eventId: "KO",
          teamStaffUserIds: [],
        }),
      ],
    });
    expect(items).toHaveLength(1);
    expect(items[0].id).toBe("staff-uncovered:KO:coach");
    expect(items[0].source).toBe("staff-uncovered");
    expect(items[0].role).toBe("coach");
    expect(items[0].primaryAction).toEqual({ kind: "open-event", eventId: "KO" });
  });

  it("exclut les événements déjà commencés", () => {
    const past = new Date(NOW.getTime() - 3600_000).toISOString();
    const items = computeStaffCoverageUrgencies({
      ...args,
      events: [base({ eventId: "PAST", startsAt: past, teamStaffUserIds: [] })],
    });
    expect(items).toHaveLength(0);
  });
});
