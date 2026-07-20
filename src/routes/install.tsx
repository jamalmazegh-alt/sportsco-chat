import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Bell, Smartphone, Zap } from "lucide-react";
import { useTranslation } from "react-i18next";
import { InstallAppButton } from "@/components/pwa/InstallAppButton";
import i18n from "@/i18n";

export const Route = createFileRoute("/install")({
  head: () => {
    const t = i18n.getFixedT(i18n.language || "fr", "translation");
    return {
      meta: [
        { title: t("install.meta.title") },
        { name: "description", content: t("install.meta.description") },
        { property: "og:title", content: t("install.meta.ogTitle") },
        { property: "og:description", content: t("install.meta.ogDescription") },
      ],
    };
  },
  component: InstallPage,
});

function InstallPage() {
  const { t } = useTranslation();
  return (
    <div className="min-h-dvh bg-gradient-to-b from-[#070D1B] to-[#0B1730] text-white">
      <div className="mx-auto max-w-lg px-5 pt-6 pb-16">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-sm text-white/70 hover:text-white transition"
        >
          <ArrowLeft className="h-4 w-4" /> {t("install.back")}
        </Link>

        <div className="mt-8 text-center">
          <div className="mx-auto h-16 w-16 rounded-2xl bg-gradient-to-br from-[#1d7a45] to-[#15583a] flex items-center justify-center shadow-lg">
            <Smartphone className="h-8 w-8 text-white" />
          </div>
          <h1 className="mt-5 text-2xl font-bold">{t("install.title")}</h1>
          <p className="mt-2 text-sm text-white/70">{t("install.subtitle")}</p>
        </div>

        <div className="mt-8 flex justify-center">
          <InstallAppButton alwaysShow label={t("install.cta")} className="px-6 py-3" />
        </div>

        <ul className="mt-10 space-y-4">
          <li className="flex gap-3">
            <span className="h-9 w-9 shrink-0 rounded-lg bg-white/10 flex items-center justify-center">
              <Bell className="h-4 w-4 text-emerald-300" />
            </span>
            <div>
              <p className="text-sm font-semibold">{t("install.notifTitle")}</p>
              <p className="text-xs text-white/60 mt-0.5">{t("install.notifDesc")}</p>
            </div>
          </li>
          <li className="flex gap-3">
            <span className="h-9 w-9 shrink-0 rounded-lg bg-white/10 flex items-center justify-center">
              <Zap className="h-4 w-4 text-emerald-300" />
            </span>
            <div>
              <p className="text-sm font-semibold">{t("install.launchTitle")}</p>
              <p className="text-xs text-white/60 mt-0.5">{t("install.launchDesc")}</p>
            </div>
          </li>
          <li className="flex gap-3">
            <span className="h-9 w-9 shrink-0 rounded-lg bg-white/10 flex items-center justify-center">
              <Smartphone className="h-4 w-4 text-emerald-300" />
            </span>
            <div>
              <p className="text-sm font-semibold">{t("install.platformsTitle")}</p>
              <p className="text-xs text-white/60 mt-0.5">{t("install.platformsDesc")}</p>
            </div>
          </li>
        </ul>

        <div className="mt-10 rounded-xl border border-white/10 bg-white/5 p-4 text-xs text-white/70">
          <p className="font-semibold text-white mb-1">{t("install.alreadyInstalledTitle")}</p>
          <p>{t("install.alreadyInstalledDesc")}</p>
        </div>
      </div>
    </div>
  );
}
