import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ResponsiveFormDialog } from "@/components/responsive-form-dialog";
import { AttachmentPicker, type Attachment } from "@/components/attachments";
import { Plus, Trash2, Users, Loader2, HelpCircle } from "lucide-react";
import { toast } from "sonner";
import {
  addTournamentTeam,
  removeTournamentTeam,
} from "../tournaments.functions";


interface Props {
  tournamentId: string;
  clubId: string | null;
  teams: Array<{
    id: string;
    name: string;
    short_name: string | null;
    logo_url: string | null;
    seed: number | null;
    team_id: string | null;
  }>;
}

export function TeamsManager({ tournamentId, clubId, teams }: Props) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"external" | "internal">("external");
  const [name, setName] = useState("");
  const [shortName, setShortName] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [seed, setSeed] = useState("");
  const [selectedTeamId, setSelectedTeamId] = useState("");

  const addFn = useServerFn(addTournamentTeam);
  const removeFn = useServerFn(removeTournamentTeam);

  const clubTeams = useQuery({
    queryKey: ["club-teams", clubId],
    enabled: !!clubId,
    queryFn: async () => {
      if (!clubId) return [];
      const { data } = await supabase
        .from("teams")
        .select("id, name")
        .eq("club_id", clubId)
        .is("deleted_at", null)
        .order("name");
      return data ?? [];
    },
  });

  const add = useMutation({
    mutationFn: (input: any) => addFn({ data: input }),
    onSuccess: () => {
      toast.success("Équipe ajoutée");
      qc.invalidateQueries({ queryKey: ["tournament", tournamentId] });
      setOpen(false);
      setName("");
      setShortName("");
      setLogoUrl("");
      setSeed("");
      setSelectedTeamId("");
    },
    onError: (e: any) => toast.error(e?.message ?? "Erreur"),
  });

  const remove = useMutation({
    mutationFn: (teamId: string) =>
      removeFn({ data: { team_id: teamId, tournament_id: tournamentId } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tournament", tournamentId] });
    },
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (mode === "internal") {
      const t = clubTeams.data?.find((x) => x.id === selectedTeamId);
      if (!t) {
        toast.error("Choisis une équipe");
        return;
      }
      add.mutate({
        tournament_id: tournamentId,
        team_id: t.id,
        name: t.name,
        short_name: shortName || null,
        seed: seed ? parseInt(seed, 10) : null,
      });
    } else {
      add.mutate({
        tournament_id: tournamentId,
        name: name.trim(),
        short_name: shortName || null,
        logo_url: logoUrl || null,
        seed: seed ? parseInt(seed, 10) : null,
      });
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-muted-foreground">
          {teams.length} équipe{teams.length > 1 ? "s" : ""}
        </h2>
        <ResponsiveFormDialog
          open={open}
          onOpenChange={setOpen}
          trigger={
            <Button size="sm">
              <Plus className="h-4 w-4" />
              Ajouter
            </Button>
          }
          title="Ajouter une équipe"
        >
          <form onSubmit={onSubmit} className="space-y-4 mt-4 pb-6">
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant={mode === "external" ? "default" : "outline"}
                onClick={() => setMode("external")}
              >
                Équipe externe
              </Button>
              <Button
                type="button"
                variant={mode === "internal" ? "default" : "outline"}
                onClick={() => setMode("internal")}
              >
                Équipe Clubero
              </Button>
            </div>

            {mode === "external" ? (
              <>
                <div className="space-y-1.5">
                  <Label>Nom</Label>
                  <Input
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Logo URL (optionnel)</Label>
                  <Input
                    value={logoUrl}
                    onChange={(e) => setLogoUrl(e.target.value)}
                    placeholder="https://…"
                  />
                </div>
              </>
            ) : (
              <div className="space-y-1.5">
                <Label>Équipe du club</Label>
                <select
                  className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                  value={selectedTeamId}
                  onChange={(e) => setSelectedTeamId(e.target.value)}
                  required
                >
                  <option value="">— Sélectionner —</option>
                  {clubTeams.data?.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Nom court</Label>
                <Input
                  value={shortName}
                  onChange={(e) => setShortName(e.target.value)}
                  placeholder="FCU"
                  maxLength={20}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Seed</Label>
                <Input
                  type="number"
                  min={1}
                  value={seed}
                  onChange={(e) => setSeed(e.target.value)}
                  placeholder="1"
                />
              </div>
            </div>

            <Button type="submit" className="w-full" disabled={add.isPending}>
              {add.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Ajouter"
              )}
            </Button>
          </form>
        </ResponsiveFormDialog>
      </div>

      {teams.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          <Users className="h-6 w-6 mx-auto mb-2 opacity-60" />
          Aucune équipe inscrite
        </div>
      ) : (
        <ul className="space-y-2">
          {teams.map((t) => (
            <li
              key={t.id}
              className="flex items-center gap-3 rounded-xl border border-border bg-card p-3"
            >
              <div className="h-10 w-10 rounded-lg bg-muted shrink-0 overflow-hidden flex items-center justify-center">
                {t.logo_url ? (
                  <img
                    src={t.logo_url}
                    alt={t.name}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <Users className="h-4 w-4 text-muted-foreground" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-medium truncate text-sm">{t.name}</p>
                <p className="text-xs text-muted-foreground">
                  {t.seed ? `Seed ${t.seed}` : "—"}
                  {t.team_id ? " · Clubero" : " · Externe"}
                </p>
              </div>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => remove.mutate(t.id)}
                disabled={remove.isPending}
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
