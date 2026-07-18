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
  type ClubGroupRuleType,
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
                    otherGroups={allGroups.filter((x) => x.id !== g.id)}
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

// ---------------- Bulk-add audience presets ----------------

type BulkKind =
  | "club_members"
  | "club_staff"
  | "club_educators"
  | "team_players"
  | "team_parents"
  | "team_educators"
  | "category_educators"
  | "club_group";

function GroupMembersPanel({
  groupId,
  clubId,
  allMembers,
  teams,
  otherGroups,
}: {
  groupId: string;
  clubId: string;
  allMembers: ClubMemberRow[];
  teams: TeamRow[];
  otherGroups: GroupRow[];
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const roleLabel = useRoleLabel();
  const listMembersFn = useServerFn(listClubGroupMembers);
  const addFn = useServerFn(addClubGroupMember);
  const removeFn = useServerFn(removeClubGroupMember);
  const previewFn = useServerFn(previewAudienceCount);

  const [search, setSearch] = useState("");
  const [bulkKind, setBulkKind] = useState<BulkKind | "">("");
  const [bulkParam, setBulkParam] = useState<string>("");
  const [bulkBusy, setBulkBusy] = useState(false);

  const membersQ = useQuery({
    queryKey: ["club-group-members", groupId],
    queryFn: () => listMembersFn({ data: { group_id: groupId } }),
  });

  const currentMemberIds = useMemo(
    () => new Set((membersQ.data?.members ?? []).map((m) => m.member_id)),
    [membersQ.data],
  );

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ["club-group-members", groupId] });
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

  const candidates = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allMembers
      .filter((m) => !currentMemberIds.has(m.id))
      .filter((m) => !q || displayName(m).toLowerCase().includes(q))
      .slice(0, 20);
  }, [allMembers, currentMemberIds, search]);

  // Distinct age groups from teams (for category_educators).
  const ageGroups = useMemo(() => {
    const s = new Set<string>();
    for (const t of teams) if (t.age_group) s.add(t.age_group);
    return Array.from(s).sort();
  }, [teams]);

  const needsParam = (k: BulkKind) =>
    k === "team_players" ||
    k === "team_parents" ||
    k === "team_educators" ||
    k === "category_educators" ||
    k === "club_group";

  function buildSelector(): AudienceSelector | null {
    if (!bulkKind) return null;
    switch (bulkKind) {
      case "club_members":
        return { type: "club_members" };
      case "club_staff":
        return { type: "club_staff" };
      case "club_educators":
        return { type: "club_educators" };
      case "team_players":
        return bulkParam ? { type: "team_players", team_id: bulkParam } : null;
      case "team_parents":
        return bulkParam ? { type: "team_parents", team_id: bulkParam } : null;
      case "team_educators":
        return bulkParam ? { type: "team_educators", team_id: bulkParam } : null;
      case "category_educators":
        return bulkParam ? { type: "category_educators", category: bulkParam } : null;
      case "club_group":
        return bulkParam ? { type: "club_group", group_id: bulkParam } : null;
    }
  }

  async function runBulkAdd() {
    const sel = buildSelector();
    if (!sel) return;
    setBulkBusy(true);
    try {
      const res = await previewFn({
        data: { club_id: clubId, spec: [sel] },
      });
      const userIds = new Set(res.user_ids);
      // Map user_ids to club_member ids, skip those already in group.
      const targets = allMembers.filter(
        (m) => userIds.has(m.user_id) && !currentMemberIds.has(m.id),
      );
      if (targets.length === 0) {
        toast.info(
          t("groups.bulkNoneToAdd", {
            defaultValue: "Aucun nouveau membre à ajouter.",
          }),
        );
        return;
      }
      // Add sequentially to keep it simple and idempotent.
      let added = 0;
      for (const m of targets) {
        try {
          await addFn({ data: { group_id: groupId, member_id: m.id } });
          added += 1;
        } catch (e) {
          console.warn("bulk add failed for", m.id, e);
        }
      }
      toast.success(
        t("groups.bulkAdded", {
          defaultValue: "{{count}} membre(s) ajouté(s)",
          count: added,
        }),
      );
      setBulkKind("");
      setBulkParam("");
      invalidateAll();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBulkBusy(false);
    }
  }

  return (
    <div className="border-t border-border bg-muted/20 p-3 space-y-4">
      <div>
        <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          {t("groups.manageMembers")}
        </Label>
      </div>

      {membersQ.isLoading ? (
        <div className="flex justify-center py-4">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      ) : (membersQ.data?.members ?? []).length === 0 ? (
        <div className="text-sm text-muted-foreground italic">{t("groups.noMembers")}</div>
      ) : (
        <ul className="space-y-1">
          {(membersQ.data?.members ?? []).map((m) => {
            const label = roleLabel(m.role);
            return (
              <li
                key={m.id}
                className="flex items-center justify-between gap-2 rounded-md bg-background border border-border px-3 py-2"
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <span className="text-sm truncate">
                    {displayName({
                      full_name: m.profile?.full_name,
                      first_name: m.profile?.first_name,
                      last_name: m.profile?.last_name,
                    })}
                  </span>
                  {label && (
                    <Badge variant="secondary" className="text-[10px] shrink-0">
                      {label}
                    </Badge>
                  )}
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
              const label = roleLabel(m.role);
              return (
                <li
                  key={m.id}
                  className="flex items-center justify-between gap-2 px-3 py-2"
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <span className="text-sm truncate">{displayName(m)}</span>
                    {label && (
                      <Badge variant="secondary" className="text-[10px] shrink-0">
                        {label}
                      </Badge>
                    )}
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

      {/* Bulk add from sub-groups */}
      <div className="space-y-2 rounded-md border border-dashed border-border p-3">
        <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
          <Layers className="h-3.5 w-3.5" />
          {t("groups.addSubgroup", {
            defaultValue: "Ajouter un sous-groupe prédéfini",
          })}
        </Label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <Select
            value={bulkKind}
            onValueChange={(v) => {
              setBulkKind(v as BulkKind);
              setBulkParam("");
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
              <SelectItem value="club_members">
                {t("groups.bulk.club_members", {
                  defaultValue: "Tous les membres du club",
                })}
              </SelectItem>
              <SelectItem value="club_staff">
                {t("groups.bulk.club_staff", { defaultValue: "Tout le staff" })}
              </SelectItem>
              <SelectItem value="club_educators">
                {t("groups.bulk.club_educators", {
                  defaultValue: "Tous les éducateurs",
                })}
              </SelectItem>
              <SelectItem value="team_players">
                {t("groups.bulk.team_players", {
                  defaultValue: "Joueurs d'une équipe",
                })}
              </SelectItem>
              <SelectItem value="team_parents">
                {t("groups.bulk.team_parents", {
                  defaultValue: "Parents d'une équipe",
                })}
              </SelectItem>
              <SelectItem value="team_educators">
                {t("groups.bulk.team_educators", {
                  defaultValue: "Éducateurs d'une équipe",
                })}
              </SelectItem>
              <SelectItem value="category_educators">
                {t("groups.bulk.category_educators", {
                  defaultValue: "Éducateurs d'une catégorie (U11, U12…)",
                })}
              </SelectItem>
              {otherGroups.length > 0 && (
                <SelectItem value="club_group">
                  {t("groups.bulk.club_group", {
                    defaultValue: "Membres d'un autre groupe",
                  })}
                </SelectItem>
              )}
            </SelectContent>
          </Select>

          {bulkKind && needsParam(bulkKind) && (
            <Select value={bulkParam} onValueChange={setBulkParam}>
              <SelectTrigger>
                <SelectValue
                  placeholder={t("groups.bulkPickParam", {
                    defaultValue: "Choisir…",
                  })}
                />
              </SelectTrigger>
              <SelectContent>
                {(bulkKind === "team_players" ||
                  bulkKind === "team_parents" ||
                  bulkKind === "team_educators") &&
                  teams.map((tm) => (
                    <SelectItem key={tm.id} value={tm.id}>
                      {tm.name}
                      {tm.age_group ? ` · ${tm.age_group}` : ""}
                    </SelectItem>
                  ))}
                {bulkKind === "category_educators" &&
                  ageGroups.map((ag) => (
                    <SelectItem key={ag} value={ag}>
                      {ag}
                    </SelectItem>
                  ))}
                {bulkKind === "club_group" &&
                  otherGroups.map((g) => (
                    <SelectItem key={g.id} value={g.id}>
                      {g.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          )}
        </div>
        <div className="flex justify-end">
          <Button
            size="sm"
            disabled={
              !bulkKind ||
              (needsParam(bulkKind as BulkKind) && !bulkParam) ||
              bulkBusy
            }
            onClick={runBulkAdd}
          >
            {bulkBusy && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
            <UserPlus className="h-4 w-4 mr-1" />
            {t("groups.bulkAdd", { defaultValue: "Ajouter au groupe" })}
          </Button>
        </div>
      </div>
    </div>
  );
}
