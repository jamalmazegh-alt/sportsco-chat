/**
 * RLS: visibilité de la liste des convoqués (héritage Club → Équipe → Événement).
 *
 * La policy RESTRICTIVE `convocations_visibility_gate` + `event_lineups_visibility_gate`
 * doit :
 *   - Laisser passer staff (coach/admin), self, parent lié, quelle que soit la config.
 *   - Bloquer les pairs (autres joueurs de la même équipe) quand la liste est masquée.
 *   - Bloquer les parents non liés dans tous les cas.
 *   - Retourner `false` (jamais NULL) pour un event_id inconnu.
 *
 * On seede à la volée un joueur "teammate" (utilisateur + players + convocation)
 * dans le club A pour tester le cas "pair de la même équipe", que la permissive
 * `can_view_team` autorise et que la restrictive doit filtrer quand masqué.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { admin, SUPABASE_URL, SUPABASE_ANON_KEY } from "./_admin";
import { signInAs, anonClient } from "./_clients";
import { getFixtures, PASSWORD } from "./_setup";

const PWD = PASSWORD;

let teammateUserId: string;
let teammatePlayerId: string;
let teammateConvocationId: string;
let teammateClient: SupabaseClient;
const teammateEmail = `__rls_calluptm_${Date.now().toString(36)}@clubero-rls.test`;

async function setEventVisibility(eventId: string, value: boolean | null) {
  const { error } = await admin
    .from("events")
    .update({ show_called_up_players_override: value })
    .eq("id", eventId);
  if (error) throw new Error(`setEventVisibility: ${error.message}`);
}

async function setTeamVisibility(teamId: string, value: boolean | null) {
  const { error } = await admin
    .from("teams")
    .update({ show_called_up_players_override: value })
    .eq("id", teamId);
  if (error) throw new Error(`setTeamVisibility: ${error.message}`);
}

async function setClubVisibility(clubId: string, value: boolean) {
  const { error } = await admin
    .from("clubs")
    .update({ show_called_up_players_default: value })
    .eq("id", clubId);
  if (error) throw new Error(`setClubVisibility: ${error.message}`);
}

beforeAll(async () => {
  const fx = getFixtures();

  // 1. Teammate user in clubA, teamA
  const { data: created, error: cErr } = await admin.auth.admin.createUser({
    email: teammateEmail,
    password: PWD,
    email_confirm: true,
  });
  if (cErr || !created.user) throw new Error(`create teammate: ${cErr?.message}`);
  teammateUserId = created.user.id;

  await admin.from("profiles").upsert({
    id: teammateUserId,
    full_name: "RLS Teammate",
    first_name: "RLS",
    last_name: "teammate",
  });

  await admin.from("club_members").insert({
    club_id: fx.clubA,
    user_id: teammateUserId,
    role: "player",
    roles: ["player"],
  });

  const { data: pl, error: pErr } = await admin
    .from("players")
    .insert({
      club_id: fx.clubA,
      first_name: "Teammate",
      last_name: "A",
      user_id: teammateUserId,
    })
    .select("id")
    .single();
  if (pErr || !pl) throw new Error(`create teammate player: ${pErr?.message}`);
  teammatePlayerId = pl.id;

  const { data: conv, error: convErr } = await admin
    .from("convocations")
    .insert({ event_id: fx.eventA, player_id: teammatePlayerId, status: "pending" })
    .select("id")
    .single();
  if (convErr || !conv) throw new Error(`create teammate convocation: ${convErr?.message}`);
  teammateConvocationId = conv.id;

  teammateClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: signErr } = await teammateClient.auth.signInWithPassword({
    email: teammateEmail,
    password: PWD,
  });
  if (signErr) throw new Error(`teammate signIn: ${signErr.message}`);

  // Reset to inherited defaults before running matrix
  await setEventVisibility(fx.eventA, null);
  await setTeamVisibility(fx.teamA, null);
  await setClubVisibility(fx.clubA, true);
});

afterAll(async () => {
  await admin.from("convocations").delete().eq("id", teammateConvocationId);
  await admin.from("players").delete().eq("id", teammatePlayerId);
  await admin.from("club_members").delete().eq("user_id", teammateUserId);
  await admin.from("profiles").delete().eq("id", teammateUserId);
  await admin.auth.admin.deleteUser(teammateUserId);
});

describe("RLS: call-up visibility — fonction call_up_list_visible", () => {
  it("returns false (never null) for unknown event_id", async () => {
    const { data, error } = await admin.rpc("call_up_list_visible", {
      p_event_id: "00000000-0000-0000-0000-000000000000",
    });
    expect(error).toBeNull();
    expect(data).toBe(false);
  });

  it("returns true when the club default is true and no override", async () => {
    const fx = getFixtures();
    await setEventVisibility(fx.eventA, null);
    await setTeamVisibility(fx.teamA, null);
    await setClubVisibility(fx.clubA, true);
    const { data } = await admin.rpc("call_up_list_visible", { p_event_id: fx.eventA });
    expect(data).toBe(true);
  });

  it("event override wins over team and club", async () => {
    const fx = getFixtures();
    await setClubVisibility(fx.clubA, true);
    await setTeamVisibility(fx.teamA, true);
    await setEventVisibility(fx.eventA, false);
    const { data } = await admin.rpc("call_up_list_visible", { p_event_id: fx.eventA });
    expect(data).toBe(false);
    await setEventVisibility(fx.eventA, null);
  });

  it("team override wins over club when event has no override", async () => {
    const fx = getFixtures();
    await setEventVisibility(fx.eventA, null);
    await setTeamVisibility(fx.teamA, false);
    await setClubVisibility(fx.clubA, true);
    const { data } = await admin.rpc("call_up_list_visible", { p_event_id: fx.eventA });
    expect(data).toBe(false);
    await setTeamVisibility(fx.teamA, null);
  });
});

describe("RLS: convocations — restrictive gate quand liste masquée", () => {
  beforeAll(async () => {
    const fx = getFixtures();
    await setClubVisibility(fx.clubA, true);
    await setTeamVisibility(fx.teamA, null);
    await setEventVisibility(fx.eventA, false); // masquée pour toute la suite
  });

  afterAll(async () => {
    const fx = getFixtures();
    await setEventVisibility(fx.eventA, null);
  });

  it("coachA (staff) reads all convocations even when hidden", async () => {
    const fx = getFixtures();
    const c = await signInAs("coachA");
    const { data, error } = await c
      .from("convocations")
      .select("id")
      .eq("event_id", fx.eventA);
    expect(error).toBeNull();
    const ids = (data ?? []).map((r) => r.id).sort();
    expect(ids).toContain(fx.convocationA);
    expect(ids).toContain(teammateConvocationId);
  });

  it("adminA (staff) reads all convocations even when hidden", async () => {
    const fx = getFixtures();
    const c = await signInAs("adminA");
    const { data, error } = await c
      .from("convocations")
      .select("id")
      .eq("event_id", fx.eventA);
    expect(error).toBeNull();
    expect((data ?? []).length).toBeGreaterThanOrEqual(2);
  });

  it("playerA reads their OWN convocation when hidden", async () => {
    const fx = getFixtures();
    const c = await signInAs("playerA");
    const { data, error } = await c
      .from("convocations")
      .select("id")
      .eq("id", fx.convocationA);
    expect(error).toBeNull();
    expect((data ?? []).length).toBe(1);
  });

  it("playerA CANNOT read teammate convocation when hidden", async () => {
    const c = await signInAs("playerA");
    const { data, error } = await c
      .from("convocations")
      .select("id")
      .eq("id", teammateConvocationId);
    if (error) return; // silently blocked also OK
    expect(data ?? []).toHaveLength(0);
  });

  it("teammate reads their OWN convocation but NOT playerA's", async () => {
    const fx = getFixtures();
    const own = await teammateClient
      .from("convocations")
      .select("id")
      .eq("id", teammateConvocationId);
    expect(own.error).toBeNull();
    expect((own.data ?? []).length).toBe(1);
    const other = await teammateClient
      .from("convocations")
      .select("id")
      .eq("id", fx.convocationA);
    expect((other.data ?? []).length).toBe(0);
  });

  it("parentA (linked to playerA) reads playerA's convocation", async () => {
    const fx = getFixtures();
    const c = await signInAs("parentA");
    const { data, error } = await c
      .from("convocations")
      .select("id")
      .eq("id", fx.convocationA);
    expect(error).toBeNull();
    expect((data ?? []).length).toBe(1);
  });

  it("parentUnlinkedA cannot read any convocation of eventA when hidden", async () => {
    const fx = getFixtures();
    const c = await signInAs("parentUnlinkedA");
    const { data } = await c.from("convocations").select("id").eq("event_id", fx.eventA);
    expect(data ?? []).toHaveLength(0);
  });

  it("playerA can still respond to their own convocation when hidden", async () => {
    const fx = getFixtures();
    const c = await signInAs("playerA");
    const { data, error } = await c
      .from("convocations")
      .update({ status: "present" })
      .eq("id", fx.convocationA)
      .select();
    expect(error).toBeNull();
    expect((data ?? []).length).toBe(1);
  });

  it("parentA can respond on behalf of playerA when hidden", async () => {
    const fx = getFixtures();
    const c = await signInAs("parentA");
    const { data, error } = await c
      .from("convocations")
      .update({ status: "absent" })
      .eq("id", fx.convocationA)
      .select();
    expect(error).toBeNull();
    expect((data ?? []).length).toBe(1);
  });
});

describe("RLS: convocations — visible restaure l'accès équipe", () => {
  beforeAll(async () => {
    const fx = getFixtures();
    await setEventVisibility(fx.eventA, true);
  });
  afterAll(async () => {
    const fx = getFixtures();
    await setEventVisibility(fx.eventA, null);
  });

  it("playerA reads teammate convocation when list is visible", async () => {
    const c = await signInAs("playerA");
    const { data, error } = await c
      .from("convocations")
      .select("id")
      .eq("id", teammateConvocationId);
    expect(error).toBeNull();
    expect((data ?? []).length).toBe(1);
  });
});

describe("RLS: event_lineups — masqué = 0 ligne pour les non-staff", () => {
  let lineupId: string | null = null;

  beforeAll(async () => {
    const fx = getFixtures();
    // seed a lineup for eventA
    const { data, error } = await admin
      .from("event_lineups")
      .insert({
        event_id: fx.eventA,
        team_id: fx.teamA,
        club_id: fx.clubA,
        formation: "4-4-2",
        slots: [],
        bench: [],
        visibility: "team",
        published_at: new Date().toISOString(),
        created_by: fx.users.coachA.userId,
      })
      .select("id")
      .single();
    if (error || !data) throw new Error(`seed lineup: ${error?.message}`);
    lineupId = data.id;

    await setEventVisibility(fx.eventA, false);
  });

  afterAll(async () => {
    const fx = getFixtures();
    if (lineupId) await admin.from("event_lineups").delete().eq("id", lineupId);
    await setEventVisibility(fx.eventA, null);
  });

  it("coachA sees the lineup when hidden", async () => {
    const fx = getFixtures();
    const c = await signInAs("coachA");
    const { data, error } = await c
      .from("event_lineups")
      .select("id")
      .eq("event_id", fx.eventA);
    expect(error).toBeNull();
    expect((data ?? []).length).toBe(1);
  });

  it("playerA sees NO lineup when hidden (not even their own place)", async () => {
    const fx = getFixtures();
    const c = await signInAs("playerA");
    const { data } = await c.from("event_lineups").select("id").eq("event_id", fx.eventA);
    expect(data ?? []).toHaveLength(0);
  });

  it("parentA sees NO lineup when hidden", async () => {
    const fx = getFixtures();
    const c = await signInAs("parentA");
    const { data } = await c.from("event_lineups").select("id").eq("event_id", fx.eventA);
    expect(data ?? []).toHaveLength(0);
  });
});

describe("RLS: anon — aucun accès direct, même quand la liste est visible", () => {
  it("anon cannot SELECT convocations", async () => {
    const fx = getFixtures();
    await setEventVisibility(fx.eventA, true); // visible: pire cas pour la fuite
    const c = anonClient();
    const { data } = await c.from("convocations").select("id").eq("event_id", fx.eventA);
    expect(data ?? []).toHaveLength(0);
    await setEventVisibility(fx.eventA, null);
  });

  it("anon cannot SELECT event_lineups", async () => {
    const fx = getFixtures();
    const c = anonClient();
    const { data } = await c.from("event_lineups").select("id").eq("event_id", fx.eventA);
    expect(data ?? []).toHaveLength(0);
  });

  it("anon cannot EXECUTE call_up_list_visible (grant revoked)", async () => {
    const fx = getFixtures();
    const c = anonClient();
    const { data, error } = await c.rpc("call_up_list_visible", { p_event_id: fx.eventA });
    // anon lost EXECUTE → PostgREST returns an error, or data is null.
    const blocked = !!error || data === null;
    expect(blocked, `anon should not be able to call the RPC (data=${data}, err=${error?.message})`).toBe(true);
  });

  it("anon cannot EXECUTE is_team_staff_of_event", async () => {
    const fx = getFixtures();
    const c = anonClient();
    const { data, error } = await c.rpc("is_team_staff_of_event", {
      p_event_id: fx.eventA,
      p_user_id: fx.users.coachA.userId,
    });
    const blocked = !!error || data === null;
    expect(blocked).toBe(true);
  });
});

/**
 * Écriture via RPC gardée : negative test symétrique.
 *
 * On prouve deux choses en un test :
 *  1. Un non-staff qui appelle `set_call_up_visibility` se prend 42501.
 *  2. Après le refus, la colonne n'a PAS bougé — la RPC ne fait pas d'UPDATE
 *     partiel avant de lever, et aucun autre chemin (policy UPDATE générique
 *     sur events) ne permet à ce rôle de flipper le réglage.
 *
 * Les deux volets comptent : (1) seul prouve que la RPC lève, pas qu'aucune
 * écriture ne fuit. (2) seul prouve que la colonne n'a pas changé, pas que
 * la RPC est la porte. Ensemble ils ferment la boucle.
 */
