import type {
  AudienceState,
  ScalarAudienceKey,
  TeamKind,
} from "@/components/needs/audience-picker";

const SCALAR_KEYS: ScalarAudienceKey[] = [
  "convoked_players",
  "convoked_parents",
  "club_members",
  "club_educators",
  "club_staff",
  "club_admins",
  "club_tournament_managers",
];
const TEAM_KINDS = new Set(["team_players", "team_parents", "team_educators"]);

export type AttendeeForSelection = {
  user_id: string;
  full_name?: string | null;
  added_manually?: boolean | null;
  sources?: unknown;
};

/**
 * Reconstruit la sélection d'audiences (état du picker) à partir des convoqués
 * existants, pour pré-remplir « Gérer les convoqués » à l'édition.
 */
export function sourcesToSelection(
  attendees: readonly AttendeeForSelection[] | null | undefined,
): Partial<AudienceState> {
  const scalar = new Set<ScalarAudienceKey>();
  const groupIds = new Set<string>();
  const teamPicks: Array<{ team_id: string; kind: TeamKind }> = [];
  const teamSeen = new Set<string>();
  let category = "";
  const preassigned: Array<{ user_id: string; full_name: string | null }> = [];
  const preSeen = new Set<string>();

  for (const a of attendees ?? []) {
    if (a?.added_manually && a.user_id && !preSeen.has(a.user_id)) {
      preSeen.add(a.user_id);
      preassigned.push({ user_id: a.user_id, full_name: a.full_name ?? null });
    }
    const srcs = Array.isArray(a?.sources) ? (a!.sources as unknown[]) : [];
    for (const raw of srcs) {
      const s = (raw ?? {}) as {
        type?: string;
        group_id?: string;
        team_id?: string;
        category?: string;
      };
      const type = typeof s.type === "string" ? s.type : "";
      if (!type || type === "manual") continue;

      if (type === "club_group" && s.group_id) {
        groupIds.add(s.group_id);
      } else if (TEAM_KINDS.has(type) && s.team_id) {
        const key = `${type}:${s.team_id}`;
        if (!teamSeen.has(key)) {
          teamSeen.add(key);
          teamPicks.push({ team_id: s.team_id, kind: type as TeamKind });
        }
      } else if (type === "category_educators" && s.category) {
        if (!category) category = s.category;
      } else if ((SCALAR_KEYS as string[]).includes(type)) {
        scalar.add(type as ScalarAudienceKey);
      }
    }
  }

  return { scalar, groupIds, teamPicks, category, preassigned };
}
