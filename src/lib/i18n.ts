import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import enCommon from "@/locales/en/common.json";
import enMarketing from "@/locales/en/marketing.json";
import enSupport from "@/locales/en/support.json";
import enTournaments from "@/locales/en/tournaments.json";
import enChallenges from "@/locales/en/challenges.json";
import enBuildClubero from "@/locales/en/buildClubero.json";
import enCamps from "@/locales/en/camps.json";

import frCommon from "@/locales/fr/common.json";
import frMarketing from "@/locales/fr/marketing.json";
import frSupport from "@/locales/fr/support.json";
import frTournaments from "@/locales/fr/tournaments.json";
import frChallenges from "@/locales/fr/challenges.json";
import frBuildClubero from "@/locales/fr/buildClubero.json";
import frCamps from "@/locales/fr/camps.json";

import deCommon from "@/locales/de/common.json";
import deMarketing from "@/locales/de/marketing.json";
import deSupport from "@/locales/de/support.json";
import deTournaments from "@/locales/de/tournaments.json";
import deChallenges from "@/locales/de/challenges.json";
import deBuildClubero from "@/locales/de/buildClubero.json";
import deCamps from "@/locales/de/camps.json";

import esCommon from "@/locales/es/common.json";
import esMarketing from "@/locales/es/marketing.json";
import esSupport from "@/locales/es/support.json";
import esTournaments from "@/locales/es/tournaments.json";
import esChallenges from "@/locales/es/challenges.json";
import esBuildClubero from "@/locales/es/buildClubero.json";
import esCamps from "@/locales/es/camps.json";

import ptCommon from "@/locales/pt/common.json";
import ptMarketing from "@/locales/pt/marketing.json";
import ptSupport from "@/locales/pt/support.json";
import ptTournaments from "@/locales/pt/tournaments.json";
import ptChallenges from "@/locales/pt/challenges.json";
import ptBuildClubero from "@/locales/pt/buildClubero.json";
import ptCamps from "@/locales/pt/camps.json";

import itCommon from "@/locales/it/common.json";
import itMarketing from "@/locales/it/marketing.json";
import itSupport from "@/locales/it/support.json";
import itTournaments from "@/locales/it/tournaments.json";
import itChallenges from "@/locales/it/challenges.json";
import itBuildClubero from "@/locales/it/buildClubero.json";
import itCamps from "@/locales/it/camps.json";

import nlCommon from "@/locales/nl/common.json";
import nlMarketing from "@/locales/nl/marketing.json";
import nlSupport from "@/locales/nl/support.json";
import nlTournaments from "@/locales/nl/tournaments.json";
import nlChallenges from "@/locales/nl/challenges.json";
import nlBuildClubero from "@/locales/nl/buildClubero.json";
import nlCamps from "@/locales/nl/camps.json";

import enNeeds from "@/locales/en/needs.json";
import frNeeds from "@/locales/fr/needs.json";
import deNeeds from "@/locales/de/needs.json";
import esNeeds from "@/locales/es/needs.json";
import ptNeeds from "@/locales/pt/needs.json";
import itNeeds from "@/locales/it/needs.json";
import nlNeeds from "@/locales/nl/needs.json";

import enPublications from "@/locales/en/publications.json";
import frPublications from "@/locales/fr/publications.json";
import dePublications from "@/locales/de/publications.json";
import esPublications from "@/locales/es/publications.json";
import ptPublications from "@/locales/pt/publications.json";
import itPublications from "@/locales/it/publications.json";
import nlPublications from "@/locales/nl/publications.json";

import enMeetings from "@/locales/en/meetings.json";
import frMeetings from "@/locales/fr/meetings.json";
import deMeetings from "@/locales/de/meetings.json";
import esMeetings from "@/locales/es/meetings.json";
import ptMeetings from "@/locales/pt/meetings.json";
import itMeetings from "@/locales/it/meetings.json";
import nlMeetings from "@/locales/nl/meetings.json";

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

function resolveInitialLang(): SupportedLang {
  if (typeof window === "undefined") return "en";
  try {
    const stored = window.localStorage.getItem("i18nextLng");
    if (stored && (SUPPORTED_LANGS as readonly string[]).includes(stored)) {
      return stored as SupportedLang;
    }
  } catch {
    /* ignore storage errors */
  }
  return detectBrowserLang();
}

const initialLang = resolveInitialLang();

if (!i18n.isInitialized) {
  i18n.use(initReactI18next).init({
    resources: {
      en: {
        common: enCommon,
        marketing: enMarketing,
        support: enSupport,
        tournaments: enTournaments,
        challenges: enChallenges,
        buildClubero: enBuildClubero,
        camps: enCamps,
        needs: enNeeds,
        publications: enPublications,
        meetings: enMeetings,
      },
      fr: {
        common: frCommon,
        marketing: frMarketing,
        support: frSupport,
        tournaments: frTournaments,
        challenges: frChallenges,
        buildClubero: frBuildClubero,
        camps: frCamps,
        needs: frNeeds,
        publications: frPublications,
        meetings: frMeetings,
      },
      de: {
        common: deCommon,
        marketing: deMarketing,
        support: deSupport,
        tournaments: deTournaments,
        challenges: deChallenges,
        buildClubero: deBuildClubero,
        camps: deCamps,
        needs: deNeeds,
        publications: dePublications,
        meetings: deMeetings,
      },
      es: {
        common: esCommon,
        marketing: esMarketing,
        support: esSupport,
        tournaments: esTournaments,
        challenges: esChallenges,
        buildClubero: esBuildClubero,
        camps: esCamps,
        needs: esNeeds,
        publications: esPublications,
        meetings: esMeetings,
      },
      pt: {
        common: ptCommon,
        marketing: ptMarketing,
        support: ptSupport,
        tournaments: ptTournaments,
        challenges: ptChallenges,
        buildClubero: ptBuildClubero,
        camps: ptCamps,
        needs: ptNeeds,
        publications: ptPublications,
        meetings: ptMeetings,
      },
      it: {
        common: itCommon,
        marketing: itMarketing,
        support: itSupport,
        tournaments: itTournaments,
        challenges: itChallenges,
        buildClubero: itBuildClubero,
        camps: itCamps,
        needs: itNeeds,
        publications: itPublications,
        meetings: itMeetings,
      },
      nl: {
        common: nlCommon,
        marketing: nlMarketing,
        support: nlSupport,
        tournaments: nlTournaments,
        challenges: nlChallenges,
        buildClubero: nlBuildClubero,
        camps: nlCamps,
        needs: nlNeeds,
        publications: nlPublications,
        meetings: nlMeetings,
      },
    },
    lng: initialLang,
    fallbackLng: "en",
    supportedLngs: SUPPORTED_LANGS as unknown as string[],
    defaultNS: "common",
    ns: [
      "common",
      "marketing",
      "support",
      "tournaments",
      "challenges",
      "buildClubero",
      "camps",
      "needs",
      "publications",
      "meetings",
    ],
    interpolation: { escapeValue: false },
    react: { useSuspense: false },
  });
}

// Client-only: reconcile if init ran before storage was readable (rare).
if (typeof window !== "undefined") {
  const target = resolveInitialLang();
  if (target !== i18n.language) {
    queueMicrotask(() => {
      i18n.changeLanguage(target);
    });
  }
}

export default i18n;
