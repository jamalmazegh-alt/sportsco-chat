/**
 * Team championships management section (team detail page).
 *
 * Lets coaches/admins manage the list of named championships for a team.
 * All writes go through team-championships.functions.ts (server fns, RLS-checked).
 * The old teams.championship column is intentionally NOT written from this UI:
 * team_championships is the new source of truth. events.competition_name keeps
 * the historical snapshot per event; renaming here does NOT rewrite history.
 */
import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Plus, Pencil, Archive, ArchiveRestore, Trash2, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import {
  createTeamChampionship,
  updateTeamChampionship,
  deleteTeamChampionship,
} from "@/lib/team-championships.functions";

type Championship = {
  id: string;
  name: string;
  season_label: string | null;
  is_active: boolean;
};

interface Props {
  teamId: string;
  canManage: boolean;
}

export function TeamChampionshipsSection({ teamId, canManage }: Props) {
  const { t } = useTranslation();
  const qc = useQueryClient();

  const create = useServerFn(createTeamChampionship);
  const update = useServerFn(updateTeamChampionship);
  const remove = useServerFn(deleteTeamChampionship);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["team-championships", teamId, "all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("team_championships" as never)
        .select("id, name, season_label, is_active")
        .eq("team_id", teamId)
        .order("is_active", { ascending: false })
        .order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Championship[];
    },
  });

  const active = rows.filter((r) => r.is_active);
  const archived = rows.filter((r) => !r.is_active);

  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newSeason, setNewSeason] = useState("");

  const [editing, setEditing] = useState<Championship | null>(null);
  const [editName, setEditName] = useState("");
  const [editSeason, setEditSeason] = useState("");

  const [showArchived, setShowArchived] = useState(false);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["team-championships", teamId] });
  };

  const addMut = useMutation({
    mutationFn: async () =>
      create({
        data: { teamId, name: newName.trim(), seasonLabel: newSeason.trim() || null },
      }),
    onSuccess: () => {
      toast.success(t("common.saved"));
      setAddOpen(false);
      setNewName("");
      setNewSeason("");
      invalidate();
    },
    onError: (e: Error) => {
      toast.error(e.message === "duplicate" ? t("championships.errors.duplicate") : e.message);
    },
  });

  const editMut = useMutation({
    mutationFn: async () =>
      update({
        data: {
          id: editing!.id,
          name: editName.trim(),
          seasonLabel: editSeason.trim() || null,
        },
      }),
    onSuccess: () => {
      toast.success(t("common.saved"));
      setEditing(null);
      invalidate();
    },
    onError: (e: Error) => {
      toast.error(e.message === "duplicate" ? t("championships.errors.duplicate") : e.message);
    },
  });

  const toggleActive = useMutation({
    mutationFn: async (row: Championship) =>
      update({ data: { id: row.id, isActive: !row.is_active } }),
    onSuccess: () => {
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: async (row: Championship) => remove({ data: { id: row.id } }),
    onSuccess: () => {
      toast.success(t("common.deleted"));
      invalidate();
    },
    onError: (e: Error) => {
      if (e.message === "championship_in_use") {
        toast.error(t("championships.errors.inUse"));
      } else {
        toast.error(e.message);
      }
    },
  });

  function onSubmitAdd(e: FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    addMut.mutate();
  }
  function onSubmitEdit(e: FormEvent) {
    e.preventDefault();
    if (!editName.trim()) return;
    editMut.mutate();
  }

  return (
    <section
      id="team-championships-section"
      className="rounded-2xl border border-border bg-card p-4 space-y-3 scroll-mt-20"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Trophy className="h-4 w-4 text-muted-foreground" />
          <h2 className="font-semibold">{t("championships.title")}</h2>
        </div>
        {canManage && (
          <Button size="sm" variant="outline" onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4 mr-1" />
            {t("championships.add")}
          </Button>
        )}
      </div>

      {isLoading ? (
        <p className="text-xs text-muted-foreground">{t("common.loading")}</p>
      ) : active.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t("championships.emptyActive")}</p>
      ) : (
        <ul className="space-y-1.5">
          {active.map((row) => (
            <li
              key={row.id}
              className="flex items-center gap-2 rounded-lg border border-border/60 bg-background px-3 py-2"
            >
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium truncate">{row.name}</div>
                {row.season_label && (
                  <div className="text-xs text-muted-foreground">{row.season_label}</div>
                )}
              </div>
              {canManage && (
                <div className="flex items-center gap-0.5">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8"
                    aria-label={t("championships.rename")}
                    onClick={() => {
                      setEditing(row);
                      setEditName(row.name);
                      setEditSeason(row.season_label ?? "");
                    }}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8"
                    aria-label={t("championships.archive")}
                    onClick={() => toggleActive.mutate(row)}
                  >
                    <Archive className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-destructive"
                    aria-label={t("championships.delete")}
                    onClick={() => {
                      if (window.confirm(t("championships.confirmDelete"))) {
                        deleteMut.mutate(row);
                      }
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {archived.length > 0 && (
        <div>
          <Button
            variant="ghost"
            size="sm"
            className="text-xs text-muted-foreground h-7 px-2"
            onClick={() => setShowArchived((v) => !v)}
          >
            {showArchived
              ? t("common.hide")
              : t("championships.showArchived", {
                  n: archived.length,
                })}
          </Button>
          {showArchived && (
            <ul className="mt-2 space-y-1.5 opacity-70">
              {archived.map((row) => (
                <li
                  key={row.id}
                  className="flex items-center gap-2 rounded-lg border border-dashed border-border/60 bg-background/50 px-3 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-sm truncate">{row.name}</div>
                    {row.season_label && (
                      <div className="text-xs text-muted-foreground">{row.season_label}</div>
                    )}
                  </div>
                  {canManage && (
                    <div className="flex items-center gap-0.5">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        aria-label={t("championships.reactivate")}
                        onClick={() => toggleActive.mutate(row)}
                      >
                        <ArchiveRestore className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 text-destructive"
                        aria-label={t("championships.delete")}
                        onClick={() => {
                          if (window.confirm(t("championships.confirmDelete"))) {
                            deleteMut.mutate(row);
                          }
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Add dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("championships.add")}</DialogTitle>
          </DialogHeader>
          <form onSubmit={onSubmitAdd} className="space-y-3">
            <div className="space-y-1.5">
              <Label>{t("championships.name")}</Label>
              <Input
                autoFocus
                required
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder={t("championships.levelPlaceholder")}
              />
            </div>
            <div className="space-y-1.5">
              <Label>
                {t("championships.season")}{" "}
                <span className="text-xs text-muted-foreground">
                  ({t("championships.seasonOptional")})
                </span>
              </Label>
              <Input
                value={newSeason}
                onChange={(e) => setNewSeason(e.target.value)}
                placeholder="2026–2027"
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setAddOpen(false)}
                disabled={addMut.isPending}
              >
                {t("common.cancel")}
              </Button>
              <Button type="submit" disabled={addMut.isPending || !newName.trim()}>
                {addMut.isPending ? t("common.saving") : t("common.save")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("championships.rename")}</DialogTitle>
          </DialogHeader>
          <form onSubmit={onSubmitEdit} className="space-y-3">
            <div className="space-y-1.5">
              <Label>{t("championships.name")}</Label>
              <Input
                autoFocus
                required
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>
                {t("championships.season")}{" "}
                <span className="text-xs text-muted-foreground">
                  ({t("championships.seasonOptional")})
                </span>
              </Label>
              <Input value={editSeason} onChange={(e) => setEditSeason(e.target.value)} />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setEditing(null)}
                disabled={editMut.isPending}
              >
                {t("common.cancel")}
              </Button>
              <Button type="submit" disabled={editMut.isPending || !editName.trim()}>
                {editMut.isPending ? t("common.saving") : t("common.save")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  );
}
