/** Display name for an existing challenge: prefer i18n template name so
 * renames (e.g. "Jonglerie" → "Jonglerie libre") take effect for challenges
 * created before the rename. Falls back to the stored DB name.
 * The `t` function must be bound to the `challenges` namespace. */
export function challengeDisplayName(
  c: { name: string; template_key?: string | null },
  t: (k: string, opts?: any) => string,
): string {
  if (c.template_key) {
    const translated = t(`templates.${c.template_key}.name`, { defaultValue: "" });
    if (translated) return translated;
  }
  return c.name;
}
