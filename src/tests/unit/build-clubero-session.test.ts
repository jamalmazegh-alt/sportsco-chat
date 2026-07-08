// @vitest-environment jsdom
import { describe, expect, it, beforeEach } from "vitest";
import { __test } from "@/lib/build-clubero-session";

describe("build-clubero-session persistence", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("read/write/clear roundtrip", () => {
    expect(__test.readPersisted()).toBeNull();

    __test.writePersisted({
      session_id: "sess-123",
      answers: { audience: "kids", timesinks: ["convocations"] },
      index: 3,
    });
    const back = __test.readPersisted();
    expect(back?.session_id).toBe("sess-123");
    expect((back?.answers as any).audience).toBe("kids");
    expect(back?.index).toBe(3);

    __test.clearPersisted();
    expect(__test.readPersisted()).toBeNull();
  });

  it("ignores corrupted payloads", () => {
    window.localStorage.setItem(__test.STORAGE_KEY, "not-json");
    expect(__test.readPersisted()).toBeNull();
    window.localStorage.setItem(__test.STORAGE_KEY, JSON.stringify({ nope: 1 }));
    expect(__test.readPersisted()).toBeNull();
  });
});
