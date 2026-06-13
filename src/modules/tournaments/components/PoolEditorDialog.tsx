import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import { Loader2, Users } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { reassignTeamsToGroups } from "../tournaments.functions";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  tournamentId: string;
}

type GroupRow = { id: string; name: string; sort_order: number | null };
type TeamRow = { id: string; name: string; group_id: string | null };

export function PoolEditorDialog({ open, onOpenChange, tournamentId }: Props) {
  const { t } = useTranslation("tournaments");
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["pool-editor", tournamentId],
    enabled: open,
    queryFn: async () => {
      const [{ data: groups }, { data: teams }, { data: matches }] = await Promise.all([
        supabase
          .from("tournament_groups")
          .select("id, name, sort_order")
          .eq("tournament_id", tournamentId)
          .order("sort_order", { ascending: true }),
        supabase
          .from("tournament_teams")
          .select("id, name, group_id")
          .eq("tournament_id", tournamentId)
          .order("name", { ascending: true }),
        supabase
          .from("tournament_matches")
          .select("id, status")
          .eq("tournament_id", tournamentId)
          .eq("round", "group")
          .in("status", ["live", "completed"]),
      ]);
      return {
        groups: (groups ?? []) as GroupRow[],
        teams: (teams ?? []) as TeamRow[],
        startedCount: matches?.length ?? 0,
      };
    },
  });

  const [assignments, setAssignments] = useState<Record<string, string>>({});
  useEffect(() => {
    if (data?.teams) {
      const init: Record<string, string> = {};
      for (const tm of data.teams) if (tm.group_id) init[tm.id] = tm.group_id;
      setAssignments(init);
    }
  }, [data?.teams]);

  const reassignFn = useServerFn(reassignTeamsToGroups);
  const mutation = useMutation({
    mutationFn: async () => {
      const payload = Object.entries(assignments).map(([team_id, group_id]) => ({
        team_id,
        group_id,
      }));
      return reassignFn({ data: { tournament_id: tournamentId, assignments: payload } });
    },
    onSuccess: () => {
      toast.success(t("poolEditor.savedToast", "Poules mises à jour"));
      qc.invalidateQueries({ queryKey: ["tournament", tournamentId] });
      qc.invalidateQueries({ queryKey: ["pool-editor", tournamentId] });
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(e?.message ?? "Erreur"),
  });

  const grouped = useMemo(() => {
    const byGroup: Record<string, TeamRow[]> = {};
    for (const g of data?.groups ?? []) byGroup[g.id] = [];
    for (const tm of data?.teams ?? []) {
      const gid = assignments[tm.id] ?? tm.group_id;
      if (gid && byGroup[gid]) byGroup[gid].push(tm);
    }
    return byGroup;
  }, [data, assignments]);

  const locked = (data?.startedCount ?? 0) > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            {t("poolEditor.title", "Modifier les poules")}
          </DialogTitle>
          <DialogDescription>
            {t(
              "poolEditor.subtitle",
              "Réassignez les équipes avant le début des matchs. Les fixtures seront régénérées.",
            )}
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : locked ? (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
            {t(
              "poolEditor.locked",
              "Des matchs de poule ont déjà commencé : édition impossible.",
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {(data?.groups ?? []).map((g) => (
              <div key={g.id} className="rounded-lg border border-border p-3">
                <div className="text-sm font-semibold mb-2">{g.name}</div>
                <div className="space-y-2">
                  {(grouped[g.id] ?? []).length === 0 ? (
                    <p className="text-xs text-muted-foreground italic">
                      {t("poolEditor.empty", "Aucune équipe")}
                    </p>
                  ) : (
                    grouped[g.id].map((tm) => (
                      <div key={tm.id} className="flex items-center gap-2">
                        <span className="flex-1 text-sm truncate">{tm.name}</span>
                        <Select
                          value={assignments[tm.id] ?? ""}
                          onValueChange={(v) =>
                            setAssignments((prev) => ({ ...prev, [tm.id]: v }))
                          }
                        >
                          <SelectTrigger className="w-32 h-8">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {(data?.groups ?? []).map((gg) => (
                              <SelectItem key={gg.id} value={gg.id}>
                                {gg.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    ))
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("common.cancel", "Annuler")}
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || locked || isLoading}
          >
            {mutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            {t("poolEditor.save", "Enregistrer & régénérer")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
