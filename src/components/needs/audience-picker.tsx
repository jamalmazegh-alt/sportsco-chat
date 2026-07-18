/**
 * AudiencePicker — sélection d'audience partagée entre :
 *  - le dialog de création d'un besoin (avant publication)
 *  - le dialog de publication d'un besoin existant
 *
 * UX chips + ajout : reprend le pattern des « sous-groupes dynamiques »
 * de /admin/groups. L'utilisateur ajoute des critères un par un ; chaque
 * critère apparaît comme une puce colorée avec icône et bouton de retrait.
 */
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Users,
  UserRound,
  GraduationCap,
  Shield,
  ShieldCheck,
  Trophy,
  Flag,
  Tag,
  UsersRound,
  UserCheck,
  Plus,
  X,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  event_team_id?: string | null;
  event_category?: string | null;
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

export function useHydratedAudiences(
  eventId: string,
  buildAudiences: (id: string) => AudienceSelector[],
  deps: unknown[],
) {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => buildAudiences(eventId), [eventId, ...deps]);
}

/* ------------------------------------------------------------------ */
/* Kind registry — labels, icons, colors                              */
/* ------------------------------------------------------------------ */

type KindKey =
  | ScalarAudienceKey
  | "club_group"
  | TeamKind
  | "category_educators";

const KIND_META: Record<KindKey, { Icon: LucideIcon; cls: string }> = {
  convoked_players: {
    Icon: UserCheck,
    cls: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  },
  convoked_parents: {
    Icon: UserRound,
    cls: "border-violet-500/40 bg-violet-500/10 text-violet-700 dark:text-violet-300",
  },
  club_members: {
    Icon: Users,
    cls: "border-slate-500/40 bg-slate-500/10 text-slate-700 dark:text-slate-300",
  },
  club_educators: {
    Icon: GraduationCap,
    cls: "border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300",
  },
  club_staff: {
    Icon: Shield,
    cls: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  },
  club_admins: {
    Icon: ShieldCheck,
    cls: "border-red-500/40 bg-red-500/10 text-red-600 dark:text-red-300",
  },
  club_tournament_managers: {
    Icon: Trophy,
    cls: "border-orange-500/40 bg-orange-500/10 text-orange-700 dark:text-orange-300",
  },
  club_group: {
    Icon: UsersRound,
    cls: "border-fuchsia-500/40 bg-fuchsia-500/10 text-fuchsia-700 dark:text-fuchsia-300",
  },
  team_players: {
    Icon: Trophy,
    cls: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  },
  team_parents: {
    Icon: UserRound,
    cls: "border-violet-500/40 bg-violet-500/10 text-violet-700 dark:text-violet-300",
  },
  team_educators: {
    Icon: Flag,
    cls: "border-indigo-500/40 bg-indigo-500/10 text-indigo-700 dark:text-indigo-300",
  },
  category_educators: {
    Icon: Tag,
    cls: "border-teal-500/40 bg-teal-500/10 text-teal-700 dark:text-teal-300",
  },
};

function needsTeam(k: KindKey) {
  return k === "team_players" || k === "team_parents" || k === "team_educators";
}
function needsGroup(k: KindKey) {
  return k === "club_group";
}
function needsCategory(k: KindKey) {
  return k === "category_educators";
}

