import { describe, it, expect } from "vitest";
import { selectSurfaceState, type SurfaceState } from "./pure";
import type { UrgencyStatus } from "./types";

type Row = {
  name: string;
  status: UrgencyStatus;
  itemCount: number;
  expected: SurfaceState;
};

const TABLE: Row[] = [
  {
    name: "pending, no failures, no items → pending",
    status: { phase: "pending", failedSources: [] },
    itemCount: 0,
    expected: "pending",
  },
  {
    name: "pending domine même avec failures + items",
    status: { phase: "pending", failedSources: ["convocation-silence"] },
    itemCount: 3,
    expected: "pending",
  },
  {
    name: "settled, failures, 0 items → error",
    status: { phase: "settled", failedSources: ["reduced-squad"] },
    itemCount: 0,
    expected: "error",
  },
  {
    name: "settled, failures, items → partial",
    status: { phase: "settled", failedSources: ["reduced-squad"] },
    itemCount: 3,
    expected: "partial",
  },
  {
    name: "settled, no failures, 0 items → empty (SuccessBanner)",
    status: { phase: "settled", failedSources: [] },
    itemCount: 0,
    expected: "empty",
  },
  {
    name: "settled, no failures, items → list",
    status: { phase: "settled", failedSources: [] },
    itemCount: 3,
    expected: "list",
  },
];

describe("selectSurfaceState — lattice 5 branches", () => {
  for (const row of TABLE) {
    it(row.name, () => {
      expect(selectSurfaceState(row.status, row.itemCount)).toBe(row.expected);
    });
  }

  it("INVARIANT: la branche 'empty' n'est JAMAIS atteinte si failedSources est non vide", () => {
    const sources: UrgencyStatus["failedSources"][] = [
      ["convocation-silence"],
      ["reduced-squad"],
      ["convocation-silence", "reduced-squad"],
    ];
    for (const failedSources of sources) {
      for (const itemCount of [0, 1, 5, 42]) {
        const got = selectSurfaceState({ phase: "settled", failedSources }, itemCount);
        expect(got, `failed=${failedSources.join(",")} items=${itemCount}`).not.toBe("empty");
      }
    }
  });
});
