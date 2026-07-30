import { useEffect, useState } from "react";
import { Download, Smartphone, Apple } from "lucide-react";
import { isAndroid, isIOS, isInStandaloneMode } from "@/lib/pwa";
import { isNativePlatform } from "@/lib/native-platform";
import { cn } from "@/lib/utils";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const INSTALLED_KEY = "pwa_installed";

interface Props {
  className?: string;
  variant?: "primary" | "ghost";
  label?: string;
  /** If true, always render (never auto-hide when installed). Useful on /install. */
  alwaysShow?: boolean;
}

// iOS glyphs (kept tiny to avoid a new dep)
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

// App native Capacitor : proposer d'« installer l'app » n'a pas de sens,
// l'utilisateur est déjà dedans. Wrapper pour garder les hooks inconditionnels.
export function InstallAppButton(props: Props) {
  if (isNativePlatform()) return null;
  return <InstallAppButtonWeb {...props} />;
}

function InstallAppButtonWeb({
  className,
  variant = "primary",
  label = "Installer l'app",
  alwaysShow = false,
}: Props) {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [showIOSGuide, setShowIOSGuide] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    if (typeof window === "undefined") return;

    if (isInStandaloneMode()) {
      setInstalled(true);
    }
    try {
      if (localStorage.getItem(INSTALLED_KEY) === "true") setInstalled(true);
    } catch {
      /* ignore */
    }

    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onAppInstalled = () => {
      try {
        localStorage.setItem(INSTALLED_KEY, "true");
      } catch {
        /* ignore */
      }
      setInstalled(true);
      setDeferred(null);
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onAppInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onAppInstalled);
    };
  }, []);

  // Avoid SSR/CSR mismatch — decide visibility only after mount.
  if (!mounted) return null;
  if (installed && !alwaysShow) return null;

  const ios = isIOS();
  const android = isAndroid();
  // Desktop / other: no native install path via PWA prompt reliably — hide by default
  // (Chrome desktop can still install via the URL bar), unless alwaysShow.
  if (!ios && !android && !deferred && !alwaysShow) return null;

  async function handleClick() {
    if (deferred) {
      try {
        await deferred.prompt();
        const choice = await deferred.userChoice;
        if (choice.outcome === "accepted") {
          setDeferred(null);
        }
      } catch {
        /* ignore */
      }
      return;
    }
    if (ios) {
      setShowIOSGuide(true);
      return;
    }
    // Desktop fallback: open browser guidance modal reusing iOS layout isn't ideal.
    // Show a minimal alert-like guide via the iOS modal state (labelled generically).
    setShowIOSGuide(true);
  }

  const base =
    "inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold shadow-sm transition disabled:opacity-60";
  const styles =
    variant === "primary"
      ? "bg-gradient-to-br from-[#1d7a45] to-[#15583a] text-white hover:opacity-90"
      : "border border-white/20 text-white/90 hover:bg-white/10";

  return (
    <>
      <button type="button" onClick={handleClick} className={cn(base, styles, className)}>
        {ios ? <Apple className="h-4 w-4" /> : <Download className="h-4 w-4" />}
        <span>{label}</span>
      </button>

      {showIOSGuide && (
        <div
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
          onClick={() => setShowIOSGuide(false)}
        >
          <div
            className="bg-white text-gray-900 rounded-2xl shadow-2xl max-w-sm w-full p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 mb-1">
              <Smartphone className="h-5 w-5 text-emerald-700" />
              <h2 className="text-lg font-bold">
                {ios ? "Installer sur iPhone / iPad" : "Installer Clubero"}
              </h2>
            </div>
            {ios ? (
              <>
                <p className="text-xs text-gray-500 mb-4">3 étapes dans Safari</p>
                <ol className="space-y-3 text-sm">
                  <li className="flex gap-3 items-start">
                    <span className="h-7 w-7 shrink-0 rounded-full bg-emerald-50 text-[#1d7a45] flex items-center justify-center font-bold text-xs">
                      1
                    </span>
                    <span className="flex-1 pt-0.5 inline-flex items-center gap-1.5 flex-wrap">
                      Appuyez sur
                      <span className="inline-flex items-center gap-1 rounded-md bg-gray-100 px-1.5 py-0.5">
                        <IOSShareIcon className="h-4 w-4" />
                        <span className="text-[12px] font-medium">Partager</span>
                      </span>
                      en bas de Safari
                    </span>
                  </li>
                  <li className="flex gap-3 items-start">
                    <span className="h-7 w-7 shrink-0 rounded-full bg-emerald-50 text-[#1d7a45] flex items-center justify-center font-bold text-xs">
                      2
                    </span>
                    <span className="flex-1 pt-0.5 inline-flex items-center gap-1.5 flex-wrap">
                      Choisissez
                      <span className="inline-flex items-center gap-1 rounded-md bg-gray-100 px-1.5 py-0.5">
                        <IOSAddIcon className="h-4 w-4" />
                        <span className="text-[12px] font-medium">Sur l'écran d'accueil</span>
                      </span>
                    </span>
                  </li>
                  <li className="flex gap-3 items-start">
                    <span className="h-7 w-7 shrink-0 rounded-full bg-emerald-50 text-[#1d7a45] flex items-center justify-center font-bold text-xs">
                      3
                    </span>
                    <span className="flex-1 pt-0.5">Appuyez sur « Ajouter »</span>
                  </li>
                </ol>
              </>
            ) : (
              <p className="text-sm text-gray-700 mt-2">
                Ouvrez le menu de votre navigateur (⋮ en haut à droite) puis choisissez
                <span className="mx-1 rounded bg-gray-100 px-1.5 py-0.5 font-medium">
                  Installer l'application
                </span>
                ou
                <span className="mx-1 rounded bg-gray-100 px-1.5 py-0.5 font-medium">
                  Ajouter à l'écran d'accueil
                </span>
                .
              </p>
            )}
            <button
              type="button"
              onClick={() => setShowIOSGuide(false)}
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
