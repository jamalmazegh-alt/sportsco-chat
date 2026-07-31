/**
 * Push natif Capacitor (FCM Android / APNs iOS) — lot 3 mobile.
 *
 * Toute la logique est derrière `isNativePlatform()` — sur le web ces
 * fonctions sont des no-ops et le proxy du plugin n'est jamais invoqué.
 *
 * Le token natif est envoyé à `/api/push/subscribe` avec `channel: fcm|apns` ;
 * le serveur le stocke dans `endpoint` (clé UNIQUE → upsert idempotent).
 * L'expéditeur serveur correspondant sera branché quand la clé APNs (adhésion
 * Apple) et le projet Firebase existeront — d'ici là les lignes natives sont
 * simplement ignorées par `sendPushToUser`.
 */
import { PushNotifications } from "@capacitor/push-notifications";
import { supabase } from "@/integrations/supabase/client";
import { getApiOrigin, getPlatform, isNativePlatform } from "@/lib/native-platform";

// Import STATIQUE du plugin, à dessein : l'import dynamique ne se résolvait
// jamais dans la WKWebView (spike du 31/07/2026 — promesse pendante, ni valeur
// ni rejet). Coût web : quelques Ko d'un proxy registerPlugin inerte, jamais
// invoqué hors natif grâce aux gardes isNativePlatform().

export type NativePushStatus = "unavailable" | "prompt" | "granted" | "denied";

function nativeChannel(): "fcm" | "apns" {
  return getPlatform() === "android" ? "fcm" : "apns";
}

export async function getNativePushStatus(): Promise<NativePushStatus> {
  if (!isNativePlatform()) return "unavailable";
  try {
    const { receive } = await PushNotifications.checkPermissions();
    console.log("[native-push] checkPermissions:", receive);
    if (receive === "granted") return "granted";
    if (receive === "denied") return "denied";
    return "prompt";
  } catch (e) {
    // Un échec ici signifie plugin absent du binaire ou bridge indisponible —
    // toujours le tracer, un `unavailable` silencieux est indébogable.
    console.warn("[native-push] status check failed:", (e as Error).message);
    return "unavailable";
  }
}

/** Attend le token d'enregistrement (ou une erreur) après `register()`. */
async function registerAndGetToken(): Promise<string> {
  const tokenPromise = new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("registration timeout")), 15_000);
    PushNotifications.addListener("registration", (t) => {
      clearTimeout(timer);
      resolve(t.value);
    });
    PushNotifications.addListener("registrationError", (e) => {
      clearTimeout(timer);
      reject(new Error(e.error || "registration error"));
    });
  });

  await PushNotifications.register();
  return tokenPromise;
}

async function saveToken(token: string): Promise<boolean> {
  const { data } = await supabase.auth.getSession();
  const access = data.session?.access_token;
  if (!access) return false;

  const res = await fetch(`${getApiOrigin()}/api/push/subscribe`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${access}` },
    body: JSON.stringify({
      channel: nativeChannel(),
      token,
      user_agent: navigator.userAgent.slice(0, 512),
      takeover: true,
    }),
  });
  return res.ok;
}

/**
 * Parcours utilisateur : demande la permission puis enregistre le token.
 * À appeler depuis un geste explicite (CTA du profil).
 */
export async function enableNativePush(): Promise<{ ok: boolean; reason?: string }> {
  if (!isNativePlatform()) return { ok: false, reason: "unavailable" };
  try {
    const { receive } = await PushNotifications.requestPermissions();
    if (receive !== "granted") return { ok: false, reason: "denied" };

    const token = await registerAndGetToken();
    const saved = await saveToken(token);
    return saved ? { ok: true } : { ok: false, reason: "save_failed" };
  } catch (e) {
    console.warn("[native-push] enable failed", (e as Error).message);
    return { ok: false, reason: (e as Error).message };
  }
}

let launchInitDone = false;

/**
 * Au lancement (utilisateur authentifié) : si la permission est déjà accordée,
 * ré-enregistre silencieusement — les tokens APNs/FCM peuvent tourner — et
 * branche la navigation depuis un tap sur une notification.
 */
export async function initNativePushOnLaunch(): Promise<void> {
  if (!isNativePlatform() || launchInitDone) return;
  launchInitDone = true;

  try {
    PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
      const url = (action.notification.data as { url?: string } | undefined)?.url;
      // Rechargement du shell SPA sur la route cible — simple et fiable pour
      // un tap de notification ; intégration router fine possible plus tard.
      if (url && url.startsWith("/")) window.location.assign(url);
    });

    const { receive } = await PushNotifications.checkPermissions();
    if (receive !== "granted") return;

    const token = await registerAndGetToken();
    await saveToken(token);
  } catch (e) {
    console.warn("[native-push] launch init failed", (e as Error).message);
  }
}
