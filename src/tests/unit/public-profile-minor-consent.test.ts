/**
 * Règle mineur / consentement parental — importe le code prod
 * (`src/lib/public-profile-visibility.ts`), pas une copie locale.
 *
 * La route `/p/$slug` est gated par `public_player_profiles` (off en bêta) ;
 * ces unit tests exercent la règle hors flag UI. Les E2E RPC
 * (`ui-real-flows` confidentialité) couvrent le côté base.
 */
import { describe, expect, it } from "vitest";
import { displayLastName, isMinorWithoutConsent } from "@/lib/public-profile-visibility";

describe("public profile — mineur / consentement (p.$slug rule)", () => {
  it("masque un mineur sans consentement parental", () => {
    const p = {
      birth_date: "2015-01-01",
      parental_public_consent: false,
      last_name: "Dupont",
    };
    expect(isMinorWithoutConsent(p)).toBe(true);
    expect(displayLastName(p)).toBe("D.");
  });

  it("masque un mineur avec consentement null (≠ true)", () => {
    const p = {
      birth_date: "2010-06-01",
      parental_public_consent: null,
      last_name: "Martin",
    };
    expect(isMinorWithoutConsent(p)).toBe(true);
    expect(displayLastName(p)).toBe("M.");
  });

  it("expose un mineur avec consentement parental", () => {
    const p = {
      birth_date: "2015-01-01",
      parental_public_consent: true,
      last_name: "Dupont",
    };
    expect(isMinorWithoutConsent(p)).toBe(false);
    expect(displayLastName(p)).toBe("Dupont");
  });

  it("expose un majeur même sans consentement parental", () => {
    const p = {
      birth_date: "1995-06-15",
      parental_public_consent: false,
      last_name: "Bernard",
    };
    expect(isMinorWithoutConsent(p)).toBe(false);
    expect(displayLastName(p)).toBe("Bernard");
  });
});
