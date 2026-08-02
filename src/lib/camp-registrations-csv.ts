/**
 * Étape 5 — Export CSV du tableau d'inscriptions.
 *
 * Respecte les filtres actifs (déjà appliqués côté client sur `rows`).
 * Aucun lien ni contenu de document — uniquement des champs textuels.
 * UTF-8 BOM + séparateur `;` pour ouverture directe dans Excel avec accents.
 */
import type { CampRegistrationRow } from "@/lib/camp-registrations.functions";
import { downloadFile } from "@/lib/download-file";

function escapeCsv(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (/[";\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function ageFromBirthDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return String(age);
}

export interface CsvExportOptions {
  campTitle?: string;
  campSlug?: string;
  t: (k: string, o?: any) => string;
}

export function buildRegistrationsCsv(
  rows: CampRegistrationRow[],
  opts: CsvExportOptions,
): { filename: string; blob: Blob } {
  const { t } = opts;
  const header = [
    t("registrations.csv.participantFirstName", { defaultValue: "Participant - Prénom" }),
    t("registrations.csv.participantLastName", { defaultValue: "Participant - Nom" }),
    t("registrations.csv.birthDate", { defaultValue: "Date de naissance" }),
    t("registrations.csv.age", { defaultValue: "Âge" }),
    t("registrations.csv.gender", { defaultValue: "Genre" }),
    t("registrations.csv.clubName", { defaultValue: "Club actuel" }),
    t("registrations.csv.guardianFirstName", { defaultValue: "Responsable - Prénom" }),
    t("registrations.csv.guardianLastName", { defaultValue: "Responsable - Nom" }),
    t("registrations.csv.email", { defaultValue: "E-mail" }),
    t("registrations.csv.phone", { defaultValue: "Téléphone" }),
    t("registrations.csv.registrationStatus", { defaultValue: "Statut inscription" }),
    t("registrations.csv.paymentStatus", { defaultValue: "Statut paiement" }),
    t("registrations.csv.dossierStatus", { defaultValue: "Statut dossier" }),
    t("registrations.csv.amountPaid", { defaultValue: "Montant payé" }),
    t("registrations.csv.requestedAt", { defaultValue: "Date de demande" }),
  ];

  const lines: string[] = [];
  lines.push(header.map(escapeCsv).join(";"));

  for (const r of rows) {
    const cells = [
      r.participant_first_name,
      r.participant_last_name,
      r.birth_date,
      ageFromBirthDate(r.birth_date),
      r.gender ?? "",
      r.club_name ?? "",
      r.guardian_first_name,
      r.guardian_last_name,
      r.guardian_email,
      r.guardian_phone ?? "",
      t(`registrations.status.${r.registration_status}`, {
        defaultValue: r.registration_status,
      }),
      t(`registrations.payment.${r.payment_status}`, {
        defaultValue: r.payment_status,
      }),
      t(
        `registrations.dossier.${
          r.dossier_status === "documents_missing"
            ? "documentsMissing"
            : r.dossier_status === "documents_pending"
              ? "documentsPending"
              : r.dossier_status === "payment_missing"
                ? "paymentMissing"
                : "complete"
        }`,
        { defaultValue: r.dossier_status },
      ),
      r.amount_paid.toFixed(2),
      new Date(r.created_at).toISOString(),
    ];
    lines.push(cells.map(escapeCsv).join(";"));
  }

  // UTF-8 BOM pour Excel (accents corrects).
  const BOM = "\uFEFF";
  const csv = BOM + lines.join("\r\n");
  const stamp = new Date().toISOString().slice(0, 10);
  const slug = (opts.campSlug ?? "stage").replace(/[^a-z0-9-]/gi, "-");
  const filename = `inscriptions-${slug}-${stamp}.csv`;
  return {
    filename,
    blob: new Blob([csv], { type: "text/csv;charset=utf-8" }),
  };
}

export function downloadRegistrationsCsv(
  rows: CampRegistrationRow[],
  opts: CsvExportOptions,
): void {
  const { filename, blob } = buildRegistrationsCsv(rows, opts);
  void downloadFile(blob, filename);
}
