import { describe, it, expect } from "vitest";
import { severityForStart } from "./pure";
import { mergeUrgencies } from "./pure";
import type { UrgencyItem } from "./types";

const NOW = new Date("2025-07-20T10:00:00.000Z");
const H = 3_600_000;
const D = 24 * H;

function inMs(ms: number): string {
  return new Date(NOW.getTime() + ms).toISOString();
}

describe("severityForStart — défauts convocations (24 h / 3 j)", () => {
  it("< 24h → critical", () => {
    expect(severityForStart(inMs(1 * H), NOW)).toBe("critical");
    expect(severityForStart(inMs(23 * H), NOW)).toBe("critical");
  });

  it("24 h .. < 3 j → high", () => {
    expect(severityForStart(inMs(24 * H), NOW)).toBe("high");
    expect(severityForStart(inMs(2 * D), NOW)).toBe("high");
    expect(severityForStart(inMs(3 * D - H), NOW)).toBe("high");
  });

  it("au-delà de 3 j → medium (plus de null, plus d'exclusion)", () => {
    expect(severityForStart(inMs(3 * D), NOW)).toBe("medium");
    expect(severityForStart(inMs(10 * D), NOW)).toBe("medium");
    expect(severityForStart(inMs(30 * D), NOW)).toBe("medium");
  });

  it("null si et seulement si l'événement est commencé", () => {
    expect(severityForStart(inMs(0), NOW)).toBeNull();
    expect(severityForStart(inMs(-H), NOW)).toBeNull();
  });
});

describe("severityForStart — seuils paramétrables (besoins 48 h / 7 j)", () => {
  const NEED = { criticalHours: 48, highHours: 24 * 7 };

  it("< 48 h → critical", () => {
    expect(severityForStart(inMs(47 * H), NOW, NEED)).toBe("critical");
  });

  it("48 h .. < 7 j → high", () => {
    expect(severityForStart(inMs(2 * D), NOW, NEED)).toBe("high");
    expect(severityForStart(inMs(6 * D), NOW, NEED)).toBe("high");
  });

  it("au-delà de 7 j → medium", () => {
    expect(severityForStart(inMs(10 * D), NOW, NEED)).toBe("medium");
  });

  it("null si commencé, quels que soient les seuils", () => {
    expect(severityForStart(inMs(-1), NOW, NEED)).toBeNull();
  });
});

describe("mergeUrgencies — tri stable critical < high < medium sans exclusion", () => {
  function mkItem(id: string, sev: "critical" | "high" | "medium", anchor: string): UrgencyItem {
    return {
      id,
      source: "convocation-silence",
      sourceId: id,
      severity: sev,
      role: "coach",
      title: id,
      subtitle: "",
      anchorAt: anchor,
      primaryAction: { kind: "open-event", eventId: id },
    };
  }
  it("critical J-1 avant high J-3 avant medium J-10", () => {
    const items = [
      mkItem("j10", "medium", inMs(10 * D)),
      mkItem("j3", "high", inMs(3 * D)),
      mkItem("j1", "critical", inMs(1 * D)),
    ];
    const out = mergeUrgencies([items]);
    expect(out.map((i) => i.id)).toEqual(["j1", "j3", "j10"]);
  });
});
