/**
 * Single source of truth for Clubero's legal/company information.
 *
 * All legal mentions across the app (marketing footer, contact page,
 * email footers, generated PDFs / invoices / receipts, JSON-LD,
 * support pages, settings, etc.) MUST consume these values rather
 * than hardcoding company data.
 *
 * Translations should interpolate these values (legalName, address,
 * registrationNumber, email) instead of inlining them in i18n strings.
 *
 * IMPORTANT:
 * - `registrationNumber` (Estonian registrikood) is NOT a VAT number.
 * - Never display an empty VAT number — show `vatLabel` instead.
 */
export const COMPANY_LEGAL = {
  legalName: "Clubero OÜ",
  brandName: "Clubero",
  legalForm: "OÜ (Estonian Private Limited Company / Ltd)",
  registrationNumber: "17538695",
  vatNumber: null,
  vatLabel: "VAT not applicable",
  incorporationDate: "2026-06-25",
  activity: "Software Publishing (NACE 58.29)",
  registeredOffice: {
    street: "Sepapaja tn 6",
    postalCode: "15551",
    city: "Tallinn",
    country: "Estonia",
    countryCode: "EE",
  },
  email: "hello@clubero.app",
  website: "https://clubero.app",
} as const;

export type CompanyLegal = typeof COMPANY_LEGAL;

/** Single-line address: "Sepapaja tn 6, 15551 Tallinn, Estonia". */
export function formatCompanyAddress(): string {
  const a = COMPANY_LEGAL.registeredOffice;
  return `${a.street}, ${a.postalCode} ${a.city}, ${a.country}`;
}

/** Footer line for emails: "Clubero OÜ · Reg. No. 17538695 · Tallinn, Estonia · hello@clubero.app". */
export function formatCompanyFooterLine(): string {
  const a = COMPANY_LEGAL.registeredOffice;
  return `${COMPANY_LEGAL.legalName} · Reg. No. ${COMPANY_LEGAL.registrationNumber} · ${a.city}, ${a.country} · ${COMPANY_LEGAL.email}`;
}
