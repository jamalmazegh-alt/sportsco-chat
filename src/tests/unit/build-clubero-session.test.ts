import { describe, expect, it } from "vitest";
import { __test } from "@/lib/build-clubero-session";

/**
 * The session hook is heavily bound to React and Supabase. Here we cover the
 * pure persistence helpers; interactive tests would need a full render harness.
 */
describe("build-clubero-session persistence", () => {
  it("read/write/clear roundtrip", () => {
    // JSDOM provides localStorage
    __test.clearPersisted();
    expect(__test.readPersisted()).toBeNull();

    __test.writePersisted({
      session_id: "sess-123",
      answers: { audience: "kids", timesinks: ["convocations"] },
      index: 3,
    });
    const back = __test.readPersisted();
    expect(back?.session_id).toBe("sess-123");
    expect(back?.answers.audience).toBe("kids");
    expect(back?.index).toBe(3);

    __test.clearPersisted();
    expect(__test.readPersisted()).toBeNull();
  });

  it("ignores corrupted payloads", () => {
    window.localStorage.setItem(__test.STORAGE_KEY, "not-json");
    expect(__test.readPersisted()).toBeNull();
    window.localStorage.setItem(__test.STORAGE_KEY, JSON.stringify({ nope: 1 }));
    expect(__test.readPersisted()).toBeNull();
    __test.clearPersisted();
  });
});
