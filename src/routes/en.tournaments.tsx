import { createFileRoute } from "@tanstack/react-router";
import i18n from "@/lib/i18n";
import { TournamentExperiencePage } from "@/components/marketing/TournamentExperiencePage";

export const Route = createFileRoute("/en/tournaments")({
  component: () => <TournamentExperiencePage locale="en" />,
  head: () => ({
    meta: [
      { title: i18n.t("meta.tournamentsPage.title", { lng: "en" }) },
      { name: "description", content: i18n.t("meta.tournamentsPage.description", { lng: "en" }) },
      { property: "og:title", content: i18n.t("meta.tournamentsPage.title", { lng: "en" }) },
      { property: "og:description", content: i18n.t("meta.tournamentsPage.ogDescription", { lng: "en" }) },
      { property: "og:locale", content: "en_US" },
      { property: "og:url", content: "https://clubero.app/en/tournaments" },
    ],
    links: [
      { rel: "canonical", href: "https://clubero.app/en/tournaments" },
      { rel: "alternate", hrefLang: "fr", href: "https://clubero.app/fr/tournois" },
      { rel: "alternate", hrefLang: "en", href: "https://clubero.app/en/tournaments" },
    ],
  }),
});
