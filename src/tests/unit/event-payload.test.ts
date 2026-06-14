import { describe, it, expect } from "vitest";
import {
  buildEventPayload,
  toGoogleMapsUrl,
  type BuildEventPayloadInput,
} from "@/lib/events/event-payload";

const TEAM = "00000000-0000-0000-0000-000000000001";
const START = "2025-09-06T13:00:00.000Z";
const END = "2025-09-06T14:30:00.000Z";

describe("buildEventPayload — single source of truth", () => {
  it("derives location_url from location when none provided", () => {
    const p = buildEventPayload({
      teamId: TEAM,
      type: "training",
      title: "Entraînement U15",
      location: "Stade municipal",
      startsAt: START,
    });
    expect(p.location_url).toBe(toGoogleMapsUrl("Stade municipal"));
  });

  it("nulls match-only fields for non-match events", () => {
    const p = buildEventPayload({
      teamId: TEAM,
      type: "training",
      title: "Entraînement U15",
      startsAt: START,
      opponent: "should-be-dropped",
      meetingPoint: "should-be-dropped",
    });
    expect(p.opponent).toBeNull();
    expect(p.competition_type).toBeNull();
    expect(p.is_home).toBeNull();
    expect(p.meeting_point).toBeNull();
    expect(p.is_official).toBe(false);
  });

  it("match is always official, away keeps meeting_point", () => {
    const p = buildEventPayload({
      teamId: TEAM,
      type: "match",
      title: "U15 vs FC X",
      startsAt: START,
      isHome: false,
      opponent: "FC X",
      meetingPoint: "stadium",
      competitionType: "championship",
    });
    expect(p.is_official).toBe(true);
    expect(p.is_home).toBe(false);
    expect(p.meeting_point).toBe("stadium");
    expect(p.competition_type).toBe("championship");
  });

  it("'other' is preserved", () => {
    const p = buildEventPayload({ teamId: TEAM, type: "other", title: "Divers", startsAt: START });
    expect(p.type).toBe("other");
  });

  it("carpool is only persisted when explicitly set", () => {
    expect(
      "carpool_enabled" in
        buildEventPayload({ teamId: TEAM, type: "training", title: "x", startsAt: START }),
    ).toBe(false);
    expect(
      buildEventPayload({
        teamId: TEAM,
        type: "training",
        title: "x",
        startsAt: START,
        carpoolEnabled: true,
      }).carpool_enabled,
    ).toBe(true);
    expect(
      buildEventPayload({
        teamId: TEAM,
        type: "training",
        title: "x",
        startsAt: START,
        carpoolEnabled: false,
      }).carpool_enabled,
    ).toBe(false);
  });

  it("links series children when seriesId provided", () => {
    const p = buildEventPayload({
      teamId: TEAM,
      type: "other",
      title: "x",
      startsAt: START,
      seriesId: "11111111-1111-1111-1111-111111111111",
    });
    expect(p.series_id).toBe("11111111-1111-1111-1111-111111111111");
  });

  // ---- The drift lock ----
  it("LOCK: wizard-shaped input and form-shaped input produce the SAME row", () => {
    // Same logical event, expressed the way each caller assembles it.
    const fromForm: BuildEventPayloadInput = {
      teamId: TEAM,
      type: "training",
      title: "Entraînement U15",
      description: null,
      location: "Stade municipal",
      locationUrl: toGoogleMapsUrl("Stade municipal"), // form pre-derives the URL
      startsAt: START,
      endsAt: END,
      convocationTime: null,
      isOfficial: false,
      carpoolEnabled: true,
    };
    const fromWizard: BuildEventPayloadInput = {
      teamId: TEAM,
      type: "training",
      title: "Entraînement U15",
      description: null,
      location: "Stade municipal",
      locationUrl: null, // wizard lets the builder derive the URL
      startsAt: START,
      endsAt: END,
      convocationTime: null,
      isOfficial: undefined, // training → false either way
      carpoolEnabled: true,
    };
    expect(buildEventPayload(fromWizard)).toEqual(buildEventPayload(fromForm));
  });
});
