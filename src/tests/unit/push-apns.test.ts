import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * L'expéditeur APNs ne pourra être éprouvé sur appareil qu'au premier build
 * TestFlight. Ces tests verrouillent ce qui est vérifiable sans iPhone : la
 * forme de la requête, la réutilisation du jeton d'autorisation, et surtout la
 * distinction entre un destinataire disparu — à élaguer — et une panne
 * passagère, qu'il ne faut surtout pas élaguer.
 */

/** Génère une vraie clé P-256 au format PEM, comme le .p8 d'Apple. */
async function makePem(): Promise<string> {
  const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, [
    "sign",
    "verify",
  ]);
  const pkcs8 = await crypto.subtle.exportKey("pkcs8", pair.privateKey);
  const bytes = new Uint8Array(pkcs8);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  const b64 = btoa(bin).replace(/(.{64})/g, "$1\n");
  return `-----BEGIN PRIVATE KEY-----\n${b64}\n-----END PRIVATE KEY-----`;
}

async function loadWithEnv(extra: Record<string, string> = {}) {
  vi.resetModules();
  const pem = await makePem();
  process.env.APNS_KEY_ID = "952Q4YRC73";
  process.env.APNS_TEAM_ID = "TUDCV2PMTN";
  process.env.APNS_BUNDLE_ID = "app.clubero.mobile";
  // Le stockage réel porte des `\n` littéraux, pas de vrais retours à la ligne.
  process.env.APNS_PRIVATE_KEY = pem.replace(/\n/g, "\\n");
  delete process.env.APNS_SANDBOX;
  Object.assign(process.env, extra);
  return import("@/lib/push-apns.server");
}

const PAYLOAD = {
  title: "Convocation",
  body: "Match dimanche 18h30",
  url: "/events/42",
  tag: "e42",
};

describe("expéditeur APNs", () => {
  beforeEach(() => {
    for (const k of [
      "APNS_KEY_ID",
      "APNS_TEAM_ID",
      "APNS_BUNDLE_ID",
      "APNS_PRIVATE_KEY",
      "APNS_SANDBOX",
    ])
      delete process.env[k];
    vi.restoreAllMocks();
  });

  it("se déclare non configuré tant qu'une variable manque", async () => {
    vi.resetModules();
    const mod = await import("@/lib/push-apns.server");
    expect(mod.isApnsConfigured()).toBe(false);
  });

  it("vise la production et porte les en-têtes attendus", async () => {
    const mod = await loadWithEnv();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    globalThis.fetch = fetchMock as never;

    const res = await mod.sendApnsToToken("ABCDEF0123", PAYLOAD);

    expect(res).toEqual({ status: 200, unregistered: false });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.push.apple.com/3/device/ABCDEF0123");
    expect(init.headers["apns-topic"]).toBe("app.clubero.mobile");
    expect(init.headers["apns-push-type"]).toBe("alert");
    expect(init.headers.authorization).toMatch(/^bearer eyJ/);

    const body = JSON.parse(init.body);
    expect(body.aps.alert).toEqual({ title: PAYLOAD.title, body: PAYLOAD.body });
    expect(body.aps["thread-id"]).toBe("e42");
    // L'URL voyage hors du bloc `aps` : c'est ce que lit le tap de notification.
    expect(body.url).toBe("/events/42");
  });

  it("bascule sur le bac à sable quand APNS_SANDBOX vaut 1", async () => {
    const mod = await loadWithEnv({ APNS_SANDBOX: "1" });
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    globalThis.fetch = fetchMock as never;
    await mod.sendApnsToToken("TOK", PAYLOAD);
    expect(fetchMock.mock.calls[0][0]).toBe("https://api.sandbox.push.apple.com/3/device/TOK");
  });

  it("réutilise le jeton d'autorisation entre deux envois", async () => {
    // Apple bannit un émetteur qui régénère son JWT à chaque notification.
    const mod = await loadWithEnv();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    globalThis.fetch = fetchMock as never;

    await mod.sendApnsToToken("A", PAYLOAD);
    await mod.sendApnsToToken("B", PAYLOAD);

    const first = fetchMock.mock.calls[0][1].headers.authorization;
    const second = fetchMock.mock.calls[1][1].headers.authorization;
    expect(second).toBe(first);
  });

  it("signale un destinataire disparu sur 410", async () => {
    const mod = await loadWithEnv();
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 410,
      text: async () => '{"reason":"Unregistered"}',
    }) as never;
    await expect(mod.sendApnsToToken("TOK", PAYLOAD)).resolves.toEqual({
      status: 410,
      unregistered: true,
    });
  });

  it("signale un jeton du mauvais environnement sur 400 BadDeviceToken", async () => {
    const mod = await loadWithEnv();
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => '{"reason":"BadDeviceToken"}',
    }) as never;
    const res = await mod.sendApnsToToken("TOK", PAYLOAD);
    expect(res.unregistered).toBe(true);
  });

  it("n'élague PAS sur une panne passagère", async () => {
    // Un 503 ou un 429 est un incident côté Apple : supprimer le jeton
    // priverait durablement l'utilisateur de notifications.
    const mod = await loadWithEnv();
    for (const status of [429, 500, 503]) {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status,
        text: async () => '{"reason":"TooManyRequests"}',
      }) as never;
      const res = await mod.sendApnsToToken("TOK", PAYLOAD);
      expect(res.unregistered, `statut ${status}`).toBe(false);
    }
  });
});
