import { describe, expect, it } from "vitest";
import { z } from "zod";

const tournamentDateSchema = z
  .object({
    starts_on: z.string(),
    ends_on: z.string().optional().nullable(),
  })
  .refine((d) => !d.ends_on || d.ends_on >= d.starts_on, {
    message: "End date must be on or after start date",
    path: ["ends_on"],
  });

describe("tournament date validation", () => {
  it("accepts end on or after start", () => {
    expect(
      tournamentDateSchema.safeParse({ starts_on: "2026-06-10", ends_on: "2026-06-12" }).success,
    ).toBe(true);
  });

  it("accepts empty end date", () => {
    expect(tournamentDateSchema.safeParse({ starts_on: "2026-06-10", ends_on: null }).success).toBe(
      true,
    );
  });

  it("rejects end before start", () => {
    const res = tournamentDateSchema.safeParse({ starts_on: "2026-06-10", ends_on: "2026-06-09" });
    expect(res.success).toBe(false);
  });
});
