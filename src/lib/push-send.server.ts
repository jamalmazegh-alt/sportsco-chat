/**
 * Server-only — Web Push sender.
 * Imported lazily from server routes / server functions only.
 */
import webpush from "web-push";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

let configured = false;
function ensureConfigured() {
  if (configured) return;
  const subject = process.env.VAPID_SUBJECT;
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!subject || !pub || !priv) {
    throw new Error("VAPID env vars missing (VAPID_SUBJECT/PUBLIC_KEY/PRIVATE_KEY)");
  }
  webpush.setVapidDetails(subject, pub, priv);
  configured = true;
}

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
}

/**
 * Send a push notification to every active subscription of one user.
 * Cleans up endpoints rejected with 404/410 (gone).
 * Fire-and-forget safe — never throws to caller.
 */
export async function sendPushToUser(
  userId: string,
  payload: PushPayload,
): Promise<{ sent: number; pruned: number }> {
  try {
    ensureConfigured();
  } catch (e) {
    console.warn("[push] not configured:", (e as Error).message);
    return { sent: 0, pruned: 0 };
  }

  const { data: subs } = await supabaseAdmin
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth")
    .eq("user_id", userId);

  if (!subs?.length) return { sent: 0, pruned: 0 };

  const body = JSON.stringify(payload);
  const results = await Promise.allSettled(
    subs.map((s: any) =>
      webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        body,
        { TTL: 60 * 60 * 24 },
      ),
    ),
  );

  let sent = 0;
  const toPrune: string[] = [];
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (r.status === "fulfilled") {
      sent++;
    } else {
      const status = (r.reason as any)?.statusCode;
      if (status === 404 || status === 410) toPrune.push((subs[i] as any).endpoint);
      else console.warn("[push] send failed", status, (r.reason as any)?.body || (r.reason as Error)?.message);
    }
  }

  if (toPrune.length) {
    await supabaseAdmin.from("push_subscriptions").delete().in("endpoint", toPrune);
  }

  return { sent, pruned: toPrune.length };
}

/** Best-effort fire-and-forget — never blocks or throws on caller. */
export function sendPushToUserFireAndForget(userId: string, payload: PushPayload): void {
  sendPushToUser(userId, payload).catch((e) => console.warn("[push] background send failed", e));
}
