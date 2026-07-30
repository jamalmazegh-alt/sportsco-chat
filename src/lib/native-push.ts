/**
 * Push natif Capacitor (FCM Android / APNs iOS) — lot 3 mobile.
 *
 * Toute la logique est derrière `isNativePlatform()` et le plugin est importé
 * DYNAMIQUEMENT : rien de tout ceci n'atteint le chemin critique du bundle web.
 *
 * Le token natif est envoyé à `/api/push/subscribe` avec `channel: fcm|apns` ;
 * le serveur le stocke dans `endpoint` (clé UNIQUE → upsert idempotent).
 * L'expéditeur serveur correspondant sera branché quand la clé APNs (adhésion
 * Apple) et le projet Firebase existeront — d'ici là les lignes natives sont
 * simplement ignorées par `sendPushToUser`.
 */
import { supabase } from "@/integrations/supabase/client";
import { getApiOrigin, getPlatform, isNativePlatform } from "@/lib/native-platform";

export type NativePushStatus = "unavailable" | "prompt" | "granted" | "denied";

function nativeChannel(): "fcm" | "apns" {
  return getPlatform() === "android" ? "fcm" : "apns";
}

async function loadPlugin() {
  const { PushNotifications } = await import("@capacitor/push-notifications");
  return PushNotifications;
}

export async function getNativePushStatus(): Promise<NativePushStatus> {
  if (!isNativePlatform()) return "unavailable";
  try {
    const PushNotifications = await loadPlugin();
    const { receive } = await PushNotifications.checkPermissions();
    if (receive === "granted") return "granted";
    if (receive === "denied") return "denied";
    return "prompt";
  } catch {
    return "unavailable";
  }
}

/** Attend le token d'enregistrement (ou une erreur) après `register()`. */
async function registerAndGetToken(): Promise<string> {
  const PushNotifications = await loadPlugin();

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
    const PushNotifications = await loadPlugin();
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
    const PushNotifications = await loadPlugin();

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
