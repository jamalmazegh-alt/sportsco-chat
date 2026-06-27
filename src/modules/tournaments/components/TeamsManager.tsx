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
import { Alert, AlertDescription } from "@/components/ui/alert";
import { DestructiveConfirmSheet } from "@/components/destructive-confirm-sheet";
import { AttachmentPicker, type Attachment } from "@/components/attachments";
import {
  Plus,
  Trash2,
  Users,
  Loader2,
  HelpCircle,
  Upload,
  Pencil,
  UsersRound,
  Download,
  Mail,
  Phone,
  User2,
  AlertCircle,
  CheckCircle2,
  Circle,
  Banknote,
  RefreshCw,

} from "lucide-react";
import { toast } from "sonner";
import {
  addTournamentTeam,
  removeTournamentTeam,
  updateTournamentTeam,
  bulkAddTournamentTeams,
} from "../tournaments.functions";
import { TeamRosterDialog } from "./TeamRosterDialog";
import { cn } from "@/lib/utils";

interface TeamRow {
  id: string;
  name: string;
  short_name: string | null;
  logo_url: string | null;
  seed: number | null;
  team_id: string | null;
  contact_name?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
  payment_status?: "unpaid" | "paid" | "exempt" | null;
  amount_paid_cents?: number | null;
  payment_currency?: string | null;
  paid_at?: string | null;

  tournament_registrations?:
    | { contact_name?: string | null; contact_email?: string | null; contact_phone?: string | null }
    | {
        contact_name?: string | null;
        contact_email?: string | null;
        contact_phone?: string | null;
      }[]
    | null;
}

interface Props {
  tournamentId: string;
  clubId: string | null;
  teams: TeamRow[];
  maxTeams?: number | null;
  sport?: string | null;
}

