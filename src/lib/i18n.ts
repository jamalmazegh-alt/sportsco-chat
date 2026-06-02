import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import enCommon from "@/locales/en/common.json";
import enMarketing from "@/locales/en/marketing.json";
import enSupport from "@/locales/en/support.json";
import enTournaments from "@/locales/en/tournaments.json";

import frCommon from "@/locales/fr/common.json";
import frMarketing from "@/locales/fr/marketing.json";
import frSupport from "@/locales/fr/support.json";
import frTournaments from "@/locales/fr/tournaments.json";

import deCommon from "@/locales/de/common.json";
import deMarketing from "@/locales/de/marketing.json";
import deSupport from "@/locales/de/support.json";
import deTournaments from "@/locales/de/tournaments.json";

import esCommon from "@/locales/es/common.json";
import esMarketing from "@/locales/es/marketing.json";
import esSupport from "@/locales/es/support.json";
import esTournaments from "@/locales/es/tournaments.json";

import ptCommon from "@/locales/pt/common.json";
import ptMarketing from "@/locales/pt/marketing.json";
import ptSupport from "@/locales/pt/support.json";
import ptTournaments from "@/locales/pt/tournaments.json";

import itCommon from "@/locales/it/common.json";
import itMarketing from "@/locales/it/marketing.json";
import itSupport from "@/locales/it/support.json";
import itTournaments from "@/locales/it/tournaments.json";

import nlCommon from "@/locales/nl/common.json";
import nlMarketing from "@/locales/nl/marketing.json";
import nlSupport from "@/locales/nl/support.json";
import nlTournaments from "@/locales/nl/tournaments.json";

export const SUPPORTED_LANGS = ["en", "fr", "de", "es", "pt", "it", "nl"] as const;
export type SupportedLang = (typeof SUPPORTED_LANGS)[number];

function detectBrowserLang(): SupportedLang {
  if (typeof navigator === "undefined") return "en";
  const langs = [navigator.language, ...(navigator.languages ?? [])].filter(Boolean);
  for (const raw of langs) {
    const l = raw.toLowerCase();
    for (const code of SUPPORTED_LANGS) {
      if (l.startsWith(code)) return code;
    }
  }
  return "en";
}

if (!i18n.isInitialized) {
  i18n.use(initReactI18next).init({
    resources: {
      en: { common: enCommon, marketing: enMarketing, support: enSupport, tournaments: enTournaments },
      fr: { common: frCommon, marketing: frMarketing, support: frSupport, tournaments: frTournaments },
      de: { common: deCommon, marketing: deMarketing, support: deSupport, tournaments: deTournaments },
      es: { common: esCommon, marketing: esMarketing, support: esSupport, tournaments: esTournaments },
      pt: { common: ptCommon, marketing: ptMarketing, support: ptSupport, tournaments: ptTournaments },
      it: { common: itCommon, marketing: itMarketing, support: itSupport, tournaments: itTournaments },
      nl: { common: nlCommon, marketing: nlMarketing, support: nlSupport, tournaments: nlTournaments },
    },
    lng: "en",
    fallbackLng: "en",
    supportedLngs: SUPPORTED_LANGS as unknown as string[],
    defaultNS: "common",
    ns: ["common", "marketing", "support", "tournaments"],
    interpolation: { escapeValue: false },
    react: { useSuspense: false },
  });
}

// After hydration: prefer stored language, else browser detection.
if (typeof window !== "undefined") {
  const stored = window.localStorage.getItem("i18nextLng") as SupportedLang | null;
  const target: SupportedLang =
    stored && (SUPPORTED_LANGS as readonly string[]).includes(stored)
      ? stored
      : detectBrowserLang();
  if (target !== i18n.language) {
    queueMicrotask(() => {
      i18n.changeLanguage(target);
    });
  }
}

export default i18n;
