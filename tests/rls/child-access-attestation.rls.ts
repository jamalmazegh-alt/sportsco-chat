/**
 * Accès plateforme d'un mineur — attestation et trace incontournables.
 *
 * Ce que ce fichier verrouille, et qui était contournable :
 *
 *   1. Un parent lié pouvait écrire `child_platform_access = true` directement
 *      via PostgREST (la policy `players_parent_media_update` couvre TOUTE la
 *      ligne malgré son nom). L'attestation n'existait que dans l'entrée de la
 *      server fn : elle n'atteignait jamais la base.
 *   2. La trace dans `user_consents` était écrite en best-effort après coup.
 *      Un échec renvoyait quand même un succès — un consentement rapporté sans
 *      être enregistré, ce qui vide le contrôle CSAE de son objet.
 *
 * Le seul chemin d'écriture est désormais `set_child_platform_access`, qui pose
 * le drapeau ET la trace dans la même transaction.
 */
import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { admin } from "./_admin";
import { signInAs } from "./_clients";
import { getFixtures } from "./_setup";

async function currentAccess(playerId: string): Promise<boolean | null> {
  const { data } = await admin
    .from("players")
    .select("child_platform_access")
    .eq("id", playerId)
    .single();
  return (data?.child_platform_access ?? null) as boolean | null;
}

async function consentCount(playerId: string): Promise<number> {
  const { count } = await admin
    .from("user_consents")
    .select("id", { count: "exact", head: true })
    .eq("on_behalf_of_player_id", playerId)
    .eq("kind", "parental_consent");
  return count ?? 0;
}

let playerId: string;

beforeAll(async () => {
  playerId = getFixtures().playerA;
});

afterEach(async () => {
  // Remise à zéro par service_role : les flux service_role restent permis,
  // c'est justement ce que le trigger doit continuer d'autoriser.
  await admin.from("players").update({ child_platform_access: false }).eq("id", playerId);
  await admin
    .from("user_consents")
    .delete()
    .eq("on_behalf_of_player_id", playerId)
    .eq("kind", "parental_consent");
});

describe("écriture directe de child_platform_access", () => {
  it("un parent lié ne peut PLUS activer par un UPDATE direct — c'était le contournement", async () => {
    const c = await signInAs("parentA");
    const { error } = await c
      .from("players")
      .update({ child_platform_access: true })
      .eq("id", playerId);

    expect(error, "l'UPDATE direct doit être refusé").not.toBeNull();
    expect(error?.message).toContain("use_rpc_required");
    expect(await currentAccess(playerId)).toBe(false);
    expect(await consentCount(playerId)).toBe(0);
  });

  it("le staff ne peut pas non plus écrire directement", async () => {
    const c = await signInAs("adminA");
    const { error } = await c
      .from("players")
      .update({ child_platform_access: true })
      .eq("id", playerId);
    expect(error).not.toBeNull();
    expect(await currentAccess(playerId)).toBe(false);
  });
});

describe("set_child_platform_access — activation", () => {
  it("refuse sans attestation, même pour le parent légitime", async () => {
    const c = await signInAs("parentA");
    const { error } = await c.rpc("set_child_platform_access", {
      _player_id: playerId,
      _enabled: true,
      _attestation: false,
    });
    expect(error?.message).toContain("attestation_required");
    expect(await currentAccess(playerId)).toBe(false);
    expect(await consentCount(playerId)).toBe(0);
  });

  it("refuse l'attestation omise (valeur par défaut)", async () => {
    const c = await signInAs("parentA");
    const { error } = await c.rpc("set_child_platform_access", {
      _player_id: playerId,
      _enabled: true,
    });
    expect(error?.message).toContain("attestation_required");
  });

  it("refuse un membre du staff qui n'est pas le représentant légal", async () => {
    const c = await signInAs("adminA");
    const { error } = await c.rpc("set_child_platform_access", {
      _player_id: playerId,
      _enabled: true,
      _attestation: true,
    });
    expect(error?.message).toContain("parent_required");
    expect(await currentAccess(playerId)).toBe(false);
  });

  it("refuse un parent non lié à cet enfant", async () => {
    const c = await signInAs("parentUnlinkedA");
    const { error } = await c.rpc("set_child_platform_access", {
      _player_id: playerId,
      _enabled: true,
      _attestation: true,
    });
    expect(error?.message).toContain("parent_required");
  });

  it("autorise le parent avec attestation ET enregistre la trace dans la même opération", async () => {
    const c = await signInAs("parentA");
    const { error } = await c.rpc("set_child_platform_access", {
      _player_id: playerId,
      _enabled: true,
      _attestation: true,
    });
    expect(error).toBeNull();
    expect(await currentAccess(playerId)).toBe(true);

    const { data: consents } = await admin
      .from("user_consents")
      .select("user_id, granted, kind, version_id")
      .eq("on_behalf_of_player_id", playerId)
      .eq("kind", "parental_consent");
    expect(consents).toHaveLength(1);
    expect(consents![0].granted).toBe(true);
    expect(consents![0].user_id).toBe(getFixtures().users.parentA.userId);
    expect(consents![0].version_id).toBeTruthy();
  });

  it("référence la version dans la langue demandée quand elle existe", async () => {
    const c = await signInAs("parentA");
    const { error } = await c.rpc("set_child_platform_access", {
      _player_id: playerId,
      _enabled: true,
      _attestation: true,
      _locale: "en",
    });
    expect(error).toBeNull();

    const { data: consents } = await admin
      .from("user_consents")
      .select("version_id")
      .eq("on_behalf_of_player_id", playerId)
      .limit(1);
    const { data: version } = await admin
      .from("consent_versions")
      .select("locale, kind")
      .eq("id", consents![0].version_id)
      .single();
    expect(version?.kind).toBe("parental_consent");
    expect(version?.locale).toBe("en");
  });
});

describe("set_child_platform_access — désactivation", () => {
  beforeAll(async () => {
    await admin.from("players").update({ child_platform_access: true }).eq("id", playerId);
  });

  it("le staff peut désactiver — action protectrice, et elle laisse une trace", async () => {
    await admin.from("players").update({ child_platform_access: true }).eq("id", playerId);
    const c = await signInAs("adminA");
    const { error } = await c.rpc("set_child_platform_access", {
      _player_id: playerId,
      _enabled: false,
    });
    expect(error).toBeNull();
    expect(await currentAccess(playerId)).toBe(false);

    const { data: consents } = await admin
      .from("user_consents")
      .select("granted")
      .eq("on_behalf_of_player_id", playerId)
      .eq("kind", "parental_consent");
    expect(consents).toHaveLength(1);
    expect(consents![0].granted).toBe(false); // retrait tracé
  });

  it("un membre sans lien ni rôle ne peut pas désactiver", async () => {
    const c = await signInAs("playerB");
    const { error } = await c.rpc("set_child_platform_access", {
      _player_id: playerId,
      _enabled: false,
    });
    expect(error).not.toBeNull();
  });
});
