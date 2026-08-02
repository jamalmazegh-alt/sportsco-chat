/**
 * redeem_club_invite_v2 — idempotence du compteur + anti-claim identité.
 *
 * Couvre les deux durcissements de 20260802111813 :
 *  - uses_count n'incrémente qu'au premier rattachement club de l'appelant
 *  - une identité déjà liée à un autre compte est refusée (player_already_linked)
 */
import { describe, it, expect, afterAll } from "vitest";
import { admin } from "./_admin";
import { signInAs } from "./_clients";
import { getFixtures } from "./_setup";

const createdInviteIds: string[] = [];
const createdPlayerIds: string[] = [];
const profileBackups: Array<{
  userId: string;
  first_name: string | null;
  last_name: string | null;
}> = [];

function token() {
  return `rls_invite_${crypto.randomUUID().replace(/-/g, "")}`;
}

async function backupProfile(userId: string) {
  if (profileBackups.some((p) => p.userId === userId)) return;
  const { data } = await admin
    .from("profiles")
    .select("first_name, last_name")
    .eq("id", userId)
    .single();
  profileBackups.push({
    userId,
    first_name: data?.first_name ?? null,
    last_name: data?.last_name ?? null,
  });
}

async function setProfileName(userId: string, first: string, last: string) {
  await backupProfile(userId);
  const { error } = await admin
    .from("profiles")
    .update({ first_name: first, last_name: last })
    .eq("id", userId);
  if (error) throw new Error(`setProfileName: ${error.message}`);
}

async function readUses(inviteId: string) {
  const { data, error } = await admin
    .from("club_invites")
    .select("uses_count")
    .eq("id", inviteId)
    .single();
  expect(error).toBeNull();
  return data!.uses_count as number;
}

async function createTeamInvite(opts: { maxUses?: number | null; usesCount?: number } = {}) {
  const fx = getFixtures();
  const t = token();
  const { data, error } = await admin
    .from("club_invites")
    .insert({
      club_id: fx.clubA,
      team_id: fx.teamA,
      role: "player",
      token: t,
      created_by: fx.users.adminA.userId,
      max_uses: opts.maxUses === undefined ? null : opts.maxUses,
      uses_count: opts.usesCount ?? 0,
    })
    .select("id, token")
    .single();
  if (error || !data) throw new Error(`createTeamInvite: ${error?.message}`);
  createdInviteIds.push(data.id);
  return data as { id: string; token: string };
}

async function ensureNotMember(userId: string) {
  const fx = getFixtures();
  await admin.from("club_members").delete().eq("club_id", fx.clubA).eq("user_id", userId);
}

afterAll(async () => {
  const fx = getFixtures();
  for (const p of profileBackups) {
    await admin
      .from("profiles")
      .update({ first_name: p.first_name, last_name: p.last_name })
      .eq("id", p.userId);
  }
  for (const userId of [
    fx.users.parentUnlinkedA.userId,
    fx.users.playerB.userId,
    fx.users.coachB.userId,
  ]) {
    await admin.from("club_members").delete().eq("club_id", fx.clubA).eq("user_id", userId);
  }
  for (const id of createdPlayerIds) {
    await admin.from("team_members").delete().eq("player_id", id);
    await admin.from("player_parents").delete().eq("player_id", id);
    await admin.from("players").delete().eq("id", id);
  }
  for (const id of createdInviteIds) {
    await admin.from("club_invites").delete().eq("id", id);
  }
});

