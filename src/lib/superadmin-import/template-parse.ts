/**
 * Parsing template strict (sans IA) côté serveur.
 * Reçoit headers + rawRows (objets) issus de SheetJS côté client.
 */
import {
  type AnalysisResult,
  type Cell,
  type FieldDef,
  type ImportType,
  getFields,
} from "./schemas";

const normKey = (s: string) =>
  s.toLowerCase().replace(/\s+/g, "").replace(/[éèê]/g, "e").replace(/[^a-z0-9_]/g, "");

function normalizeDate(v: string): string {
  // Accept JJ/MM/AAAA, JJ-MM-AAAA, YYYY-MM-DD, Excel serial (number-as-string)
  const trimmed = v.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const m = trimmed.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (m) {
    let [, d, mo, y] = m;
    if (y.length === 2) y = (parseInt(y, 10) > 30 ? "19" : "20") + y;
    return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  // Excel serial number
  const n = Number(trimmed);
  if (!isNaN(n) && n > 10000 && n < 80000) {
    const date = new Date(Date.UTC(1899, 11, 30) + n * 86400000);
    return date.toISOString().slice(0, 10);
  }
  return trimmed;
}

function normalizeTime(v: string): string {
  const t = v.trim().toLowerCase().replace(/\s+/g, "");
  const m1 = t.match(/^(\d{1,2})[h:](\d{0,2})$/);
  if (m1) return `${m1[1].padStart(2, "0")}:${(m1[2] || "00").padStart(2, "0")}`;
  const m2 = t.match(/^(\d{1,2}):(\d{2})(am|pm)?$/);
  if (m2) {
    let h = parseInt(m2[1], 10);
    if (m2[3] === "pm" && h < 12) h += 12;
    if (m2[3] === "am" && h === 12) h = 0;
    return `${String(h).padStart(2, "0")}:${m2[2]}`;
  }
  return v.trim();
}

function normalizeValue(field: FieldDef, raw: string): string {
  const trimmed = raw.trim();
  if (field.key.includes("date") && !field.key.includes("naissance") === false) {
    return normalizeDate(trimmed);
  }
  if (field.key.startsWith("date_") || field.key === "date_naissance" || field.key === "recurrence_fin") {
    return normalizeDate(trimmed);
  }
  if (field.key.startsWith("heure_")) return normalizeTime(trimmed);
  if (field.key === "email" || field.key.startsWith("email_")) return trimmed.toLowerCase();
  if (field.key === "role") {
    const r = trimmed.toLowerCase().replace(/\s+/g, "_");
    if (["coach", "assistant_coach", "manager"].includes(r)) return r;
    return trimmed;
  }
  if (field.key === "domicile") {
    const l = trimmed.toLowerCase();
    if (["domicile", "home", "dom"].includes(l)) return "Domicile";
    if (["exterieur", "extérieur", "away", "ext"].includes(l)) return "Extérieur";
    return trimmed;
  }
  return trimmed;
}

export function parseTemplate(
  type: ImportType,
  headers: string[],
  rawRows: Array<Record<string, unknown>>,
): AnalysisResult {
  const fields = getFields(type);
  const headerByNorm = new Map<string, string>();
  for (const h of headers) headerByNorm.set(normKey(h), h);

  const mapping: Record<string, string> = {};
  for (const f of fields) {
    const found = headerByNorm.get(normKey(f.key));
    if (found) mapping[found] = f.key;
  }

  const rows: AnalysisResult["rows"] = [];
  const correctionMap = new Map<string, { original: string; corrected: string; count: number }>();
  let valid = 0;
  let to_fix = 0;

  for (const raw of rawRows) {
    const out: Record<string, Cell> = {};
    let rowOk = true;
    for (const f of fields) {
      const srcHeader = Object.keys(mapping).find((k) => mapping[k] === f.key);
      const rawVal = srcHeader != null ? raw[srcHeader] : undefined;
      const str = rawVal == null || rawVal === "" ? "" : String(rawVal);
      let value: string | null = null;
      let original: string | null = null;
      let auto_corrected = false;
      let error: string | null = null;
      if (str) {
        const normalized = normalizeValue(f, str);
        value = normalized || null;
        if (normalized !== str) {
          auto_corrected = true;
          original = str;
          const k = `${f.key}|${str}`;
          const ex = correctionMap.get(k);
          if (ex) ex.count++;
          else correctionMap.set(k, { original: str, corrected: normalized, count: 1 });
        }
        if (f.validate) error = f.validate(value);
      } else if (f.required) {
        rowOk = false;
      }
      out[f.key] = { value, error, auto_corrected, original };
      if (error) rowOk = false;
    }
    if (rowOk) valid++;
    else to_fix++;
    rows.push(out);
  }

  const corrections = Array.from(correctionMap.entries()).map(([k, v]) => ({
    field: k.split("|")[0],
    original: v.original,
    corrected: v.corrected,
    count: v.count,
  }));

  return { mapping, rows, corrections, summary: { total: rows.length, valid, to_fix } };
}