describe("RPC set_call_up_visibility — refus non-staff + non-écriture", () => {
  it("playerA (non-staff) → 42501 et colonne event inchangée", async () => {
    const fx = getFixtures();
    // Reset baseline
    await setEventVisibility(fx.eventA, null);

    const c = await signInAs("playerA");
    const { error } = await c.rpc("set_call_up_visibility", {
      _scope: "event",
      _id: fx.eventA,
      _choice: "masked",
    });
    expect(error).not.toBeNull();
    expect(error?.code).toBe("42501");

    // Relecture admin : la colonne n'a pas bougé
    const { data: row } = await admin
      .from("events")
      .select("show_called_up_players_override")
      .eq("id", fx.eventA)
      .single();
    expect(row?.show_called_up_players_override).toBeNull();
  });

  it("coachB (staff d'un autre club) → 42501 sur teamA + colonne inchangée", async () => {
    const fx = getFixtures();
    await setTeamVisibility(fx.teamA, null);

    const c = await signInAs("coachB");
    const { error } = await c.rpc("set_call_up_visibility", {
      _scope: "team",
      _id: fx.teamA,
      _choice: "masked",
    });
    expect(error).not.toBeNull();
    expect(error?.code).toBe("42501");

    const { data: row } = await admin
      .from("teams")
      .select("show_called_up_players_override")
      .eq("id", fx.teamA)
      .single();
    expect(row?.show_called_up_players_override).toBeNull();
  });

  it("club scope rejette 'inherit' avec 22023 (racine de cascade, colonne NOT NULL)", async () => {
    const fx = getFixtures();
    const c = await signInAs("adminA");
    const { error } = await c.rpc("set_call_up_visibility", {
      _scope: "club",
      _id: fx.clubA,
      _choice: "inherit",
    });
    expect(error).not.toBeNull();
    expect(error?.code).toBe("22023");
  });
});

