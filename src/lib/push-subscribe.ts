import { isPushSupported, VAPID_PUBLIC_KEY } from "@/lib/pwa";
import { supabase } from "@/integrations/supabase/client";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function arrayBufferToUrlBase64(buffer: ArrayBuffer | null | undefined): string {
  if (!buffer) return "";
  const bytes = new Uint8Array(buffer);
  let raw = "";
  for (let i = 0; i < bytes.byteLength; i++) raw += String.fromCharCode(bytes[i]);
  return btoa(raw).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function subscriptionUsesCurrentVapidKey(sub: PushSubscription): boolean {
  return arrayBufferToUrlBase64(sub.options.applicationServerKey) === VAPID_PUBLIC_KEY;
}

export async function subscribeToPush(): Promise<PushSubscription | null> {
  if (!isPushSupported()) return null;

  const permission = await Notification.requestPermission();
  if (permission !== "granted") return null;

  const reg = await navigator.serviceWorker.ready;

  let sub = await reg.pushManager.getSubscription();
  if (sub && !subscriptionUsesCurrentVapidKey(sub)) {
    await sub.unsubscribe();
    sub = null;
  }
  if (!sub) {
    const key = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: key.buffer as ArrayBuffer,
    });
  }

  const json = sub.toJSON();
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) return null;

  const res = await fetch("/api/push/subscribe", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      endpoint: sub.endpoint,
      p256dh: json.keys?.p256dh,
      auth: json.keys?.auth,
      user_agent: navigator.userAgent,
    }),
  });
  if (!res.ok) {
    console.warn("[push] server subscription failed", res.status, await res.text().catch(() => ""));
    return null;
  }

  return sub;
}

export async function unsubscribeFromPush(): Promise<boolean> {
  if (!isPushSupported()) return false;
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return true;
  const endpoint = sub.endpoint;
  await sub.unsubscribe();
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (token) {
      await fetch("/api/push/unsubscribe", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ endpoint }),
      });
    }
  } catch {
    // Best effort: local unsubscribe already succeeded.
  }
  return true;
}

export async function currentPushPermission(): Promise<NotificationPermission | "unsupported"> {
  if (!isPushSupported()) return "unsupported";
  return Notification.permission;
}

/**
 * Reconcile the OS/browser push permission state with our DB.
 *
 * - If the user revoked permission in iOS Settings (or browser settings),
 *   the local PushSubscription may still exist but `Notification.permission`
 *   is "denied" → we delete every row for this user from `push_subscriptions`.
 * - If permission is granted AND a PushSubscription exists locally but the
 *   server doesn't know about it (or we just lost track), we re-upsert it.
 * - If permission is "default" we do nothing (don't prompt silently).
 *
 * Safe to call on every app mount and on `visibilitychange`.
 */
export async function syncPushSubscriptionState(): Promise<void> {
  if (!isPushSupported()) return;

  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) return;

  const permission = Notification.permission;
  let reg: ServiceWorkerRegistration | null = null;
  try {
    reg = await navigator.serviceWorker.ready;
  } catch {
    return;
  }
  const sub = await reg.pushManager.getSubscription();

  // Permission revoked at OS/browser level → clean DB + local sub.
  if (permission === "denied") {
    if (sub) {
      try { await sub.unsubscribe(); } catch { /* noop */ }
    }
    try {
      await fetch("/api/push/unsubscribe", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ all_for_user: true }),
      });
    } catch { /* best effort */ }
    return;
  }

  // Permission granted: ensure DB row exists and matches current endpoint.
  if (permission === "granted" && sub) {
    const json = sub.toJSON();
    try {
      await fetch("/api/push/subscribe", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          endpoint: sub.endpoint,
          p256dh: json.keys?.p256dh,
          auth: json.keys?.auth,
          user_agent: navigator.userAgent,
        }),
      });
    } catch { /* best effort */ }
  }
}
