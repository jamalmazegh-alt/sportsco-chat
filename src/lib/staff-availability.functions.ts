import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const TeamCoachesInput = z.object({
  teamId: z.string().uuid(),
});

export type TeamCoachForAvailability = {
  user_id: string;
  full_name: string;
  role: string;
};

const STAFF_ROLES = new Set(["coach", "assistant_coach", "admin", "dirigeant"]);

function profileName(profile: {
  first_name?: string | null;
  last_name?: string | null;
  full_name?: string | null;
} | null | undefined): string {
  const p = profile;
  const built = `${p?.first_name ?? ""} ${p?.last_name ?? ""}`.trim();
  return built || p?.full_name || "—";
}

export const listTeamCoachesForAvailability = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => TeamCoachesInput.parse(data))
  .handler(async ({ data, context }): Promise<TeamCoachForAvailability[]> => {
    const { supabase, userId } = context;

    const { data: team, error: teamError } = await supabase
      .from("teams")
      .select("id, club_id")
      .eq("id", data.teamId)
      .maybeSingle();
    if (teamError || !team) return [];

    const [{ data: callerRows }, { data: hasClubStaffRole }, { data: canViewTeam }] = await Promise.all([
      supabase
        .from("team_members")
        .select("role")
        .eq("team_id", data.teamId)
        .eq("user_id", userId),
      (supabase as any).rpc("has_club_role_any", {
        _user_id: userId,
        _club_id: team.club_id,
        _roles: ["admin", "dirigeant", "coach", "assistant_coach"],
      }),
      (supabase as any).rpc("can_view_team", {
        _user_id: userId,
        _team_id: data.teamId,
      }),
    ]);

    const isTeamStaff = (callerRows ?? []).some((row: { role: string }) =>
      STAFF_ROLES.has(String(row.role)),
    );
    if (!isTeamStaff && !hasClubStaffRole && !canViewTeam) return [];

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("team_members")
      .select("user_id, role")
      .eq("team_id", data.teamId)
      .not("user_id", "is", null);
    if (error) throw error;

    const staffRows = (rows ?? []).filter(
      (row) => Boolean(row.user_id) && STAFF_ROLES.has(String(row.role)),
    );
    const ids = [...new Set(staffRows.map((row) => row.user_id))];
    if (ids.length === 0) return [];

    const { data: profiles, error: profilesError } = await supabaseAdmin
      .from("profiles")
      .select("id, first_name, last_name, full_name")
      .in("id", ids);
    if (profilesError) throw profilesError;

    const profilesById = new Map((profiles ?? []).map((profile) => [profile.id, profile]));
    const seen = new Set<string>();
    return staffRows
      .filter((row) => {
        if (seen.has(row.user_id)) return false;
        seen.add(row.user_id);
        return true;
      })
      .map((row) => ({
        user_id: row.user_id,
        full_name: profileName(profilesById.get(row.user_id)),
        role: String(row.role),
      }))
      .sort((a, b) => a.full_name.localeCompare(b.full_name));
  });