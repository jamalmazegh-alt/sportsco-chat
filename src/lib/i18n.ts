import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import enCommon from "@/locales/en/common.json";
import frCommon from "@/locales/fr/common.json";
import enMarketing from "@/locales/en/marketing.json";
import frMarketing from "@/locales/fr/marketing.json";

function detectBrowserLang(): "fr" | "en" {
  if (typeof navigator === "undefined") return "en";
  const langs = [navigator.language, ...(navigator.languages ?? [])].filter(Boolean);
  for (const l of langs) {
    if (l.toLowerCase().startsWith("fr")) return "fr";
  }
  return "en";
}

if (!i18n.isInitialized) {
  i18n.use(initReactI18next).init({
    resources: {
      en: { common: enCommon, marketing: enMarketing },
      fr: { common: frCommon, marketing: frMarketing },
    },
    lng: "en",
    fallbackLng: "en",
    defaultNS: "common",
    ns: ["common", "marketing"],
    interpolation: { escapeValue: false },
    react: { useSuspense: false },
  });
}

// After hydration: prefer stored language, else fall back to the browser locale
// (fr if any browser language starts with "fr", en otherwise).
if (typeof window !== "undefined") {
  const stored = window.localStorage.getItem("i18nextLng");
  const target = stored && (stored === "fr" || stored === "en")
    ? stored
    : detectBrowserLang();
  if (target !== i18n.language) {
    queueMicrotask(() => {
      i18n.changeLanguage(target);
    });
  }
}

export default i18n;
