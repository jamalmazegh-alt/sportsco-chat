import { useState, type FormEvent, type ChangeEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ResponsiveFormDialog } from "@/components/responsive-form-dialog";
import { AttachmentPicker, type Attachment } from "@/components/attachments";
import { Plus, Trash2, Users, Loader2, HelpCircle, Upload, Pencil, UsersRound } from "lucide-react";
import { toast } from "sonner";
import {
  addTournamentTeam,
  removeTournamentTeam,
  updateTournamentTeam,
  bulkAddTournamentTeams,
} from "../tournaments.functions";
import { TeamRosterDialog } from "./TeamRosterDialog";


interface TeamRow {
  id: string;
  name: string;
  short_name: string | null;
  logo_url: string | null;
  seed: number | null;
  team_id: string | null;
}

interface Props {
  tournamentId: string;
  clubId: string | null;
  teams: TeamRow[];
  maxTeams?: number | null;
}

export function TeamsManager({ tournamentId, clubId, teams, maxTeams }: Props) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [editing, setEditing] = useState<TeamRow | null>(null);
  const [rosterTeam, setRosterTeam] = useState<TeamRow | null>(null);
  const [mode, setMode] = useState<"external" | "internal">("external");
  const [name, setName] = useState("");
  const [shortName, setShortName] = useState("");
  const [logo, setLogo] = useState<Attachment[]>([]);
  const [seed, setSeed] = useState("");
  const [selectedTeamId, setSelectedTeamId] = useState("");

  // Bulk import state
  const [bulkText, setBulkText] = useState("");

  const addFn = useServerFn(addTournamentTeam);
  const removeFn = useServerFn(removeTournamentTeam);
  const updateFn = useServerFn(updateTournamentTeam);
  const bulkFn = useServerFn(bulkAddTournamentTeams);

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
      setLogo([]);
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

  const bulk = useMutation({
    mutationFn: (rows: Array<{ name: string; short_name?: string | null; seed?: number | null }>) =>
      bulkFn({ data: { tournament_id: tournamentId, teams: rows } }),
    onSuccess: (res: any) => {
      toast.success(`${res.inserted} équipe(s) importée(s)`);
      qc.invalidateQueries({ queryKey: ["tournament", tournamentId] });
      setBulkOpen(false);
      setBulkText("");
    },
    onError: (e: any) => toast.error(e?.message ?? "Erreur"),
  });

  // Parse CSV / line list. Format per line: name[,short_name[,seed]]
  function parseBulk(text: string) {
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const rows: Array<{ name: string; short_name?: string | null; seed?: number | null }> = [];
    for (const line of lines) {
      // skip header
      if (/^name[\s,;]/i.test(line) && rows.length === 0) continue;
      const parts = line.split(/[;,\t]/).map((p) => p.trim());
      const teamName = parts[0];
      if (!teamName) continue;
      const sn = parts[1] || null;
      const sd = parts[2] ? parseInt(parts[2], 10) : null;
      rows.push({
        name: teamName,
        short_name: sn || null,
        seed: Number.isFinite(sd) && sd && sd > 0 ? sd : null,
      });
    }
    return rows;
  }

  function onBulkSubmit(e: FormEvent) {
    e.preventDefault();
    const rows = parseBulk(bulkText);
    if (rows.length === 0) {
      toast.error("Aucune équipe détectée");
      return;
    }
    bulk.mutate(rows);
  }

  function onCsvFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setBulkText(String(reader.result ?? ""));
    };
    reader.readAsText(file);
    e.target.value = "";
  }

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
        logo_url: logo[0]?.url ?? null,
        seed: seed ? parseInt(seed, 10) : null,
      });
    }
  }

  const atLimit =
    typeof maxTeams === "number" && maxTeams > 0 && teams.length >= maxTeams;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h2 className="text-sm font-medium text-muted-foreground">
          {teams.length}
          {typeof maxTeams === "number" && maxTeams > 0 ? ` / ${maxTeams}` : ""}{" "}
          équipe{teams.length > 1 ? "s" : ""}
        </h2>
        <div className="flex gap-2">
          <ResponsiveFormDialog
            open={bulkOpen}
            onOpenChange={(v) => !atLimit && setBulkOpen(v)}
            trigger={
              <Button size="sm" variant="outline" disabled={atLimit}>
                <Upload className="h-4 w-4" />
                Importer
              </Button>
            }
            title="Importer plusieurs équipes"
          >
            <form onSubmit={onBulkSubmit} className="space-y-4 mt-4 pb-6">
              <div className="space-y-1.5">
                <Label>Fichier CSV</Label>
                <Input
                  type="file"
                  accept=".csv,text/csv,text/plain"
                  onChange={onCsvFile}
                />
                <p className="text-[11px] text-muted-foreground">
                  Une équipe par ligne. Colonnes : <code>nom, nom_court, seed</code> (seul le nom est obligatoire).
                </p>
              </div>
              <div className="space-y-1.5">
                <Label>Ou colle ta liste</Label>
                <Textarea
                  value={bulkText}
                  onChange={(e) => setBulkText(e.target.value)}
                  rows={8}
                  placeholder={"FC United\nReal Madrid, RMA, 1\nAtlético, ATM, 2"}
                  className="font-mono text-xs"
                />
              </div>
              <Button type="submit" className="w-full" disabled={bulk.isPending}>
                {bulk.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Importer"
                )}
              </Button>
              <p className="text-[11px] text-muted-foreground text-center">
                Les logos peuvent être ajoutés ensuite équipe par équipe.
              </p>
            </form>
          </ResponsiveFormDialog>

          <ResponsiveFormDialog
            open={open}
            onOpenChange={(v) => !atLimit && setOpen(v)}
            trigger={
              <Button size="sm" disabled={atLimit}>
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
                    <Label>Logo de l'équipe (optionnel)</Label>
                    <AttachmentPicker
                      value={logo}
                      onChange={setLogo}
                      prefix="tournament-team-logo"
                      accept="image/*"
                      max={1}
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
                  <Label className="flex items-center gap-1.5">
                    Seed
                    <span
                      className="text-muted-foreground"
                      title="Le seed (tête de série) indique le classement de départ. Seed 1 = meilleure équipe ; elle est placée pour ne rencontrer le seed 2 qu'en finale."
                    >
                      <HelpCircle className="h-3.5 w-3.5" />
                    </span>
                  </Label>
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
                onClick={() => setRosterTeam(t)}
                title="Joueurs"
              >
                <UsersRound className="h-4 w-4" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => setEditing(t)}
                title="Modifier"
              >
                <Pencil className="h-4 w-4" />
              </Button>
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

      {editing && (
        <EditTeamDialog
          team={editing}
          tournamentId={tournamentId}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            qc.invalidateQueries({ queryKey: ["tournament", tournamentId] });
          }}
          updateFn={updateFn}
        />
      )}

      {rosterTeam && (
        <TeamRosterDialog
          tournamentTeamId={rosterTeam.id}
          teamName={rosterTeam.name}
          onClose={() => setRosterTeam(null)}
        />
      )}
    </div>
  );
}

