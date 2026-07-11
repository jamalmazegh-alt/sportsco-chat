/**
 * Pure helpers for camp slugs. Kept separate from camps.functions.ts so it
 * can be unit-tested and reused client-side (live preview in the form).
 */

const RESERVED_SLUGS = new Set([
  "admin",
  "api",
  "app",
  "auth",
  "login",
  "logout",
  "register",
  "new",
  "edit",
  "delete",
  "index",
  "stages",
  "stage",
  "camps",
  "camp",
  "public",
  "static",
  "assets",
]);

export function slugifyCampTitle(input: string): string {
  const base = (input ?? "")
    .toString()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  if (!base) return "stage";
  if (RESERVED_SLUGS.has(base)) return `${base}-stage`;
  return base;
}

export function isValidCampSlug(slug: string): boolean {
  if (!slug || slug.length < 2 || slug.length > 80) return false;
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return false;
  if (RESERVED_SLUGS.has(slug)) return false;
  return true;
}
