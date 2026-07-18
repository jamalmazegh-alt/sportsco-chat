/**
 * redactErrorMessage — assainit un message d'erreur avant stockage/affichage.
 *
 * Masque : access_token=..., client_secret=..., refresh_token=..., code=...,
 * Bearer <token>, apikey/api_key=..., adresses email, numéros de téléphone
 * évidents. Tronque à MAX_LEN caractères.
 *
 * Utilisé systématiquement avant `logActivity({ metadata: { error } })` pour
 * les réponses Meta/Graph/Instagram (susceptibles de contenir un access_token
 * dans l'URL) et pour les error_log d'import (susceptibles de contenir des
 * PII).
 */
const MAX_LEN = 500;

const PATTERNS: Array<[RegExp, string]> = [
  [
    /(access_token|refresh_token|client_secret|code|apikey|api_key|token)=[^&\s"']+/gi,
    "$1=[REDACTED]",
  ],
  [/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [REDACTED]"],
  [/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, "[EMAIL]"],
  // Basic international-ish phone match (7-15 digits, may have + and spaces/dashes)
  [/(?<!\d)\+?\d[\d\s.-]{6,14}\d(?!\d)/g, "[PHONE]"],
];

export function redactErrorMessage(input: unknown): string {
  if (input == null) return "";
  let s: string;
  if (input instanceof Error) s = input.message ?? String(input);
  else if (typeof input === "string") s = input;
  else {
    try {
      s = JSON.stringify(input);
    } catch {
      s = String(input);
    }
  }
  for (const [re, rep] of PATTERNS) s = s.replace(re, rep);
  if (s.length > MAX_LEN) s = s.slice(0, MAX_LEN) + "…";
  return s;
}
