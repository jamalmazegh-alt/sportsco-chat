import { describe, it, expect } from "vitest";
import { sortConvocatedPlayers, type MatchSheetPlayer } from "@/lib/match-sheet/sort";
import { buildMatchSheetPdf } from "@/lib/match-sheet/match-sheet.server";

function p(over: Partial<MatchSheetPlayer>): MatchSheetPlayer {
  return {
    id: over.id ?? "p" + Math.random(),
    first_name: over.first_name ?? null,
    last_name: over.last_name ?? null,
    jersey_number: over.jersey_number ?? null,
    birth_date: over.birth_date ?? null,
    license_number: over.license_number ?? null,
  };
}

describe("sortConvocatedPlayers", () => {
  it("sorts numbered jerseys ascending first", () => {
    const out = sortConvocatedPlayers([
      p({ id: "a", jersey_number: 10, last_name: "Zidane" }),
      p({ id: "b", jersey_number: 2, last_name: "Müller" }),
      p({ id: "c", jersey_number: 7, last_name: "Henry" }),
    ]);
    expect(out.map((x) => x.id)).toEqual(["b", "c", "a"]);
  });

  it("appends jersey-less players after numbered ones, sorted by last name", () => {
    const out = sortConvocatedPlayers([
      p({ id: "noA", jersey_number: null, last_name: "Übel" }),
      p({ id: "num", jersey_number: 4, last_name: "Anything" }),
      p({ id: "noB", jersey_number: null, last_name: "Acosta" }),
    ]);
    expect(out.map((x) => x.id)).toEqual(["num", "noB", "noA"]);
  });

  it("treats missing last names as empty string (locale compare doesn't throw)", () => {
    const out = sortConvocatedPlayers([
      p({ id: "x", jersey_number: null, last_name: null }),
      p({ id: "y", jersey_number: null, last_name: "Beta" }),
    ]);
    // null/empty last names sort before "Beta"
    expect(out.map((x) => x.id)).toEqual(["x", "y"]);
  });

  it("does not mutate the input array", () => {
    const input = [
      p({ id: "a", jersey_number: 5 }),
      p({ id: "b", jersey_number: 1 }),
    ];
    const snap = input.map((x) => x.id);
    sortConvocatedPlayers(input);
    expect(input.map((x) => x.id)).toEqual(snap);
  });

  it("accented last names sort case/diacritic-insensitively", () => {
    const out = sortConvocatedPlayers([
      p({ id: "1", jersey_number: null, last_name: "Étienne" }),
      p({ id: "2", jersey_number: null, last_name: "Adam" }),
      p({ id: "3", jersey_number: null, last_name: "Élise" }),
    ]);
    expect(out[0].id).toBe("2"); // Adam first
  });
});
