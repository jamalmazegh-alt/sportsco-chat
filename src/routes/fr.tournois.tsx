import { createFileRoute } from "@tanstack/react-router";
import i18n from "@/lib/i18n";
import { TournamentExperiencePage } from "@/components/marketing/TournamentExperiencePage";

export const Route = createFileRoute("/fr/tournois")({
  component: () => <TournamentExperiencePage locale="fr" />,
  head: () => ({
    meta: [
      { title: i18n.t("meta.tournamentsPage.title", { lng: "fr" }) },
      { name: "description", content: i18n.t("meta.tournamentsPage.description", { lng: "fr" }) },
      { property: "og:title", content: i18n.t("meta.tournamentsPage.title", { lng: "fr" }) },
      { property: "og:description", content: i18n.t("meta.tournamentsPage.ogDescription", { lng: "fr" }) },
      { property: "og:locale", content: "fr_FR" },
      { property: "og:url", content: "https://clubero.app/fr/tournois" },
    ],
    links: [
      { rel: "canonical", href: "https://clubero.app/fr/tournois" },
      { rel: "alternate", hrefLang: "fr", href: "https://clubero.app/fr/tournois" },
      { rel: "alternate", hrefLang: "en", href: "https://clubero.app/en/tournaments" },
    ],
  }),
});
