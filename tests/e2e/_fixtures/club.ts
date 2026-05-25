/**
 * createTestClub — returns a SeededClub scoped to the pre-existing E2E club.
 *
 * Uses the 4 pre-created E2E users (admin / coach / player / parent) when
 * available. When the coach/player/parent env vars are not provided, those
 * slots fall back to the admin user (see admin.ts → HAS_MULTI_ROLE_USERS).
 *
 * What we create per test suite (via RLS as admin):
 *   - 1 team scoped to the pre-existing club
 *   - 2 player records (player2 linked to the player user_id)
 *   - team_members for coach + both players
 *   - 1 future event
 *   - a player_parents row linking p2 → the parent user
 *
 * cleanup() deletes only the rows this fixture created, scoped by team_id /
 * player_id list.
 */
import {
  admin,
  E2E_ADMIN_EMAIL,
  E2E_ADMIN_PASSWORD,
  E2E_CLUB_NAME,
  E2E_COACH,
  E2E_PLAYER,
  E2E_PARENT,
} from "./admin";

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
  return { email: E2E_ADMIN_EMAIL, password: E2E_ADMIN_PASSWORD, userId };
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
  const coachUser: SeededUser = E2E_COACH;
  const playerUser: SeededUser = E2E_PLAYER;
  const parentUser: SeededUser = E2E_PARENT;

  const clubId = resolveClubId();

  // Per-suite team scoped to the pre-existing club.
  const { data: teamRow, error: teamErr } = await admin
    .from("teams")
    .insert({ club_id: clubId, name: `${prefix}_team`, sport: "football" })
    .select("id")
    .single();
  if (teamErr || !teamRow) throw new Error(`team insert: ${teamErr?.message}`);
  const teamId = teamRow.id;

  // 2 player records. Link player2 to the player user so RLS lets that
  // user respond to convocations etc. Player1 stays unlinked (used by
  // tests that only assert structural permissions).
  const { data: players, error: plErr } = await admin
    .from("players")
    .insert([
      {
        club_id: clubId,
        first_name: "Joueur1",
        last_name: prefix,
        user_id: playerUser.userId,
      },
      {
        club_id: clubId,
        first_name: "Joueur2",
        last_name: prefix,
        user_id: playerUser.userId,
      },
    ])
    .select("id");
  if (plErr || !players) throw new Error(`players insert: ${plErr?.message}`);
  const [p1, p2] = players;

  {
    await admin
      .from("team_members")
      .upsert(
        [
          { team_id: teamId, user_id: coachUser.userId, role: "coach" },
          { team_id: teamId, user_id: playerUser.userId, player_id: p1.id, role: "player" },
          { team_id: teamId, user_id: playerUser.userId, player_id: p2.id, role: "player" },
        ],
        { onConflict: "team_id,user_id" },
      )
      .throwOnError();
  }

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
    player1: { id: p1.id, user: playerUser },
    player2WithParent: { id: p2.id, user: playerUser, parent: parentUser },
    cleanup,
  };
}
