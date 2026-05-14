import { fr, enUS, type Locale } from "date-fns/locale";
import { format as dfFormat } from "date-fns";
import i18n from "@/lib/i18n";

export function dateLocale(): Locale {
  return i18n.language?.startsWith("fr") ? fr : enUS;
}

export function fmt(date: Date | string | number, pattern: string): string {
  const d = typeof date === "string" || typeof date === "number" ? new Date(date) : date;
  return dfFormat(d, pattern, { locale: dateLocale() });
}
