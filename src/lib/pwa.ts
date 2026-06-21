/**
 * PWA helpers — registration is GUARDED to never run inside Lovable
 * preview / iframe / dev. Service workers persist across sessions and a
 * preview registration would keep serving stale HTML to every visitor.
 */

// Public VAPID key — safe to expose (used by browser to subscribe).
export const VAPID_PUBLIC_KEY =
  "BBxRFLb5fDEvbsA55dEoHwyChwtqwdg0VuErJAPxAI791NHQ_0uZ_EwJshlrPt6oEBO448OhQm9sVLkRSU8B7sA";

const SW_PATH = "/sw.js";

function isLovablePreview(): boolean {
  if (typeof window === "undefined") return true;
  const h = window.location.hostname;
  return (
    h.startsWith("id-preview--") ||
    h.startsWith("preview--") ||
    h === "lovableproject.com" ||
    h.endsWith(".lovableproject.com") ||
    h === "lovableproject-dev.com" ||
    h.endsWith(".lovableproject-dev.com") ||
    h === "beta.lovable.dev" ||
    h.endsWith(".beta.lovable.dev")
  );
}

function shouldRefuse(): boolean {
  if (typeof window === "undefined") return true;
  if (!import.meta.env.PROD) return true;
  if (window.self !== window.top) return true; // iframe
  if (isLovablePreview()) return true;
  if (new URL(window.location.href).searchParams.get("sw") === "off") return true;
  return false;
}

async function unregisterMatching() {
  if (!("serviceWorker" in navigator)) return;
  try {
    const regs = await navigator.serviceWorker.getRegistrations();
    for (const r of regs) {
      const url = r.active?.scriptURL || r.installing?.scriptURL || r.waiting?.scriptURL;
      if (url && new URL(url).pathname === SW_PATH) {
        await r.unregister();
      }
    }
  } catch {
    // best effort
  }
}

export async function registerServiceWorker() {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  if (shouldRefuse()) {
    await unregisterMatching();
    return;
  }
  try {
    const reg = await navigator.serviceWorker.register(SW_PATH, { scope: "/" });
    return reg;
  } catch (e) {
    console.warn("[pwa] SW registration failed", e);
  }
}

export function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  return (
    /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

export function isAndroid(): boolean {
  if (typeof navigator === "undefined") return false;
  return /android/i.test(navigator.userAgent);
}

export function isInStandaloneMode(): boolean {
  if (typeof window === "undefined") return false;
  // @ts-expect-error iOS Safari
  if (window.navigator?.standalone === true) return true;
  return window.matchMedia?.("(display-mode: standalone)").matches ?? false;
}

export function isPushSupported(): boolean {
  if (typeof window === "undefined") return false;
  return "PushManager" in window && "serviceWorker" in navigator && "Notification" in window;
}
