/**
 * Serveur — construction de la map user_id → MemberContext pour un ensemble
 * de user_ids d'un même club. Réutilisé par :
 *   - `searchClubMembersForAssignment` (dropdown pré-assignation)
 *   - `searchClubMembersForNeed` (dropdown recherche membre pour un besoin)
 *   - `listClubMembersWithContext` (liste /admin/groups)
 *   - `listEventNeeds` (enrichissement confirmed_signups pour le staff)
 *
 * Confidentialité :
 *   - Ne PAS appeler cette fonction pour des payloads exposés à un non-staff.
 *   - Les enfants sont exposés avec « prénom + initiale » uniquement.
 */
import type { MemberContext } from "./member-context";

// Le supabaseAdmin étant chargé dynamiquement, on l'accepte en any (SupabaseClient
// générique) plutôt que d'imposer un import statique server-only ici.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AdminClient = any;

type MemberRow = {
  user_id: string | null;
  roles: string[] | null;
  role: string | null;
};

function pickPrimary(roles: string[]): string | null {
  const set = new Set(roles.map((r) => (r ?? "").toLowerCase()).filter(Boolean));
  const order = [
    "admin",
    "owner",
    "coach",
    "assistant_coach",
    "tournament_manager",
    "staff",
    "dirigeant",
    "parent",
    "player",
  ];
  for (const r of order) if (set.has(r)) return r;
  return roles[0] ?? null;
}

export function computePrimaryRole(
  roles: string[] | null | undefined,
  role: string | null | undefined,
): string | null {
  const merged = [...(roles ?? []), ...(role ? [role] : [])].filter(Boolean);
  return pickPrimary(Array.from(new Set(merged)));
}

