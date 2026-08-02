import { useCallback, useMemo, useState, type ChangeEvent } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import * as XLSX from "xlsx";
import { downloadFile } from "@/lib/download-file";
import { toast } from "sonner";
import { Loader2, Upload, Download, Sparkles, CheckCircle2, AlertCircle } from "lucide-react";

import { ResponsiveFormDialog } from "@/components/responsive-form-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  analyzeFileWithAI,
  previewPlayersImport,
  runImport,
  type PlayerImportPreview,
} from "@/lib/superadmin-import/import.functions";
import { type AnalysisResult, getFields } from "@/lib/superadmin-import/schemas";
import { normalizeSheetCell } from "@/lib/superadmin-import/sheet-date";

/**
 * Coach/admin import dialog. Thin wrapper on top of the unified superadmin
 * import pipeline — no bespoke parsing or DB writes here. The server enforces
 * authorization (admin/coach of clubId) and scopes writes to `teamId`.
 */

const FIELD_KEYS = [
  "prenom_joueur",
  "nom_joueur",
  "date_naissance",
  "numero_maillot",
  "numero_licence",
  "poste",
  "telephone_joueur",
  "email_contact",
  "prenom_parent_1",
  "nom_parent_1",
  "email_parent_1",
  "telephone_parent_1",
  "prenom_parent_2",
  "nom_parent_2",
  "email_parent_2",
  "telephone_parent_2",
] as const;

const FIELD_LABEL_FR: Record<string, string> = {
  first_name: "Prénom",
  last_name: "Nom",
  jersey_number: "N° maillot",
  license_number: "N° licence",
  preferred_position: "Poste",
  email: "Email",
  phone: "Téléphone",
};

function cleanSheetRows(rows: Array<Record<string, unknown>>) {
  return rows
    .map((row) => {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(row)) {
        if (k === "__rowNum__" || k.trim() === "") continue;
        out[k] = normalizeSheetCell(v);
      }
      return out;
    })
    .filter((row) => Object.values(row).some((v) => v != null && String(v).trim() !== ""));
}

