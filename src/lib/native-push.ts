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

/**
 * Marque locale d'un enregistrement abouti.
 *
 * La permission ne suffit pas à décrire l'état : sur Android 12 et antérieur,
 * `POST_NOTIFICATIONS` n'existe pas et `checkPermissions()` renvoie toujours
 * `granted`. La carte du profil annonçait donc « Notifications activées » alors
 * qu'aucun token n'était enregistré — constaté après une réinstallation depuis
 * le Play Store. Seule la présence d'un token prouve que les push arriveront.
 *
 * Le stockage local est effacé à la désinstallation, ce qui est exactement la
 * durée de vie voulue : un token appartient à une installation.
 */
const TOKEN_MARK = "clubero.native-push.token";

function markRegistered(token: string): void {
  try {
    localStorage.setItem(TOKEN_MARK, token);
  } catch {
    // Stockage indisponible : on dégrade vers « prompt », jamais vers un faux
    // « activé ».
  }
}

function hasRegisteredToken(): boolean {
  try {
    return !!localStorage.getItem(TOKEN_MARK);
  } catch {
    return false;
  }
}

export async function getNativePushStatus(): Promise<NativePushStatus> {
  if (!isNativePlatform()) return "unavailable";
  try {
    const { receive } = await PushNotifications.checkPermissions();
    console.log("[native-push] checkPermissions:", receive);
    if (receive === "denied") return "denied";
    // `granted` sans token = rien n'arrivera : proposer l'activation plutôt que
    // d'afficher un succès que l'utilisateur n'a aucun moyen de démentir.
    if (!hasRegisteredToken()) return "prompt";
    return receive === "granted" ? "granted" : "prompt";
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
    if (saved) markRegistered(token);
    return saved ? { ok: true } : { ok: false, reason: "save_failed" };
  } catch (e) {
    console.warn("[native-push] enable failed", (e as Error).message);
    return { ok: false, reason: (e as Error).message };
  }
}

let tapListenerAttached = false;
let registrationDone = false;

/**
 * Au lancement (utilisateur authentifié) : si la permission est déjà accordée,
 * ré-enregistre silencieusement — les tokens APNs/FCM peuvent tourner — et
 * branche la navigation depuis un tap sur une notification.
 *
 * Les deux responsabilités portent des drapeaux distincts, à dessein. Un seul
 * drapeau posé à l'entrée condamnait toute nouvelle tentative dès le premier
 * appel : sur une installation neuve, la permission n'est pas encore accordée,
 * la fonction sortait aussitôt, et plus rien ne se réenregistrait de toute la
 * session — même après que l'utilisateur ait accordé la permission. Il fallait
 * se déconnecter et se reconnecter pour recharger le module. Constaté sur
 * appareil après une réinstallation depuis le Play Store.
 */
export async function initNativePushOnLaunch(): Promise<void> {
  if (!isNativePlatform()) return;

  // Une seule fois par session : un second écouteur dupliquerait la navigation.
  if (!tapListenerAttached) {
    tapListenerAttached = true;
    PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
      const url = (action.notification.data as { url?: string } | undefined)?.url;
      // Rechargement du shell SPA sur la route cible — simple et fiable pour
      // un tap de notification ; intégration router fine possible plus tard.
      if (url && url.startsWith("/")) window.location.assign(url);
    });
  }

  if (registrationDone) return;

  try {
    const { receive } = await PushNotifications.checkPermissions();
    // Sortie SANS marquer l'enregistrement fait : la permission peut être
    // accordée plus tard dans la même session, et l'appel suivant doit aboutir.
    if (receive !== "granted") return;

    const token = await registerAndGetToken();
    if (await saveToken(token)) {
      markRegistered(token);
      registrationDone = true;
    }
  } catch (e) {
    console.warn("[native-push] launch init failed", (e as Error).message);
  }
}
