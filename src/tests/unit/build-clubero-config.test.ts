import { describe, expect, it } from "vitest";
import {
  QUESTIONS,
  TOTAL_QUESTIONS,
  reorder,
  emailOk,
  isAnswered,
  buildContactPayload,
  isContactValid,
  parseUtm,
  type ContactFormValues,
} from "@/lib/build-clubero-config";

describe("build-clubero-config", () => {
  it("keeps stable question keys and option ids", () => {
    // These keys are used by SQL views — CI guard against silent renames.
    const keys = QUESTIONS.map((q) => q.key);
    expect(keys).toEqual([
      "audience",
      "sport",
      "timesinks",
      "hours",
      "satisfaction",
      "priorities",
      "currenttool",
      "onewish",
    ]);
    expect(TOTAL_QUESTIONS).toBe(8);
  });

  it("reorder moves items", () => {
    expect(reorder([1, 2, 3, 4], 0, 2)).toEqual([2, 3, 1, 4]);
    expect(reorder(["a", "b", "c"], 2, 0)).toEqual(["c", "a", "b"]);
  });

  it("emailOk", () => {
    expect(emailOk("a@b.co")).toBe(true);
    expect(emailOk(" a@b.co ")).toBe(true);
    expect(emailOk("nope")).toBe(false);
    expect(emailOk("a@b")).toBe(false);
  });

  describe("isAnswered", () => {
    const single = QUESTIONS.find((q) => q.type === "single")!;
    const multi = QUESTIONS.find((q) => q.type === "multi")!;
    const rating = QUESTIONS.find((q) => q.type === "rating")!;
    const slider = QUESTIONS.find((q) => q.type === "slider")!;
    const rank = QUESTIONS.find((q) => q.type === "rank")!;
    const text = QUESTIONS.find((q) => q.type === "text")!;

    it("single/multi/rating/slider", () => {
      expect(isAnswered(single, undefined)).toBe(false);
      expect(isAnswered(single, "kids")).toBe(true);
      expect(isAnswered(multi, [])).toBe(false);
      expect(isAnswered(multi, ["a"])).toBe(true);
      expect(isAnswered(rating, 0)).toBe(false);
      expect(isAnswered(rating, 3)).toBe(true);
      expect(isAnswered(slider, 0)).toBe(true);
      expect(isAnswered(rank, ["a"])).toBe(true);
    });

    it("optional text is always answered", () => {
      expect(isAnswered(text, "")).toBe(true);
    });
  });

  describe("contact payload", () => {
    const base: ContactFormValues = {
      first_name: "Alice",
      last_name: "Martin",
      email: "a@b.co",
      phone: "",
      club: "FC Test",
      newsletter: false,
      beta: false,
    };

    it("returns null when identity is incomplete", () => {
      expect(buildContactPayload({ ...base, first_name: "" })).toBeNull();
      expect(buildContactPayload({ ...base, last_name: "" })).toBeNull();
      expect(buildContactPayload({ ...base, club: "" })).toBeNull();
      expect(isContactValid({ ...base, first_name: "" })).toBe(false);
      expect(isContactValid({ ...base, last_name: "" })).toBe(false);
      expect(isContactValid({ ...base, club: "" })).toBe(false);
    });

    it("returns payload when identity is complete (no opt-in)", () => {
      const p = buildContactPayload(base);
      expect(p).not.toBeNull();
      expect(p?.first_name).toBe("Alice");
      expect(p?.last_name).toBe("Martin");
      expect(p?.club).toBe("FC Test");
      expect(p?.newsletter).toBe(false);
      expect(p?.beta).toBe(false);
      expect(isContactValid(base)).toBe(true);
    });

    it("newsletter only", () => {
      const p = buildContactPayload({ ...base, newsletter: true });
      expect(p?.newsletter).toBe(true);
      expect(p?.beta).toBe(false);
      expect(p?.email).toBe("a@b.co");
    });

    it("beta only", () => {
      const p = buildContactPayload({ ...base, beta: true });
      expect(p?.beta).toBe(true);
      expect(p?.newsletter).toBe(false);
    });

    it("newsletter + beta", () => {
      const p = buildContactPayload({ ...base, newsletter: true, beta: true });
      expect(p?.newsletter).toBe(true);
      expect(p?.beta).toBe(true);
    });

    it("email required and valid when consent + identity ok", () => {
      expect(isContactValid({ ...base, email: "invalid" })).toBe(true); // no consent
      expect(isContactValid({ ...base, newsletter: true, email: "invalid" })).toBe(false);
      expect(isContactValid({ ...base, beta: true, email: "" })).toBe(false);
      expect(isContactValid({ ...base, newsletter: true, email: "ok@x.io" })).toBe(true);
    });
  });

  it("parseUtm extracts utm params", () => {
    expect(parseUtm("")).toBeNull();
    expect(parseUtm("?a=1")).toBeNull();
    expect(parseUtm("?utm_source=fb&utm_campaign=x")).toEqual({
      utm_source: "fb",
      utm_campaign: "x",
    });
  });
});
