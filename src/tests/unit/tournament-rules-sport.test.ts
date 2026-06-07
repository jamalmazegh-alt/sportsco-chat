import { describe, expect, it } from "vitest";
import { sportAllowsDraw } from "@/lib/sports";
import { defaultRulesForSport } from "@/modules/tournaments/lib/rules";

describe("sportAllowsDraw", () => {
  it("returns false for volleyball", () => {
    expect(sportAllowsDraw("volleyball")).toBe(false);
  });

  it("returns true for football", () => {
    expect(sportAllowsDraw("football")).toBe(true);
  });
});

describe("defaultRulesForSport", () => {
  it("sets draw points to 0 for volleyball", () => {
    const rules = defaultRulesForSport("volleyball");
    expect(rules.points.draw).toBe(0);
    expect(rules.scoring?.mode).toBe("sets");
  });

  it("keeps draw points for football", () => {
    const rules = defaultRulesForSport("football");
    expect(rules.points.draw).toBe(1);
  });
});
