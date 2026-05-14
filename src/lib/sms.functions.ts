import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/twilio";

const SendSmsInput = z.object({
  to: z.string().min(5).max(20).regex(/^\+[1-9]\d{4,14}$/, "Phone must be E.164 (+...)"),
  body: z.string().min(1).max(1000),
});

async function twilioSendSms(to: string, body: string) {
  const LOVABLE_API_KEY = process.env.LOVABLE_API_KEY;
  if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");
  const TWILIO_API_KEY = process.env.TWILIO_API_KEY;
  if (!TWILIO_API_KEY) throw new Error("TWILIO_API_KEY is not configured");
  const FROM = process.env.TWILIO_FROM_NUMBER;
  if (!FROM) throw new Error("TWILIO_FROM_NUMBER is not configured");

  const res = await fetch(`${GATEWAY_URL}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "X-Connection-Api-Key": TWILIO_API_KEY,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ To: to, From: FROM, Body: body }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`Twilio send failed [${res.status}]: ${JSON.stringify(data)}`);
  }
  return { sid: (data as any).sid as string };
}

export const sendSms = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => SendSmsInput.parse(input))
  .handler(async ({ data }) => {
    return twilioSendSms(data.to, data.body);
  });

export { twilioSendSms };
