import { describe, it, expect } from "vitest";
import {
  defaultState,
  defaultDuration,
  countOccurrences,
  toEventInsert,
  toEventPayloadInput,
  toIso,
  addMinutesIso,
  autoTitle,
} from "@/components/events/event-wizard-config";
import {
  readDraft,
  writeDraft,
  clearDraft,
  draftHasProgress,
} from "@/components/events/event-wizard-draft";

const t = (k: string, opts?: Record<string, unknown>) => (opts?.defaultValue as string) ?? k;

describe("event-wizard-config", () => {
  it("default duration depends on type", () => {
    expect(defaultDuration("training")).toBe(90);
    expect(defaultDuration("match")).toBe(105);
    expect(defaultDuration("meeting")).toBe(60);
  });

  it("countOccurrences counts weekdays in range", () => {
    // Sept 1 2025 = Mon. 7-day range => 1 Mon, 1 Wed, 1 Fri
    const n = countOccurrences("2025-09-01", "2025-09-07", [1, 3, 5]);
    expect(n).toBe(3);
  });

  it("countOccurrences returns 0 on invalid input", () => {
    expect(countOccurrences(undefined, "2025-09-07", [1])).toBe(0);
    expect(countOccurrences("2025-09-10", "2025-09-01", [1])).toBe(0);
    expect(countOccurrences("2025-09-01", "2025-09-07", [])).toBe(0);
  });

  it("toIso + addMinutesIso compute end time", () => {
    const start = toIso("2025-09-01", "18:30");
    expect(start).toBeTruthy();
    const end = addMinutesIso(start, 90);
    expect(end).toBeTruthy();
    expect(new Date(end!).getTime() - new Date(start!).getTime()).toBe(90 * 60 * 1000);
  });

  it("autoTitle builds title for match with opponent", () => {
    const s = defaultState();
    s.type = "match";
    s.opponent = "FC Voisin";
    expect(autoTitle(s, "U15", t)).toContain("vs FC Voisin");
  });

  it("toEventInsert returns null when mandatory fields missing", () => {
    const s = defaultState();
    expect(toEventInsert(s, "x")).toBeNull();
  });

  it("toEventInsert builds full payload for match", () => {
    const s = defaultState();
    s.type = "match";
    s.teamId = "00000000-0000-0000-0000-000000000001";
    s.startDate = "2025-09-06";
    s.startTime = "15:00";
    s.durationMin = 90;
    s.isHome = "away";
    s.opponent = "FC X";
    s.meetingPoint = "stadium";
    s.location = "Stade municipal";
    s.competitionType = "championship";
    const p = toEventInsert(s, "U15 vs FC X");
    expect(p).not.toBeNull();
    expect(p!.type).toBe("match");
    expect(p!.is_home).toBe(false);
    expect(p!.opponent).toBe("FC X");
    expect(p!.meeting_point).toBe("stadium");
    expect(p!.competition_type).toBe("championship");
    expect(p!.is_official).toBe(true);
  });

  it("#1 'other' stays 'other' (never silently becomes training)", () => {
    const s = defaultState();
    s.type = "other";
    s.teamId = "00000000-0000-0000-0000-000000000001";
    s.startDate = "2025-09-06";
    const p = toEventInsert(s, "Réunion parents");
    expect(p).not.toBeNull();
    expect(p!.type).toBe("other");
    const init = toEventPayloadInput(s, "Réunion parents");
    expect(init!.type).toBe("other");
  });

  it("#3 carpool answer is persisted on a simple event", () => {
    const s = defaultState();
    s.type = "training";
    s.teamId = "00000000-0000-0000-0000-000000000001";
    s.startDate = "2025-09-06";
    s.carpoolEnabled = true;
    const p = toEventInsert(s, "Entraînement U15");
    expect(p!.carpool_enabled).toBe(true);
  });

  it("carpool absent → key omitted (DB default/trigger applies)", () => {
    const s = defaultState();
    s.type = "training";
    s.teamId = "00000000-0000-0000-0000-000000000001";
    s.startDate = "2025-09-06";
    const p = toEventInsert(s, "Entraînement U15");
    expect(p).not.toBeNull();
    expect("carpool_enabled" in (p as object)).toBe(false);
  });
});

describe("event-wizard-draft", () => {
  it("write/read/clear roundtrip", () => {
    // shim sessionStorage for node env
    const store = new Map<string, string>();
    (globalThis as any).window = {
      sessionStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => store.set(k, v),
        removeItem: (k: string) => store.delete(k),
      },
    };
    const s = defaultState();
    s.type = "training";
    s.teamId = "abc";
    writeDraft(s);
    const r = readDraft();
    expect(r?.type).toBe("training");
    expect(r?.teamId).toBe("abc");
    clearDraft();
    expect(readDraft()).toBeNull();
    delete (globalThis as any).window;
  });

  it("draftHasProgress detects answered fields", () => {
    expect(draftHasProgress(null)).toBe(false);
    expect(draftHasProgress(defaultState())).toBe(false);
    const s = defaultState();
    s.type = "training";
    expect(draftHasProgress(s)).toBe(true);
  });
});
