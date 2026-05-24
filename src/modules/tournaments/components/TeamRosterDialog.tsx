import { useState, type FormEvent, type ChangeEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Plus, Trash2, Loader2, Upload, Star, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { ResponsiveFormDialog } from "@/components/responsive-form-dialog";
import { PositionCombobox } from "@/components/position-combobox";
import {
  listTeamPlayers,
  upsertTeamPlayer,
  deleteTeamPlayer,
  bulkImportTeamPlayers,
} from "../tournaments.functions";

interface Props {
  tournamentTeamId: string;
  teamName: string;
  sport?: string | null;
  onClose: () => void;
}

type Player = {
  id: string;
  first_name: string;
  last_name: string;
  jersey_number: number | null;
  position: string | null;
  is_captain: boolean;
  birth_date: string | null;
  license_number: string | null;
};

export function TeamRosterDialog({ tournamentTeamId, teamName, sport, onClose }: Props) {
  const { t } = useTranslation("tournaments");
  const qc = useQueryClient();
  const listFn = useServerFn(listTeamPlayers);
  const upsertFn = useServerFn(upsertTeamPlayer);
  const deleteFn = useServerFn(deleteTeamPlayer);
  const bulkFn = useServerFn(bulkImportTeamPlayers);

  const q = useQuery({
    queryKey: ["team-roster", tournamentTeamId],
    queryFn: () => listFn({ data: { tournament_team_id: tournamentTeamId } }),
  });

  const [editing, setEditing] = useState<Player | null>(null);
  const [adding, setAdding] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);

  const remove = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { player_id: id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["team-roster", tournamentTeamId] });
    },
    onError: (e: any) => toast.error(e?.message ?? t("roster.errorToast")),
  });

  const players = (q.data?.players ?? []) as Player[];

  return (
    <ResponsiveFormDialog
      open={true}
      onOpenChange={(v) => !v && onClose()}
      title={t("roster.title", { team: teamName })}
    >
      <div className="space-y-3 mt-3 pb-6">
        <div className="flex gap-2 justify-end">
          <Button size="sm" variant="outline" onClick={() => setBulkOpen(true)}>
            <Upload className="h-4 w-4" />
            {t("roster.import")}
          </Button>
          <Button size="sm" onClick={() => setAdding(true)}>
            <Plus className="h-4 w-4" />
            {t("roster.add")}
          </Button>
        </div>

        {q.isLoading ? (
          <div className="py-6 flex justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          </div>
        ) : players.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">
            {t("roster.empty")}
          </p>
        ) : (
          <ul className="space-y-1.5">
            {players.map((p) => (
              <li
                key={p.id}
                className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2"
              >
                <div className="h-7 w-7 rounded bg-muted flex items-center justify-center text-xs font-semibold">
                  {p.jersey_number ?? "—"}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm truncate flex items-center gap-1">
                    {p.last_name.toUpperCase()} {p.first_name}
                    {p.is_captain && (
                      <Star className="h-3 w-3 fill-yellow-500 text-yellow-500" />
                    )}
                  </p>
                  {p.position && (
                    <p className="text-[11px] text-muted-foreground truncate">
                      {p.position}
                    </p>
                  )}
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => setEditing(p)}
                  aria-label={t("roster.edit")}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => remove.mutate(p.id)}
                  disabled={remove.isPending}
                  aria-label={t("roster.remove")}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {(adding || editing) && (
        <PlayerFormDialog
          tournamentTeamId={tournamentTeamId}
          player={editing}
          sport={sport ?? null}
          upsertFn={upsertFn}
          onClose={() => {
            setAdding(false);
            setEditing(null);
          }}
          onSaved={() => {
            setAdding(false);
            setEditing(null);
            qc.invalidateQueries({ queryKey: ["team-roster", tournamentTeamId] });
          }}
        />
      )}

      {bulkOpen && (
        <BulkRosterDialog
          tournamentTeamId={tournamentTeamId}
          bulkFn={bulkFn}
          onClose={() => setBulkOpen(false)}
          onDone={() => {
            setBulkOpen(false);
            qc.invalidateQueries({ queryKey: ["team-roster", tournamentTeamId] });
          }}
        />
      )}
    </ResponsiveFormDialog>
  );
}

function PlayerFormDialog({
  tournamentTeamId,
  player,
  sport,
  upsertFn,
  onClose,
  onSaved,
}: {
  tournamentTeamId: string;
  player: Player | null;
  sport?: string | null;
  upsertFn: (args: { data: any }) => Promise<any>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation("tournaments");
  const [firstName, setFirstName] = useState(player?.first_name ?? "");
  const [lastName, setLastName] = useState(player?.last_name ?? "");
  const [jersey, setJersey] = useState(
    player?.jersey_number ? String(player.jersey_number) : "",
  );
  const [position, setPosition] = useState(player?.position ?? "");
  const [captain, setCaptain] = useState(player?.is_captain ?? false);
  const [license, setLicense] = useState(player?.license_number ?? "");

  const save = useMutation({
    mutationFn: () =>
      upsertFn({
        data: {
          tournament_team_id: tournamentTeamId,
          player_id: player?.id,
          patch: {
            first_name: firstName.trim(),
            last_name: lastName.trim(),
            jersey_number: jersey ? parseInt(jersey, 10) : null,
            position: position.trim() || null,
            is_captain: captain,
            license_number: license.trim() || null,
          },
        },
      }),
    onSuccess: () => {
      toast.success(player ? t("roster.form.updated") : t("roster.form.added"));
      onSaved();
    },
    onError: (e: any) => toast.error(e?.message ?? t("roster.errorToast")),
  });

  return (
    <ResponsiveFormDialog
      open={true}
      onOpenChange={(v) => !v && onClose()}
      title={player ? t("roster.form.editTitle") : t("roster.form.addTitle")}
    >
      <form
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          if (!firstName.trim() || !lastName.trim()) {
            toast.error(t("roster.form.requiredNames"));
            return;
          }
          save.mutate();
        }}
        className="space-y-3 mt-3 pb-6"
      >
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1.5">
            <Label>{t("roster.form.firstName")}</Label>
            <Input
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              required
              maxLength={80}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="flex items-center justify-between">
              <span>{t("roster.form.lastName")}</span>
              <button
                type="button"
                onClick={() =>
                  setLastName((v) =>
                    v.trim() ? `${v.trim().charAt(0).toUpperCase()}.` : v,
                  )
                }
                className="text-[11px] text-primary hover:underline"
              >
                {t("roster.form.anonymize")}
              </button>
            </Label>
            <Input
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              required
              maxLength={80}
              placeholder={t("roster.form.lastNamePlaceholder")}
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1.5">
            <Label>{t("roster.form.jersey")}</Label>
            <Input
              type="number"
              min={0}
              max={999}
              value={jersey}
              onChange={(e) => setJersey(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>{t("roster.form.position")}</Label>
            <Input
              value={position}
              onChange={(e) => setPosition(e.target.value)}
              maxLength={40}
              placeholder={t("roster.form.positionPlaceholder")}
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>{t("roster.form.license")}</Label>
          <Input
            value={license}
            onChange={(e) => setLicense(e.target.value)}
            maxLength={60}
          />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={captain}
            onCheckedChange={(v) => setCaptain(!!v)}
          />
          {t("roster.form.captain")}
        </label>
        <Button type="submit" className="w-full" disabled={save.isPending}>
          {save.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            t("roster.form.save")
          )}
        </Button>
      </form>
    </ResponsiveFormDialog>
  );
}

// Parse CSV: first_name, last_name[, jersey, position, captain, license]
function parseRoster(text: string) {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const rows: any[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (i === 0 && /first_?name|prenom|prénom/i.test(line)) continue;
    const parts = line.split(/[;,\t]/).map((p) => p.trim());
    const first = parts[0];
    const last = parts[1];
    if (!first || !last) continue;
    const jerseyRaw = parts[2];
    const jersey = jerseyRaw ? parseInt(jerseyRaw, 10) : NaN;
    const position = parts[3] || null;
    const captainRaw = (parts[4] || "").toLowerCase();
    const captain =
      captainRaw === "1" ||
      captainRaw === "true" ||
      captainRaw === "yes" ||
      captainRaw === "oui" ||
      captainRaw === "c";
    const license = parts[5] || null;
    rows.push({
      first_name: first,
      last_name: last,
      jersey_number: Number.isFinite(jersey) && jersey >= 0 ? jersey : null,
      position,
      is_captain: captain,
      license_number: license,
    });
  }
  return rows;
}

function BulkRosterDialog({
  tournamentTeamId,
  bulkFn,
  onClose,
  onDone,
}: {
  tournamentTeamId: string;
  bulkFn: (args: { data: any }) => Promise<any>;
  onClose: () => void;
  onDone: () => void;
}) {
  const { t } = useTranslation("tournaments");
  const [text, setText] = useState("");
  const [replace, setReplace] = useState(false);

  const mut = useMutation({
    mutationFn: (rows: any[]) =>
      bulkFn({
        data: {
          tournament_team_id: tournamentTeamId,
          replace,
          players: rows,
        },
      }),
    onSuccess: (res: any) => {
      toast.success(t("roster.bulk.imported", { count: res.inserted }));
      onDone();
    },
    onError: (e: any) => toast.error(e?.message ?? t("roster.errorToast")),
  });

  function onFile(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => setText(String(reader.result ?? ""));
    reader.readAsText(f);
    e.target.value = "";
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const rows = parseRoster(text);
    if (rows.length === 0) {
      toast.error(t("roster.bulk.noneDetected"));
      return;
    }
    mut.mutate(rows);
  }

  return (
    <ResponsiveFormDialog
      open={true}
      onOpenChange={(v) => !v && onClose()}
      title={t("roster.bulk.title")}
    >
      <form onSubmit={onSubmit} className="space-y-3 mt-3 pb-6">
        <div className="space-y-1.5">
          <Label>{t("roster.bulk.fileLabel")}</Label>
          <Input
            type="file"
            accept=".csv,text/csv,text/plain"
            onChange={onFile}
          />
          <p
            className="text-[11px] text-muted-foreground"
            dangerouslySetInnerHTML={{ __html: t("roster.bulk.hint") }}
          />
        </div>
        <div className="space-y-1.5">
          <Label>{t("roster.bulk.pasteLabel")}</Label>
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={8}
            className="font-mono text-xs"
            placeholder={"Léa,Martin,1,GK,c\nPaul,Dupont,7,ATT"}
          />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={replace}
            onCheckedChange={(v) => setReplace(!!v)}
          />
          {t("roster.bulk.replace")}
        </label>
        <Button type="submit" className="w-full" disabled={mut.isPending}>
          {mut.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            t("roster.bulk.submit")
          )}
        </Button>
      </form>
    </ResponsiveFormDialog>
  );
}
