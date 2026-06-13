import { describe, it, expect } from "vitest";
import {
  computeStepper,
  computeContinueAction,
  countMatches,
  findNextScoreMatch,
  type ComputeArgs,
} from "@/modules/tournaments/lib/control-center";

type MatchInput = {
  id: string;
  round?: string;
  status?: string;
  scheduled_at?: string | null;
  score_a?: number | null;
  score_b?: number | null;
};

function match(input: MatchInput) {
  return {
    id: input.id,
    round: input.round ?? "group",
    status: input.status ?? "scheduled",
    scheduled_at: input.scheduled_at ?? null,
    score_a: input.score_a ?? null,
    score_b: input.score_b ?? null,
  };
}

function args(partial: Partial<ComputeArgs> & { teamsCount: number }): ComputeArgs {
  return {
    tournament: { status: "published", format: "groups_knockout" },
    groupsCount: 0,
    matches: [],
    flightsCount: 0,
    ...partial,
  };
}

describe("computeContinueAction — priority order", () => {
  it("1) asks to add a team below the real minimum (2), regardless of capacity", () => {
    expect(computeContinueAction(args({ teamsCount: 0 })).kind).toBe("add_team");
    expect(computeContinueAction(args({ teamsCount: 1 })).kind).toBe("add_team");
  });

  // Fix B regression: num_teams is the MAX capacity (e.g. "8 / 16 équipes"),
  // it must never gate the workflow. TC-01→TC-04 team counts.
  it.each([7, 9, 15, 31])(
    "does NOT stay stuck on add_team with %i teams in a 32-capacity tournament",
    (teamsCount) => {
      const action = computeContinueAction(
        args({
          teamsCount,
          tournament: { status: "published", format: "groups_knockout" },
        }),
      );
      expect(action.kind).toBe("run_draw");
    },
  );

  it("proposes publish when still draft after teams are added", () => {
    const action = computeContinueAction(
      args({ teamsCount: 8, tournament: { status: "draft", format: "groups_knockout" } }),
    );
    expect(action.kind).toBe("publish_tournament");
  });

  // Fix D edge — a draft must never be left without a publish path. Publishing
  // is not gated on the team count (draft → publish wins over add_team).
  it.each([0, 1])(
    "still proposes publish for a draft with only %i team(s)",
    (teamsCount) => {
      const action = computeContinueAction(
        args({ teamsCount, tournament: { status: "draft", format: "groups_knockout" } }),
      );
      expect(action.kind).toBe("publish_tournament");
    },
  );

  it("2) run_draw when pools expected and no group generated", () => {
    expect(computeContinueAction(args({ teamsCount: 8 })).kind).toBe("run_draw");
  });

  it("3) generate_matches when groups exist but no match", () => {
    expect(
      computeContinueAction(args({ teamsCount: 8, groupsCount: 2 })).kind,
    ).toBe("generate_matches");
  });

  it("4) enter_next_score targets the live match first", () => {
    const action = computeContinueAction(
      args({
        teamsCount: 8,
        groupsCount: 2,
        matches: [
          match({ id: "m1", status: "completed", score_a: 1, score_b: 0 }),
          match({ id: "m2", status: "live", score_a: 0, score_b: 0 }),
          match({ id: "m3", status: "scheduled" }),
        ],
      }),
    );
    expect(action.kind).toBe("enter_next_score");
    expect(action.matchId).toBe("m2");
  });

  it("5) create_flights once all pool matches are done (flighted format)", () => {
    const action = computeContinueAction(
      args({
        teamsCount: 8,
        groupsCount: 2,
        tournament: { status: "in_progress", format: "flighted_finals" },
        matches: [
          match({ id: "m1", status: "completed", score_a: 1, score_b: 0 }),
          match({ id: "m2", status: "completed", score_a: 2, score_b: 2 }),
        ],
      }),
    );
    expect(action.kind).toBe("create_flights");
  });

  it("6) share_results when everything is finished (Fix E: reachable, not all_done)", () => {
    const action = computeContinueAction(
      args({
        teamsCount: 8,
        groupsCount: 2,
        tournament: { status: "in_progress", format: "groups_knockout" },
        matches: [
          match({ id: "m1", status: "completed", score_a: 1, score_b: 0 }),
          match({ id: "m2", round: "final", status: "completed", score_a: 3, score_b: 1 }),
        ],
      }),
    );
    expect(action.kind).toBe("share_results");
  });

  it("falls back to all_done once the tournament is closed", () => {
    const action = computeContinueAction(
      args({
        teamsCount: 8,
        groupsCount: 2,
        tournament: { status: "completed", format: "groups_knockout" },
        matches: [match({ id: "m1", status: "completed", score_a: 1, score_b: 0 })],
      }),
    );
    expect(action.kind).toBe("all_done");
  });
});

describe("computeStepper", () => {
  it("validates the registrations step with 2+ teams once published (not at full capacity)", () => {
    const steps = computeStepper(args({ teamsCount: 3 }));
    expect(steps.find((s) => s.id === "registrations")?.state).toBe("done");
    expect(steps.find((s) => s.id === "draw")?.state).toBe("current");
  });

  it("keeps registrations as current while in draft or below 2 teams", () => {
    const draft = computeStepper(
      args({ teamsCount: 5, tournament: { status: "draft", format: "groups_knockout" } }),
    );
    expect(draft.find((s) => s.id === "registrations")?.state).toBe("current");

    const tooFew = computeStepper(args({ teamsCount: 1 }));
    expect(tooFew.find((s) => s.id === "registrations")?.state).toBe("current");
  });
});

describe("countMatches / findNextScoreMatch", () => {
  it("counts done, live and upcoming buckets", () => {
    const counters = countMatches([
      match({ id: "m1", status: "completed" }),
      match({ id: "m2", status: "forfeit_a" }),
      match({ id: "m3", status: "live" }),
      match({ id: "m4", status: "scheduled" }),
    ]);
    expect(counters).toEqual({ done: 2, live: 1, upcoming: 1, total: 4 });
  });

  it("picks the earliest scheduled match when nothing is live", () => {
    const next = findNextScoreMatch([
      match({ id: "m1", status: "scheduled", scheduled_at: "2026-06-13T10:00:00Z" }),
      match({ id: "m2", status: "scheduled", scheduled_at: "2026-06-13T09:00:00Z" }),
    ]);
    expect(next?.id).toBe("m2");
  });

  // Fix G — once every match has a score, there is no "next match" to chain to.
  it("returns null when all matches are already played (no next match)", () => {
    expect(
      findNextScoreMatch([
        match({ id: "m1", status: "completed", score_a: 2, score_b: 1 }),
        match({ id: "m2", status: "completed", score_a: 0, score_b: 0 }),
      ]),
    ).toBeNull();
  });

  // Fix G — chaining excludes the just-saved match to surface the following one.
  it("excluding the saved match yields the next unplayed one", () => {
    const all = [
      match({ id: "m1", status: "live", score_a: 0, score_b: 0 }),
      match({ id: "m2", status: "scheduled", scheduled_at: "2026-06-13T09:00:00Z" }),
      match({ id: "m3", status: "scheduled", scheduled_at: "2026-06-13T10:00:00Z" }),
    ];
    const next = findNextScoreMatch(all.filter((m) => m.id !== "m1"));
    expect(next?.id).toBe("m2");
  });
});
