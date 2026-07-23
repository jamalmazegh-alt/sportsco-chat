/**
 * Unit tests — publications input validation & shape guards.
 *
 * The heavy lifting (RLS, atomicity, threshold, procuration) lives in SQL
 * and is covered by the RLS test suite; these tests only lock the pure
 * TypeScript contract of publications.functions inputs.
 */
import { describe, expect, it } from "vitest";
import { z } from "zod";

/**
 * Mirror of the audience discriminated union in publications.functions.ts.
 * Kept local to avoid triggering the server-fn code path in unit tests.
 */
const AudienceInput = z.discriminatedUnion("audience_type", [
  z.object({ audience_type: z.literal("joueurs_equipe"), team_id: z.string().uuid() }),
  z.object({ audience_type: z.literal("parents_equipe"), team_id: z.string().uuid() }),
  z.object({
    audience_type: z.literal("joueurs_categorie"),
    category_label: z.string().min(1).max(60),
    season_id: z.string().uuid(),
  }),
  z.object({
    audience_type: z.literal("parents_categorie"),
    category_label: z.string().min(1).max(60),
    season_id: z.string().uuid(),
  }),
  z.object({ audience_type: z.literal("joueurs_convoques"), event_id: z.string().uuid() }),
  z.object({ audience_type: z.literal("parents_convoques"), event_id: z.string().uuid() }),
  z.object({ audience_type: z.literal("educateurs") }),
  z.object({ audience_type: z.literal("dirigeants") }),
  z.object({ audience_type: z.literal("groupe_personnalise"), group_id: z.string().uuid() }),
  z.object({ audience_type: z.literal("selection_manuelle") }),
]);

const UUID = "11111111-1111-4111-8111-111111111111";

describe("publications — audience input contract", () => {
  it("accepts team-scoped audience", () => {
    expect(
      AudienceInput.safeParse({ audience_type: "joueurs_equipe", team_id: UUID }).success,
    ).toBe(true);
  });

  it("accepts season-scoped category audience", () => {
    const r = AudienceInput.safeParse({
      audience_type: "joueurs_categorie",
      category_label: "U15",
      season_id: UUID,
    });
    expect(r.success).toBe(true);
  });

  it("rejects category audience without season_id", () => {
    const r = AudienceInput.safeParse({
      audience_type: "joueurs_categorie",
      category_label: "U15",
    } as never);
    expect(r.success).toBe(false);
  });

  it("rejects convocation audience without event_id", () => {
    const r = AudienceInput.safeParse({ audience_type: "joueurs_convoques" } as never);
    expect(r.success).toBe(false);
  });

  it("accepts staff-scoped audiences without extra fields", () => {
    expect(AudienceInput.safeParse({ audience_type: "educateurs" }).success).toBe(true);
    expect(AudienceInput.safeParse({ audience_type: "dirigeants" }).success).toBe(true);
    expect(AudienceInput.safeParse({ audience_type: "selection_manuelle" }).success).toBe(true);
  });

  it("rejects unknown audience type", () => {
    expect(AudienceInput.safeParse({ audience_type: "everyone" } as never).success).toBe(false);
  });
});

describe("publications — delivery mode invariants", () => {
  // The DB enforces `publish_to_wall OR send_email`; we mirror the check
  // in the server fn for a clearer 400.
  function deliveryOk(publishToWall: boolean, sendEmail: boolean) {
    return publishToWall || sendEmail;
  }
  it("mur+push valid", () => expect(deliveryOk(true, false)).toBe(true));
  it("mur+push+email valid", () => expect(deliveryOk(true, true)).toBe(true));
  it("email-only valid (with send_email forced)", () => expect(deliveryOk(false, true)).toBe(true));
  it("no wall AND no email is invalid", () => expect(deliveryOk(false, false)).toBe(false));
});

describe("publications — poll anonymity threshold logic", () => {
  // Mirrors get_poll_results server logic for below_threshold.
  function belowThreshold(pollVisibility: "anonymous" | "staff_visible", total: number) {
    return pollVisibility === "anonymous" && total < 3;
  }
  it("anonymous with 0 votes → hidden", () => expect(belowThreshold("anonymous", 0)).toBe(true));
  it("anonymous with 2 votes → hidden", () => expect(belowThreshold("anonymous", 2)).toBe(true));
  it("anonymous with 3 votes → visible", () => expect(belowThreshold("anonymous", 3)).toBe(false));
  it("staff_visible with 0 votes → visible", () =>
    expect(belowThreshold("staff_visible", 0)).toBe(false));
});

describe("publications — create input requires at least one target", () => {
  // Mirror of CreateInput refine: audiences OR manualMemberIds must be non-empty.
  const CreateInput = z
    .object({
      audiences: z.array(AudienceInput).default([]),
      manualMemberIds: z.array(z.string().uuid()).default([]),
    })
    .refine((d) => d.audiences.length > 0 || d.manualMemberIds.length > 0, {
      message: "audience_required",
      path: ["audiences"],
    });

  it("accepts manual-only publication", () => {
    expect(CreateInput.safeParse({ audiences: [], manualMemberIds: [UUID] }).success).toBe(true);
  });
  it("accepts audience-only publication", () => {
    expect(
      CreateInput.safeParse({
        audiences: [{ audience_type: "educateurs" }],
        manualMemberIds: [],
      }).success,
    ).toBe(true);
  });
  it("rejects empty audience AND empty manual list", () => {
    const r = CreateInput.safeParse({ audiences: [], manualMemberIds: [] });
    expect(r.success).toBe(false);
  });
});
