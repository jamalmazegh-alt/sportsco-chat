import { describe, it, expect } from "vitest";
import { mergeUrgencies } from "./pure";
import type { UrgencyItem, UrgencyRole, UrgencySeverity } from "./types";

function make(o: {
  eventId: string;
  role: UrgencyRole;
  severity?: UrgencySeverity;
  anchorAt?: string;
}): UrgencyItem {
  const severity = o.severity ?? "high";
  return {
    id: `convocation-silence:${o.eventId}:${o.role}`,
    source: "convocation-silence",
    sourceId: o.eventId,
    severity,
    role: o.role,
    title: `event ${o.eventId}`,
    subtitle: "",
    anchorAt: o.anchorAt ?? "2025-01-10T18:00:00.000Z",
    primaryAction: { kind: "respond", eventId: o.eventId },
  };
}

describe("mergeUrgencies — dedup par id + tri severity/anchorAt", () => {
  it("CAS CRITIQUE: coach-parent même event → 2 items conservés (rôle ≠ → pas un doublon)", () => {
    const coach = make({ eventId: "E1", role: "coach" });
    const parent = make({ eventId: "E1", role: "parent" });
    const out = mergeUrgencies([[coach], [parent]]);
    expect(out).toHaveLength(2);
    const roles = out.map((i) => i.role).sort();
    expect(roles).toEqual(["coach", "parent"]);
  });

  it("vrai doublon: deux items identiques (E1, coach) → collapse à 1", () => {
    const a = make({ eventId: "E1", role: "coach" });
    const b = make({ eventId: "E1", role: "coach" });
    const out = mergeUrgencies([[a], [b]]);
    expect(out).toHaveLength(1);
  });

  it("parent multi-enfants même event → collapse à 1 (dedup sourceId=eventId)", () => {
    // Côté collecteur, un parent multi-enfants émet 1 seul item par event.
    // On le simule en passant deux fois le MÊME item.
    const a = make({ eventId: "E1", role: "parent" });
    const b = make({ eventId: "E1", role: "parent" });
    const out = mergeUrgencies([[a, b]]);
    expect(out).toHaveLength(1);
  });

  it("tri: severity domine (critical tardif > high tôt)", () => {
    const high = make({
      eventId: "E1",
      role: "coach",
      severity: "high",
      anchorAt: "2025-01-01T00:00:00.000Z",
    });
    const critical = make({
      eventId: "E2",
      role: "coach",
      severity: "critical",
      anchorAt: "2025-12-31T00:00:00.000Z",
    });
    const out = mergeUrgencies([[high, critical]]);
    expect(out.map((i) => i.severity)).toEqual(["critical", "high"]);
  });

  it("tri: anchorAt ASC en départage", () => {
    const late = make({
      eventId: "E1",
      role: "coach",
      severity: "critical",
      anchorAt: "2025-02-01T00:00:00.000Z",
    });
    const early = make({
      eventId: "E2",
      role: "coach",
      severity: "critical",
      anchorAt: "2025-01-15T00:00:00.000Z",
    });
    const out = mergeUrgencies([[late, early]]);
    expect(out.map((i) => i.sourceId)).toEqual(["E2", "E1"]);
  });

  it("coach+parent même event/anchorAt → adjacents, ordre stable entre runs", () => {
    const coach = make({
      eventId: "E1",
      role: "coach",
      severity: "critical",
      anchorAt: "2025-03-01T18:00:00.000Z",
    });
    const parent = make({
      eventId: "E1",
      role: "parent",
      severity: "critical",
      anchorAt: "2025-03-01T18:00:00.000Z",
    });
    const r1 = mergeUrgencies([[coach], [parent]]).map((i) => i.role);
    const r2 = mergeUrgencies([[coach], [parent]]).map((i) => i.role);
    const r3 = mergeUrgencies([[coach], [parent]]).map((i) => i.role);
    expect(r1).toEqual(r2);
    expect(r2).toEqual(r3);
    // Adjacents (longueur 2, donc trivialement adjacents).
    expect(r1).toHaveLength(2);
  });
});