export async function buildMemberContextByUser(
  supabaseAdmin: AdminClient,
  clubId: string,
  members: MemberRow[],
): Promise<Map<string, MemberContext>> {
  const userIds = Array.from(
    new Set(members.map((m) => m.user_id).filter((u): u is string => !!u)),
  );
  const out = new Map<string, MemberContext>();
  if (userIds.length === 0) return out;

  // Teams of this club (age_group lookup).
  const { data: clubTeams } = await supabaseAdmin
    .from("teams")
    .select("id, name, age_group")
    .eq("club_id", clubId);
  const teamById = new Map<string, { name: string; age_group: string | null }>(
    (clubTeams ?? []).map((t: { id: string; name: string | null; age_group: string | null }) => [
      t.id,
      { name: t.name ?? "", age_group: t.age_group ?? null },
    ]),
  );
  const clubTeamIds = Array.from(teamById.keys());

  // team_members (joueur + coach) restreint aux équipes du club.
  const { data: tmRows } =
    clubTeamIds.length && userIds.length
      ? await supabaseAdmin
          .from("team_members")
          .select("team_id, user_id, role")
          .in("team_id", clubTeamIds)
          .in("user_id", userIds)
      : { data: [] as Array<{ team_id: string; user_id: string; role: string }> };

  const playerTeamsByUser = new Map<string, Set<string>>();
  const coachTeamsByUser = new Map<string, Set<string>>();
  for (const r of (tmRows ?? []) as Array<{
    team_id: string | null;
    user_id: string | null;
    role: string | null;
  }>) {
    const uid = r.user_id;
    const tid = r.team_id;
    const rl = (r.role ?? "").toLowerCase();
    if (!uid || !tid) continue;
    if (rl === "player" || rl === "joueur") {
      if (!playerTeamsByUser.has(uid)) playerTeamsByUser.set(uid, new Set());
      playerTeamsByUser.get(uid)!.add(tid);
    } else if (
      rl === "head_coach" ||
      rl === "coach" ||
      rl === "assistant_coach" ||
      rl === "educator"
    ) {
      if (!coachTeamsByUser.has(uid)) coachTeamsByUser.set(uid, new Set());
      coachTeamsByUser.get(uid)!.add(tid);
    }
  }

  // Union additionnelle : joueurs présents dans `players` (user_id) mais
  // éventuellement absents de `team_members` avec role='player'. On aligne
  // ainsi la résolution de la catégorie d'un joueur sur la même source que
  // celle utilisée pour les enfants (players → team_members via player_id).
  const { data: playerRows } = await supabaseAdmin
    .from("players")
    .select("id, user_id")
    .eq("club_id", clubId)
    .in("user_id", userIds)
    .is("deleted_at", null);
  const playerIdByUser = new Map<string, string>();
  const playerUserIds: string[] = [];
  for (const p of (playerRows ?? []) as Array<{
    id: string | null;
    user_id: string | null;
  }>) {
    if (p.id && p.user_id && !playerIdByUser.has(p.user_id)) {
      playerIdByUser.set(p.user_id, p.id);
      playerUserIds.push(p.id);
    }
  }
  console.log("DBG playerUserIds", playerUserIds, "playerIdByUser", Array.from(playerIdByUser.entries()));if (playerUserIds.length > 0) {
    const { data: playerTm } = await supabaseAdmin
      .from("team_members")
      .select("player_id, team_id")
      .in("player_id", playerUserIds);
    const teamsByPlayerId = new Map<string, Set<string>>();
    for (const r of (playerTm ?? []) as Array<{
      player_id: string | null;
      team_id: string | null;
    }>) {
      if (!r.player_id || !r.team_id) continue;
      if (!teamsByPlayerId.has(r.player_id))
        teamsByPlayerId.set(r.player_id, new Set());
      teamsByPlayerId.get(r.player_id)!.add(r.team_id);
    }
    console.log("DBG teamsByPlayerId", Array.from(teamsByPlayerId.entries()).map(([k,v])=>[k,Array.from(v)]));for (const [uid, pid] of playerIdByUser.entries()) {
      const tset = teamsByPlayerId.get(pid);
      if (!tset) continue;
      if (!playerTeamsByUser.has(uid)) playerTeamsByUser.set(uid, new Set());
      const target = playerTeamsByUser.get(uid)!;
      for (const t of tset) target.add(t);
    }
  }

  // Parents → enfants.
  const { data: parentLinks } = await supabaseAdmin
    .from("player_parents")
    .select("parent_user_id, player_id")
    .in("parent_user_id", userIds);

  const childrenByParent = new Map<string, string[]>();
  const allChildIds = new Set<string>();
  for (const pl of (parentLinks ?? []) as Array<{
    parent_user_id: string;
    player_id: string;
  }>) {
    const uid = pl.parent_user_id;
    const pid = pl.player_id;
    if (!uid || !pid) continue;
    if (!childrenByParent.has(uid)) childrenByParent.set(uid, []);
    childrenByParent.get(uid)!.push(pid);
    allChildIds.add(pid);
  }

  const childInfo = new Map<string, { name: string; team_id: string | null }>();
  if (allChildIds.size > 0) {
    const ids = Array.from(allChildIds);
    const { data: ps } = await supabaseAdmin
      .from("players")
      .select("id, first_name, last_name")
      .in("id", ids)
      .is("deleted_at", null);
    const { data: childTm } = await supabaseAdmin
      .from("team_members")
      .select("player_id, team_id")
      .in("player_id", ids);
    const teamByPlayer = new Map<string, string>();
    for (const r of (childTm ?? []) as Array<{
      player_id: string | null;
      team_id: string | null;
    }>) {
      if (r.player_id && r.team_id && !teamByPlayer.has(r.player_id)) {
        teamByPlayer.set(r.player_id, r.team_id);
      }
    }
    for (const p of (ps ?? []) as Array<{
      id: string;
      first_name: string | null;
      last_name: string | null;
    }>) {
      const fn = p.first_name ?? "";
      const ln = p.last_name ?? "";
      const initial = ln ? ` ${ln.charAt(0).toUpperCase()}.` : "";
      childInfo.set(p.id, {
        name: `${fn}${initial}`.trim() || "—",
        team_id: teamByPlayer.get(p.id) ?? null,
      });
    }
  }

  for (const m of members) {
    const uid = m.user_id;
    if (!uid) continue;
    const primary = computePrimaryRole(m.roles, m.role);

    let playerCategories: string[] = [];
    let children: Array<{ name: string; category: string | null }> = [];
    let coached: Array<{ name: string; age_group: string | null }> = [];

    console.log("DBG member",uid,"primary",primary,"playerTeamsByUser",Array.from(playerTeamsByUser.entries()).map(([k,v])=>[k,Array.from(v)]),"teamById",Array.from(teamById.entries()));if (primary === "player") {
      const tids = playerTeamsByUser.get(uid);
      if (tids) {
        const cats = Array.from(tids)
          .map((tid) => teamById.get(tid)?.age_group)
          .filter((c): c is string => !!c);
        playerCategories = Array.from(new Set(cats));
      }
    }
    if (primary === "parent" || (!primary && childrenByParent.has(uid))) {
      const pids = childrenByParent.get(uid) ?? [];
      children = pids
        .map((pid) => {
          const info = childInfo.get(pid);
          if (!info) return null;
          const cat = info.team_id
            ? teamById.get(info.team_id)?.age_group ?? null
            : null;
          return { name: info.name, category: cat };
        })
        .filter((c): c is { name: string; category: string | null } => !!c);
    }
    if (primary === "coach" || primary === "assistant_coach") {
      const tids = coachTeamsByUser.get(uid);
      if (tids) {
        coached = Array.from(tids)
          .map((tid) => teamById.get(tid))
          .filter((t): t is { name: string; age_group: string | null } => !!t)
          .map((t) => ({ name: t.name, age_group: t.age_group }));
      }
    }

    out.set(uid, {
      primary_role: primary,
      player_category: playerCategories[0] ?? null,
      player_categories: playerCategories,
      children,
      coached_teams: coached,
    });
  }

  return out;
}
