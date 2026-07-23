import { describe, expect, it } from "vitest";
import {
  assertE2ETargetGuard,
  collectRoleCreds,
  extractProjectRef,
} from "../../../tests/e2e/_fixtures/ensure-seed";

describe("e2e ensure-seed helpers", () => {
  it("extractProjectRef parses supabase host", () => {
    expect(extractProjectRef("https://dkcfcifsrnnaqaipfuzi.supabase.co")).toBe(
      "dkcfcifsrnnaqaipfuzi",
    );
    expect(extractProjectRef("https://example.com")).toBeNull();
    expect(extractProjectRef("")).toBeNull();
  });

  it("assertE2ETargetGuard rejects missing / mismatched refs", () => {
    expect(() =>
      assertE2ETargetGuard({
        supabaseUrl: "https://dkcfcifsrnnaqaipfuzi.supabase.co",
        targetRef: undefined,
      }),
    ).toThrow(/E2E_TARGET_PROJECT_REF is not set/);

    expect(() =>
      assertE2ETargetGuard({
        supabaseUrl: "https://woawmhuntajpiezmmgzm.supabase.co",
        targetRef: "dkcfcifsrnnaqaipfuzi",
      }),
    ).toThrow(/points at "woawmhuntajpiezmmgzm"/);

    expect(
      assertE2ETargetGuard({
        supabaseUrl: "https://dkcfcifsrnnaqaipfuzi.supabase.co",
        targetRef: "dkcfcifsrnnaqaipfuzi",
      }),
    ).toBe("dkcfcifsrnnaqaipfuzi");
  });

  it("collectRoleCreds requires admin and skips incomplete optional roles", () => {
    expect(() => collectRoleCreds({})).toThrow(/E2E_ADMIN_EMAIL/);

    const creds = collectRoleCreds({
      E2E_ADMIN_EMAIL: "e2e-admin@clubero.app",
      E2E_ADMIN_PASSWORD: "secret-admin",
      E2E_COACH_EMAIL: "e2e-coach@clubero.app",
      E2E_COACH_PASSWORD: "secret-coach",
      // player incomplete → skipped
      E2E_PLAYER_EMAIL: "e2e-player@clubero.app",
      E2E_PARENT_EMAIL: "e2e-parent@clubero.app",
      E2E_PARENT_PASSWORD: "secret-parent",
    });

    expect(creds.map((c) => c.role)).toEqual(["admin", "coach", "parent"]);
    expect(creds.find((c) => c.role === "admin")?.password).toBe("secret-admin");
  });
});
