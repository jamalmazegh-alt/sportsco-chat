import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useMemo, useCallback } from "react";
import { useServerFn } from "@tanstack/react-start";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Upload, ArrowLeft, FileSpreadsheet, Sparkles, Download, CheckCircle2, AlertCircle } from "lucide-react";
import {
  listClubsForImport,
  getClubImportStats,
  analyzeFileWithAI,
  parseTemplateFn,
  runImport,
} from "@/lib/superadmin-import/import.functions";
import {
  type AnalysisResult,
  type ImportType,
  getFields,
  templateMatchRatio,
} from "@/lib/superadmin-import/schemas";

export const Route = createFileRoute("/superadmin/onboarding/import")({
  component: ImportPage,
});

type Club = { id: string; name: string };
type Stats = Awaited<ReturnType<typeof getClubImportStats>>;

const TYPE_LABELS: Record<ImportType, string> = {
  players: "Joueurs & Parents",
  coaches: "Entraîneurs",
  planning: "Planning",
};

function downloadTemplate(type: ImportType) {
  const fields = getFields(type);
  const ws = XLSX.utils.aoa_to_sheet([fields.map((f) => f.key + (f.required ? "*" : ""))]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Template");
  XLSX.writeFile(wb, `clubero-template-${type}.xlsx`);
}

function ImportPage() {
  const listClubs = useServerFn(listClubsForImport);
  const getStats = useServerFn(getClubImportStats);
  const aiAnalyze = useServerFn(analyzeFileWithAI);
  const tplParse = useServerFn(parseTemplateFn);
  const doImport = useServerFn(runImport);

  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5>(1);
  const [search, setSearch] = useState("");
  const [clubs, setClubs] = useState<Club[]>([]);
  const [club, setClub] = useState<Club | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [type, setType] = useState<ImportType | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<Array<Record<string, unknown>>>([]);
  const [templateDetected, setTemplateDetected] = useState(false);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [iaUsed, setIaUsed] = useState(false);
  const [sendInvitations, setSendInvitations] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Awaited<ReturnType<typeof runImport>> | null>(null);

  const doSearch = useCallback(async (q: string) => {
    setSearch(q);
    if (q.length < 2) { setClubs([]); return; }
    const { clubs } = await listClubs({ data: { search: q } });
    setClubs(clubs);
  }, [listClubs]);

  const selectClub = async (c: Club) => {
    setClub(c);
    setClubs([]);
    setSearch(c.name);
    const s = await getStats({ data: { clubId: c.id } });
    setStats(s);
  };

  const onFile = async (f: File) => {
    if (!type || !club) return;
    setFileName(f.name);
    setLoading(true);
    try {
      const buf = await f.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
      if (rows.length === 0) throw new Error("Fichier vide");
      const hdrs = Object.keys(rows[0]);
      setHeaders(hdrs);
      setRawRows(rows);
      const ratio = templateMatchRatio(hdrs, type);
      const isTemplate = ratio >= 0.8;
      setTemplateDetected(isTemplate);
      setStep(3);
      if (isTemplate) {
        const res = await tplParse({ data: { type, headers: hdrs, rawRows: rows } });
        setAnalysis(res);
        setIaUsed(false);
        setStep(4);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const runAI = async () => {
    if (!type || !club) return;
    setLoading(true);
    try {
      const res = await aiAnalyze({ data: { clubId: club.id, type, headers, rawRows } });
      setAnalysis(res);
      setIaUsed(true);
      setStep(4);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally { setLoading(false); }
  };

  const fields = useMemo(() => (type ? getFields(type) : []), [type]);

  const editCell = (rowIdx: number, key: string, val: string) => {
    if (!analysis) return;
    const newRows = [...analysis.rows];
    const cell = { ...newRows[rowIdx][key], value: val || null, original: newRows[rowIdx][key].value, auto_corrected: false };
    const fdef = fields.find((f) => f.key === key);
    cell.error = fdef?.validate ? fdef.validate(cell.value) : null;
    newRows[rowIdx] = { ...newRows[rowIdx], [key]: cell };
    // recompute summary
    let valid = 0; let to_fix = 0;
    const required = fields.filter((f) => f.required).map((f) => f.key);
    for (const r of newRows) {
      const ok = required.every((k) => r[k]?.value) && Object.values(r).every((c) => !c.error);
      if (ok) valid++; else to_fix++;
    }
    setAnalysis({ ...analysis, rows: newRows, summary: { total: newRows.length, valid, to_fix } });
  };

  const confirmImport = async () => {
    if (!analysis || !type || !club) return;
    setLoading(true);
    try {
      const cleanRows = analysis.rows.map((r) => {
        const o: Record<string, string | null> = {};
        for (const f of fields) o[f.key] = r[f.key]?.value ?? null;
        return o;
      });
      const res = await doImport({
        data: { clubId: club.id, type, rows: cleanRows, sendInvitations, fileName, iaUsed },
      });
      setResult(res);
      setStep(5);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally { setLoading(false); }
  };

  const reset = (keepClub: boolean) => {
    setStep(2); setType(null); setFileName(""); setHeaders([]); setRawRows([]);
    setAnalysis(null); setResult(null); setIaUsed(false); setSendInvitations(false);
    if (!keepClub) { setClub(null); setStats(null); setSearch(""); setStep(1); }
  };

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      <Link to="/superadmin" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Super Admin
      </Link>
      <div>
        <h1 className="text-2xl font-semibold">Import de données — Onboarding club</h1>
        <p className="text-sm text-muted-foreground">Outil interne Clubero. Étape {step} sur 5.</p>
      </div>

      {/* Stepper */}
      <div className="flex gap-1">
        {[1,2,3,4,5].map(n => (
          <div key={n} className={`h-1 flex-1 rounded ${step >= n ? "bg-primary" : "bg-muted"}`} />
        ))}
      </div>

      {/* STEP 1 — Club */}
      {step === 1 && (
        <div className="space-y-4">
          <h2 className="font-medium">Sélectionner le club</h2>
          <Input placeholder="Rechercher un club..." value={search} onChange={(e) => doSearch(e.target.value)} />
          {clubs.length > 0 && (
            <div className="border rounded-md divide-y">
              {clubs.map((c) => (
                <button key={c.id} onClick={() => selectClub(c)} className="block w-full text-left px-3 py-2 hover:bg-muted">
                  {c.name}
                </button>
              ))}
            </div>
          )}
          {club && stats && (
            <div className="rounded-lg border p-4 space-y-2">
              <div className="font-medium">✓ {club.name}</div>
              <div className="text-sm text-muted-foreground">
                {stats.teams} équipes · {stats.players} joueurs · {stats.coaches} coachs déjà en base
              </div>
              {stats.imports.length > 0 && (
                <div className="text-xs text-muted-foreground">
                  {stats.imports.length} import(s) effectué(s) — dernier le {new Date(stats.imports[0].created_at).toLocaleDateString("fr-FR")}
                </div>
              )}
              <Button onClick={() => setStep(2)} className="mt-2">Continuer</Button>
            </div>
          )}
        </div>
      )}

      {/* STEP 2 — Type + upload */}
      {step === 2 && club && (
        <div className="space-y-4">
          <h2 className="font-medium">Choisir le type d'import</h2>
          <p className="text-xs text-muted-foreground">Ordre conseillé : Joueurs → Coachs → Planning (les événements dépendent des équipes).</p>
          <div className="grid md:grid-cols-3 gap-3">
            {(Object.keys(TYPE_LABELS) as ImportType[]).map((t) => (
              <button
                key={t}
                onClick={() => setType(t)}
                className={`border rounded-lg p-4 text-left hover:bg-muted ${type === t ? "border-primary ring-2 ring-primary/30" : ""}`}
              >
                <FileSpreadsheet className="h-5 w-5 mb-2 text-primary" />
                <div className="font-medium">{TYPE_LABELS[t]}</div>
                <button
                  onClick={(e) => { e.stopPropagation(); downloadTemplate(t); }}
                  className="mt-2 inline-flex items-center gap-1 text-xs text-primary hover:underline"
                >
                  <Download className="h-3 w-3" /> Télécharger le modèle
                </button>
              </button>
            ))}
          </div>
          {type && (
            <label className="block border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:bg-muted/50">
              <Upload className="h-6 w-6 mx-auto mb-2 text-muted-foreground" />
              <div className="text-sm">Glissez le fichier ou cliquez (xlsx/xls/csv, max 5 Mo)</div>
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) { if (f.size > 5*1024*1024) { toast.error("Fichier trop volumineux (max 5 Mo)"); return; } onFile(f); } }}
              />
              {loading && <Loader2 className="h-4 w-4 animate-spin mx-auto mt-2" />}
            </label>
          )}
        </div>
      )}

      {/* STEP 3 — IA fallback */}
      {step === 3 && !templateDetected && (
        <div className="space-y-4">
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 flex gap-3">
            <Sparkles className="h-5 w-5 text-amber-600 flex-shrink-0" />
            <div className="text-sm">
              <p className="font-medium">Ce fichier ne correspond pas au modèle standard.</p>
              <p className="text-muted-foreground">L'IA peut analyser et mapper les colonnes vers les champs Clubero.</p>
            </div>
          </div>
          <Button onClick={runAI} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            Analyser avec l'IA
          </Button>
        </div>
      )}

      {/* STEP 4 — Validation */}
      {step === 4 && analysis && type && (
        <div className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="text-sm">
              <span className="font-medium">{analysis.summary.total} lignes</span>
              {" · "}
              <span className={analysis.summary.to_fix === 0 ? "text-emerald-600" : "text-amber-600"}>
                {analysis.summary.to_fix} à compléter
              </span>
              {iaUsed && <span className="ml-2 text-xs text-primary">✨ analysé par l'IA</span>}
            </div>
          </div>
          {analysis.corrections.length > 0 && (
            <details className="rounded border p-3 text-xs">
              <summary className="cursor-pointer text-muted-foreground">
                {analysis.corrections.length} normalisation(s) automatique(s) — voir le détail
              </summary>
              <ul className="mt-2 space-y-1">
                {analysis.corrections.map((c, i) => (
                  <li key={i}><code>{c.field}</code> : "{c.original}" → "{c.corrected}" ({c.count}×)</li>
                ))}
              </ul>
            </details>
          )}
          <div className="overflow-auto border rounded-lg max-h-[60vh]">
            <table className="w-full text-xs">
              <thead className="bg-muted sticky top-0">
                <tr>
                  <th className="px-2 py-1.5 text-left">#</th>
                  {fields.map((f) => (
                    <th key={f.key} className="px-2 py-1.5 text-left whitespace-nowrap">
                      {f.label}{f.required && <span className="text-destructive">*</span>}
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
                      const bg = c?.error ? "bg-destructive/10" : missing ? "bg-amber-500/10" : "";
                      return (
                        <td key={f.key} className={`px-1 py-0.5 ${bg}`} title={c?.error || ""}>
                          <input
                            value={c?.value || ""}
                            onChange={(e) => editCell(i, f.key, e.target.value)}
                            placeholder={missing ? "Requis" : ""}
                            className="w-full bg-transparent outline-none px-1 py-0.5 min-w-[80px]"
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {(type === "players" || type === "coaches") && (
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={sendInvitations} onCheckedChange={(v) => setSendInvitations(!!v)} />
              Envoyer les invitations par email après import
            </label>
          )}
          <Button onClick={confirmImport} disabled={loading || analysis.summary.to_fix > 0} className="w-full">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            Confirmer et importer
          </Button>
        </div>
      )}

      {/* STEP 5 — Résumé */}
      {step === 5 && result && (
        <div className="space-y-4">
          <div className={`rounded-lg border p-5 ${result.status === "success" ? "border-emerald-500/40 bg-emerald-500/10" : "border-amber-500/40 bg-amber-500/10"}`}>
            <div className="flex items-center gap-2 font-medium">
              {result.status === "success" ? <CheckCircle2 className="h-5 w-5 text-emerald-600" /> : <AlertCircle className="h-5 w-5 text-amber-600" />}
              Import {result.status === "success" ? "réussi" : result.status === "partial" ? "partiel" : "échoué"}
            </div>
            <div className="mt-2 text-sm">
              {result.imported} / {result.total} lignes importées
            </div>
            <div className="mt-2 text-xs text-muted-foreground space-y-0.5">
              {Object.entries(result.summary).map(([k, v]) => (
                <div key={k}>{k.replace(/_/g, " ")} : {v}</div>
              ))}
            </div>
            {result.errors.length > 0 && (
              <details className="mt-3 text-xs">
                <summary className="cursor-pointer">{result.errors.length} erreur(s)</summary>
                <ul className="mt-1 max-h-40 overflow-auto">
                  {result.errors.map((e, i) => <li key={i}>Ligne {e.row} : {e.error}</li>)}
                </ul>
              </details>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => reset(true)}>Importer un autre type</Button>
            <Button variant="outline" onClick={() => reset(false)}>Changer de club</Button>
            <Link to="/superadmin"><Button variant="ghost">Retour au dashboard</Button></Link>
          </div>
        </div>
      )}
    </div>
  );
}