/**
 * Round-trip write→read : prouve que les deux RPC gardées, écrites en miroir,
 * partagent effectivement le même modèle de cascade en conditions réelles.
 *
 * Staff pose team.override='masked' via l'écriture → la lecture event
 * (event en héritage) doit renvoyer effective=false, source='team'. Ce test
 * relie set_call_up_visibility et get_call_up_visibility_config au niveau
 * comportemental, pas juste au niveau syntaxique du bloc de garde copié.
 */
describe("Round-trip set → get : propagation team → event en héritage", () => {
  afterAll(async () => {
    const fx = getFixtures();
    await setTeamVisibility(fx.teamA, null);
    await setEventVisibility(fx.eventA, null);
    await setClubVisibility(fx.clubA, true);
  });

  it("coachA masque au niveau équipe → event en héritage lit effective=false, source='team'", async () => {
    const fx = getFixtures();
    // Baseline : event et team en héritage, club visible
    await setEventVisibility(fx.eventA, null);
    await setTeamVisibility(fx.teamA, null);
    await setClubVisibility(fx.clubA, true);

    const c = await signInAs("coachA");

    // Écriture team via la RPC gardée
    const { error: setErr } = await c.rpc("set_call_up_visibility", {
      _scope: "team",
      _id: fx.teamA,
      _choice: "masked",
    });
    expect(setErr).toBeNull();

    // Lecture event via la RPC gardée — la cascade doit remonter le team
    const { data, error: getErr } = await c.rpc("get_call_up_visibility_config", {
      _scope: "event",
      _id: fx.eventA,
    });
    expect(getErr).toBeNull();
    const row = Array.isArray(data) ? data[0] : data;
    expect(row).toBeTruthy();
    expect(row.event_override).toBeNull();
    expect(row.team_override).toBe(false);
    expect(row.club_default).toBe(true);
    expect(row.effective).toBe(false);
    expect(row.source).toBe("team");

    // Sanity check : le gate booléen public confirme aussi
    const { data: gate } = await c.rpc("call_up_list_visible", { p_event_id: fx.eventA });
    expect(gate).toBe(false);
  });

  it("puis coachA repasse à 'inherit' au niveau équipe → source retombe sur 'club'", async () => {
    const fx = getFixtures();
    const c = await signInAs("coachA");

    const { error: setErr } = await c.rpc("set_call_up_visibility", {
      _scope: "team",
      _id: fx.teamA,
      _choice: "inherit",
    });
    expect(setErr).toBeNull();

    // Relecture admin : NULL, pas false — inherit persiste bien comme absence d'override
    const { data: teamRow } = await admin
      .from("teams")
      .select("show_called_up_players_override")
      .eq("id", fx.teamA)
      .single();
    expect(teamRow?.show_called_up_players_override).toBeNull();

    // Et la cascade retombe sur le club
    const { data } = await c.rpc("get_call_up_visibility_config", {
      _scope: "event",
      _id: fx.eventA,
    });
    const row = Array.isArray(data) ? data[0] : data;
    expect(row.team_override).toBeNull();
    expect(row.effective).toBe(true);
    expect(row.source).toBe("club");
  });
});

