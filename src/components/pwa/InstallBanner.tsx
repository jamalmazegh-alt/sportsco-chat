import { useEffect, useState } from "react";
import { X, Download, Smartphone, Share2, Plus } from "lucide-react";
import { isAndroid, isIOS, isInStandaloneMode } from "@/lib/pwa";

const DISMISS_KEY = "clubero:pwa:install-dismissed-at";
const DISMISS_DAYS = 7;

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function recentlyDismissed(): boolean {
  try {
    const v = localStorage.getItem(DISMISS_KEY);
    if (!v) return false;
    const at = Number(v);
    if (!Number.isFinite(at)) return false;
    return Date.now() - at < DISMISS_DAYS * 86400 * 1000;
  } catch {
    return false;
  }
}

export function InstallBanner() {
  const [visible, setVisible] = useState(false);
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (isInStandaloneMode()) return;
    if (recentlyDismissed()) return;

    const ios = isIOS();
    const android = isAndroid();
    if (!ios && !android) return;

    if (android) {
      const onBeforeInstall = (e: Event) => {
        e.preventDefault();
        setDeferred(e as BeforeInstallPromptEvent);
        setVisible(true);
      };
      window.addEventListener("beforeinstallprompt", onBeforeInstall);
      return () => window.removeEventListener("beforeinstallprompt", onBeforeInstall);
    }

    // iOS: no native event — show after 2s
    const t = setTimeout(() => setVisible(true), 2000);
    return () => clearTimeout(t);
  }, []);

  function dismiss() {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {}
    setVisible(false);
    setShowIOSGuide(false);
  }

  async function install() {
    if (deferred) {
      await deferred.prompt();
      const choice = await deferred.userChoice;
      if (choice.outcome === "accepted") {
        setVisible(false);
        setDeferred(null);
      }
      return;
    }
    if (isIOS()) setShowIOSGuide(true);
  }

  if (!visible) return null;

  const ios = isIOS();

  return (
    <>
      <div className="fixed inset-x-3 bottom-20 z-40 sm:left-auto sm:right-4 sm:bottom-4 sm:max-w-sm animate-in slide-in-from-bottom-4 fade-in duration-300">
        <div className="rounded-2xl border border-emerald-100 bg-white shadow-2xl p-4 flex items-start gap-3">
          <div className="h-11 w-11 shrink-0 rounded-xl bg-gradient-to-br from-[#1d7a45] to-[#15583a] flex items-center justify-center text-white shadow-md">
            <Smartphone className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm text-gray-900">Installer Clubero</p>
            <p className="text-xs text-gray-600 mt-0.5 leading-snug">
              {ios
                ? "Installez l'app pour activer les notifications"
                : "Recevez vos convocations en temps réel"}
            </p>
            <div className="mt-2.5 flex items-center gap-2">
              <button
                type="button"
                onClick={install}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-br from-[#1d7a45] to-[#15583a] text-white text-xs font-semibold shadow-sm hover:opacity-90 transition"
              >
                <Download className="h-3.5 w-3.5" />
                Installer
              </button>
            </div>
          </div>
          <button
            type="button"
            aria-label="Fermer"
            onClick={dismiss}
            className="-mr-1 -mt-1 p-1.5 rounded-lg hover:bg-gray-100 transition"
          >
            <X className="h-4 w-4 text-gray-500" />
          </button>
        </div>
      </div>

      {showIOSGuide && (
        <div
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-end sm:items-center justify-center p-4 animate-in fade-in"
          onClick={() => setShowIOSGuide(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-bold text-gray-900 mb-1">Installer sur iPhone</h2>
            <p className="text-xs text-gray-500 mb-4">3 étapes dans Safari</p>
            <ol className="space-y-3 text-sm">
              <li className="flex gap-3 items-start">
                <span className="h-7 w-7 shrink-0 rounded-full bg-emerald-50 text-[#1d7a45] flex items-center justify-center font-bold text-xs">
                  1
                </span>
                <span className="flex-1 pt-0.5 text-gray-700 inline-flex items-center gap-1.5">
                  Appuyez sur <Share2 className="inline h-4 w-4 text-blue-500" /> en bas de Safari
                </span>
              </li>
              <li className="flex gap-3 items-start">
                <span className="h-7 w-7 shrink-0 rounded-full bg-emerald-50 text-[#1d7a45] flex items-center justify-center font-bold text-xs">
                  2
                </span>
                <span className="flex-1 pt-0.5 text-gray-700 inline-flex items-center gap-1.5">
                  Faites défiler et choisissez <Plus className="inline h-4 w-4" /> « Sur l'écran d'accueil »
                </span>
              </li>
              <li className="flex gap-3 items-start">
                <span className="h-7 w-7 shrink-0 rounded-full bg-emerald-50 text-[#1d7a45] flex items-center justify-center font-bold text-xs">
                  3
                </span>
                <span className="flex-1 pt-0.5 text-gray-700">
                  Appuyez sur « Ajouter »
                </span>
              </li>
            </ol>
            <button
              type="button"
              onClick={dismiss}
              className="mt-5 w-full py-2.5 rounded-xl bg-gradient-to-br from-[#1d7a45] to-[#15583a] text-white font-semibold text-sm shadow-md hover:opacity-90 transition"
            >
              J'ai compris
            </button>
          </div>
        </div>
      )}
    </>
  );
}
