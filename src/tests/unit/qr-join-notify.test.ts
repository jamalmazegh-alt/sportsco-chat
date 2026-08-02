import { describe, expect, it } from "vitest";
import { QR_STAFF_ROLES, pickStaffTargets, qrJoinMessage } from "@/lib/club-invite-notify.server";

describe("QR join notification — staff resolution", () => {
  it("includes coaches, assistant coaches and admins", () => {
    expect([...QR_STAFF_ROLES].sort()).toEqual(["admin", "assistant_coach", "coach"]);
  });

  it("keeps assistant coaches as targets", () => {
    const targets = pickStaffTargets(
      [
        { user_id: "u1", role: "coach" },
        { user_id: "u2", role: "assistant_coach" },
        { user_id: "u3", role: "admin" },
      ],
      "actor",
    );
    expect(targets).toEqual(["u1", "u2", "u3"]);
  });

  it("drops the actor, players and empty user ids, and dedupes", () => {
    const targets = pickStaffTargets(
      [
        { user_id: "actor", role: "coach" },
        { user_id: "u1", role: "coach" },
        { user_id: "u1", role: "admin" },
        { user_id: null, role: "coach" },
        { user_id: "u9", role: "player" },
      ],
      "actor",
    );
    expect(targets).toEqual(["u1"]);
  });
});

describe("QR join notification — i18n", () => {
  it("localizes the message for each supported language", () => {
    for (const lang of ["fr", "en", "es", "de", "it", "nl", "pt"]) {
      const m = qrJoinMessage(lang, "Lamine Yamal", "U15 R1");
      expect(m.title).toBeTruthy();
      expect(m.body).toContain("Lamine Yamal");
      expect(m.body).toContain("U15 R1");
    }
    expect(qrJoinMessage("en", "Lamine", "U15").title).not.toEqual(
      qrJoinMessage("fr", "Lamine", "U15").title,
    );
  });

  it("falls back to French for unknown or missing languages", () => {
    const fr = qrJoinMessage("fr", "Lamine", "U15");
    expect(qrJoinMessage(null, "Lamine", "U15")).toEqual(fr);
    expect(qrJoinMessage("zz", "Lamine", "U15")).toEqual(fr);
    expect(qrJoinMessage("FR-fr", "Lamine", "U15")).toEqual(fr);
  });
});