function downloadTemplate() {
  const headers = FIELD_KEYS.map(
    (k) => k + (k === "prenom_joueur" || k === "nom_joueur" || k === "date_naissance" ? "*" : ""),
  );
  const example = [
    "Léa",
    "Martin",
    "2010-05-12",
    "7",
    "L12345",
    "GK",
    "",
    "",
    "Sophie",
    "Martin",
    "sophie@example.com",
    "+33600000000",
    "Marc",
    "Martin",
    "marc@example.com",
    "+33600000002",
  ];
  const ws = XLSX.utils.aoa_to_sheet([headers, example]);
  // Force la colonne date en texte ISO pour empêcher un tableur de la
  // reformater en JJ/MM ou MM/JJ selon la locale de l'utilisateur.
  const dateColIndex = FIELD_KEYS.indexOf("date_naissance");
  if (dateColIndex >= 0) {
    const ref = XLSX.utils.encode_cell({ r: 1, c: dateColIndex });
    if (ws[ref]) {
      ws[ref].t = "s";
      ws[ref].z = "@";
    }
  }
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Joueurs");
  // `XLSX.writeFile` déclenche un lien `download` en interne, ignoré par les
  // WebView : le bouton ne produisait rien en natif. On génère le binaire et on
  // délègue à `downloadFile`, qui gère les deux plateformes.
  const out = XLSX.write(wb, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
  const blob = new Blob([out], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  void downloadFile(blob, "clubero-import-joueurs.xlsx");
}

export function ImportPlayersCsvDialog({
  open,
  onOpenChange,
  teamId,
  clubId,
  onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  teamId: string;
  clubId: string;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const aiAnalyze = useServerFn(analyzeFileWithAI);

  const doPreview = useServerFn(previewPlayersImport);
  const doImport = useServerFn(runImport);

  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<Array<Record<string, unknown>>>([]);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [iaUsed, setIaUsed] = useState(false);
  const [preview, setPreview] = useState<PlayerImportPreview | null>(null);
  /** rowIndex → set of fields authorized to overwrite. */
  const [overrides, setOverrides] = useState<Record<number, Set<string>>>({});
  const [loading, setLoading] = useState(false);
  const [busyLabel, setBusyLabel] = useState<string>("");
  const [result, setResult] = useState<Awaited<ReturnType<typeof runImport>> | null>(null);

  const fields = useMemo(() => getFields("players"), []);

  const cleanRows = useMemo(() => {
    if (!analysis) return null;
    return analysis.rows.map((r) => {
      const o: Record<string, string | null> = {};
      for (const f of fields) o[f.key] = r[f.key]?.value ?? null;
      return o;
    });
  }, [analysis, fields]);

  const editCell = (rowIdx: number, key: string, val: string) => {
    if (!analysis) return;
    const newRows = [...analysis.rows];
    const prev = newRows[rowIdx][key] ?? {
      value: null,
      error: null,
      auto_corrected: false,
      original: null,
    };
    const cell = {
      ...prev,
      value: val || null,
      original: prev.value,
      auto_corrected: false,
    };
    const fdef = fields.find((x) => x.key === key);
    cell.error = fdef?.validate ? fdef.validate(cell.value) : null;
    newRows[rowIdx] = { ...newRows[rowIdx], [key]: cell };
    const required = fields.filter((f) => f.required).map((f) => f.key);
    let valid = 0;
    let to_fix = 0;
    for (const r of newRows) {
      const ok = required.every((k) => r[k]?.value) && Object.values(r).every((c) => !c.error);
      if (ok) valid++;
      else to_fix++;
    }
    setAnalysis({
      ...analysis,
      rows: newRows,
      summary: { total: newRows.length, valid, to_fix },
    });
    setPreview(null);
    setOverrides({});
  };

  const reset = () => {
    setFileName("");
    setHeaders([]);
    setRawRows([]);
    setAnalysis(null);
    setIaUsed(false);
    setPreview(null);
    setOverrides({});
    setResult(null);
  };

  const onFile = useCallback(
    async (e: ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0];
      if (!f) return;
      e.target.value = "";
      setFileName(f.name);
      setResult(null);
      setAnalysis(null);
      setPreview(null);
      setOverrides({});
      setLoading(true);
      setBusyLabel(t("players.import.reading", { defaultValue: "Lecture du fichier..." }));
      try {
        const buf = await f.arrayBuffer();
        const wb = XLSX.read(buf, { type: "array", cellDates: true });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const rows = cleanSheetRows(
          XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
            defval: "",
            raw: true,
            blankrows: false,
          }),
        );
        if (rows.length === 0)
          throw new Error(
            t("players.import.noneDetected", {
              defaultValue: "Aucun joueur détecté dans le fichier.",
            }),
          );
        const hdrs = Object.keys(rows[0]);
        setHeaders(hdrs);
        setRawRows(rows);

        setBusyLabel(t("players.import.ai", { defaultValue: "Analyse IA en cours..." }));
        const res = await aiAnalyze({
          data: { clubId, teamId, type: "players", headers: hdrs, rawRows: rows },
        });
        setAnalysis(res);
        setIaUsed(true);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
        setBusyLabel("");
      }
    },
    [aiAnalyze, clubId, teamId, t],
  );

  const runImportFlow = async (opts: { fromDiffs?: boolean } = {}) => {
    if (!cleanRows) return;
    setLoading(true);
    try {
      // 1. Preview to detect conflicts on existing players.
      let previewRes = preview;
      if (!previewRes) {
        setBusyLabel(t("players.import.previewing", { defaultValue: "Vérification..." }));
        previewRes = await doPreview({
          data: { clubId, teamId, rows: cleanRows },
        });
        const hasDiffs = previewRes.rowPreviews.some((r) => r.diffs.length > 0);
        if (hasDiffs && !opts.fromDiffs) {
          // Stop here and let the user arbitrate conflicts.
          setPreview(previewRes);
          setOverrides({});
          setLoading(false);
          setBusyLabel("");
          return;
        }
      }

      // 2. Direct import (no conflicts, or user confirmed from diffs step).
      setBusyLabel(t("players.import.importing", { defaultValue: "Import en cours..." }));
      const fieldOverrides: Record<string, string[]> = {};
      for (const [idx, set] of Object.entries(overrides)) {
        if (set.size > 0) fieldOverrides[idx] = Array.from(set);
      }
      const res = await doImport({
        data: {
          clubId,
          teamId,
          type: "players",
          rows: cleanRows,
          sendInvitations: false,
          fileName,
          iaUsed,
          fieldOverrides: Object.keys(fieldOverrides).length > 0 ? fieldOverrides : undefined,
        },
      });
      setResult(res);
      if (res.imported > 0) onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
      setBusyLabel("");
    }
  };

  const toggleOverride = (rowIndex: number, field: string, checked: boolean) => {
    setOverrides((prev) => {
      const next = { ...prev };
      const set = new Set(next[rowIndex] ?? []);
      if (checked) set.add(field);
      else set.delete(field);
      next[rowIndex] = set;
      return next;
    });
  };

  const handleClose = (v: boolean) => {
    if (!v) reset();
    onOpenChange(v);
  };

  const rowsWithDiffs = preview?.rowPreviews.filter((r) => r.diffs.length > 0) ?? [];

  return (
    <ResponsiveFormDialog
      open={open}
      onOpenChange={handleClose}
      title={t("players.import.title", { defaultValue: "Importer des joueurs" })}
    >
      <div className="space-y-4 mt-3 pb-6">
        {/* Step 1: upload */}
        {!analysis && !result && (
          <>
            <p className="text-sm text-muted-foreground">
              {t("players.import.intro2", {
                defaultValue:
                  "Importez un fichier Excel (.xlsx) ou CSV. Les colonnes sont détectées automatiquement ; la date de naissance est obligatoire.",
              })}
            </p>
            <div className="flex items-center justify-between gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={downloadTemplate}>
                <Download className="h-4 w-4 mr-1" />
                {t("players.import.template", {
                  defaultValue: "Télécharger le modèle",
                })}
              </Button>
            </div>
            <label className="block border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:bg-muted/50 transition-colors">
              <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
              <div className="text-sm font-medium">
                {loading
                  ? busyLabel
                  : t("players.import.dropOrClick", {
                      defaultValue: "Cliquez pour choisir un fichier",
                    })}
              </div>
              <div className="text-xs text-muted-foreground mt-1">.xlsx, .xls, .csv</div>
              <input
                type="file"
                accept=".xlsx,.xls,.csv,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/comma-separated-values,text/plain,*/*"
                className="hidden"
                onChange={onFile}
                disabled={loading}
              />
            </label>
            {loading && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> {busyLabel}
              </div>
            )}
          </>
        )}

        {/* Step 2: analysis summary → go to preview */}
        {analysis && !preview && !result && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm flex-wrap">
              <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary px-2 py-0.5 text-xs">
                <Sparkles className="h-3 w-3" /> IA
              </span>
              <span className="text-muted-foreground truncate flex-1">{fileName}</span>
            </div>

            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg border p-3">
                <div className="text-2xl font-semibold">{analysis.summary.total}</div>
                <div className="text-xs text-muted-foreground">
                  {t("players.import.rowsTotal", { defaultValue: "lignes" })}
                </div>
              </div>
              <div className="rounded-lg border p-3">
                <div className="text-2xl font-semibold text-green-600">
                  {analysis.summary.valid}
                </div>
                <div className="text-xs text-muted-foreground">
                  {t("players.import.rowsValid", { defaultValue: "valides" })}
                </div>
              </div>
              <div className="rounded-lg border p-3">
                <div className="text-2xl font-semibold text-amber-600">
                  {analysis.summary.to_fix}
                </div>
                <div className="text-xs text-muted-foreground">
                  {t("players.import.rowsToFix", { defaultValue: "à corriger" })}
                </div>
              </div>
            </div>
            {analysis.summary.to_fix > 0 && (
              <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 space-y-1">
                <div className="font-medium flex items-center gap-1">
                  <AlertCircle className="h-3.5 w-3.5" />
                  {t("players.import.toFixHintEditable", {
                    defaultValue:
                      "Certaines lignes ont des erreurs (cases rouges) ou champs manquants (cases orange). Corrigez-les directement dans le tableau ci-dessous avant d'importer.",
                  })}
                </div>
              </div>
            )}

            {/* Editable data table — same UX as superadmin onboarding */}
            <div
              className="w-full min-w-0 overflow-x-auto overflow-y-auto border rounded-lg max-h-[50vh]"
              style={{ overscrollBehaviorX: "contain" }}
            >
              <table className="min-w-max text-xs">
                <thead className="bg-muted sticky top-0 z-10">
                  <tr>
                    <th className="px-2 py-1.5 text-left">#</th>
                    {fields.map((f) => (
                      <th key={f.key} className="px-2 py-1.5 text-left whitespace-nowrap">
                        {f.label}
                        {f.required && <span className="text-destructive">*</span>}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {analysis.rows.map((row, i) => (
                    <tr key={i} className="border-t">
                      <td className="px-2 py-1 text-muted-foreground">{i + 1}</td>
                      {fields.map((f) => {
                        const c = row[f.key];
                        const missing = f.required && !c?.value;
                        const bg = c?.error
                          ? "bg-destructive/10"
                          : missing
                            ? "bg-amber-500/10"
                            : "";
                        return (
                          <td key={f.key} className={`px-1 py-0.5 ${bg}`} title={c?.error || ""}>
                            <input
                              value={c?.value || ""}
                              onChange={(e) => editCell(i, f.key, e.target.value)}
                              placeholder={missing ? "Requis" : ""}
                              className="w-full bg-transparent outline-none px-1 py-0.5 min-w-[100px]"
                            />
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={reset} disabled={loading}>
                {t("common.back", { defaultValue: "Retour" })}
              </Button>
              <Button
                onClick={() => runImportFlow()}
                disabled={loading || analysis.summary.valid === 0}
                className="flex-1"
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  t("players.import.confirm", {
                    defaultValue: `Importer ${analysis.summary.valid} joueur(s)`,
                    count: analysis.summary.valid,
                  })
                )}
              </Button>
            </div>
          </div>
        )}

        {/* Step 3: preview with diffs */}
        {preview && !result && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              <div className="rounded-lg border p-2">
                <div className="text-xl font-semibold text-green-600">{preview.summary.new}</div>
                <div className="text-muted-foreground">
                  {t("players.import.actionNew", { defaultValue: "nouveaux" })}
                </div>
              </div>
              <div className="rounded-lg border p-2">
                <div className="text-xl font-semibold text-blue-600">{preview.summary.update}</div>
                <div className="text-muted-foreground">
                  {t("players.import.actionUpdate", { defaultValue: "mises à jour" })}
                </div>
              </div>
              <div className="rounded-lg border p-2">
                <div className="text-xl font-semibold text-amber-600">
                  {preview.summary.restore}
                </div>
                <div className="text-muted-foreground">
                  {t("players.import.actionRestore", { defaultValue: "réactivés" })}
                </div>
              </div>
            </div>

            {rowsWithDiffs.length === 0 ? (
              <div className="rounded-md border p-3 text-xs text-muted-foreground">
                {t("players.import.noDiffs", {
                  defaultValue:
                    "Aucun conflit détecté. Les champs vides des joueurs existants seront complétés automatiquement.",
                })}
              </div>
            ) : (
              <>
                <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900">
                  {t("players.import.diffsHint", {
                    defaultValue:
                      "Les joueurs existants ci-dessous ont des données qui diffèrent. Cochez uniquement les champs que vous voulez écraser. Par défaut, aucun écrasement.",
                  })}
                </div>
                <div className="space-y-2 max-h-[40vh] overflow-y-auto">
                  {rowsWithDiffs.map((row) => (
                    <div key={row.index} className="rounded-md border p-3 space-y-2 bg-card">
                      <div className="flex items-center justify-between text-xs">
                        <div className="font-medium">
                          {row.firstName} {row.lastName}
                          {row.birthDate && (
                            <span className="text-muted-foreground ml-1">· {row.birthDate}</span>
                          )}
                        </div>
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] uppercase ${
                            row.action === "restore"
                              ? "bg-amber-100 text-amber-800"
                              : "bg-blue-100 text-blue-800"
                          }`}
                        >
                          {row.action === "restore"
                            ? t("players.import.actionRestore", {
                                defaultValue: "réactivés",
                              })
                            : t("players.import.actionUpdate", {
                                defaultValue: "mises à jour",
                              })}
                        </span>
                      </div>
                      <table className="w-full text-xs">
                        <thead className="text-muted-foreground">
                          <tr>
                            <th className="text-left font-normal py-1">
                              {t("players.import.field", { defaultValue: "Champ" })}
                            </th>
                            <th className="text-left font-normal py-1">
                              {t("players.import.current", { defaultValue: "Actuel" })}
                            </th>
                            <th className="text-left font-normal py-1">
                              {t("players.import.incoming", {
                                defaultValue: "Nouveau",
                              })}
                            </th>
                            <th className="text-right font-normal py-1 w-24">
                              {t("players.import.overwrite", {
                                defaultValue: "Écraser",
                              })}
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {row.diffs.map((d) => {
                            const willAutoFill = !d.overwritable;
                            const checked = overrides[row.index]?.has(d.field) ?? false;
                            return (
                              <tr key={d.field} className="border-t">
                                <td className="py-1 font-medium">
                                  {FIELD_LABEL_FR[d.field] ?? d.field}
                                </td>
                                <td className="py-1 text-muted-foreground">
                                  {d.current ?? (
                                    <span className="italic">
                                      {t("players.import.empty", {
                                        defaultValue: "(vide)",
                                      })}
                                    </span>
                                  )}
                                </td>
                                <td className="py-1">{d.incoming ?? "—"}</td>
                                <td className="py-1 text-right">
                                  {willAutoFill ? (
                                    <span className="text-[10px] text-green-700">
                                      {t("players.import.autoFill", {
                                        defaultValue: "auto",
                                      })}
                                    </span>
                                  ) : (
                                    <Checkbox
                                      checked={checked}
                                      onCheckedChange={(v) =>
                                        toggleOverride(row.index, d.field, !!v)
                                      }
                                    />
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  ))}
                </div>
              </>
            )}

            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setPreview(null);
                  setOverrides({});
                }}
                disabled={loading}
              >
                {t("common.back", { defaultValue: "Retour" })}
              </Button>
              <Button
                onClick={() => runImportFlow({ fromDiffs: true })}
                disabled={loading || (analysis?.summary.valid ?? 0) === 0}
                className="flex-1"
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  t("players.import.confirm", {
                    defaultValue: `Importer ${analysis?.summary.valid ?? 0} joueur(s)`,
                    count: analysis?.summary.valid ?? 0,
                  })
                )}
              </Button>
            </div>
          </div>
        )}

        {/* Step 4: result */}
        {result && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-green-600">
              <CheckCircle2 className="h-5 w-5" />
              <span className="font-medium">
                {t("players.import.doneTitle", { defaultValue: "Import terminé" })}
              </span>
            </div>
            <div className="rounded-md border p-3 text-sm space-y-1">
              <div>
                {t("players.import.created", { defaultValue: "Nouveaux joueurs" })} :{" "}
                <strong>{result.summary.players_created ?? 0}</strong>
              </div>
              <div>
                {t("players.import.updated", { defaultValue: "Mis à jour" })} :{" "}
                <strong>{result.summary.players_updated ?? 0}</strong>
              </div>
              <div>
                {t("players.import.restored", { defaultValue: "Réactivés" })} :{" "}
                <strong>{result.summary.players_restored ?? 0}</strong>
              </div>
              <div>
                {t("players.import.linked", {
                  defaultValue: "Rattachés à cette équipe",
                })}{" "}
                : <strong>{result.summary.players_linked ?? 0}</strong>
              </div>

              {result.errors.length > 0 && (
                <div className="text-amber-700 mt-2">
                  {result.errors.length}{" "}
                  {t("players.import.errorRows", { defaultValue: "ligne(s) en erreur" })}
                </div>
              )}
            </div>
            {result.errors.length > 0 && (
              <ul className="text-xs text-muted-foreground max-h-32 overflow-y-auto space-y-0.5">
                {result.errors.slice(0, 10).map((e, i) => (
                  <li key={i}>
                    {t("players.import.row", { defaultValue: "Ligne" })} {e.row} : {e.error}
                  </li>
                ))}
              </ul>
            )}
            <div className="flex gap-2">
              <Button variant="outline" onClick={reset}>
                {t("players.import.another", { defaultValue: "Nouvel import" })}
              </Button>
              <Button className="flex-1" onClick={() => handleClose(false)}>
                {t("common.close", { defaultValue: "Fermer" })}
              </Button>
            </div>
          </div>
        )}
      </div>
    </ResponsiveFormDialog>
  );
}
