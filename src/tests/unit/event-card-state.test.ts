import { describe, it, expect } from "vitest";
import {
  eventCardState,
  matchOutcome,
  type EventCardEvent,
} from "@/components/events/event-card-state";

function makeEvent(patch: Partial<EventCardEvent> = {}): EventCardEvent {
  return {
    id: "e1",
    title: "U15 A vs FC Riverside",
    starts_at: "2026-03-14T15:00:00.000Z",
    type: "match",
    status: "published",
    team_id: "t1",
    ...patch,
  };
}

describe("eventCardState", () => {
  const kickoff = "2026-03-14T15:00:00.000Z";
  const end = "2026-03-14T16:45:00.000Z";

  it("marks a future event as neither past nor today", () => {
    const s = eventCardState(makeEvent({ starts_at: kickoff }), new Date("2026-03-11T09:00:00Z"));
    expect(s).toEqual({ cancelled: false, today: false, past: false, live: false });
  });

  it("marks a finished event on an earlier day as past", () => {
    const s = eventCardState(makeEvent({ starts_at: kickoff }), new Date("2026-03-16T09:00:00Z"));
    expect(s.past).toBe(true);
    expect(s.today).toBe(false);
  });

  it("never marks the same day as past, even after the start time", () => {
    const s = eventCardState(makeEvent({ starts_at: kickoff }), new Date("2026-03-14T20:00:00Z"));
    expect(s.today).toBe(true);
    expect(s.past).toBe(false);
  });

  it("is live between start and end when the end time is known", () => {
    const s = eventCardState(
      makeEvent({ starts_at: kickoff, ends_at: end }),
      new Date("2026-03-14T15:30:00Z"),
    );
    expect(s.live).toBe(true);
  });

  it("is not live before kickoff or after the final whistle", () => {
    const ev = makeEvent({ starts_at: kickoff, ends_at: end });
    expect(eventCardState(ev, new Date("2026-03-14T14:59:00Z")).live).toBe(false);
    expect(eventCardState(ev, new Date("2026-03-14T16:46:00Z")).live).toBe(false);
  });

  it("stays not live when the end time is unknown — duration is never guessed", () => {
    const s = eventCardState(
      makeEvent({ starts_at: kickoff, ends_at: null }),
      new Date("2026-03-14T15:30:00Z"),
    );
    expect(s.live).toBe(false);
  });

  it("never shows a cancelled event as live", () => {
    const s = eventCardState(
      makeEvent({ starts_at: kickoff, ends_at: end, status: "cancelled" }),
      new Date("2026-03-14T15:30:00Z"),
    );
    expect(s.cancelled).toBe(true);
    expect(s.live).toBe(false);
  });
});

describe("matchOutcome", () => {
  const result = { home_score: 3, away_score: 1 };

  it("reads the home score as ours when we play at home", () => {
    expect(matchOutcome(makeEvent({ is_home: true, result }))).toBe("win");
  });

  it("reads the away score as ours when we play away", () => {
    expect(matchOutcome(makeEvent({ is_home: false, result }))).toBe("loss");
  });

  it("treats an unspecified side as home — matching the list query default", () => {
    expect(matchOutcome(makeEvent({ is_home: null, result }))).toBe("win");
  });

  it("returns a draw on equal scores", () => {
    expect(
      matchOutcome(makeEvent({ is_home: true, result: { home_score: 2, away_score: 2 } })),
    ).toBe("draw");
  });

  it("returns null without a result, and for non-match events", () => {
    expect(matchOutcome(makeEvent({ is_home: true, result: null }))).toBeNull();
    expect(matchOutcome(makeEvent({ type: "training", result }))).toBeNull();
  });
});
