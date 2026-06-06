/**
 * Email helpers — read email_send_log to grab tokens (validation, invites,
 * convocations) without needing real SMTP.
 */
import { admin } from "./admin";

/**
 * Poll email_send_log for the most recent entry to a given recipient,
 * optionally filtered by template name.
 */
export async function waitForEmail(
  recipient: string,
  options: { template?: string; timeoutMs?: number; sinceIso?: string } = {},
) {
  const since = options.sinceIso ?? new Date(Date.now() - 60_000).toISOString();
  const deadline = Date.now() + (options.timeoutMs ?? 20_000);
  while (Date.now() < deadline) {
    let q = admin
      .from("email_send_log")
      .select("*")
      .eq("recipient_email", recipient)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(1);
    if (options.template) q = q.eq("template_name", options.template);
    const { data } = await q;
    if (data && data.length > 0) return data[0];
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(
    `waitForEmail timeout: ${recipient} template=${options.template ?? "*"}`,
  );
}
