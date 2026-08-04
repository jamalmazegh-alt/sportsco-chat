const SUPPORTED = new Set(["fr", "en", "es", "de", "it", "nl", "pt"]);

/**
 * First supported locale among candidates (preferred_language, invite language,
 * club default_language, Accept-Language, …), else `"fr"`.
 */
export function resolveEmailLocale(...candidates: Array<string | null | undefined>): string {
  for (const c of candidates) {
    const v = (c ?? "").toLowerCase().slice(0, 2);
    if (SUPPORTED.has(v)) return v;
  }
  return "fr";
}
