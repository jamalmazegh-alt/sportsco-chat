import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import i18nInstance from "@/lib/i18n";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Loader2,
  Plus,
  Pencil,
  Trash2,
  UsersRound,
  UserPlus,
  X,
  Search,
  ChevronDown,
  ChevronRight,
  Layers,
  ShieldCheck,
  Shield,
  GraduationCap,
  Users,
  Trophy,
  UserRound,
  Flag,
  Tag,
  type LucideIcon,
} from "lucide-react";
import { useAuth, useMyRoles } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  listClubGroups,
  createClubGroup,
  updateClubGroup,
  deleteClubGroup,
  listClubGroupMembers,
  addClubGroupMember,
  removeClubGroupMember,
  listClubGroupRules,
  addClubGroupRule,
  removeClubGroupRule,
  getGroupResolvedCount,
  previewAudienceCount,
  previewGroupRuleDetails,
  type ClubGroupRuleType,
  type AudienceSelector,
} from "@/modules/groups/groups.functions";



export const Route = createFileRoute("/_authenticated/admin/groups")({
  component: GroupsPage,
  head: () => ({
    meta: [
      {
        title: i18nInstance.t("groups.title", { defaultValue: "Groupes du club" }),
      },
      {
        name: "description",
        content: i18nInstance.t("groups.subtitle", {
          defaultValue:
            "Créez des groupes personnalisés pour cibler vos communications.",
        }),
      },
    ],
  }),
});

type ClubMemberRow = {
  id: string;
  user_id: string;
  role: string | null;
  roles: string[];
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
  children_names?: string[];
};


type TeamRow = {
  id: string;
  name: string;
  age_group: string | null;
  sport: string | null;
};

type GroupRow = {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  created_by: string | null;
};

function displayName(m: {
  full_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
}) {
  return (
    m.full_name?.trim() ||
    [m.first_name, m.last_name].filter(Boolean).join(" ").trim() ||
    "—"
  );
}

function useRoleLabel() {
  const { t } = useTranslation();
  return (role: string | null) => {
    if (!role) return null;
    return t(`roles.${role}`, { defaultValue: role });
  };
}

const ROLE_COLORS: Record<string, string> = {
  admin:
    "bg-red-100 text-red-800 border-red-200 dark:bg-red-900/40 dark:text-red-200 dark:border-red-800/60",
  coach:
    "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/40 dark:text-blue-200 dark:border-blue-800/60",
  assistant_coach:
    "bg-sky-100 text-sky-800 border-sky-200 dark:bg-sky-900/40 dark:text-sky-200 dark:border-sky-800/60",
  staff:
    "bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-900/40 dark:text-purple-200 dark:border-purple-800/60",
  dirigeant:
    "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/40 dark:text-amber-200 dark:border-amber-800/60",
  tournament_manager:
    "bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-900/40 dark:text-orange-200 dark:border-orange-800/60",
  financial_admin:
    "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-200 dark:border-emerald-800/60",
  player:
    "bg-teal-100 text-teal-800 border-teal-200 dark:bg-teal-900/40 dark:text-teal-200 dark:border-teal-800/60",
  parent:
    "bg-pink-100 text-pink-800 border-pink-200 dark:bg-pink-900/40 dark:text-pink-200 dark:border-pink-800/60",
};

function RoleBadges({
  roles,
  fallback,
}: {
  roles: string[] | null | undefined;
  fallback: string | null;
}) {
  const { t } = useTranslation();
  const list = (roles && roles.length > 0 ? roles : fallback ? [fallback] : []).filter(
    (r, i, arr) => r && arr.indexOf(r) === i,
  );
  if (list.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1 shrink-0">
      {list.map((r) => (
        <Badge
          key={r}
          variant="outline"
          className={`text-[10px] border ${ROLE_COLORS[r] ?? "bg-muted text-muted-foreground border-border"}`}
        >
          {t(`roles.${r}`, { defaultValue: r })}
        </Badge>
      ))}
    </div>
  );
}