function EditTeamDialog({
  team,
  tournamentId,
  onClose,
  onSaved,
  updateFn,
}: {
  team: TeamRow;
  tournamentId: string;
  onClose: () => void;
  onSaved: () => void;
  updateFn: (args: { data: any }) => Promise<any>;
}) {
  const [editName, setEditName] = useState(team.name);
  const [editShort, setEditShort] = useState(team.short_name ?? "");
  const [editSeed, setEditSeed] = useState(team.seed ? String(team.seed) : "");
  const [editLogo, setEditLogo] = useState<Attachment[]>(
    team.logo_url
      ? [{ url: team.logo_url, path: "", name: "logo", type: "image/*", size: 0 }]
      : [],
  );

  const save = useMutation({
    mutationFn: () =>
      updateFn({
        data: {
          tournament_id: tournamentId,
          team_id: team.id,
          patch: {
            name: editName.trim(),
            short_name: editShort.trim() || null,
            seed: editSeed ? parseInt(editSeed, 10) : null,
            logo_url: editLogo[0]?.url ?? null,
          },
        },
      }),
    onSuccess: () => {
      toast.success("Équipe mise à jour");
      onSaved();
    },
    onError: (e: any) => toast.error(e?.message ?? "Erreur"),
  });

  return (
    <ResponsiveFormDialog
      open={true}
      onOpenChange={(v) => !v && onClose()}
      title={`Modifier ${team.name}`}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
        className="space-y-4 mt-4 pb-6"
      >
        <div className="space-y-1.5">
          <Label>Nom</Label>
          <Input required value={editName} onChange={(e) => setEditName(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Logo</Label>
          <AttachmentPicker
            value={editLogo}
            onChange={setEditLogo}
            prefix="tournament-team-logo"
            accept="image/*"
            max={1}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Nom court</Label>
            <Input
              value={editShort}
              onChange={(e) => setEditShort(e.target.value)}
              maxLength={20}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Seed</Label>
            <Input
              type="number"
              min={1}
              value={editSeed}
              onChange={(e) => setEditSeed(e.target.value)}
            />
          </div>
        </div>
        <Button type="submit" className="w-full" disabled={save.isPending}>
          {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Enregistrer"}
        </Button>
      </form>
    </ResponsiveFormDialog>
  );
}
