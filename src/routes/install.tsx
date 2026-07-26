import { createFileRoute } from "@tanstack/react-router";
import i18n from "@/lib/i18n";
import { InstallPage } from "@/components/marketing/InstallPage";

export const Route = createFileRoute("/install")({
  component: InstallPage,
  head: () => ({
    meta: [
      { title: i18n.t("meta.install.title") },
      { name: "description", content: i18n.t("meta.install.description") },
      { property: "og:title", content: i18n.t("meta.install.title") },
      { property: "og:description", content: i18n.t("meta.install.ogDescription") },
    ],
    links: [{ rel: "canonical", href: "https://clubero.app/install" }],
  }),
});
