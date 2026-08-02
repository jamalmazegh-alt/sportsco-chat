import { downloadFile } from "@/lib/download-file";
// Minimal CSV exporter — handles commas, quotes, newlines via RFC 4180 quoting.

function escapeCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = typeof value === "string" ? value : String(value);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function toCsv<T extends Record<string, unknown>>(
  rows: T[],
  columns: { key: keyof T & string; header: string }[],
): string {
  const header = columns.map((c) => escapeCell(c.header)).join(",");
  const body = rows.map((r) => columns.map((c) => escapeCell(r[c.key])).join(","));
  return [header, ...body].join("\r\n");
}

/**
 * Propose un CSV au téléchargement.
 *
 * Délègue à `downloadFile`, qui gère web et natif : dans une WebView,
 * l'attribut `download` d'un lien est ignoré et le clic ne produit rien.
 */
export function downloadCsv(filename: string, csv: string) {
  // BOM pour la compatibilité UTF-8 d'Excel
  const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
  void downloadFile(blob, filename.endsWith(".csv") ? filename : `${filename}.csv`);
}
