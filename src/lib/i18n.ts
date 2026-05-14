import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "@/locales/en/common.json";
import fr from "@/locales/fr/common.json";

if (!i18n.isInitialized) {
  i18n.use(initReactI18next).init({
    resources: {
      en: { common: en },
      fr: { common: fr },
    },
    lng: "en",
    fallbackLng: "en",
    defaultNS: "common",
    ns: ["common"],
    interpolation: { escapeValue: false },
    react: { useSuspense: false },
  });
}

// After hydration, switch to user's preferred language from localStorage
if (typeof window !== "undefined") {
  const stored = window.localStorage.getItem("i18nextLng");
  if (stored && stored !== "en" && (stored === "fr" || stored === "en")) {
    // Defer to after hydration
    queueMicrotask(() => {
      i18n.changeLanguage(stored);
    });
  }
}

export default i18n;
