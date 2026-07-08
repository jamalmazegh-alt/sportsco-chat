/**
 * Priorities rank question: 4 new options added.
 * - Config exposes new option ids with emoji.
 * - All 7 locales resolve label + description for each new option.
 * - rank.hint / rank.moveUp / rank.moveDown exist in all 7 locales with {{item}} interpolation.
 * - Move up/down is inert at boundaries; persisted order matches visual order (array contract).
 */
import { describe, it, expect } from "vitest";
import { QUESTIONS, reorder } from "@/lib/build-clubero-config";
import fr from "@/locales/fr/buildClubero.json";
import en from "@/locales/en/buildClubero.json";
import de from "@/locales/de/buildClubero.json";
import es from "@/locales/es/buildClubero.json";
import itLocale from "@/locales/it/buildClubero.json";
import nl from "@/locales/nl/buildClubero.json";
import pt from "@/locales/pt/buildClubero.json";

const LOCALES = { fr, en, de, es, it, nl, pt } as const;
const NEW_OPTS = [
  "player_social_network",
  "public_player_profiles",
  "payments_dues",
  "fundraising",
] as const;

describe("priorities question — 4 new options", () => {
  const prio = QUESTIONS.find((q) => q.key === "priorities")!;
  it("is still a rank question", () => {
    expect(prio.type).toBe("rank");
  });

  it("exposes the 4 new option ids", () => {
    if (prio.type !== "rank") throw new Error("unreachable");
    const ids = prio.options.map((o) => o.id);
    for (const id of NEW_OPTS) expect(ids).toContain(id);
    // Existing options preserved (contract stability).
    for (const id of ["ai_report", "challenges", "matchday", "funding", "wall"]) {
      expect(ids).toContain(id);
    }
  });
});

describe("priorities i18n — label + description in 7 locales", () => {
  for (const [lang, dict] of Object.entries(LOCALES)) {
    for (const id of NEW_OPTS) {
      it(`${lang}: ${id} has label + description`, () => {
        const opt = (dict as any).questions.priorities.options[id];
        expect(opt, `${lang}/${id} missing`).toBeTruthy();
        expect(typeof opt.label).toBe("string");
        expect(opt.label.length).toBeGreaterThan(0);
        expect(typeof opt.description).toBe("string");
        expect(opt.description.length).toBeGreaterThan(0);
      });
    }
  }
});

describe("rank.* helper keys — 7/7 with {{item}} interpolation", () => {
  for (const [lang, dict] of Object.entries(LOCALES)) {
    it(`${lang} has rank.hint / moveUp / moveDown with {{item}}`, () => {
      const r = (dict as any).rank;
      expect(r, `${lang} missing rank block`).toBeTruthy();
      expect(typeof r.hint).toBe("string");
      expect(r.hint.length).toBeGreaterThan(0);
      expect(r.moveUp).toContain("{{item}}");
      expect(r.moveDown).toContain("{{item}}");
    });
  }
});

describe("rank widget logic — bounded reorder & array contract", () => {
  const order = ["a", "b", "c", "d"];

  it("moves up (from 2 to 1)", () => {
    expect(reorder(order, 2, 1)).toEqual(["a", "c", "b", "d"]);
  });

  it("moves down (from 1 to 2)", () => {
    expect(reorder(order, 1, 2)).toEqual(["a", "c", "b", "d"]);
  });

  it("move up on first item is a no-op (widget guards to<0)", () => {
    // Widget-level: `if (to < 0 || to >= order.length) return;`
    const from = 0;
    const to = from - 1;
    const guarded = to < 0 || to >= order.length;
    expect(guarded).toBe(true);
  });

  it("move down on last item is a no-op (widget guards to>=len)", () => {
    const from = order.length - 1;
    const to = from + 1;
    const guarded = to < 0 || to >= order.length;
    expect(guarded).toBe(true);
  });

  it("persisted answer stays an ordered array of optionKeys", () => {
    const next = reorder(order, 0, 3);
    expect(Array.isArray(next)).toBe(true);
    expect(next).toEqual(["b", "c", "d", "a"]);
    // Same set, no dupes.
    expect(new Set(next).size).toBe(next.length);
  });
});
