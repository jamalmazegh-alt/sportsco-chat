/**
 * Règle mineur / consentement parental — miroir de
 * `src/routes/p.$slug.tsx` (`isMinorWithoutConsent` + affichage).
 *
 * La route `/p/$slug` est gated par `public_player_profiles` (off en bêta) ;
 * ces unit tests exercent la règle hors flag UI. Les E2E RPC
 * (`ui-real-flows` confidentialité) couvrent le côté base.
 */
import { describe, expect, it } from "vitest";

type PlayerBits = {
  birth_date: string | null;
  parental_public_consent: boolean | null;
  last_name: string;
};

function isMinorWithoutConsent(p: PlayerBits): boolean {
  if (!p.birth_date) return false;
  const ageMs = Date.now() - new Date(p.birth_date).getTime();
  const age = ageMs / (365.25 * 24 * 3600 * 1000);
  return age < 18 && p.parental_public_consent !== true;
}

function displayLastName(p: PlayerBits): string {
  if (isMinorWithoutConsent(p) && p.last_name) {
    return `${p.last_name.charAt(0).toUpperCase()}.`;
  }
  return p.last_name;
}

describe("public profile — mineur / consentement (p.$slug rule)", () => {
  it("masque un mineur sans consentement parental", () => {
    const p: PlayerBits = {
      birth_date: "2015-01-01",
      parental_public_consent: false,
      last_name: "Dupont",
    };
    expect(isMinorWithoutConsent(p)).toBe(true);
    expect(displayLastName(p)).toBe("D.");
  });

  it("masque un mineur avec consentement null (≠ true)", () => {
    const p: PlayerBits = {
      birth_date: "2010-06-01",
      parental_public_consent: null,
      last_name: "Martin",
    };
    expect(isMinorWithoutConsent(p)).toBe(true);
    expect(displayLastName(p)).toBe("M.");
  });

  it("expose un mineur avec consentement parental", () => {
    const p: PlayerBits = {
      birth_date: "2015-01-01",
      parental_public_consent: true,
      last_name: "Dupont",
    };
    expect(isMinorWithoutConsent(p)).toBe(false);
    expect(displayLastName(p)).toBe("Dupont");
  });

  it("expose un majeur même sans consentement parental", () => {
    const p: PlayerBits = {
      birth_date: "1995-06-15",
      parental_public_consent: false,
      last_name: "Bernard",
    };
    expect(isMinorWithoutConsent(p)).toBe(false);
    expect(displayLastName(p)).toBe("Bernard");
  });
});
