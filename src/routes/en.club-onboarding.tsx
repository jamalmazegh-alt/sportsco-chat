import { createFileRoute } from "@tanstack/react-router";
import i18n from "@/lib/i18n";
import { ClubOnboardingPage } from "@/components/marketing/ClubOnboardingPage";

export const Route = createFileRoute("/en/club-onboarding")({
  component: () => <ClubOnboardingPage locale="en" />,
  head: () => ({
    meta: [
      { title: i18n.t("meta.onboarding.title", { lng: "en" }) },
      { name: "description", content: i18n.t("meta.onboarding.description", { lng: "en" }) },
      { property: "og:title", content: i18n.t("meta.onboarding.title", { lng: "en" }) },
      { property: "og:description", content: i18n.t("meta.onboarding.ogDescription", { lng: "en" }) },
      { property: "og:locale", content: "en_US" },
    ],
    links: [
      { rel: "canonical", href: "https://www.clubero.app/en/club-onboarding" },
      { rel: "alternate", hrefLang: "en", href: "https://www.clubero.app/en/club-onboarding" },
      { rel: "alternate", hrefLang: "fr", href: "https://www.clubero.app/fr/onboarding-club" },
    ],
  }),
});
