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
import {
  buildConsecutiveAbsencePrompt,
  buildPendingConvocationsPrompt,
  rehydrateMessages,
} from "../../lib/llm/insights-prompts";

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

describe("insights LLM prompts — no real PII reaches the gateway", () => {
  const REAL = {
    p1: { id: "11111111-1111-1111-1111-111111111111", fullName: "Zinedine Zidane" },
    p2: { id: "alice@example.com", fullName: "Kylian Mbappé" },
    p3: { id: "p-3", fullName: "Antoine Griezmann" },
  };

  function assertNoRealPii(prompt: string) {
    for (const p of Object.values(REAL)) {
      // No real first/last names
      for (const part of p.fullName.split(/\s+/)) {
        expect(prompt).not.toContain(part);
      }
      // No raw ids / emails
      expect(prompt).not.toContain(p.id);
    }
    expect(prompt).not.toContain("@");
  }

  it("consecutive-absence prompt contains only a label, no real name/id", () => {
    const { prompt, rehydrate } = buildConsecutiveAbsencePrompt({
      player: REAL.p1,
      absenceCount: 3,
    });
    assertNoRealPii(prompt);
    expect(prompt).toContain("Joueur A");
    expect(prompt).toContain("3");
    expect(rehydrate["Joueur A"]).toBe(REAL.p1.fullName);
  });

  it("pending-convocations prompt contains only labels, no real names/emails", () => {
    const { prompt, rehydrate } = buildPendingConvocationsPrompt({
      players: [REAL.p1, REAL.p2, REAL.p3],
      pendingCount: 3,
    });
    assertNoRealPii(prompt);
    expect(prompt).toContain("Joueur A");
    expect(prompt).toContain("Joueur B");
    expect(prompt).toContain("Joueur C");
    expect(rehydrate["Joueur A"]).toBe(REAL.p1.fullName);
    expect(rehydrate["Joueur B"]).toBe(REAL.p2.fullName);
    expect(rehydrate["Joueur C"]).toBe(REAL.p3.fullName);
  });

  it("rehydration restores the real names server-side (labels → names)", () => {
    const { rehydrate } = buildPendingConvocationsPrompt({
      players: [REAL.p1, REAL.p2],
      pendingCount: 2,
    });
    const out = rehydrateMessages(
      {
        fr: "Joueur A et Joueur B n'ont pas répondu.",
        en: "Joueur A and Joueur B haven't responded.",
      },
      rehydrate,
    );
    expect(out.fr).toContain(REAL.p1.fullName);
    expect(out.fr).toContain(REAL.p2.fullName);
    expect(out.en).toContain(REAL.p1.fullName);
    expect(out.fr).not.toContain("Joueur A");
  });

  it("rehydration replaces longer labels first (Joueur AA not clobbered)", () => {
    const map = { "Joueur A": "Alice", "Joueur AA": "Bob" };
    const out = rehydrateMessages({ fr: "Joueur AA & Joueur A", en: "Joueur AA & Joueur A" }, map);
    expect(out.fr).toBe("Bob & Alice");
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