/* ------------------------------------------------------------------ */
/* Chip-based body                                                    */
/* ------------------------------------------------------------------ */

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
  const [kind, setKind] = useState<KindKey | "">("");
  const [param, setParam] = useState<string>("");

  const teamNameById = useMemo(
    () => new Map((ctx?.teams ?? []).map((tm) => [tm.id, tm])),
    [ctx?.teams],
  );
  const groupNameById = useMemo(
    () => new Map((ctx?.groups ?? []).map((g) => [g.id, g])),
    [ctx?.groups],
  );

  // Build the list of active chips from state
  type Chip = { id: string; kind: KindKey; label: string; onRemove: () => void };
  const chips: Chip[] = useMemo(() => {
    const list: Chip[] = [];
    for (const k of state.scalar) {
      list.push({
        id: `s-${k}`,
        kind: k,
        label: t(`needs:audiences.${k}`),
        onRemove: () => controls.toggleScalar(k),
      });
    }
    for (const gid of state.groupIds) {
      const g = groupNameById.get(gid);
      list.push({
        id: `g-${gid}`,
        kind: "club_group",
        label: `${t("needs:audiences.club_group")} · ${g?.name ?? gid}`,
        onRemove: () => controls.toggleGroup(gid),
      });
    }
    for (const tp of state.teamPicks) {
      const tm = teamNameById.get(tp.team_id);
      list.push({
        id: `t-${tp.team_id}-${tp.kind}`,
        kind: tp.kind,
        label: `${t(`needs:audiences.${tp.kind}`)} · ${tm?.name ?? tp.team_id}`,
        onRemove: () => controls.toggleTeam(tp.team_id, tp.kind),
      });
    }
    if (state.category.trim()) {
      const cat = state.category.trim();
      list.push({
        id: `c-${cat}`,
        kind: "category_educators",
        label: `${t("needs:audiences.category_educators")} · ${cat}`,
        onRemove: () => controls.setCategory(""),
      });
    }
    return list;
  }, [state, controls, t, teamNameById, groupNameById]);

  // Determine which kinds are available in the "kind" select
  const availableKinds = useMemo(() => {
    const kinds: KindKey[] = [];
    for (const opt of SCALAR_AUDIENCES) {
      if (!state.scalar.has(opt.key)) kinds.push(opt.key);
    }
    if (ctx && ctx.groups.length > 0) kinds.push("club_group");
    if (ctx && ctx.teams.length > 0) {
      kinds.push("team_players", "team_parents", "team_educators");
    }
    if (ctx && ctx.categories.length > 0 && !state.category) {
      kinds.push("category_educators");
    }
    return kinds;
  }, [ctx, state.scalar, state.category]);

  const kindLabel = (k: KindKey): string => {
    if (k === "club_group") return t("needs:audiences.club_group");
    return t(`needs:audiences.${k}`);
  };

  function canSubmit() {
    if (!kind) return false;
    if (needsTeam(kind) || needsGroup(kind) || needsCategory(kind)) return !!param;
    return true;
  }

  function submit() {
    if (!canSubmit() || !kind) return;
    if (kind === "club_group") controls.toggleGroup(param);
    else if (needsTeam(kind)) controls.toggleTeam(param, kind as TeamKind);
    else if (needsCategory(kind)) controls.setCategory(param);
    else controls.toggleScalar(kind as ScalarAudienceKey);
    setKind("");
    setParam("");
  }

  return (
    <div className="space-y-3">
      {/* Chips of currently selected audiences */}
      {chips.length === 0 ? (
        <p className="text-xs text-muted-foreground italic rounded-md border border-dashed p-3">
          {t("needs:audiences.emptyHint", {
            defaultValue:
              "Aucune audience sélectionnée. Ajoute au moins un critère ci-dessous.",
          })}
        </p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {chips.map((c) => {
            const { Icon, cls } = KIND_META[c.kind];
            return (
              <Badge
                key={c.id}
                variant="outline"
                className={`gap-1.5 py-1 pl-2 pr-1 ${cls}`}
              >
                <Icon className="h-3 w-3" />
                <span className="text-xs">{c.label}</span>
                <button
                  type="button"
                  className="ml-0.5 rounded hover:bg-muted p-0.5"
                  onClick={c.onRemove}
                  aria-label={t("common.remove", { defaultValue: "Retirer" })}
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            );
          })}
        </div>
      )}

      {/* Add row */}
      <div>
        <Label className="text-xs uppercase tracking-wide text-muted-foreground">
          {t("needs:audiences.addCriterion", {
            defaultValue: "Ajouter un critère",
          })}
        </Label>
        <div className="mt-1.5 grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-2">
          <Select
            value={kind}
            onValueChange={(v) => {
              setKind(v as KindKey);
              setParam("");
            }}
          >
            <SelectTrigger>
              <SelectValue
                placeholder={t("needs:audiences.pickKind", {
                  defaultValue: "Choisir un type…",
                })}
              />
            </SelectTrigger>
            <SelectContent>
              {availableKinds.map((k) => {
                const { Icon } = KIND_META[k];
                return (
                  <SelectItem key={k} value={k}>
                    <span className="inline-flex items-center gap-2">
                      <Icon className="h-3.5 w-3.5" />
                      {kindLabel(k)}
                    </span>
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>

          {kind && (needsTeam(kind) || needsGroup(kind) || needsCategory(kind)) ? (
            <Select value={param} onValueChange={setParam}>
              <SelectTrigger>
                <SelectValue
                  placeholder={t("needs:audiences.pickParam", {
                    defaultValue: "Choisir…",
                  })}
                />
              </SelectTrigger>
              <SelectContent>
                {needsGroup(kind) &&
                  (ctx?.groups ?? []).map((g) => (
                    <SelectItem key={g.id} value={g.id}>
                      {g.name}
                    </SelectItem>
                  ))}
                {needsTeam(kind) &&
                  (ctx?.teams ?? [])
                    .filter(
                      (tm) =>
                        !state.teamPicks.some(
                          (p) => p.team_id === tm.id && p.kind === kind,
                        ),
                    )
                    .map((tm) => (
                      <SelectItem key={tm.id} value={tm.id}>
                        {tm.name}
                        {tm.age_group ? ` · ${tm.age_group}` : ""}
                      </SelectItem>
                    ))}
                {needsCategory(kind) &&
                  (ctx?.categories ?? []).map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          ) : (
            <div />
          )}

          <Button
            type="button"
            size="sm"
            disabled={!canSubmit()}
            onClick={submit}
          >
            <Plus className="h-4 w-4 mr-1" />
            {t("common.add", { defaultValue: "Ajouter" })}
          </Button>
        </div>
        {ctx && ctx.groups.length === 0 && (
          <p className="mt-2 text-[11px] text-muted-foreground">
            {t("needs:publish.noGroups", {
              defaultValue:
                "Aucun groupe personnalisé actif. Crée-en dans Réglages → Groupes du club pour cibler une audience précise.",
            })}
          </p>
        )}
      </div>
    </div>
  );
}
