/**
 * Sprint 5 — LLM helpers unit tests.
 *
 * These cover the deterministic pieces (no real LLM call):
 *  - anonymizePlayers never leaks names/emails
 *  - ageToCategory bucketing
 *  - sanitizeRestrictedHtml strips dangerous tags & attributes
 */
import { describe, it, expect } from "vitest";
import {
  anonymizePlayers,
  ageToCategory,
  sanitizeRestrictedHtml,
} from "../../lib/llm/core.server";

describe("anonymizePlayers", () => {
  it("returns 'Joueur A', 'Joueur B', …", () => {
    const ids = ["id-1", "id-2", "id-3"];
    const { map, label } = anonymizePlayers(ids);
    expect(map.get("id-1")).toBe("Joueur A");
    expect(label("id-2")).toBe("Joueur B");
    expect(label("id-3")).toBe("Joueur C");
  });

  it("does not contain any input id, name or email", () => {
    const ids = ["alice@example.com", "Jean Dupont", "00000000-uuid"];
    const { map } = anonymizePlayers(ids);
    for (const value of map.values()) {
      expect(value).not.toContain("@");
      expect(value).not.toContain("Jean");
      expect(value).not.toContain("uuid");
    }
  });

  it("handles more than 26 players (AA, AB…)", () => {
    const ids = Array.from({ length: 30 }, (_, i) => `p${i}`);
    const { map } = anonymizePlayers(ids);
    expect(map.get("p25")).toBe("Joueur Z");
    expect(map.get("p26")).toBe("Joueur AA");
    expect(map.get("p27")).toBe("Joueur AB");
  });
});

describe("ageToCategory", () => {
  it.each([
    [null, "U?"],
    [6, "U7"],
    [8, "U9"],
    [12, "U13"],
    [16, "U17"],
    [20, "U21"],
    [30, "Senior"],
  ])("ageToCategory(%s) === %s", (age, expected) => {
    expect(ageToCategory(age)).toBe(expected);
  });
});

describe("sanitizeRestrictedHtml", () => {
  it("keeps whitelisted tags", () => {
    const html = "<h2>Title</h2><p>Hello <strong>world</strong></p><ul><li>one</li></ul>";
    expect(sanitizeRestrictedHtml(html)).toBe(html);
  });

  it("strips <script> tag AND its content", () => {
    const html = "<p>safe</p><script>alert('x')</script>";
    const clean = sanitizeRestrictedHtml(html);
    expect(clean).not.toContain("script");
    expect(clean).not.toContain("alert");
    expect(clean).toContain("safe");
  });

  it("strips <img> entirely", () => {
    const html = "<p>ok</p><img src=x onerror=y>";
    const clean = sanitizeRestrictedHtml(html);
    expect(clean).not.toContain("<img");
    expect(clean).not.toContain("onerror");
  });

  it("removes attributes on allowed tags", () => {
    const html = '<p class="evil" onclick="x()">hi</p>';
    expect(sanitizeRestrictedHtml(html)).toBe("<p>hi</p>");
  });

  it("strips non-whitelisted tags but keeps inner text", () => {
    const html = "<div>kept</div><a href='evil'>link</a>";
    const clean = sanitizeRestrictedHtml(html);
    expect(clean).not.toContain("<div");
    expect(clean).not.toContain("<a");
    expect(clean).toContain("kept");
    expect(clean).toContain("link");
  });

  it("strips <iframe> and <style>", () => {
    const html = "<p>x</p><iframe src='evil'></iframe><style>body{}</style>";
    const clean = sanitizeRestrictedHtml(html);
    expect(clean).not.toContain("iframe");
    expect(clean).not.toContain("style");
  });

  it("returns empty string for empty input", () => {
    expect(sanitizeRestrictedHtml("")).toBe("");
  });
});
