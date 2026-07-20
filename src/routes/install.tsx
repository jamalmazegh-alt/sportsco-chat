import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Bell, Smartphone, Zap } from "lucide-react";
import { Apple } from "lucide-react";
import { useTranslation } from "react-i18next";
import { InstallAppButton } from "@/components/pwa/InstallAppButton";
import i18n from "@/lib/i18n";

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

function IOSMoreIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <circle cx="5" cy="12" r="2" />
      <circle cx="12" cy="12" r="2" />
      <circle cx="19" cy="12" r="2" />
    </svg>
  );
}
function IOSShareIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 3v12" />
      <path d="M8 7l4-4 4 4" />
      <path d="M6 11H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2h-1" />
    </svg>
  );
}
function IOSExpandIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}
function IOSAddIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="3" width="18" height="18" rx="4" />
      <path d="M12 8v8M8 12h8" />
    </svg>
  );
}

function InstallPage() {
  const { t } = useTranslation();
  const steps = [
    {
      icon: <IOSMoreIcon className="h-4 w-4" />,
      before: t("install.iosStep1Before"),
      label: t("install.iosStep1Icon"),
      after: t("install.iosStep1After"),
    },
    {
      icon: <IOSShareIcon className="h-4 w-4" />,
      before: t("install.iosStep2Before"),
      label: t("install.iosStep2Icon"),
      after: "",
    },
    {
      icon: <IOSExpandIcon className="h-4 w-4" />,
      before: t("install.iosStep3Before"),
      label: t("install.iosStep3Icon"),
      after: t("install.iosStep3After"),
    },
    {
      icon: <IOSAddIcon className="h-4 w-4" />,
      before: t("install.iosStep4Before"),
      label: t("install.iosStep4Icon"),
      after: t("install.iosStep4After"),
    },
  ];
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

        <div className="mt-8 rounded-2xl border border-white/10 bg-white/5 p-5">
          <h2 className="text-sm font-bold">{t("install.iosStepsTitle")}</h2>
          <p className="text-xs text-white/60 mt-0.5">{t("install.iosStepsSubtitle")}</p>
          <ol className="mt-4 space-y-3">
            {steps.map((s, i) => (
              <li key={i} className="flex gap-3 items-start">
                <span className="h-7 w-7 shrink-0 rounded-full bg-emerald-500/15 text-emerald-300 flex items-center justify-center font-bold text-xs">
                  {i + 1}
                </span>
                <span className="flex-1 pt-0.5 text-sm text-white/85 inline-flex items-center gap-1.5 flex-wrap">
                  {s.before}
                  <span className="inline-flex items-center gap-1 rounded-md bg-white/10 px-1.5 py-0.5 text-white">
                    {s.icon}
                    <span className="text-[12px] font-medium">{s.label}</span>
                  </span>
                  {s.after}
                </span>
              </li>
            ))}
          </ol>
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
