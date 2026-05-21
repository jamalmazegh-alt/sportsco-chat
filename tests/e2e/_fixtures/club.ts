/**
 * createTestClub — bootstraps an isolated club with admin + coach + 2 players
 * (one with a parent) and 1 future event. Returns ids + a cleanup() function.
 *
 * Every E2E test should create its own club via this helper to stay isolated.
 */
import { admin } from "./admin";

const PASSWORD = "Clubero-E2E-Passw0rd!";

export type SeededUser = {
  email: string;
  password: string;
  userId: string;
};

export type SeededClub = {
  runId: string;
  prefix: string;
  clubId: string;
  teamId: string;
  eventId: string;
  admin: SeededUser;
  coach: SeededUser;
  player1: { id: string; user: SeededUser };
  player2WithParent: {
    id: string;
    user: SeededUser;
    parent: SeededUser;
  };
  cleanup: () => Promise<void>;
};

async function mkUser(prefix: string, label: string): Promise<SeededUser> {
  const email = `${prefix}_${label}@clubero-e2e.test`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { e2e_run: prefix, role: label },
  });
  if (error || !data.user) {
    throw new Error(`createUser(${label}): ${error?.message ?? "no user"}`);
  }
  return { email, password: PASSWORD, userId: data.user.id };
}

export async function createTestClub(suiteName = "suite"): Promise<SeededClub> {
  const runId = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const prefix = `__e2e_${suiteName}_${runId}`;

  const adminUser = await mkUser(prefix, "admin");
  const coachUser = await mkUser(prefix, "coach");
  const playerUser1 = await mkUser(prefix, "p1");
  const playerUser2 = await mkUser(prefix, "p2");
  const parentUser = await mkUser(prefix, "parent");

  await admin.from("profiles").upsert([
    { id: adminUser.userId, full_name: `${prefix} admin`, first_name: "Admin", last_name: prefix },
    { id: coachUser.userId, full_name: `${prefix} coach`, first_name: "Coach", last_name: prefix },
    { id: playerUser1.userId, full_name: `${prefix} p1`, first_name: "Joueur1", last_name: prefix },
    { id: playerUser2.userId, full_name: `${prefix} p2`, first_name: "Joueur2", last_name: prefix },
    { id: parentUser.userId, full_name: `${prefix} parent`, first_name: "Parent", last_name: prefix },
  ]);

  const { data: clubRow, error: clubErr } = await admin
    .from("clubs")
    .insert({ name: `${prefix}_club`, created_by: adminUser.userId })
    .select("id")
    .single();
  if (clubErr || !clubRow) throw new Error(`club insert: ${clubErr?.message}`);
  const clubId = clubRow.id;

  await admin.from("club_members").insert([
    { club_id: clubId, user_id: adminUser.userId, role: "admin" },
    { club_id: clubId, user_id: coachUser.userId, role: "coach" },
    { club_id: clubId, user_id: playerUser1.userId, role: "player" },
    { club_id: clubId, user_id: playerUser2.userId, role: "player" },
    { club_id: clubId, user_id: parentUser.userId, role: "parent" },
  ]);

  const { data: teamRow, error: teamErr } = await admin
    .from("teams")
    .insert({ club_id: clubId, name: `${prefix}_team`, sport: "football" })
    .select("id")
    .single();
  if (teamErr || !teamRow) throw new Error(`team insert: ${teamErr?.message}`);
  const teamId = teamRow.id;

  const { data: players, error: plErr } = await admin
    .from("players")
    .insert([
      { club_id: clubId, first_name: "Joueur1", last_name: prefix, user_id: playerUser1.userId },
      { club_id: clubId, first_name: "Joueur2", last_name: prefix, user_id: playerUser2.userId },
    ])
    .select("id");
  if (plErr || !players) throw new Error(`players insert: ${plErr?.message}`);
  const [p1, p2] = players;

  await admin.from("team_members").insert([
    { team_id: teamId, user_id: coachUser.userId, role: "coach" },
    { team_id: teamId, user_id: playerUser1.userId, player_id: p1.id, role: "player" },
    { team_id: teamId, user_id: playerUser2.userId, player_id: p2.id, role: "player" },
  ]);

  await admin.from("player_parents").insert({
    player_id: p2.id,
    parent_user_id: parentUser.userId,
    can_respond: true,
  });

  const future = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
  const { data: ev, error: evErr } = await admin
    .from("events")
    .insert({
      team_id: teamId,
      title: `${prefix}_match`,
      starts_at: future,
      type: "match",
      created_by: coachUser.userId,
      status: "published",
    })
    .select("id")
    .single();
  if (evErr || !ev) throw new Error(`event insert: ${evErr?.message}`);
  const eventId = ev.id;

  const cleanup = async () => {
    // Order matters: children → parents
    try {
      await admin.from("event_messages").delete().eq("event_id", eventId);
      await admin.from("event_goals").delete().eq("event_id", eventId);
      await admin.from("event_lineups").delete().eq("event_id", eventId);
      await admin.from("match_results").delete().eq("event_id", eventId);
      await admin.from("convocations").delete().eq("event_id", eventId);
      await admin.from("reminders").delete().in("convocation_id", []).select(); // best-effort
      await admin.from("events").delete().eq("team_id", teamId);
      await admin.from("player_feedback").delete().eq("club_id", clubId);
      await admin.from("player_reviews").delete().eq("club_id", clubId);
      await admin.from("team_members").delete().eq("team_id", teamId);
      await admin.from("player_parents").delete().eq("parent_user_id", parentUser.userId);
      await admin.from("players").delete().eq("club_id", clubId);
      await admin.from("teams").delete().eq("club_id", clubId);
      await admin.from("member_invites").delete().eq("club_id", clubId);
      await admin.from("club_invites").delete().eq("club_id", clubId);
      await admin.from("audit_logs").delete().eq("club_id", clubId);
      await admin.from("notifications").delete().in("user_id", [
        adminUser.userId,
        coachUser.userId,
        playerUser1.userId,
        playerUser2.userId,
        parentUser.userId,
      ]);
      await admin.from("support_messages").delete().in("sender_id", [
        adminUser.userId,
        coachUser.userId,
      ]);
      await admin.from("support_tickets").delete().in("user_id", [
        adminUser.userId,
        coachUser.userId,
      ]);
      await admin.from("subscriptions").delete().eq("club_id", clubId);
      await admin.from("club_members").delete().eq("club_id", clubId);
      await admin.from("clubs").delete().eq("id", clubId);

      const userIds = [
        adminUser.userId,
        coachUser.userId,
        playerUser1.userId,
        playerUser2.userId,
        parentUser.userId,
      ];
      await admin.from("profiles").delete().in("id", userIds);
      for (const uid of userIds) {
        await admin.auth.admin.deleteUser(uid).catch(() => {});
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn(`[e2e cleanup] ${prefix}:`, (e as Error).message);
    }
  };

  return {
    runId,
    prefix,
    clubId,
    teamId,
    eventId,
    admin: adminUser,
    coach: coachUser,
    player1: { id: p1.id, user: playerUser1 },
    player2WithParent: { id: p2.id, user: playerUser2, parent: parentUser },
    cleanup,
  };
}
