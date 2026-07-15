/**
 * The three-value UI selector maps to a nullable column. The critical case
 * is `inherit → NULL`: writing the *resolved effective* boolean instead
 * would freeze the cascade into an override, so a later parent-scope change
 * would silently stop propagating. This test is the regression guard for
 * that mistake.
 */
import { describe, it, expect } from "vitest";
import {
  callUpChoiceToColumn,
  callUpChoiceToClubColumn,
} from "@/hooks/use-call-up-visibility";

describe("callUpChoiceToColumn (event / team scopes)", () => {
  it("inherit → null (never the resolved effective boolean)", () => {
    expect(callUpChoiceToColumn("inherit")).toBeNull();
  });

  it("visible → true", () => {
    expect(callUpChoiceToColumn("visible")).toBe(true);
  });

  it("masked → false", () => {
    expect(callUpChoiceToColumn("masked")).toBe(false);
  });
});

describe("callUpChoiceToClubColumn (club scope, non-nullable)", () => {
  it("visible → true", () => {
    expect(callUpChoiceToClubColumn("visible")).toBe(true);
  });

  it("masked → false", () => {
    expect(callUpChoiceToClubColumn("masked")).toBe(false);
  });
});
