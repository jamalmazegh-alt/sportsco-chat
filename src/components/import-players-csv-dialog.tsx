import { useCallback, useMemo, useState, type ChangeEvent } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import { Loader2, Upload, Download, Sparkles, CheckCircle2, AlertCircle } from "lucide-react";
import { ResponsiveFormDialog } from "@/components/responsive-form-dialog";
import { Button } from "@/components/ui/button";
import {
  analyzeFileWithAI,
  parseTemplateFn,
  runImport,
} from "@/lib/superadmin-import/import.functions";
import {
  type AnalysisResult,
  getFields,
  templateMatchRatio,
} from "@/lib/superadmin-import/schemas";

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

function cleanSheetRows(rows: Array<Record<string, unknown>>) {
  return rows
    .map((row) => {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(row)) {
        if (k === "__rowNum__" || k.trim() === "") continue;
        out[k] = typeof v === "string" ? v.trim() : v;
      }
      return out;
    })
    .filter((row) =>
      Object.values(row).some((v) => v != null && String(v).trim() !== ""),
    );
}

function downloadTemplate() {
  const headers = FIELD_KEYS.map((k) => k + (k === "prenom_joueur" || k === "nom_joueur" || k === "date_naissance" ? "*" : ""));
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
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Joueurs");
  XLSX.writeFile(wb, "clubero-import-joueurs.xlsx");
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
  const tplParse = useServerFn(parseTemplateFn);
  const doImport = useServerFn(runImport);

  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<Array<Record<string, unknown>>>([]);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [iaUsed, setIaUsed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busyLabel, setBusyLabel] = useState<string>("");
  const [result, setResult] =
    useState<Awaited<ReturnType<typeof runImport>> | null>(null);

  const fields = useMemo(() => getFields("players"), []);

  const reset = () => {
    setFileName("");
    setHeaders([]);
    setRawRows([]);
    setAnalysis(null);
    setIaUsed(false);
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
      setLoading(true);
      setBusyLabel(t("players.import.reading", { defaultValue: "Lecture du fichier..." }));
      try {
        const buf = await f.arrayBuffer();
        const wb = XLSX.read(buf, { type: "array", cellDates: true });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const rows = cleanSheetRows(
          XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
            defval: "",
            raw: false,
            blankrows: false,
          }),
        );
        if (rows.length === 0) throw new Error(t("players.import.noneDetected", { defaultValue: "Aucun joueur détecté dans le fichier." }));
        const hdrs = Object.keys(rows[0]);
        setHeaders(hdrs);
        setRawRows(rows);

        const isTemplate = templateMatchRatio(hdrs, "players") >= 0.8;
        if (isTemplate) {
          setBusyLabel(t("players.import.parsing", { defaultValue: "Analyse du modèle..." }));
          const res = await tplParse({
            data: { clubId, teamId, type: "players", headers: hdrs, rawRows: rows },
          });
          setAnalysis(res);
          setIaUsed(false);
        } else {
          setBusyLabel(t("players.import.ai", { defaultValue: "Analyse IA en cours..." }));
          const res = await aiAnalyze({
            data: { clubId, teamId, type: "players", headers: hdrs, rawRows: rows },
          });
          setAnalysis(res);
          setIaUsed(true);
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
        setBusyLabel("");
      }
    },
    [aiAnalyze, clubId, teamId, tplParse, t],
  );

  const confirmImport = async () => {
    if (!analysis) return;
    setLoading(true);
    setBusyLabel(t("players.import.importing", { defaultValue: "Import en cours..." }));
    try {
      const cleanRows = analysis.rows.map((r) => {
        const o: Record<string, string | null> = {};
        for (const f of fields) o[f.key] = r[f.key]?.value ?? null;
        return o;
      });
      const res = await doImport({
        data: {
          clubId,
          teamId,
          type: "players",
          rows: cleanRows,
          sendInvitations: false,
          fileName,
          iaUsed,
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

  const handleClose = (v: boolean) => {
    if (!v) reset();
    onOpenChange(v);
  };

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
                {t("players.import.template", { defaultValue: "Télécharger le modèle" })}
              </Button>
            </div>
            <label className="block border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:bg-muted/50 transition-colors">
              <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
              <div className="text-sm font-medium">
                {loading
                  ? busyLabel
                  : t("players.import.dropOrClick", { defaultValue: "Cliquez pour choisir un fichier" })}
              </div>
              <div className="text-xs text-muted-foreground mt-1">.xlsx, .xls, .csv</div>
              <input
                type="file"
                accept=".xlsx,.xls,.csv,text/csv"
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

        {/* Step 2: preview summary */}
        {analysis && !result && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm">
              {iaUsed ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary px-2 py-0.5 text-xs">
                  <Sparkles className="h-3 w-3" /> IA
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs">
                  {t("players.import.templateBadge", { defaultValue: "Modèle Clubero" })}
                </span>
              )}
              <span className="text-muted-foreground truncate">{fileName}</span>
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
                  {t("players.import.toFixHint", {
                    defaultValue:
                      "Certaines lignes ont des erreurs et seront ignorées. Corrigez le fichier puis relancez l'import si besoin.",
                  })}
                </div>
                <ul className="list-disc pl-4">
                  {analysis.rows.slice(0, 5).flatMap((r, idx) =>
                    Object.entries(r)
                      .filter(([, c]) => c.error)
                      .slice(0, 1)
                      .map(([k, c]) => (
                        <li key={`${idx}-${k}`}>
                          {t("players.import.row", { defaultValue: "Ligne" })} {idx + 2} · {k} :{" "}
                          {c.error}
                        </li>
                      )),
                  )}
                </ul>
              </div>
            )}
            <div className="flex gap-2">
              <Button variant="outline" onClick={reset} disabled={loading}>
                {t("common.back", { defaultValue: "Retour" })}
              </Button>
              <Button
                onClick={confirmImport}
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

        {/* Step 3: result */}
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
