import { de, enUS, es, fr, it, nl, pt, type Locale } from "date-fns/locale";
import { format as dfFormat } from "date-fns";
import i18n from "@/lib/i18n";

const DATE_LOCALES: Record<string, Locale> = {
  de,
  en: enUS,
  es,
  fr,
  it,
  nl,
  pt,
};

export function dateLocale(): Locale {
  const language = i18n.language?.split("-")[0] ?? "en";
  return DATE_LOCALES[language] ?? enUS;
}

export function fmt(date: Date | string | number, pattern: string): string {
  const d = typeof date === "string" || typeof date === "number" ? new Date(date) : date;
  return dfFormat(d, pattern, { locale: dateLocale() });
}
