/**
 * AudiencePicker — sélection d'audience partagée entre :
 *  - le dialog de création d'un besoin (avant publication)
 *  - le dialog de publication d'un besoin existant
 *
 * Cohérence UX : mêmes cases à cocher, mêmes groupes/équipes/catégories,
 * même hydratation de `event_id` pour les sélecteurs convoqués.
 */
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { AudienceSelector } from "@/modules/groups/groups.functions";

export type ScalarAudienceKey =
  | "convoked_players"
  | "convoked_parents"
  | "club_members"
  | "club_educators"
  | "club_staff"
  | "club_admins"
  | "club_tournament_managers";

export const SCALAR_AUDIENCES: { key: ScalarAudienceKey; needsEvent: boolean }[] = [
  { key: "convoked_players", needsEvent: true },
  { key: "convoked_parents", needsEvent: true },
  { key: "club_members", needsEvent: false },
  { key: "club_educators", needsEvent: false },
  { key: "club_staff", needsEvent: false },
  { key: "club_admins", needsEvent: false },
  { key: "club_tournament_managers", needsEvent: false },
];

export type TeamKind = "team_players" | "team_parents" | "team_educators";

export type AudienceCtx = {
  teams: { id: string; name: string; age_group?: string | null }[];
  groups: { id: string; name: string }[];
  categories: string[];
};

export type AudienceState = {
  scalar: Set<ScalarAudienceKey>;
  groupIds: Set<string>;
  teamPicks: Array<{ team_id: string; kind: TeamKind }>;
  category: string;
};

export function useAudienceState(
  defaults: Partial<AudienceState> = { scalar: new Set(["convoked_parents"]) },
) {
  const [scalar, setScalar] = useState<Set<ScalarAudienceKey>>(
    defaults.scalar ?? new Set(),
  );
  const [groupIds, setGroupIds] = useState<Set<string>>(defaults.groupIds ?? new Set());
  const [teamPicks, setTeamPicks] = useState<AudienceState["teamPicks"]>(
    defaults.teamPicks ?? [],
  );
  const [category, setCategory] = useState<string>(defaults.category ?? "");

  const toggleScalar = (k: ScalarAudienceKey) => {
    const next = new Set(scalar);
    if (next.has(k)) next.delete(k);
    else next.add(k);
    setScalar(next);
  };
  const toggleGroup = (id: string) => {
    const next = new Set(groupIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setGroupIds(next);
  };
  const toggleTeam = (team_id: string, kind: TeamKind) => {
    setTeamPicks((prev) => {
      const has = prev.find((p) => p.team_id === team_id && p.kind === kind);
      if (has) return prev.filter((p) => !(p.team_id === team_id && p.kind === kind));
      return [...prev, { team_id, kind }];
    });
  };

  const buildAudiences = (eventId: string): AudienceSelector[] => {
    const list: AudienceSelector[] = [];
    for (const key of scalar) {
      const opt = SCALAR_AUDIENCES.find((o) => o.key === key)!;
      if (opt.needsEvent) list.push({ type: key, event_id: eventId } as AudienceSelector);
      else list.push({ type: key } as AudienceSelector);
    }
    for (const gid of groupIds) list.push({ type: "club_group", group_id: gid });
    for (const tp of teamPicks) list.push({ type: tp.kind, team_id: tp.team_id });
    if (category.trim()) list.push({ type: "category_educators", category: category.trim() });
    return list;
  };

  return {
    state: { scalar, groupIds, teamPicks, category },
    controls: { toggleScalar, toggleGroup, toggleTeam, setCategory },
    buildAudiences,
  };
}

export function useHydratedAudiences(eventId: string, buildAudiences: (id: string) => AudienceSelector[], deps: unknown[]) {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => buildAudiences(eventId), [eventId, ...deps]);
}

export function AudiencePickerBody({
  ctx,
  state,
  controls,
}: {
  ctx: AudienceCtx | null | undefined;
  state: AudienceState;
  controls: {
    toggleScalar: (k: ScalarAudienceKey) => void;
    toggleGroup: (id: string) => void;
    toggleTeam: (id: string, kind: TeamKind) => void;
    setCategory: (v: string) => void;
  };
}) {
  const { t } = useTranslation();

  return (
    <div className="space-y-4">
      {/* Scalars */}
      <div className="space-y-1.5">
        {SCALAR_AUDIENCES.map((opt) => (
          <label
            key={opt.key}
            className="flex items-center gap-2 cursor-pointer rounded-md border p-2 hover:bg-muted/40"
          >
            <Checkbox
              checked={state.scalar.has(opt.key)}
              onCheckedChange={() => controls.toggleScalar(opt.key)}
            />
            <span className="text-sm">{t(`needs:audiences.${opt.key}`)}</span>
          </label>
        ))}
      </div>

      {/* Club groups */}
      {ctx && (
        <div>
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">
            {t("needs:audiences.club_group")}
          </Label>
          {ctx.groups.length > 0 ? (
            <div className="mt-1.5 space-y-1">
              {ctx.groups.map((g) => (
                <label
                  key={g.id}
                  className="flex items-center gap-2 cursor-pointer rounded-md border p-2 hover:bg-muted/40"
                >
                  <Checkbox
                    checked={state.groupIds.has(g.id)}
                    onCheckedChange={() => controls.toggleGroup(g.id)}
                  />
                  <span className="text-sm">{g.name}</span>
                </label>
              ))}
            </div>
          ) : (
            <p className="mt-1.5 text-xs text-muted-foreground rounded-md border border-dashed p-2">
              {t("needs:publish.noGroups", {
                defaultValue:
                  "Aucun groupe personnalisé actif. Crée-en dans Réglages → Groupes du club pour cibler une audience précise.",
              })}
            </p>
          )}
        </div>
      )}

      {/* Teams */}
      {ctx && ctx.teams.length > 0 && (
        <div>
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">
            {t("needs:publish.chooseTeam")}
          </Label>
          <div className="mt-1.5 space-y-1.5">
            {ctx.teams.map((tm) => (
              <div key={tm.id} className="rounded-md border p-2">
                <p className="text-sm font-medium mb-1.5">{tm.name}</p>
                <div className="flex flex-wrap gap-3 text-xs">
                  {(["team_players", "team_parents", "team_educators"] as TeamKind[]).map(
                    (kind) => {
                      const active = state.teamPicks.some(
                        (p) => p.team_id === tm.id && p.kind === kind,
                      );
                      return (
                        <label
                          key={kind}
                          className="flex items-center gap-1.5 cursor-pointer"
                        >
                          <Checkbox
                            checked={active}
                            onCheckedChange={() => controls.toggleTeam(tm.id, kind)}
                          />
                          <span>{t(`needs:audiences.${kind}`)}</span>
                        </label>
                      );
                    },
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Categories */}
      {ctx && ctx.categories.length > 0 && (
        <div>
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">
            {t("needs:audiences.category_educators")}
          </Label>
          <Select
            value={state.category || "__none"}
            onValueChange={(v) => controls.setCategory(v === "__none" ? "" : v)}
          >
            <SelectTrigger className="mt-1.5">
              <SelectValue placeholder={t("needs:publish.chooseCategory")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none">—</SelectItem>
              {ctx.categories.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  );
}
