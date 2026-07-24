/**
 * wall_posts RLS — audience `team_staff` (Mur Staff d'équipe).
 *
 * Prouve la confidentialité du mur staff bout-en-bout : seuls les membres du
 * staff de l'équipe ciblée (coach/dirigeant d'équipe, admin/dirigeant du
 * club) peuvent lire les publications `team_staff` ; joueurs, parents et
 * coachs d'autres équipes sont exclus.
 *
 * Régression clef : un DIRIGEANT d'équipe (team_members.role='dirigeant',
 * pas admin/dirigeant du club) doit pouvoir PUBLIER un post team_staff.
 * Ce cas était cassé quand la RLS d'insertion utilisait `is_team_staff`
 * mais le trigger `wall_posts_validate_audience` utilisait `is_team_coach`.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { admin, SUPABASE_URL, SUPABASE_ANON_KEY } from "./_admin";
import { signInAs } from "./_clients";
import { getFixtures, PASSWORD } from "./_setup";

// Ad-hoc users created for this suite only.
type AdHoc = { email: string; userId: string };
let teamDirigeant: AdHoc; // dirigeant of teamA (team-level only)
let otherTeamCoach: AdHoc; // coach of a SECOND team in clubA
let teamA2: string; // second team in clubA
let postId: string | null = null;

async function createUser(label: string): Promise<AdHoc> {
  const email = `__rls_wall_staff_${label}_${Date.now().toString(36)}${Math.random()
    .toString(36)
    .slice(2, 6)}@clubero-rls.test`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(`createUser(${label}): ${error?.message}`);
  await admin
    .from("profiles")
    .upsert({ id: data.user.id, full_name: `RLS wall-staff ${label}` });
  return { email, userId: data.user.id };
}

async function signIn(user: AdHoc): Promise<SupabaseClient> {
  const c = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await c.auth.signInWithPassword({
    email: user.email,
    password: PASSWORD,
  });
  if (error) throw new Error(`sign-in ${user.email}: ${error.message}`);
  return c;
}

beforeAll(async () => {
  const fx = getFixtures();

  teamDirigeant = await createUser("dirigeant");
  otherTeamCoach = await createUser("othercoach");

  // Both users are ordinary club_members of clubA (parent role → NOT
  // admin/dirigeant of the club, so is_team_staff must go through the
  // team_members path to succeed).
  {
    const { error } = await admin.from("club_members").insert([
      {
        club_id: fx.clubA,
        user_id: teamDirigeant.userId,
        role: "parent",
        roles: ["parent"],
      },
      {
        club_id: fx.clubA,
        user_id: otherTeamCoach.userId,
        role: "parent",
        roles: ["parent"],
      },
    ]);
    if (error) throw new Error(`club_members ad-hoc: ${error.message}`);
  }

  // Second team in clubA → hosts otherTeamCoach; teamA (fixtures) hosts
  // teamDirigeant as dirigeant.
  {
    const { data, error } = await admin
      .from("teams")
      .insert({
        club_id: fx.clubA,
        name: `__rls_wall_staff_teamA2_${fx.runId}`,
        sport: "football",
      })
      .select("id")
      .single();
    if (error || !data) throw new Error(`teamA2 insert: ${error?.message}`);
    teamA2 = data.id;
  }

  {
    const { error } = await admin.from("team_members").insert([
      { team_id: fx.teamA, user_id: teamDirigeant.userId, role: "dirigeant" },
      { team_id: teamA2, user_id: otherTeamCoach.userId, role: "coach" },
    ]);
    if (error) throw new Error(`team_members ad-hoc: ${error.message}`);
  }
});

afterAll(async () => {
  if (postId) {
    await admin.from("wall_posts").delete().eq("id", postId);
  }
  if (teamA2) {
    await admin.from("team_members").delete().eq("team_id", teamA2);
    await admin.from("teams").delete().eq("id", teamA2);
  }
  const fx = getFixtures();
  const adhocIds = [teamDirigeant?.userId, otherTeamCoach?.userId].filter(Boolean) as string[];
  if (adhocIds.length) {
    await admin.from("team_members").delete().in("user_id", adhocIds).eq("team_id", fx.teamA);
    await admin.from("club_members").delete().in("user_id", adhocIds).eq("club_id", fx.clubA);
    for (const uid of adhocIds) {
      await admin.auth.admin.deleteUser(uid).catch(() => {});
    }
  }
});

describe("wall_posts RLS — audience team_staff (Mur Staff d'équipe)", () => {
  it("dirigeant d'équipe (team-level only) peut PUBLIER un post team_staff — régression trigger/RLS", async () => {
    const fx = getFixtures();
    const c = await signIn(teamDirigeant);
    const { data, error } = await c
      .from("wall_posts")
      .insert({
        club_id: fx.clubA,
        author_user_id: teamDirigeant.userId,
        body: "__rls_wall_staff_body",
        audience_type: "team_staff",
        audience_team_ids: [fx.teamA],
      })
      .select("id, audience_type")
      .single();

    expect(error, `insert should succeed for team dirigeant: ${error?.message ?? ""}`).toBeNull();
    expect(data?.audience_type).toBe("team_staff"); // trigger preserved it
    postId = data!.id;
  });

  it("coach de l'équipe → lit le post team_staff", async () => {
    const c = await signInAs("coachA");
    const { data, error } = await c.from("wall_posts").select("id").eq("id", postId!);
    expect(error).toBeNull();
    expect((data ?? []).map((r: any) => r.id)).toEqual([postId]);
  });

  it("admin du club → lit tous les murs staff du club", async () => {
    const c = await signInAs("adminA");
    const { data, error } = await c.from("wall_posts").select("id").eq("id", postId!);
    expect(error).toBeNull();
    expect((data ?? []).map((r: any) => r.id)).toEqual([postId]);
  });

  it("joueur de l'équipe → 0 ligne", async () => {
    const c = await signInAs("playerA");
    const { data, error } = await c.from("wall_posts").select("id").eq("id", postId!);
    expect(error).toBeNull();
    expect(data ?? []).toEqual([]);
  });

  it("parent d'un joueur de l'équipe → 0 ligne", async () => {
    const c = await signInAs("parentA");
    const { data, error } = await c.from("wall_posts").select("id").eq("id", postId!);
    expect(error).toBeNull();
    expect(data ?? []).toEqual([]);
  });

  it("coach d'une autre équipe du même club → 0 ligne", async () => {
    const c = await signIn(otherTeamCoach);
    const { data, error } = await c.from("wall_posts").select("id").eq("id", postId!);
    expect(error).toBeNull();
    expect(data ?? []).toEqual([]);
  });
});
