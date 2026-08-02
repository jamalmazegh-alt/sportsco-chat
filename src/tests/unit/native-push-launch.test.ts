import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Régression : après une réinstallation depuis le Play Store, plus aucune
 * notification n'arrivait. `initNativePushOnLaunch()` posait son drapeau AVANT
 * de vérifier la permission ; sur une installation neuve la permission n'est
 * pas encore accordée, la fonction sortait aussitôt, et toute nouvelle
 * tentative était condamnée pour le reste de la session. Il fallait se
 * déconnecter et se reconnecter pour recharger le module.
 */

const checkPermissions = vi.fn();
const requestPermissions = vi.fn();
const register = vi.fn();
const addListener = vi.fn();

vi.mock("@capacitor/push-notifications", () => ({
  PushNotifications: {
    checkPermissions: () => checkPermissions(),
    requestPermissions: () => requestPermissions(),
    register: () => register(),
    addListener: (...a: unknown[]) => addListener(...a),
  },
}));

vi.mock("@/lib/native-platform", () => ({
  isNativePlatform: () => true,
  getPlatform: () => "android",
  getApiOrigin: () => "https://clubero.app",
}));

const getSession = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { getSession: () => getSession() } },
}));

// localStorage minimal — vitest tourne sous node.
const store = new Map<string, string>();
Object.defineProperty(globalThis, "localStorage", {
  value: {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  },
  configurable: true,
});
Object.defineProperty(globalThis, "navigator", {
  value: { userAgent: "test" },
  configurable: true,
});

/** `register()` déclenche l'écouteur "registration" comme le ferait le plugin. */
function wireSuccessfulRegistration(token = "tok-1") {
  addListener.mockImplementation((event: string, cb: (v: { value: string }) => void) => {
    if (event === "registration") setTimeout(() => cb({ value: token }), 0);
  });
}

describe("initNativePushOnLaunch — reprise après permission accordée tardivement", () => {
  beforeEach(() => {
    vi.resetModules();
    store.clear();
    checkPermissions.mockReset();
    register.mockReset().mockResolvedValue(undefined);
    addListener.mockReset();
    getSession.mockResolvedValue({ data: { session: { access_token: "jwt" } } });
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true }) as never;
  });

  it("réessaie l'enregistrement quand la permission passe à granted dans la même session", async () => {
    const mod = await import("@/lib/native-push");

    // 1er lancement : permission pas encore accordée (installation neuve).
    checkPermissions.mockResolvedValue({ receive: "prompt" });
    await mod.initNativePushOnLaunch();
    expect(register).not.toHaveBeenCalled();

    // L'utilisateur accorde la permission, puis un nouvel appel survient.
    checkPermissions.mockResolvedValue({ receive: "granted" });
    wireSuccessfulRegistration();
    await mod.initNativePushOnLaunch();

    expect(register).toHaveBeenCalledTimes(1);
  });

  it("n'enregistre pas deux fois une fois le token sauvegardé", async () => {
    const mod = await import("@/lib/native-push");
    checkPermissions.mockResolvedValue({ receive: "granted" });
    wireSuccessfulRegistration();

    await mod.initNativePushOnLaunch();
    await mod.initNativePushOnLaunch();

    expect(register).toHaveBeenCalledTimes(1);
  });
});

describe("getNativePushStatus — la permission seule ne prouve rien", () => {
  beforeEach(() => {
    vi.resetModules();
    store.clear();
    checkPermissions.mockReset();
    addListener.mockReset();
  });

  it("renvoie prompt quand la permission est accordée mais qu'aucun token n'est enregistré", async () => {
    // Cas d'Android 12 et antérieur : POST_NOTIFICATIONS n'existe pas, la
    // permission est donc toujours `granted`. Afficher « activées » ici
    // trompait l'utilisateur après une réinstallation.
    checkPermissions.mockResolvedValue({ receive: "granted" });
    const mod = await import("@/lib/native-push");
    await expect(mod.getNativePushStatus()).resolves.toBe("prompt");
  });

  it("renvoie granted une fois un token enregistré", async () => {
    checkPermissions.mockResolvedValue({ receive: "granted" });
    const mod = await import("@/lib/native-push");
    store.set("clubero.native-push.token", "tok-1");
    await expect(mod.getNativePushStatus()).resolves.toBe("granted");
  });

  it("renvoie denied quand la permission est refusée, token ou pas", async () => {
    checkPermissions.mockResolvedValue({ receive: "denied" });
    const mod = await import("@/lib/native-push");
    store.set("clubero.native-push.token", "tok-1");
    await expect(mod.getNativePushStatus()).resolves.toBe("denied");
  });
});
