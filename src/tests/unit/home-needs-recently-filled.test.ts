import { describe, it, expect } from "vitest";
import { isRecentlyFilledVisible } from "@/components/home-needs-card";

const NOW = new Date("2026-07-20T12:00:00Z");
const H = 60 * 60 * 1000;

describe("isRecentlyFilledVisible", () => {
  it("hides needs that still have seats", () => {
    expect(
      isRecentlyFilledVisible(
        {
          remaining_seats: 1,
          updated_at: new Date(NOW.getTime() - 2 * H).toISOString(),
          events: { starts_at: new Date(NOW.getTime() + 24 * H).toISOString() },
        },
        NOW,
      ),
    ).toBe(false);
  });

  it("shows a full need completed under 48h ago before event start", () => {
    expect(
      isRecentlyFilledVisible(
        {
          remaining_seats: 0,
          updated_at: new Date(NOW.getTime() - 3 * H).toISOString(),
          events: { starts_at: new Date(NOW.getTime() + 24 * H).toISOString() },
        },
        NOW,
      ),
    ).toBe(true);
  });

  it("hides a full need completed more than 48h ago", () => {
    expect(
      isRecentlyFilledVisible(
        {
          remaining_seats: 0,
          updated_at: new Date(NOW.getTime() - 49 * H).toISOString(),
          events: { starts_at: new Date(NOW.getTime() + 24 * H).toISOString() },
        },
        NOW,
      ),
    ).toBe(false);
  });

  it("hides a full need once the event has started, even within 48h", () => {
    expect(
      isRecentlyFilledVisible(
        {
          remaining_seats: 0,
          updated_at: new Date(NOW.getTime() - 3 * H).toISOString(),
          events: { starts_at: new Date(NOW.getTime() - 1 * H).toISOString() },
        },
        NOW,
      ),
    ).toBe(false);
  });

  it("hides a full need without a completion timestamp", () => {
    expect(
      isRecentlyFilledVisible(
        {
          remaining_seats: 0,
          updated_at: null,
          events: { starts_at: new Date(NOW.getTime() + 24 * H).toISOString() },
        },
        NOW,
      ),
    ).toBe(false);
  });
});
