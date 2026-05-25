import { createFileRoute } from "@tanstack/react-router";
import i18n from "@/lib/i18n";
import { ClubOnboardingPage } from "@/components/marketing/ClubOnboardingPage";

export const Route = createFileRoute("/fr/onboarding-club")({
  component: () => <ClubOnboardingPage locale="fr" />,
  head: () => ({
    meta: [
      { title: i18n.t("meta.onboarding.title", { lng: "fr" }) },
      { name: "description", content: i18n.t("meta.onboarding.description", { lng: "fr" }) },
      { property: "og:title", content: i18n.t("meta.onboarding.title", { lng: "fr" }) },
      { property: "og:description", content: i18n.t("meta.onboarding.ogDescription", { lng: "fr" }) },
      { property: "og:locale", content: "fr_FR" },
    ],
    links: [
      { rel: "canonical", href: "https://www.clubero.app/fr/onboarding-club" },
      { rel: "alternate", hrefLang: "en", href: "https://www.clubero.app/en/club-onboarding" },
      { rel: "alternate", hrefLang: "fr", href: "https://www.clubero.app/fr/onboarding-club" },
    ],
  }),
});