function ParentSubtitle({ children_names }: { children_names?: string[] | null }) {
  const { t } = useTranslation();
  if (!children_names || children_names.length === 0) return null;
  return (
    <span className="text-xs text-muted-foreground truncate">
      {t("groups.parentOf", {
        defaultValue: "Parent de {{names}}",
        names: children_names.join(", "),
      })}
    </span>
  );
}

function GroupsPage() {
  const { t } = useTranslation();
  const { activeClubId } = useAuth();
  const roles = useMyRoles();
  const qc = useQueryClient();

  const listFn = useServerFn(listClubGroups);
  const createFn = useServerFn(createClubGroup);
  const updateFn = useServerFn(updateClubGroup);
  const deleteFn = useServerFn(deleteClubGroup);

  const [editing, setEditing] = useState<GroupRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const groupsQ = useQuery({
    queryKey: ["club-groups", activeClubId],
    queryFn: () => listFn({ data: { club_id: activeClubId! } }),
    enabled: !!activeClubId,
  });

  // Load all club members for the picker (RLS: staff can read).
  const membersQ = useQuery({
    queryKey: ["club-members-for-groups", activeClubId],
    enabled: !!activeClubId,
    queryFn: async (): Promise<ClubMemberRow[]> => {
      const { data: members, error } = await supabase
        .from("club_members")
        .select("id, user_id, role, roles")
        .eq("club_id", activeClubId!);
      if (error) throw error;
      const userIds = Array.from(
        new Set((members ?? []).map((m) => m.user_id).filter(Boolean)),
      );
      const { data: profiles } = userIds.length
        ? await supabase
            .from("profiles")
            .select("id, full_name, first_name, last_name")
            .in("id", userIds)
        : { data: [] as {
            id: string;
            full_name: string | null;
            first_name: string | null;
            last_name: string | null;
          }[] };
      const byId = new Map((profiles ?? []).map((p) => [p.id, p]));
      // For parents, fetch the children names
      const { data: pp } = userIds.length
        ? await supabase
            .from("player_parents")
            .select("parent_user_id, players:player_id(first_name, last_name)")
            .in("parent_user_id", userIds)
        : { data: [] as Array<{
            parent_user_id: string;
            players: { first_name: string | null; last_name: string | null } | null;
          }> };
      const childrenByParent = new Map<string, string[]>();
      for (const row of (pp ?? []) as Array<{
        parent_user_id: string;
        players: { first_name: string | null; last_name: string | null } | null;
      }>) {
        const name = [row.players?.first_name, row.players?.last_name]
          .filter(Boolean)
          .join(" ")
          .trim();
        if (!name) continue;
        const arr = childrenByParent.get(row.parent_user_id) ?? [];
        arr.push(name);
        childrenByParent.set(row.parent_user_id, arr);
      }
      return (members ?? []).map((m) => {
        const p = byId.get(m.user_id);
        return {
          id: m.id,
          user_id: m.user_id,
          role: m.role ?? null,
          roles: (m.roles ?? []) as string[],
          full_name: p?.full_name ?? null,
          first_name: p?.first_name ?? null,
          last_name: p?.last_name ?? null,
          children_names: childrenByParent.get(m.user_id) ?? [],
        };
      });

    },
  });

  // Load teams for the "bulk add from team/category" picker.
  const teamsQ = useQuery({
    queryKey: ["teams-for-groups", activeClubId],
    enabled: !!activeClubId,
    queryFn: async (): Promise<TeamRow[]> => {
      const { data, error } = await supabase
        .from("teams")
        .select("id, name, age_group, sport")
        .eq("club_id", activeClubId!)
        .is("deleted_at", null)
        .order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as TeamRow[];
    },
  });

  const invalidate = () =>
    qc.invalidateQueries({ queryKey: ["club-groups", activeClubId] });

  const createMut = useMutation({
    mutationFn: async (input: { name: string; description: string | null }) =>
      createFn({ data: { club_id: activeClubId!, ...input } }),
    onSuccess: () => {
      toast.success(t("groups.saved"));
      setCreating(false);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateMut = useMutation({
    mutationFn: async (input: {
      id: string;
      name?: string;
      description?: string | null;
      is_active?: boolean;
    }) => updateFn({ data: input }),
    onSuccess: () => {
      toast.success(t("groups.saved"));
      setEditing(null);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => {
      toast.success(t("groups.deleted"));
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!roles.includes("admin")) return <Navigate to="/profile" replace />;
  if (!activeClubId) return null;

  const allGroups = groupsQ.data?.groups ?? [];

  return (
    <div className="px-5 pt-4 pb-8 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <UsersRound className="h-5 w-5 text-primary" />
            {t("groups.title")}
          </h2>
          <p className="text-sm text-muted-foreground mt-1">{t("groups.subtitle")}</p>
        </div>
        <Button onClick={() => setCreating(true)} size="sm">
          <Plus className="h-4 w-4 mr-1" />
          {t("groups.create")}
        </Button>
      </div>

      {groupsQ.isLoading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : allGroups.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
          {t("groups.empty")}
        </div>
      ) : (
        <div className="space-y-2">
          {allGroups.map((g) => {
            const count = groupsQ.data?.counts[g.id] ?? 0;
            const expanded = expandedId === g.id;
            return (
              <div
                key={g.id}
                className="rounded-lg border border-border bg-card overflow-hidden"
              >
                <div className="flex items-center gap-2 p-3">
                  <button
                    className="p-1 -m-1 rounded hover:bg-muted/40"
                    onClick={() => setExpandedId(expanded ? null : g.id)}
                    aria-label={t("groups.manageMembers")}
                  >
                    {expanded ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                  </button>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium truncate">{g.name}</span>
                      {!g.is_active && (
                        <Badge variant="secondary" className="text-xs">
                          {t("groups.inactive")}
                        </Badge>
                      )}
                      <span className="text-xs text-muted-foreground">
                        · {t("groups.membersCount", { count })}
                      </span>
                    </div>
                    {g.description && (
                      <p className="text-xs text-muted-foreground truncate mt-0.5">
                        {g.description}
                      </p>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setEditing(g)}
                    aria-label={t("groups.edit")}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      if (window.confirm(t("groups.deleteConfirm"))) {
                        deleteMut.mutate(g.id);
                      }
                    }}
                    aria-label={t("groups.delete")}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
                {expanded && (
                  <GroupMembersPanel
                    groupId={g.id}
                    clubId={activeClubId}
                    allMembers={membersQ.data ?? []}
                    teams={teamsQ.data ?? []}

                  />
                )}
              </div>
            );
          })}
        </div>
      )}

      <GroupFormDialog
        open={creating}
        onClose={() => setCreating(false)}
        title={t("groups.create")}
        submitting={createMut.isPending}
        onSubmit={(v) => createMut.mutate(v)}
      />
      <GroupFormDialog
        open={!!editing}
        onClose={() => setEditing(null)}
        title={t("groups.edit")}
        initial={editing ?? undefined}
        submitting={updateMut.isPending}
        onSubmit={(v) =>
          editing && updateMut.mutate({ id: editing.id, ...v })
        }
        showActive
      />
    </div>
  );
}

function GroupFormDialog(props: {
  open: boolean;
  onClose: () => void;
  title: string;
  initial?: GroupRow;
  submitting?: boolean;
  showActive?: boolean;
  onSubmit: (v: {
    name: string;
    description: string | null;
    is_active?: boolean;
  }) => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState(props.initial?.name ?? "");
  const [description, setDescription] = useState(props.initial?.description ?? "");
  const [isActive, setIsActive] = useState(props.initial?.is_active ?? true);

  // Reset when opening with different initial.
  useMemo(() => {
    if (props.open) {
      setName(props.initial?.name ?? "");
      setDescription(props.initial?.description ?? "");
      setIsActive(props.initial?.is_active ?? true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.open, props.initial?.id]);

  return (
    <Dialog open={props.open} onOpenChange={(o) => !o && props.onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{props.title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="group-name">{t("groups.name")}</Label>
            <Input
              id="group-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("groups.namePlaceholder")}
              maxLength={120}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="group-desc">{t("groups.description")}</Label>
            <Textarea
              id="group-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t("groups.descriptionPlaceholder")}
              rows={3}
              maxLength={2000}
            />
          </div>
          {props.showActive && (
            <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
              <Label htmlFor="group-active" className="cursor-pointer">
                {t("groups.active")}
              </Label>
              <Switch id="group-active" checked={isActive} onCheckedChange={setIsActive} />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={props.onClose}>
            {t("common.cancel", { defaultValue: "Annuler" })}
          </Button>
          <Button
            disabled={!name.trim() || props.submitting}
            onClick={() =>
              props.onSubmit({
                name: name.trim(),
                description: description.trim() || null,
                ...(props.showActive ? { is_active: isActive } : {}),
              })
            }
          >
            {props.submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {t("common.save", { defaultValue: "Enregistrer" })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------- Dynamic rules ----------------

type RuleRow = {
  id: string;
  group_id: string;
  rule_type: ClubGroupRuleType;
  team_id: string | null;
  category: string | null;
  created_at: string;
};

const RULE_TYPES: ClubGroupRuleType[] = [
  "club_members",
  "club_staff",
  "club_admins",
  "club_educators",
  "team_players",
  "team_parents",
  "team_educators",
  "category_educators",
];

function needsTeam(t: ClubGroupRuleType) {
  return t === "team_players" || t === "team_parents" || t === "team_educators";
}
function needsCategory(t: ClubGroupRuleType) {
  return t === "category_educators";
}

function GroupMembersPanel({
  groupId,
  clubId,
  allMembers,
  teams,
}: {
  groupId: string;
  clubId: string;
  allMembers: ClubMemberRow[];
  teams: TeamRow[];
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const roleLabel = useRoleLabel();
  const listMembersFn = useServerFn(listClubGroupMembers);
  const addFn = useServerFn(addClubGroupMember);
  const removeFn = useServerFn(removeClubGroupMember);
  const listRulesFn = useServerFn(listClubGroupRules);
  const addRuleFn = useServerFn(addClubGroupRule);
  const removeRuleFn = useServerFn(removeClubGroupRule);
  const resolvedCountFn = useServerFn(getGroupResolvedCount);

  const [search, setSearch] = useState("");
  const [ruleType, setRuleType] = useState<ClubGroupRuleType | "">("");
  const [ruleParam, setRuleParam] = useState<string>("");
  const [previewRule, setPreviewRule] = useState<RuleRow | null>(null);

  const membersQ = useQuery({
    queryKey: ["club-group-members", groupId],
    queryFn: () => listMembersFn({ data: { group_id: groupId } }),
  });

  const rulesQ = useQuery({
    queryKey: ["club-group-rules", groupId],
    queryFn: () => listRulesFn({ data: { group_id: groupId } }),
  });

  const resolvedQ = useQuery({
    queryKey: ["club-group-resolved-count", groupId, rulesQ.data?.rules?.length ?? 0, membersQ.data?.members?.length ?? 0],
    queryFn: () => resolvedCountFn({ data: { club_id: clubId, group_id: groupId } }),
  });

  const currentMemberIds = useMemo(
    () => new Set((membersQ.data?.members ?? []).map((m) => m.member_id)),
    [membersQ.data],
  );

  const childrenByUserId = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const cm of allMembers) {
      if (cm.user_id && cm.children_names && cm.children_names.length > 0) {
        m.set(cm.user_id, cm.children_names);
      }
    }
    return m;
  }, [allMembers]);


  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ["club-group-members", groupId] });
    qc.invalidateQueries({ queryKey: ["club-group-rules", groupId] });
    qc.invalidateQueries({ queryKey: ["club-group-resolved-count", groupId] });
    qc.invalidateQueries({ queryKey: ["club-groups", clubId] });
  };

  const addMut = useMutation({
    mutationFn: (member_id: string) => addFn({ data: { group_id: groupId, member_id } }),
    onSuccess: () => {
      toast.success(t("groups.memberAdded"));
      invalidateAll();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const removeMut = useMutation({
    mutationFn: (member_id: string) =>
      removeFn({ data: { group_id: groupId, member_id } }),
    onSuccess: () => {
      toast.success(t("groups.memberRemoved"));
      invalidateAll();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const addRuleMut = useMutation({
    mutationFn: (input: {
      rule_type: ClubGroupRuleType;
      team_id: string | null;
      category: string | null;
    }) => addRuleFn({ data: { group_id: groupId, ...input } }),
    onSuccess: () => {
      toast.success(t("groups.ruleAdded", { defaultValue: "Règle ajoutée" }));
      setRuleType("");
      setRuleParam("");
      invalidateAll();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeRuleMut = useMutation({
    mutationFn: (id: string) => removeRuleFn({ data: { id } }),
    onSuccess: () => {
      toast.success(t("groups.ruleRemoved", { defaultValue: "Règle retirée" }));
      invalidateAll();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const candidates = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allMembers
      .filter((m) => !currentMemberIds.has(m.id))
      .filter((m) => !q || displayName(m).toLowerCase().includes(q))
      .slice(0, 20);
  }, [allMembers, currentMemberIds, search]);

  const ageGroups = useMemo(() => {
    const s = new Set<string>();
    for (const tm of teams) if (tm.age_group) s.add(tm.age_group);
    return Array.from(s).sort();
  }, [teams]);

  const teamNameById = useMemo(
    () => new Map(teams.map((tm) => [tm.id, tm])),
    [teams],
  );

  function ruleLabel(r: RuleRow) {
    const base = t(`groups.bulk.${r.rule_type}`, { defaultValue: r.rule_type });
    if (needsTeam(r.rule_type) && r.team_id) {
      const tm = teamNameById.get(r.team_id);
      return `${base} · ${tm?.name ?? r.team_id}`;
    }
    if (needsCategory(r.rule_type) && r.category) {
      return `${base} · ${r.category}`;
    }
    return base;
  }

  const ruleStyle = (rt: ClubGroupRuleType): { Icon: LucideIcon; cls: string } => {
    switch (rt) {
      case "club_admins":
        return { Icon: ShieldCheck, cls: "border-red-500/40 bg-red-500/10 text-red-600 dark:text-red-300" };
      case "club_staff":
        return { Icon: Shield, cls: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300" };
      case "club_educators":
        return { Icon: GraduationCap, cls: "border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300" };
      case "club_members":
        return { Icon: Users, cls: "border-slate-500/40 bg-slate-500/10 text-slate-700 dark:text-slate-300" };
      case "team_players":
        return { Icon: Trophy, cls: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" };
      case "team_parents":
        return { Icon: UserRound, cls: "border-violet-500/40 bg-violet-500/10 text-violet-700 dark:text-violet-300" };
      case "team_educators":
        return { Icon: Flag, cls: "border-indigo-500/40 bg-indigo-500/10 text-indigo-700 dark:text-indigo-300" };
      case "category_educators":
        return { Icon: Tag, cls: "border-teal-500/40 bg-teal-500/10 text-teal-700 dark:text-teal-300" };
    }
  };

  function canSubmitRule() {
    if (!ruleType) return false;
    if (needsTeam(ruleType) || needsCategory(ruleType)) return !!ruleParam;
    return true;
  }

  function submitRule() {
    if (!canSubmitRule() || !ruleType) return;
    addRuleMut.mutate({
      rule_type: ruleType,
      team_id: needsTeam(ruleType) ? ruleParam : null,
      category: needsCategory(ruleType) ? ruleParam : null,
    });
  }

  const rules = (rulesQ.data?.rules ?? []) as RuleRow[];

  return (
    <div className="border-t border-border bg-muted/20 p-3 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          {t("groups.manageMembers")}
        </Label>
        {resolvedQ.data && (
          <span className="text-xs text-muted-foreground">
            {t("groups.resolvedTotal", {
              defaultValue: "Total résolu : {{count}}",
              count: resolvedQ.data.count,
            })}
          </span>
        )}
      </div>

      {/* Dynamic rules (chips) */}
      <div className="space-y-2">
        <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
          <Layers className="h-3.5 w-3.5" />
          {t("groups.dynamicRules", { defaultValue: "Sous-groupes dynamiques" })}
        </Label>
        {rules.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">
            {t("groups.noRules", {
              defaultValue: "Aucune règle. La composition se met à jour automatiquement.",
            })}
          </p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {rules.map((r) => {
              const { Icon: RuleIcon, cls } = ruleStyle(r.rule_type);
              return (
              <Badge
                key={r.id}
                variant="outline"
                className={`gap-1.5 py-1 pl-2 pr-1 ${cls}`}
              >
                <RuleIcon className="h-3 w-3" />
                <button
                  type="button"
                  className="text-xs hover:underline"
                  onClick={() => setPreviewRule(r)}
                  aria-label={t("groups.rulePreview", {
                    defaultValue: "Voir les membres",
                  })}
                >
                  {ruleLabel(r)}
                </button>
                <button
                  type="button"
                  className="ml-0.5 rounded hover:bg-muted p-0.5"
                  onClick={() => removeRuleMut.mutate(r.id)}
                  aria-label={t("groups.ruleRemove", { defaultValue: "Retirer la règle" })}
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
              );
            })}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-2 pt-1">
          <Select
            value={ruleType}
            onValueChange={(v) => {
              setRuleType(v as ClubGroupRuleType);
              setRuleParam("");
            }}
          >
            <SelectTrigger>
              <SelectValue
                placeholder={t("groups.bulkPickKind", {
                  defaultValue: "Choisir un type…",
                })}
              />
            </SelectTrigger>
            <SelectContent>
              {RULE_TYPES.map((rt) => (
                <SelectItem key={rt} value={rt}>
                  {t(`groups.bulk.${rt}`, { defaultValue: rt })}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {ruleType && (needsTeam(ruleType) || needsCategory(ruleType)) ? (
            <Select value={ruleParam} onValueChange={setRuleParam}>
              <SelectTrigger>
                <SelectValue
                  placeholder={t("groups.bulkPickParam", { defaultValue: "Choisir…" })}
                />
              </SelectTrigger>
              <SelectContent>
                {needsTeam(ruleType) &&
                  teams.map((tm) => (
                    <SelectItem key={tm.id} value={tm.id}>
                      {tm.name}
                      {tm.age_group ? ` · ${tm.age_group}` : ""}
                    </SelectItem>
                  ))}
                {needsCategory(ruleType) &&
                  ageGroups.map((ag) => (
                    <SelectItem key={ag} value={ag}>
                      {ag}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          ) : (
            <div />
          )}

          <Button
            size="sm"
            disabled={!canSubmitRule() || addRuleMut.isPending}
            onClick={submitRule}
          >
            {addRuleMut.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
            <Plus className="h-4 w-4 mr-1" />
            {t("groups.addRule", { defaultValue: "Ajouter la règle" })}
          </Button>
        </div>
      </div>

      {/* Individual members */}
      <div className="space-y-2">
        <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          {t("groups.individualMembers", { defaultValue: "Membres individuels" })}
        </Label>
        {membersQ.isLoading ? (
          <div className="flex justify-center py-4">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : (membersQ.data?.members ?? []).length === 0 ? (
          <div className="text-sm text-muted-foreground italic">
            {t("groups.noMembers")}
          </div>
        ) : (
          <ul className="space-y-1">
            {(membersQ.data?.members ?? []).map((m) => {
              return (
                <li
                  key={m.id}
                  className="flex items-center justify-between gap-2 rounded-md bg-background border border-border px-3 py-2"
                >
                  <div className="flex flex-col gap-1 min-w-0 flex-1">
                    <span className="text-sm font-medium truncate">
                      {displayName({
                        full_name: m.profile?.full_name,
                        first_name: m.profile?.first_name,
                        last_name: m.profile?.last_name,
                      })}
                    </span>
                    <ParentSubtitle
                      children_names={m.user_id ? childrenByUserId.get(m.user_id) : undefined}
                    />
                    <div className="flex flex-wrap gap-1">
                      <RoleBadges roles={m.roles} fallback={m.role} />
                    </div>
                  </div>


                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => removeMut.mutate(m.member_id)}
                    aria-label={t("groups.remove")}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Individual add */}
      <div className="space-y-2">
        <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          {t("groups.addIndividual", { defaultValue: "Ajouter individuellement" })}
        </Label>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder={t("groups.searchMembers")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {search.trim() && candidates.length > 0 && (
          <ul className="rounded-md border border-border bg-background divide-y divide-border max-h-64 overflow-auto">
            {candidates.map((m) => {
              return (
                <li
                  key={m.id}
                  className="flex items-center justify-between gap-2 px-3 py-2"
                >
                  <div className="flex flex-col gap-1 min-w-0 flex-1">
                    <span className="text-sm font-medium truncate">{displayName(m)}</span>
                    <ParentSubtitle children_names={m.children_names} />
                    <div className="flex flex-wrap gap-1">
                      <RoleBadges roles={m.roles} fallback={m.role} />
                    </div>
                  </div>


                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      addMut.mutate(m.id);
                      setSearch("");
                    }}
                  >
                    <UserPlus className="h-4 w-4 mr-1" />
                    {t("groups.addMember")}
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <RulePreviewDialog
        rule={previewRule}
        ruleLabel={previewRule ? ruleLabel(previewRule) : ""}
        clubId={clubId}
        allMembers={allMembers}
        onClose={() => setPreviewRule(null)}
      />
    </div>
  );
}

function ruleToSpec(r: RuleRow): AudienceSelector | null {
  switch (r.rule_type) {
    case "team_players":
      return r.team_id ? { type: "team_players", team_id: r.team_id } : null;
    case "team_parents":
      return r.team_id ? { type: "team_parents", team_id: r.team_id } : null;
    case "team_educators":
      return r.team_id ? { type: "team_educators", team_id: r.team_id } : null;
    case "category_educators":
      return r.category ? { type: "category_educators", category: r.category } : null;
    case "club_educators":
      return { type: "club_educators" };
    case "club_staff":
      return { type: "club_staff" };
    case "club_members":
      return { type: "club_members" };
    default:
      return null;
  }
}

function RulePreviewDialog({
  rule,
  ruleLabel,
  clubId,
  allMembers,
  onClose,
}: {
  rule: RuleRow | null;
  ruleLabel: string;
  clubId: string;
  allMembers: ClubMemberRow[];
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const previewFn = useServerFn(previewAudienceCount);

  const previewQ = useQuery({
    queryKey: ["group-rule-preview", rule?.id, clubId],
    enabled: !!rule,
    queryFn: async () => {
      const spec = rule ? ruleToSpec(rule) : null;
      if (!spec) return { count: 0, user_ids: [] as string[] };
      return await previewFn({ data: { club_id: clubId, spec: [spec] } });
    },
  });

  const byUserId = useMemo(() => {
    const m = new Map<string, ClubMemberRow>();
    for (const cm of allMembers) if (cm.user_id) m.set(cm.user_id, cm);
    return m;
  }, [allMembers]);

  const rows = useMemo(() => {
    const ids = previewQ.data?.user_ids ?? [];
    return ids
      .map((uid) => byUserId.get(uid))
      .filter((x): x is ClubMemberRow => !!x)
      .sort((a, b) => displayName(a).localeCompare(displayName(b)));
  }, [previewQ.data, byUserId]);

  return (
    <Dialog open={!!rule} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Layers className="h-4 w-4 text-primary" />
            {ruleLabel}
          </DialogTitle>
          <DialogDescription>
            {t("groups.rulePreviewDescription", {
              defaultValue:
                "Liste résolue à l'instant. La composition se met à jour automatiquement.",
            })}
          </DialogDescription>
        </DialogHeader>

        {previewQ.isLoading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground italic py-4">
            {t("groups.rulePreviewEmpty", { defaultValue: "Aucun membre résolu." })}
          </p>
        ) : (
          <ul className="max-h-80 overflow-auto divide-y divide-border rounded-md border border-border">
            {rows.map((m) => (
              <li key={m.id} className="flex flex-col gap-1 px-3 py-2">
                <span className="text-sm font-medium truncate">{displayName(m)}</span>
                <ParentSubtitle children_names={m.children_names} />
                <div className="flex flex-wrap gap-1">
                  <RoleBadges roles={m.roles} fallback={m.role} />
                </div>
              </li>
            ))}


          </ul>
        )}

        <DialogFooter className="text-xs text-muted-foreground">
          {t("groups.rulePreviewCount", {
            defaultValue: "{{count}} membre(s)",
            count: rows.length,
          })}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

