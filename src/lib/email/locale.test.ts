import { describe, expect, it } from "vitest";
import { resolveEmailLocale } from "./locale";

describe("resolveEmailLocale", () => {
  it("returns first supported candidate", () => {
    expect(resolveEmailLocale("en", "fr")).toBe("en");
    expect(resolveEmailLocale(null, "de-DE")).toBe("de");
  });

  it("falls back to fr when none match", () => {
    expect(resolveEmailLocale(undefined, null, "")).toBe("fr");
    expect(resolveEmailLocale("xx")).toBe("fr");
  });

  it("normalizes Accept-Language style values", () => {
    expect(resolveEmailLocale("en-US,en;q=0.9")).toBe("en");
  });
});
