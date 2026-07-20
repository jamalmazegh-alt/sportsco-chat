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

function AndroidIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M17.523 15.3414C17.523 15.6414 17.2805 15.8839 16.9818 15.8839H15.8967V18.0664C15.8967 18.7041 15.3786 19.2222 14.7409 19.2222C14.1032 19.2222 13.5851 18.7041 13.5851 18.0664V15.8839H10.4149V18.0664C10.4149 18.7041 9.89682 19.2222 9.2591 19.2222C8.62138 19.2222 8.10329 18.7041 8.10329 18.0664V15.8839H7.01822C6.71949 15.8839 6.47697 15.6414 6.47697 15.3414V8.46643H17.523V15.3414ZM5.28051 8.46643C4.64279 8.46643 4.1247 8.98452 4.1247 9.62224V14.1856C4.1247 14.8233 4.64279 15.3414 5.28051 15.3414C5.91823 15.3414 6.43632 14.8233 6.43632 14.1856V9.62224C6.43632 8.98452 5.91823 8.46643 5.28051 8.46643ZM18.7195 8.46643C18.0818 8.46643 17.5637 8.98452 17.5637 9.62224V14.1856C17.5637 14.8233 18.0818 15.3414 18.7195 15.3414C19.3572 15.3414 19.8753 14.8233 19.8753 14.1856V9.62224C19.8753 8.98452 19.3572 8.46643 18.7195 8.46643ZM14.8827 4.84534L15.6545 3.5129C15.7226 3.39331 15.6832 3.24143 15.5637 3.17331C15.4441 3.1052 15.2922 3.14458 15.2241 3.26417L14.4363 4.62534C13.6786 4.29908 12.8572 4.11958 12 4.11958C11.1428 4.11958 10.3214 4.29908 9.5637 4.62534L8.77588 3.26417C8.70776 3.14458 8.55588 3.1052 8.43629 3.17331C8.3167 3.24143 8.27732 3.39331 8.34544 3.5129L9.11732 4.84534C7.66279 5.60303 6.6871 7.02224 6.47697 8.68563H17.523C17.3129 7.02224 16.3372 5.60303 14.8827 4.84534Z" />
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
          <h2 className="text-sm font-bold">{t("install.platformCompareTitle")}</h2>
          <p className="text-xs text-white/60 mt-0.5">{t("install.platformCompareSubtitle")}</p>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
              <div className="flex items-center gap-2">
                <Apple className="h-4 w-4 text-white/80" />
                <span className="text-sm font-semibold">{t("install.platformAppleTitle")}</span>
              </div>
              <p className="mt-1.5 text-xs text-white/60 leading-relaxed">{t("install.platformAppleDesc")}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
              <div className="flex items-center gap-2">
                <AndroidIcon className="h-4 w-4 text-emerald-400" />
                <span className="text-sm font-semibold">{t("install.platformAndroidTitle")}</span>
              </div>
              <p className="mt-1.5 text-xs text-white/60 leading-relaxed">{t("install.platformAndroidDesc")}</p>
            </div>
          </div>
          <p className="mt-3 text-xs text-white/50">{t("install.platformCompareNote")}</p>
        </div>

        <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-5">
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
