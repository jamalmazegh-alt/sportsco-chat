/**
 * LOT 2 — Helper pur : transforme `meeting_attendees.sources` en chips
 * dédupliquées (équipe / groupe / catégorie / audience club / ajout manuel).
 */
export type SourceDescriptor = {
  type?: string;
  group_id?: string;
  team_id?: string;
  category?: string;
};

export type ProvenanceChip = {
  key: string;
  kind: "team" | "group" | "category" | "club" | "manual" | "other";
  label: string;
};

export type ProvenanceNames = {
  groupNameById?: Record<string, string>;
  teamNameById?: Record<string, string>;
};

const TEAM_TYPES = new Set(["team_players", "team_parents", "team_educators"]);
const CLUB_TYPES = new Set([
  "club_members",
  "club_educators",
  "club_staff",
  "club_admins",
  "club_tournament_managers",
  "convoked_players",
  "convoked_parents",
]);

export function summarizeSources(
  sources: unknown,
  names: ProvenanceNames = {},
): ProvenanceChip[] {
  if (!Array.isArray(sources)) return [];
  const seen = new Set<string>();
  const chips: ProvenanceChip[] = [];
  for (const raw of sources) {
    const s = (raw ?? {}) as SourceDescriptor;
    const type = typeof s.type === "string" ? s.type : "";
    if (!type) continue;
    let chip: ProvenanceChip | null = null;
    if (type === "manual") {
      chip = { key: "manual", kind: "manual", label: "ajouté manuellement" };
    } else if (type === "creator") {
      chip = { key: "creator", kind: "manual", label: "organisateur" };
    } else if (TEAM_TYPES.has(type) && s.team_id) {
      chip = {
        key: `team:${s.team_id}`,
        kind: "team",
        label: names.teamNameById?.[s.team_id] ?? "équipe",
      };
    } else if (type === "club_group" && s.group_id) {
      chip = {
        key: `group:${s.group_id}`,
        kind: "group",
        label: names.groupNameById?.[s.group_id] ?? "groupe",
      };
    } else if (type === "category_educators" && s.category) {
      chip = { key: `cat:${s.category}`, kind: "category", label: s.category };
    } else if (CLUB_TYPES.has(type)) {
      chip = { key: `club:${type}`, kind: "club", label: "club" };
    } else {
      chip = { key: `other:${type}`, kind: "other", label: type };
    }
    if (chip && !seen.has(chip.key)) {
      seen.add(chip.key);
      chips.push(chip);
    }
  }
  return chips;
}
