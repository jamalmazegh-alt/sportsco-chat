import { describe, expect, it, beforeAll, beforeEach } from "vitest";
import { __test } from "@/lib/build-clubero-session";

// Minimal localStorage polyfill so the persistence helpers can run in node env.
beforeAll(() => {
  if (typeof (globalThis as any).window === "undefined") {
    const store = new Map<string, string>();
    (globalThis as any).window = {
      localStorage: {
        getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
        setItem: (k: string, v: string) => void store.set(k, String(v)),
        removeItem: (k: string) => void store.delete(k),
        clear: () => store.clear(),
      },
    };
  }
});

describe("build-clubero-session persistence", () => {
  beforeEach(() => {
    (globalThis as any).window.localStorage.clear();
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
    (globalThis as any).window.localStorage.setItem(__test.STORAGE_KEY, "not-json");
    expect(__test.readPersisted()).toBeNull();
    (globalThis as any).window.localStorage.setItem(
      __test.STORAGE_KEY,
      JSON.stringify({ nope: 1 }),
    );
    expect(__test.readPersisted()).toBeNull();
  });
});
