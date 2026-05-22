import { useState, type FormEvent, type ChangeEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ResponsiveFormDialog } from "@/components/responsive-form-dialog";
import { AttachmentPicker, type Attachment } from "@/components/attachments";
import { Plus, Trash2, Users, Loader2, HelpCircle, Upload, Pencil, UsersRound, Download } from "lucide-react";
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
  const { t } = useTranslation("tournaments");
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
      toast.success(t("teams.addedToast"));
      qc.invalidateQueries({ queryKey: ["tournament", tournamentId] });
      setOpen(false);
      setName("");
      setShortName("");
      setLogo([]);
      setSeed("");
      setSelectedTeamId("");
    },
    onError: (e: any) => toast.error(e?.message ?? t("teams.errorToast")),
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
      toast.success(t("teams.importedToast", { count: res.inserted }));
      qc.invalidateQueries({ queryKey: ["tournament", tournamentId] });
      setBulkOpen(false);
      setBulkText("");
    },
    onError: (e: any) => toast.error(e?.message ?? t("teams.errorToast")),
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
      toast.error(t("teams.noneDetected"));
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

  function downloadCsvTemplate() {
    const csv =
      "nom,nom_court,seed\n" +
      "FC United,FCU,1\n" +
      "Real Madrid,RMA,2\n" +
      "Atlético,ATM,\n" +
      "Olympique Lyonnais,OL,\n";
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "modele-equipes-clubero.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (mode === "internal") {
      const team = clubTeams.data?.find((x) => x.id === selectedTeamId);
      if (!team) {
        toast.error(t("teams.pickTeam"));
        return;
      }
      add.mutate({
        tournament_id: tournamentId,
        team_id: team.id,
        name: team.name,
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

  const limitSuffix =
    typeof maxTeams === "number" && maxTeams > 0 ? ` / ${maxTeams}` : "";

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h2 className="text-sm font-medium text-muted-foreground">
          {t("teams.count", { count: teams.length, limit: limitSuffix })}
        </h2>
        <div className="flex gap-2">
          <ResponsiveFormDialog
            open={bulkOpen}
            onOpenChange={(v) => !atLimit && setBulkOpen(v)}
            trigger={
              <Button size="sm" variant="outline" disabled={atLimit}>
                <Upload className="h-4 w-4" />
                {t("teams.import")}
              </Button>
            }
            title={t("teams.dialog.bulkTitle")}
          >
            <form onSubmit={onBulkSubmit} className="space-y-4 mt-4 pb-6">
              <div className="rounded-lg border border-dashed border-border bg-muted/30 p-3 flex items-center justify-between gap-3">
                <div className="text-xs text-muted-foreground">
                  {t("teams.dialog.templateHint")}
                </div>
                <Button type="button" size="sm" variant="outline" onClick={downloadCsvTemplate}>
                  <Download className="h-4 w-4" />
                  {t("teams.dialog.csvTemplate")}
                </Button>
              </div>
              <div className="space-y-1.5">
                <Label>{t("teams.dialog.csvFileLabel")}</Label>
                <Input
                  type="file"
                  accept=".csv,text/csv,text/plain"
                  onChange={onCsvFile}
                />
                <p
                  className="text-[11px] text-muted-foreground"
                  dangerouslySetInnerHTML={{ __html: t("teams.dialog.csvHint") }}
                />
              </div>

              <div className="space-y-1.5">
                <Label>{t("teams.dialog.pasteLabel")}</Label>
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
                  t("teams.import")
                )}
              </Button>
              <p className="text-[11px] text-muted-foreground text-center">
                {t("teams.dialog.logoHint")}
              </p>
            </form>
          </ResponsiveFormDialog>

          <ResponsiveFormDialog
            open={open}
            onOpenChange={(v) => !atLimit && setOpen(v)}
            trigger={
              <Button size="sm" disabled={atLimit}>
                <Plus className="h-4 w-4" />
                {t("teams.add")}
              </Button>
            }
            title={t("teams.dialog.addTitle")}
          >
            <form onSubmit={onSubmit} className="space-y-4 mt-4 pb-6">
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant={mode === "external" ? "default" : "outline"}
                  onClick={() => setMode("external")}
                >
                  {t("teams.dialog.external")}
                </Button>
                <Button
                  type="button"
                  variant={mode === "internal" ? "default" : "outline"}
                  onClick={() => setMode("internal")}
                >
                  {t("teams.dialog.internal")}
                </Button>
              </div>

              {mode === "external" ? (
                <>
                  <div className="space-y-1.5">
                    <Label>{t("teams.dialog.name")}</Label>
                    <Input
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>{t("teams.dialog.logo")}</Label>
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
                  <Label>{t("teams.dialog.clubTeam")}</Label>
                  <select
                    className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                    value={selectedTeamId}
                    onChange={(e) => setSelectedTeamId(e.target.value)}
                    required
                  >
                    <option value="">{t("teams.dialog.selectPlaceholder")}</option>
                    {clubTeams.data?.map((ct) => (
                      <option key={ct.id} value={ct.id}>
                        {ct.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>{t("teams.dialog.shortName")}</Label>
                  <Input
                    value={shortName}
                    onChange={(e) => setShortName(e.target.value)}
                    placeholder={t("teams.dialog.shortPlaceholder")}
                    maxLength={20}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-1.5">
                    {t("teams.dialog.seed")}
                    <span
                      className="text-muted-foreground"
                      title={t("teams.dialog.seedTooltip")}
                    >
                      <HelpCircle className="h-3.5 w-3.5" />
                    </span>
                  </Label>
                  <select
                    className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                    value={seed}
                    onChange={(e) => setSeed(e.target.value)}
                  >
                    <option value="">{t("teams.dialog.seedNone")}</option>
                    {Array.from({ length: Math.max(teams.length + 1, maxTeams ?? 16) }).map((_, i) => (
                      <option key={i + 1} value={i + 1}>
                        {t("teams.dialog.seedOption", { n: i + 1 })}
                        {i === 0 ? t("teams.dialog.seedBest") : ""}
                      </option>
                    ))}
                  </select>
                  <p className="text-[11px] text-muted-foreground">
                    {t("teams.dialog.seedHint")}
                  </p>
                </div>

              </div>

              <Button type="submit" className="w-full" disabled={add.isPending}>
                {add.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  t("teams.add")
                )}
              </Button>
            </form>
          </ResponsiveFormDialog>
        </div>
      </div>

      {teams.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          <Users className="h-6 w-6 mx-auto mb-2 opacity-60" />
          {t("teams.empty")}
        </div>
      ) : (
        <ul className="space-y-2">
          {teams.map((tm) => (
            <li
              key={tm.id}
              className="flex items-center gap-3 rounded-xl border border-border bg-card p-3"
            >
              <div className="h-10 w-10 rounded-lg bg-muted shrink-0 overflow-hidden flex items-center justify-center">
                {tm.logo_url ? (
                  <img
                    src={tm.logo_url}
                    alt={tm.name}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <Users className="h-4 w-4 text-muted-foreground" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-medium truncate text-sm">{tm.name}</p>
                <p className="text-xs text-muted-foreground">
                  {tm.seed ? t("teams.row.seed", { n: tm.seed }) : t("teams.row.noSeed")}
                  {tm.team_id ? t("teams.row.clubero") : t("teams.row.external")}
                </p>
              </div>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => setRosterTeam(tm)}
                title={t("teams.row.players")}
              >
                <UsersRound className="h-4 w-4" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => setEditing(tm)}
                title={t("teams.row.edit")}
              >
                <Pencil className="h-4 w-4" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => remove.mutate(tm.id)}
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
  const { t } = useTranslation("tournaments");
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
      toast.success(t("teams.updatedToast"));
      onSaved();
    },
    onError: (e: any) => toast.error(e?.message ?? t("teams.errorToast")),
  });

  return (
    <ResponsiveFormDialog
      open={true}
      onOpenChange={(v) => !v && onClose()}
      title={t("teams.dialog.editTitle", { name: team.name })}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
        className="space-y-4 mt-4 pb-6"
      >
        <div className="space-y-1.5">
          <Label>{t("teams.dialog.name")}</Label>
          <Input required value={editName} onChange={(e) => setEditName(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>{t("teams.dialog.logoEdit")}</Label>
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
            <Label>{t("teams.dialog.shortName")}</Label>
            <Input
              value={editShort}
              onChange={(e) => setEditShort(e.target.value)}
              maxLength={20}
            />
          </div>
          <div className="space-y-1.5">
            <Label>{t("teams.dialog.seed")}</Label>
            <select
              className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
              value={editSeed}
              onChange={(e) => setEditSeed(e.target.value)}
            >
              <option value="">{t("teams.dialog.seedNone")}</option>
              {Array.from({ length: 32 }).map((_, i) => (
                <option key={i + 1} value={i + 1}>
                  {t("teams.dialog.seedOption", { n: i + 1 })}
                  {i === 0 ? t("teams.dialog.seedBest") : ""}
                </option>
              ))}
            </select>
          </div>

        </div>
        <Button type="submit" className="w-full" disabled={save.isPending}>
          {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : t("teams.dialog.save")}
        </Button>
      </form>
    </ResponsiveFormDialog>
  );
}
