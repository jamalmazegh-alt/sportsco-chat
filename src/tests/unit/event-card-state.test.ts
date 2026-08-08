import { describe, it, expect } from "vitest";
import {
  cardFooterVisibility,
  eventCardState,
  isEventDayReached,
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

describe("cardFooterVisibility", () => {
  const upcoming = {
    cancelled: false,
    past: false,
    isCoach: true,
    hasResult: false,
    hasCounts: true,
    convocationSent: true,
    hasMyConvocation: true,
  };

  it("shows counts to staff on an upcoming event, and hides the redundant sent chip", () => {
    const v = cardFooterVisibility(upcoming);
    expect(v.counts).toBe(true);
    expect(v.sent).toBe(false);
  });

  it("falls back to the sent chip when no counts are available", () => {
    const v = cardFooterVisibility({ ...upcoming, hasCounts: false });
    expect(v.counts).toBe(false);
    expect(v.sent).toBe(true);
  });

  it("never shows counts to a player, who sees the sent chip instead", () => {
    const v = cardFooterVisibility({ ...upcoming, isCoach: false });
    expect(v.counts).toBe(false);
    expect(v.sent).toBe(true);
  });

  it("drops every attendance signal once the event is over — the result is what matters", () => {
    const v = cardFooterVisibility({ ...upcoming, past: true, hasResult: true });
    expect(v).toEqual({ counts: false, sent: false, response: false, calledRail: false });
  });

  it("drops them on a past event even without a result", () => {
    const v = cardFooterVisibility({ ...upcoming, past: true, hasResult: false });
    expect(v.counts).toBe(false);
    expect(v.response).toBe(false);
  });

  it("stays silent on a cancelled event — the only thing to say is that it is off", () => {
    const v = cardFooterVisibility({ ...upcoming, cancelled: true });
    expect(v).toEqual({ counts: false, sent: false, response: false, calledRail: false });
  });

  it("ties the called-up rail to the viewer's own convocation", () => {
    expect(cardFooterVisibility(upcoming).calledRail).toBe(true);
    expect(cardFooterVisibility({ ...upcoming, hasMyConvocation: false }).calledRail).toBe(false);
  });
});

describe("isEventDayReached", () => {
  const kickoff = new Date("2026-03-14T20:00:00Z");

  it("opens from the start of match day, hours before kick-off", () => {
    expect(isEventDayReached(kickoff, new Date("2026-03-14T08:00:00Z"))).toBe(true);
  });

  it("stays closed the day before", () => {
    expect(isEventDayReached(kickoff, new Date("2026-03-13T23:00:00Z"))).toBe(false);
  });

  it("stays open after the match", () => {
    expect(isEventDayReached(kickoff, new Date("2026-03-16T09:00:00Z"))).toBe(true);
  });
});