describe("redeem_club_invite_v2 uses_count", () => {
  it("n'incrémente uses_count qu'au premier redeem du même utilisateur", async () => {
    const fx = getFixtures();
    await ensureNotMember(fx.users.parentUnlinkedA.userId);
    await setProfileName(fx.users.parentUnlinkedA.userId, "Parent", "Unlinked");

    const invite = await createTeamInvite({ maxUses: 5 });
    const c = await signInAs("parentUnlinkedA");

    const first = await c.rpc("redeem_club_invite_v2", {
      _token: invite.token,
      _mode: "self",
      _birth_date: "2004-05-05",
    });
    expect(first.error).toBeNull();
    expect(await readUses(invite.id)).toBe(1);

    const second = await c.rpc("redeem_club_invite_v2", {
      _token: invite.token,
      _mode: "self",
      _birth_date: "2004-05-05",
    });
    expect(second.error).toBeNull();
    expect(await readUses(invite.id)).toBe(1);

    const { data: mine } = await admin
      .from("players")
      .select("id")
      .eq("club_id", fx.clubA)
      .eq("user_id", fx.users.parentUnlinkedA.userId);
    for (const row of mine ?? []) createdPlayerIds.push(row.id);
  });

  it("laisse un membre déjà présent rejouer un invite saturé", async () => {
    const fx = getFixtures();
    await setProfileName(fx.users.parentUnlinkedA.userId, "Parent", "Unlinked");
    // Garantir l'adhésion sans passer par un invite (indépendant du test précédent).
    await ensureNotMember(fx.users.parentUnlinkedA.userId);
    const { error: memErr } = await admin.from("club_members").insert({
      club_id: fx.clubA,
      user_id: fx.users.parentUnlinkedA.userId,
      role: "parent",
      roles: ["parent"],
    });
    if (memErr) throw new Error(`seed membership: ${memErr.message}`);

    const invite = await createTeamInvite({ maxUses: 1, usesCount: 1 });
    const c = await signInAs("parentUnlinkedA");
    const { error } = await c.rpc("redeem_club_invite_v2", {
      _token: invite.token,
      _mode: "self",
      _birth_date: "2004-05-05",
    });
    expect(error).toBeNull();
    expect(await readUses(invite.id)).toBe(1);

    await ensureNotMember(fx.users.playerB.userId);
    await setProfileName(fx.users.playerB.userId, "Out", "Sider");
    const outsider = await signInAs("playerB");
    const denied = await outsider.rpc("redeem_club_invite_v2", {
      _token: invite.token,
      _mode: "self",
      _birth_date: "2001-01-01",
    });
    expect(denied.error?.message).toMatch(/fully used/i);
  });
});

describe("redeem_club_invite_v2 identity match", () => {
  it("rattache une fiche roster sans user_id (pré-seed)", async () => {
    const fx = getFixtures();
    await ensureNotMember(fx.users.playerB.userId);

    const { data: orphan, error: oErr } = await admin
      .from("players")
      .insert({
        club_id: fx.clubA,
        first_name: "Orphan",
        last_name: "Roster",
        birth_date: "2010-07-07",
      })
      .select("id")
      .single();
    if (oErr || !orphan) throw new Error(oErr?.message);
    createdPlayerIds.push(orphan.id);

    await setProfileName(fx.users.playerB.userId, "Orphan", "Roster");
    const invite = await createTeamInvite();
    const c = await signInAs("playerB");
    const { error } = await c.rpc("redeem_club_invite_v2", {
      _token: invite.token,
      _mode: "self",
      _birth_date: "2010-07-07",
    });
    expect(error).toBeNull();

    const { data: linked } = await admin
      .from("players")
      .select("user_id")
      .eq("id", orphan.id)
      .single();
    expect(linked?.user_id).toBe(fx.users.playerB.userId);

    await ensureNotMember(fx.users.playerB.userId);
  });

  it("refuse de s'approprier une fiche déjà liée à un autre compte", async () => {
    const fx = getFixtures();
    await ensureNotMember(fx.users.coachB.userId);

    const { data: taken, error: tErr } = await admin
      .from("players")
      .insert({
        club_id: fx.clubA,
        user_id: fx.users.playerA.userId,
        first_name: "Already",
        last_name: "Owned",
        birth_date: "2011-08-08",
      })
      .select("id")
      .single();
    if (tErr || !taken) throw new Error(tErr?.message);
    createdPlayerIds.push(taken.id);

    await setProfileName(fx.users.coachB.userId, "Already", "Owned");
    const invite = await createTeamInvite();
    const c = await signInAs("coachB");
    const { error } = await c.rpc("redeem_club_invite_v2", {
      _token: invite.token,
      _mode: "self",
      _birth_date: "2011-08-08",
    });
    expect(error?.message).toMatch(/player_already_linked/i);

    const { data: still } = await admin
      .from("players")
      .select("user_id")
      .eq("id", taken.id)
      .single();
    expect(still?.user_id).toBe(fx.users.playerA.userId);

    // Membership may have been inserted before the identity check — clean it.
    await ensureNotMember(fx.users.coachB.userId);
  });
});