export function TeamsManager({ tournamentId, clubId, teams, maxTeams, sport }: Props) {
  const { t } = useTranslation("tournaments");
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [editing, setEditing] = useState<TeamRow | null>(null);
  const [rosterTeam, setRosterTeam] = useState<TeamRow | null>(null);
  const [teamToDelete, setTeamToDelete] = useState<TeamRow | null>(null);
  const [mode, setMode] = useState<"external" | "internal">("external");
  const [name, setName] = useState("");
  const [shortName, setShortName] = useState("");
  const [logo, setLogo] = useState<Attachment[]>([]);
  const [seed, setSeed] = useState("");
  const [selectedTeamId, setSelectedTeamId] = useState("");

  // Bulk import state
  const [bulkText, setBulkText] = useState("");
  const [bulkError, setBulkError] = useState<string | null>(null);

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
    onError: (e: unknown) => {
      // B4 — TanStack Start wraps server Response errors; extract the message
      // from wherever the adapter places it (.message, .data, or toString).
      const msg =
        (e as { message?: string })?.message ||
        (e as { data?: { message?: string } })?.data?.message ||
        String(e) ||
        t("teams.errorToast");
      console.error("[TeamsManager] addTournamentTeam failed:", e);
      toast.error(msg);
    },
  });

  const remove = useMutation({
    mutationFn: (teamId: string) =>
      removeFn({ data: { team_id: teamId, tournament_id: tournamentId } }),
    onSuccess: () => {
      toast.success(t("teams.deletedToast"));
      qc.invalidateQueries({ queryKey: ["tournament", tournamentId] });
      setTeamToDelete(null);
    },
    onError: (e: any) => toast.error(e?.message ?? t("teams.errorToast")),
  });

  const setPayment = useMutation({
    mutationFn: async (vars: { teamId: string; status: "unpaid" | "paid" | "exempt" }) => {
      const { data, error } = await supabase.rpc("set_tournament_team_payment", {
        _team_id: vars.teamId,
        _status: vars.status,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (_d, vars) => {
      const msg =
        vars.status === "paid"
          ? t("teams.payment.markedPaid", { defaultValue: "Marqué comme payé" })
          : vars.status === "exempt"
            ? t("teams.payment.markedExempt", { defaultValue: "Marqué exempté" })
            : t("teams.payment.markedUnpaid", { defaultValue: "Marqué impayé" });
      toast.success(msg);
      qc.invalidateQueries({ queryKey: ["tournament", tournamentId] });
    },
    onError: (e: any) => toast.error(e?.message ?? t("teams.errorToast")),
  });

  const bulk = useMutation({
    mutationFn: (
      rows: Array<{
        name: string;
        short_name?: string | null;
        seed?: number | null;
        contact_name?: string | null;
        contact_email?: string | null;
        contact_phone?: string | null;
      }>,
    ) => bulkFn({ data: { tournament_id: tournamentId, teams: rows } }),
    onSuccess: async (res: any) => {
      toast.success(t("teams.importedToast", { count: res?.inserted ?? 0 }));
      setBulkOpen(false);
      setBulkText("");
      await qc.invalidateQueries({ queryKey: ["tournament", tournamentId] });
      await qc.refetchQueries({ queryKey: ["tournament", tournamentId], type: "active" });
    },
    onError: (e: any) => toast.error(e?.message ?? t("teams.errorToast")),
  });

  // Parse CSV / line list. Columns: name[,short_name[,seed[,contact_name[,contact_email[,contact_phone]]]]]
  function parseBulk(text: string) {
    const lines = text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    const rows: Array<{
      name: string;
      short_name?: string | null;
      seed?: number | null;
      contact_name?: string | null;
      contact_email?: string | null;
      contact_phone?: string | null;
    }> = [];
    for (const line of lines) {
      // skip header
      if (/^(name|nom)[\s,;\t]/i.test(line) && rows.length === 0) continue;
      const parts = line.split(/[;,\t]/).map((p) => p.trim());
      const teamName = parts[0];
      if (!teamName) continue;
      const sn = parts[1] || null;
      const sd = parts[2] ? parseInt(parts[2], 10) : null;
      const cName = parts[3] || null;
      const cEmail = parts[4] || null;
      const cPhone = parts[5] || null;
      rows.push({
        name: teamName,
        short_name: sn || null,
        seed: Number.isFinite(sd) && sd && sd > 0 ? sd : null,
        contact_name: cName,
        contact_email: cEmail && /.+@.+\..+/.test(cEmail) ? cEmail : null,
        contact_phone: cPhone,
      });
    }
    return rows;
  }

  function onBulkSubmit(e: FormEvent) {
    e.preventDefault();
    setBulkError(null);
    const rows = parseBulk(bulkText);
    if (rows.length === 0) {
      setBulkError(t("teams.noneDetected"));
      return;
    }
    if (typeof maxTeams === "number" && maxTeams > 0) {
      const remaining = Math.max(0, maxTeams - teams.length);
      if (rows.length > remaining) {
        setBulkError(
          t("teams.dialog.exceedsMax", {
            count: rows.length,
            remaining,
            max: maxTeams,
            current: teams.length,
          }),
        );
        return;
      }
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
      "nom,nom_court,seed,contact_nom,contact_email,contact_tel\n" +
      "FC United,FCU,1,Jean Dupont,jean@fcu.com,+33600000001\n" +
      "Real Madrid,RMA,2,,contact@rma.com,\n" +
      "Atlético,ATM,,,,\n" +
      "Olympique Lyonnais,OL,,Marie Martin,,+33600000004\n";
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

  const atLimit = typeof maxTeams === "number" && maxTeams > 0 && teams.length >= maxTeams;

  const limitSuffix = typeof maxTeams === "number" && maxTeams > 0 ? ` / ${maxTeams}` : "";

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h2 className="text-sm font-medium text-muted-foreground">
          {t("teams.count", { count: teams.length, limit: limitSuffix })}
        </h2>
        <div className="flex gap-2">
          <ResponsiveFormDialog
            open={bulkOpen}
            onOpenChange={(v) => {
              if (atLimit) return;
              setBulkOpen(v);
              if (!v) setBulkError(null);
            }}
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
                <Input type="file" accept=".csv,text/csv,text/plain" onChange={onCsvFile} />
                <p
                  className="text-[11px] text-muted-foreground"
                  dangerouslySetInnerHTML={{ __html: t("teams.dialog.csvHint") }}
                />
              </div>

              <div className="space-y-1.5">
                <Label>{t("teams.dialog.pasteLabel")}</Label>
                <Textarea
                  value={bulkText}
                  onChange={(e) => {
                    setBulkText(e.target.value);
                    if (bulkError) setBulkError(null);
                  }}
                  rows={8}
                  placeholder={"FC United\nReal Madrid, RMA, 1\nAtlético, ATM, 2"}
                  className="font-mono text-xs"
                />
              </div>
              {bulkError && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{bulkError}</AlertDescription>
                </Alert>
              )}
              <Button type="submit" className="w-full" disabled={bulk.isPending}>
                {bulk.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : t("teams.import")}
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
                    <Input required value={name} onChange={(e) => setName(e.target.value)} />
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
                    <span className="text-muted-foreground" title={t("teams.dialog.seedTooltip")}>
                      <HelpCircle className="h-3.5 w-3.5" />
                    </span>
                  </Label>
                  <select
                    className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                    value={seed}
                    onChange={(e) => setSeed(e.target.value)}
                  >
                    <option value="">{t("teams.dialog.seedNone")}</option>
                    {Array.from({ length: Math.max(teams.length + 1, maxTeams ?? 16) }).map(
                      (_, i) => (
                        <option key={i + 1} value={i + 1}>
                          {t("teams.dialog.seedOption", { n: i + 1 })}
                          {i === 0 ? t("teams.dialog.seedBest") : ""}
                        </option>
                      ),
                    )}
                  </select>
                  <p className="text-[11px] text-muted-foreground">{t("teams.dialog.seedHint")}</p>
                </div>
              </div>

              <Button type="submit" className="w-full" disabled={add.isPending}>
                {add.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : t("teams.add")}
              </Button>
            </form>
          </ResponsiveFormDialog>
        </div>
      </div>

      {teams.length === 0 ? (
        <div className="rounded-2xl border-[1.5px] border-dashed border-border p-8 text-center bg-gradient-to-br from-white to-slate-50">
          <div
            className="h-12 w-12 rounded-2xl mx-auto mb-3 flex items-center justify-center text-white"
            style={{ background: "linear-gradient(135deg,#1d7a45 0%,#2d9d5f 100%)" }}
          >
            <Users className="h-6 w-6" />
          </div>
          <p className="text-sm font-semibold text-muted-foreground">{t("teams.empty")}</p>
        </div>
      ) : (
        <ul className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {teams.map((tm, idx) => {
            const palettes = [
              "linear-gradient(135deg,#1d7a45 0%,#2d9d5f 100%)",
              "linear-gradient(135deg,#0ea5e9 0%,#38bdf8 100%)",
              "linear-gradient(135deg,#f59e0b 0%,#f97316 100%)",
              "linear-gradient(135deg,#8b5cf6 0%,#a78bfa 100%)",
              "linear-gradient(135deg,#ec4899 0%,#f472b6 100%)",
              "linear-gradient(135deg,#14b8a6 0%,#2dd4bf 100%)",
            ];
            const initials = tm.name
              .split(/\s+/)
              .map((p) => p[0])
              .filter(Boolean)
              .slice(0, 2)
              .join("")
              .toUpperCase();
            return (
              <li
                key={tm.id}
                className="flex items-center gap-3 rounded-2xl border-[1.5px] border-border bg-card p-3 transition-all hover:-translate-y-0.5 hover:border-emerald-300"
                style={{ boxShadow: "0 2px 8px -4px rgba(15,23,42,0.06)" }}
              >
                <div
                  className="h-11 w-11 rounded-xl shrink-0 overflow-hidden flex items-center justify-center text-white font-black text-sm tracking-tight"
                  style={!tm.logo_url ? { background: palettes[idx % palettes.length] } : undefined}
                >
                  {tm.logo_url ? (
                    <img src={tm.logo_url} alt={tm.name} className="h-full w-full object-cover" />
                  ) : (
                    <span>{initials || "?"}</span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-bold truncate text-sm text-foreground tracking-tight">
                    {tm.name}
                  </p>
                  <p className="text-[11px] text-muted-foreground flex items-center gap-1.5 mt-0.5">
                    {tm.seed ? (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-amber-50 text-amber-700 font-bold">
                        #{tm.seed}
                      </span>
                    ) : (
                      <span className="text-muted-foreground/70">{t("teams.row.noSeed")}</span>
                    )}
                    <span
                      className={cn(
                        "inline-flex items-center px-1.5 py-0.5 rounded-md font-semibold",
                        tm.team_id
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-muted text-muted-foreground",
                      )}
                    >
                      {tm.team_id ? t("teams.row.clubero") : t("teams.row.external")}
                    </span>
                  </p>
                  {(() => {
                    const reg = Array.isArray(tm.tournament_registrations)
                      ? tm.tournament_registrations[0]
                      : tm.tournament_registrations;
                    const contactName = reg?.contact_name ?? tm.contact_name ?? null;
                    const contactEmail = reg?.contact_email ?? tm.contact_email ?? null;
                    const contactPhone = reg?.contact_phone ?? tm.contact_phone ?? null;

                    const hasContact = contactName || contactEmail || contactPhone;

                    const ps = tm.payment_status ?? "unpaid";
                    const cycle: Record<string, "unpaid" | "paid" | "exempt"> = {
                      unpaid: "paid",
                      paid: "exempt",
                      exempt: "unpaid",
                    };
                    const styles =
                      ps === "paid"
                        ? "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100"
                        : ps === "exempt"
                          ? "bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200"
                          : "bg-amber-50 text-amber-800 border-amber-300 hover:bg-amber-100";
                    const label =
                      ps === "paid"
                        ? t("teams.payment.paid", { defaultValue: "Payé" })
                        : ps === "exempt"
                          ? t("teams.payment.exempt", { defaultValue: "Exempté" })
                          : t("teams.payment.unpaid", { defaultValue: "À encaisser" });
                    const Icon = ps === "paid" ? CheckCircle2 : ps === "exempt" ? Circle : Banknote;

                    return (
                      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                        {contactName && (
                          <span className="inline-flex items-center gap-1 font-medium text-foreground/80">
                            <User2 className="h-3 w-3" />
                            {contactName}
                          </span>
                        )}
                        {contactEmail && (
                          <a
                            href={`mailto:${contactEmail}`}
                            className="inline-flex items-center gap-1 hover:text-foreground hover:underline"
                          >
                            <Mail className="h-3 w-3" />
                            {contactEmail}
                          </a>
                        )}
                        {contactPhone && (
                          <a
                            href={`tel:${contactPhone}`}
                            className="inline-flex items-center gap-1 hover:text-foreground hover:underline"
                          >
                            <Phone className="h-3 w-3" />
                            {contactPhone}
                          </a>
                        )}
                        {hasContact && <span className="text-border">·</span>}
                        <button
                          type="button"
                          disabled={setPayment.isPending}
                          onClick={() =>
                            setPayment.mutate({ teamId: tm.id, status: cycle[ps] })
                          }
                          className={cn(
                            "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[12px] font-semibold border transition-colors disabled:opacity-50 shadow-sm",
                            styles,
                          )}
                          title={t("teams.payment.cycleHint", {
                            defaultValue: "Cliquer pour changer le statut de paiement",
                          })}
                        >
                          <Icon className="h-3.5 w-3.5" />
                          <span>{label}</span>
                          {ps === "paid" && tm.amount_paid_cents
                            ? ` · ${(tm.amount_paid_cents / 100).toFixed(0)} ${(tm.payment_currency ?? "eur").toUpperCase()}`
                            : ""}
                          <RefreshCw className="h-3 w-3 opacity-70 ml-0.5" />
                          <span className="text-[10px] font-normal opacity-80">
                            {t("teams.payment.change", { defaultValue: "Modifier" })}
                          </span>
                        </button>
                      </div>
                    );
                  })()}

                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => setRosterTeam(tm)}
                  title={t("teams.row.players")}
                  className="rounded-lg hover:bg-emerald-50 hover:text-emerald-700"
                >
                  <UsersRound className="h-4 w-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => setEditing(tm)}
                  title={t("teams.row.edit")}
                  className="rounded-lg hover:bg-muted"
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => setTeamToDelete(tm)}
                  disabled={remove.isPending}
                  title={t("teams.row.delete")}
                  className="rounded-lg hover:bg-rose-50"
                >
                  <Trash2 className="h-4 w-4 text-rose-500" />
                </Button>
              </li>
            );
          })}
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
          sport={sport ?? null}
          onClose={() => setRosterTeam(null)}
        />
      )}

      <DestructiveConfirmSheet
        open={!!teamToDelete}
        onOpenChange={(v) => {
          if (!v && !remove.isPending) setTeamToDelete(null);
        }}
        mode="delay"
        delaySeconds={3}
        title={t("teams.deleteConfirm.title", { name: teamToDelete?.name ?? "" })}
        description={t("teams.deleteConfirm.description", {
          name: teamToDelete?.name ?? "",
        })}
        consequences={t("teams.deleteConfirm.consequences")}
        cancelLabel={t("teams.deleteConfirm.cancel")}
        confirmLabel={t("teams.deleteConfirm.confirm")}
        loading={remove.isPending}
        onConfirm={() => {
          if (teamToDelete) remove.mutate(teamToDelete.id);
        }}
      />
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
    team.logo_url ? [{ url: team.logo_url, path: "", name: "logo", type: "image/*", size: 0 }] : [],
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
