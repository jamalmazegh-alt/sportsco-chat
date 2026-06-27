import { describe, it, expect } from "vitest";
import { computeStatus, type CollectorStatusInput } from "./pure";

const conv = (o: Partial<CollectorStatusInput> = {}): CollectorStatusInput => ({
  source: "convocation-silence",
  isPending: false,
  failed: false,
  ...o,
});
const abs = (o: Partial<CollectorStatusInput> = {}): CollectorStatusInput => ({
  source: "reduced-squad",
  isPending: false,
  failed: false,
  ...o,
});

describe("computeStatus — agrégation status à 2 dimensions", () => {
  it("≥1 pending → phase 'pending', failedSources vide", () => {
    expect(computeStatus([conv({ isPending: true }), abs()])).toEqual({
      phase: "pending",
      failedSources: [],
    });
  });

  it("tous settled, ≥1 error → settled + failedSources contient les sources KO", () => {
    expect(computeStatus([conv({ failed: true }), abs()])).toEqual({
      phase: "settled",
      failedSources: ["convocation-silence"],
    });
    expect(computeStatus([conv({ failed: true }), abs({ failed: true })])).toEqual({
      phase: "settled",
      failedSources: ["convocation-silence", "reduced-squad"],
    });
  });

  it("tous settled, aucun error → settled + failedSources vide", () => {
    expect(computeStatus([conv(), abs()])).toEqual({
      phase: "settled",
      failedSources: [],
    });
  });

  it("pending domine error (1 pending + 1 error → pending, failedSources vide)", () => {
    expect(computeStatus([conv({ isPending: true }), abs({ failed: true })])).toEqual({
      phase: "pending",
      failedSources: [],
    });
  });
});
