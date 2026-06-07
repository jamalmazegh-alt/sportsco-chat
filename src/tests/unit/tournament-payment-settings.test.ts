import { describe, it, expect } from "vitest";
import { z } from "zod";

const PAYMENT_MODES = ["online", "offline", "both"] as const;
const CURRENCIES = ["eur", "usd", "gbp", "chf", "cad"] as const;

const paymentSettingsSchema = z.object({
  tournament_id: z.string().uuid(),
  registration_fee: z.number().int().min(0).max(1_000_000),
  registration_currency: z.enum(CURRENCIES).default("eur"),
  registration_fee_description: z.string().trim().max(500).nullable().optional(),
  payment_mode: z.enum(PAYMENT_MODES).default("offline"),
});

describe("tournament payment settings schema", () => {
  const base = {
    tournament_id: "95a4bdc1-bb88-4aa8-b488-3932be4a9317",
    registration_currency: "eur" as const,
    payment_mode: "online" as const,
  };

  it("rejects negative registration_fee", () => {
    expect(() =>
      paymentSettingsSchema.parse({ ...base, registration_fee: -10 }),
    ).toThrow();
  });

  it("accepts zero registration_fee", () => {
    const parsed = paymentSettingsSchema.parse({ ...base, registration_fee: 0 });
    expect(parsed.registration_fee).toBe(0);
  });

  it("accepts positive registration_fee", () => {
    const parsed = paymentSettingsSchema.parse({ ...base, registration_fee: 5000 });
    expect(parsed.registration_fee).toBe(5000);
  });
});
