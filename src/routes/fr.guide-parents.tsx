import { createFileRoute } from "@tanstack/react-router";
import i18n from "@/lib/i18n";
import { ParentGuidePage } from "@/components/marketing/ParentGuidePage";

export const Route = createFileRoute("/fr/guide-parents")({
  component: () => <ParentGuidePage locale="fr" />,
  head: () => ({
    meta: [
      { title: i18n.t("meta.parentGuide.title", { lng: "fr" }) },
      { name: "description", content: i18n.t("meta.parentGuide.description", { lng: "fr" }) },
      { property: "og:title", content: i18n.t("meta.parentGuide.title", { lng: "fr" }) },
      {
        property: "og:description",
        content: i18n.t("meta.parentGuide.ogDescription", { lng: "fr" }),
      },
      { property: "og:locale", content: "fr_FR" },
    ],
    links: [
      { rel: "canonical", href: "https://clubero.app/fr/guide-parents" },
      { rel: "alternate", hrefLang: "en", href: "https://clubero.app/en/parent-guide" },
      { rel: "alternate", hrefLang: "fr", href: "https://clubero.app/fr/guide-parents" },
    ],
  }),
});
