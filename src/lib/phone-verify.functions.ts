import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createHash } from "crypto";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { twilioSendSms } from "./sms.functions";

const PhoneSchema = z.string().regex(/^\+[1-9]\d{4,14}$/, "Phone must be E.164 (+...)");

function hashCode(code: string, userId: string) {
  return createHash("sha256").update(`${userId}:${code}`).digest("hex");
}

function genCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export const requestPhoneCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ phone: PhoneSchema }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const code = genCode();
    const code_hash = hashCode(code, userId);
    const expires_at = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    // Invalidate previous unconsumed codes for same target
    await supabase
      .from("verification_codes")
      .update({ consumed_at: new Date().toISOString() })
      .eq("user_id", userId)
      .eq("target", data.phone)
      .is("consumed_at", null);

    const { error } = await supabase.from("verification_codes").insert({
      user_id: userId,
      channel: "sms",
      target: data.phone,
      code_hash,
      expires_at,
    });
    if (error) throw new Error(error.message);

    await twilioSendSms(data.phone, `Clubero verification code: ${code} (valid 10 min)`);
    return { ok: true };
  });

export const verifyPhoneCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ phone: PhoneSchema, code: z.string().regex(/^\d{6}$/) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const code_hash = hashCode(data.code, userId);

    const { data: rows, error } = await supabase
      .from("verification_codes")
      .select("id, expires_at, consumed_at, attempts")
      .eq("user_id", userId)
      .eq("target", data.phone)
      .eq("channel", "sms")
      .eq("code_hash", code_hash)
      .is("consumed_at", null)
      .order("created_at", { ascending: false })
      .limit(1);
    if (error) throw new Error(error.message);

    const row = rows?.[0];
    if (!row) throw new Error("Invalid code");
    if (new Date(row.expires_at).getTime() < Date.now()) throw new Error("Code expired");

    const now = new Date().toISOString();
    await supabase.from("verification_codes").update({ consumed_at: now }).eq("id", row.id);
    const { error: pErr } = await supabase
      .from("profiles")
      .update({ phone: data.phone, phone_verified_at: now })
      .eq("id", userId);
    if (pErr) throw new Error(pErr.message);

    return { ok: true };
  });
