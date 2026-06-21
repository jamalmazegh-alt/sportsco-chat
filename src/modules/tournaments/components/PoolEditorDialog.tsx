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
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto p-0 gap-0 rounded-[20px] border-[1.5px]">
        {/* Anime Premium hero header */}
        <div
          className="relative overflow-hidden px-5 pt-5 pb-4 text-white"
          style={{
            background: "linear-gradient(135deg,#0f4a26 0%,#1d7a45 55%,#2d9d5f 100%)",
            boxShadow: "0 4px 16px -4px rgba(29,122,69,0.45)",
          }}
        >
          <svg
            className="absolute inset-0 h-full w-full opacity-25 pointer-events-none"
            viewBox="0 0 400 120"
            preserveAspectRatio="none"
          >
            <defs>
              <pattern id="pe-diag" width="22" height="22" patternUnits="userSpaceOnUse">
                <path d="M0 22 L22 0" stroke="white" strokeWidth="0.6" />
              </pattern>
            </defs>
            <rect width="400" height="120" fill="url(#pe-diag)" />
            <circle cx="340" cy="30" r="60" fill="white" opacity="0.15" />
          </svg>
          <DialogHeader className="relative space-y-1.5 text-left">
            <DialogTitle className="flex items-center gap-2 text-white text-base font-extrabold tracking-tight">
              <span className="h-8 w-8 rounded-xl bg-white/15 backdrop-blur flex items-center justify-center ring-1 ring-white/30">
                <Users className="h-4 w-4 text-white" />
              </span>
              {t("poolEditor.title", "Modifier les poules")}
            </DialogTitle>
            <DialogDescription className="text-white/80 text-xs leading-relaxed">
              {t(
                "poolEditor.subtitle",
                "Réassignez les équipes avant le début des matchs. Les fixtures seront régénérées.",
              )}
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="px-5 pt-5 pb-2">
          {isLoading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-emerald-600" />
            </div>
          ) : locked ? (
            <div className="rounded-2xl border-[1.5px] border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 font-medium">
              {t(
                "poolEditor.locked",
                "Des matchs de poule ont déjà commencé : édition impossible.",
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {(data?.groups ?? []).map((g, idx) => (
                <div
                  key={g.id}
                  className="rounded-2xl border-[1.5px] border-slate-200 overflow-hidden bg-white"
                  style={{ boxShadow: "0 2px 8px -4px rgba(15,23,42,0.08)" }}
                >
                  <div
                    className="flex items-center gap-2 px-3 py-2 text-white text-xs font-extrabold tracking-tight"
                    style={{ background: "linear-gradient(135deg,#1d7a45 0%,#2d9d5f 100%)" }}
                  >
                    <span className="h-5 w-5 rounded-md bg-white/20 flex items-center justify-center text-[10px] font-black">
                      {String.fromCharCode(65 + idx)}
                    </span>
                    {g.name}
                    <span className="ml-auto text-[10px] font-bold bg-white/15 px-1.5 py-0.5 rounded">
                      {(grouped[g.id] ?? []).length} {t("poolEditor.teamsShort", "éq.")}
                    </span>
                  </div>
                  <div className="p-3 space-y-2">
                    {(grouped[g.id] ?? []).length === 0 ? (
                      <p className="text-xs text-slate-400 italic text-center py-2">
                        {t("poolEditor.empty", "Aucune équipe")}
                      </p>
                    ) : (
                      grouped[g.id].map((tm) => (
                        <div key={tm.id} className="flex items-center gap-2">
                          <span className="flex-1 text-sm font-medium text-slate-700 truncate">
                            {tm.name}
                          </span>
                          <Select
                            value={assignments[tm.id] ?? ""}
                            onValueChange={(v) =>
                              setAssignments((prev) => ({ ...prev, [tm.id]: v }))
                            }
                          >
                            <SelectTrigger className="w-28 h-8 rounded-lg border-[1.5px]">
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
        </div>

        <DialogFooter className="px-5 pb-5 pt-3 gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="rounded-xl border-[1.5px]">
            {t("common.cancel", "Annuler")}
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || locked || isLoading}
            className="rounded-xl font-bold text-white border-0"
            style={{
              background: "linear-gradient(135deg,#1d7a45 0%,#2d9d5f 100%)",
              boxShadow: "0 4px 14px -4px rgba(29,122,69,0.55)",
            }}
          >
            {mutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            {t("poolEditor.save", "Enregistrer & régénérer")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
