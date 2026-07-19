import { describe, it, expect } from "vitest";
import { isImminentEngagement } from "@/components/home-needs-card";

const NOW = new Date("2026-07-20T12:00:00Z");
const H = 60 * 60 * 1000;
const iso = (offsetH: number) => new Date(NOW.getTime() + offsetH * H).toISOString();

describe("isImminentEngagement", () => {
  it("returns true for an event starting in less than 48h", () => {
    expect(isImminentEngagement(iso(24), NOW)).toBe(true);
    expect(isImminentEngagement(iso(47), NOW)).toBe(true);
  });

  it("returns false for an event starting in 48h or more", () => {
    expect(isImminentEngagement(iso(48), NOW)).toBe(false);
    expect(isImminentEngagement(iso(24 * 10), NOW)).toBe(false);
  });

  it("returns false for an event already started", () => {
    expect(isImminentEngagement(iso(-1), NOW)).toBe(false);
    expect(isImminentEngagement(iso(0), NOW)).toBe(false);
  });

  it("returns false when startsAt is missing", () => {
    expect(isImminentEngagement(null, NOW)).toBe(false);
    expect(isImminentEngagement(undefined, NOW)).toBe(false);
  });
});
