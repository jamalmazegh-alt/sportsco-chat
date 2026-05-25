/**
 * createTestClub — returns a SeededClub scoped to the pre-existing E2E club.
 *
 * Without service_role we can't create auth users on the fly, so all "role"
 * slots (admin / coach / player1 / player2 / parent) reuse the SAME pre-created
 * E2E admin user. This means tests that strictly assert role boundaries (e.g.
 * "a coach cannot do X") will not be meaningful with this fixture — they
 * should be skipped or rewritten when full multi-user setup is restored.
 *
 * What we DO create per test suite (via RLS as admin):
 *   - 1 team scoped to the pre-existing club
 *   - 2 player records
 *   - team_members for those players
 *   - 1 future event
 *   - a player_parents row linking p2 → admin user as "parent"
 *
 * cleanup() deletes only the rows this fixture created, scoped by team_id /
 * club_id + prefix.
 */
import { admin, E2E_CLUB_NAME } from "./admin";

const PASSWORD = process.env.E2E_ADMIN_PASSWORD!;
const EMAIL = process.env.E2E_ADMIN_EMAIL!;

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

function resolveAdminUser(): SeededUser {
  const userId = process.env.E2E_ADMIN_USER_ID;
  if (!userId) {
    throw new Error(
      "E2E_ADMIN_USER_ID is missing — Playwright globalSetup must run first.",
    );
  }
  return { email: EMAIL, password: PASSWORD, userId };
}

function resolveClubId(): string {
  const id = process.env.E2E_CLUB_ID;
  if (!id) {
    throw new Error(
      `E2E_CLUB_ID is missing — globalSetup did not resolve club "${E2E_CLUB_NAME}".`,
    );
  }
  return id;
}

export async function createTestClub(suiteName = "suite"): Promise<SeededClub> {
  const runId = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const prefix = `__e2e_${suiteName}_${runId}`;

  const adminUser = resolveAdminUser();
  // All other "roles" reuse the same auth user. Tests strictly checking role
  // boundaries should skip when HAS_ADMIN_PRIVILEGES is false.
  const coachUser = adminUser;
  const playerUser1 = adminUser;
  const playerUser2 = adminUser;
  const parentUser = adminUser;

  const clubId = resolveClubId();

  // Create a team scoped to the pre-existing club.
  const { data: teamRow, error: teamErr } = await admin
    .from("teams")
    .insert({ club_id: clubId, name: `${prefix}_team`, sport: "football" })
    .select("id")
    .single();
  if (teamErr || !teamRow) throw new Error(`team insert: ${teamErr?.message}`);
  const teamId = teamRow.id;

  // Create 2 player records (no user_id link required for most flows).
  const { data: players, error: plErr } = await admin
    .from("players")
    .insert([
      { club_id: clubId, first_name: "Joueur1", last_name: prefix },
      { club_id: clubId, first_name: "Joueur2", last_name: prefix },
    ])
    .select("id");
  if (plErr || !players) throw new Error(`players insert: ${plErr?.message}`);
  const [p1, p2] = players;

  // Add admin user as coach of the team (so coach-only checks pass).
  // Ignore unique violations: admin may already be on the team.
  await admin
    .from("team_members")
    .insert([
      { team_id: teamId, user_id: adminUser.userId, role: "coach" },
      { team_id: teamId, player_id: p1.id, role: "player" },
      { team_id: teamId, player_id: p2.id, role: "player" },
    ])
    .select();

  // Link admin as "parent" of player 2 — purely structural, role boundary not tested.
  await admin
    .from("player_parents")
    .insert({
      player_id: p2.id,
      parent_user_id: parentUser.userId,
      can_respond: true,
    })
    .select();

  const future = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
  const { data: ev, error: evErr } = await admin
    .from("events")
    .insert({
      team_id: teamId,
      title: `${prefix}_match`,
      starts_at: future,
      type: "match",
      created_by: adminUser.userId,
      status: "published",
    })
    .select("id")
    .single();
  if (evErr || !ev) throw new Error(`event insert: ${evErr?.message}`);
  const eventId = ev.id;

  const cleanup = async () => {
    try {
      await admin.from("event_messages").delete().eq("event_id", eventId);
      await admin.from("event_goals").delete().eq("event_id", eventId);
      await admin.from("event_lineups").delete().eq("event_id", eventId);
      await admin.from("match_results").delete().eq("event_id", eventId);
      await admin.from("convocations").delete().eq("event_id", eventId);
      await admin.from("events").delete().eq("team_id", teamId);
      await admin.from("player_feedback").delete().in("player_id", [p1.id, p2.id]);
      await admin.from("player_reviews").delete().in("player_id", [p1.id, p2.id]);
      await admin.from("team_members").delete().eq("team_id", teamId);
      await admin.from("player_parents").delete().in("player_id", [p1.id, p2.id]);
      await admin.from("players").delete().in("id", [p1.id, p2.id]);
      await admin.from("teams").delete().eq("id", teamId);
      await admin
        .from("member_invites")
        .delete()
        .eq("club_id", clubId)
        .like("email", `%${prefix}%`);
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
