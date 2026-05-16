import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Cookie, Settings2, X, ChevronDown, ChevronUp, Shield } from "lucide-react";

interface ConsentPreferences {
  necessary: boolean;
  analytics: boolean;
  marketing: boolean;
}

const STORAGE_KEY = "clubero_cookie_consent";

function getStoredConsent(): ConsentPreferences | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function saveConsent(prefs: ConsentPreferences) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
}

export function useCookieConsent() {
  const [prefs, setPrefs] = useState<ConsentPreferences | null>(null);

  useEffect(() => {
    setPrefs(getStoredConsent());
  }, []);

  const hasConsent = (type: keyof ConsentPreferences) => {
    if (!prefs) return false;
    return prefs[type] ?? false;
  };

  const isConsented = !!prefs;

  return { prefs, hasConsent, isConsented };
}

export function CookieConsentBanner() {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [prefs, setPrefs] = useState<ConsentPreferences>({
    necessary: true,
    analytics: false,
    marketing: false,
  });

  useEffect(() => {
    const stored = getStoredConsent();
    if (!stored) {
      setVisible(true);
    } else {
      setPrefs(stored);
    }
  }, []);

  const acceptAll = () => {
    const all = { necessary: true, analytics: true, marketing: true };
    saveConsent(all);
    setPrefs(all);
    setVisible(false);
  };

  const rejectAll = () => {
    const minimal = { necessary: true, analytics: false, marketing: false };
    saveConsent(minimal);
    setPrefs(minimal);
    setVisible(false);
  };

  const savePreferences = () => {
    saveConsent(prefs);
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-[100] p-4 md:p-6">
      <div className="mx-auto max-w-4xl rounded-2xl border border-border bg-card/95 backdrop-blur-xl shadow-elevated p-5 md:p-6">
        <div className="flex items-start gap-4">
          <div className="hidden sm:flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Cookie className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-base font-semibold text-foreground">
                {t("cookie.title", "Paramètres des cookies")}
              </h3>
              <button
                onClick={rejectAll}
                className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                aria-label={t("cookie.close", "Fermer")}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">
              {t(
                "cookie.description",
                "Nous utilisons des cookies pour améliorer votre expérience, analyser le trafic et personnaliser les contenus. Vous pouvez choisir ce que vous acceptez."
              )}
            </p>

            <button
              onClick={() => setShowDetails((s) => !s)}
              className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:text-primary/80 transition-colors"
            >
              <Settings2 className="h-3.5 w-3.5" />
              {showDetails
                ? t("cookie.hideDetails", "Masquer les détails")
                : t("cookie.showDetails", "Personnaliser")}
              {showDetails ? (
                <ChevronUp className="h-3.5 w-3.5" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5" />
              )}
            </button>

            {showDetails && (
              <div className="mt-4 space-y-3 rounded-xl bg-muted/50 p-4">
                <ConsentItem
                  icon={<Shield className="h-4 w-4" />}
                  title={t("cookie.necessary.title", "Nécessaires")}
                  description={t(
                    "cookie.necessary.description",
                    "Indispensables au fonctionnement du site (connexion, sécurité, préférences)."
                  )}
                  checked={prefs.necessary}
                  disabled
                />
                <ConsentItem
                  title={t("cookie.analytics.title", "Analytiques")}
                  description={t(
                    "cookie.analytics.description",
                    "Nous aident à comprendre comment vous utilisez le site pour l'améliorer."
                  )}
                  checked={prefs.analytics}
                  onToggle={() =>
                    setPrefs((p) => ({ ...p, analytics: !p.analytics }))
                  }
                />
                <ConsentItem
                  title={t("cookie.marketing.title", "Marketing")}
                  description={t(
                    "cookie.marketing.description",
                    "Utilisés pour vous proposer des contenus et offres personnalisées."
                  )}
                  checked={prefs.marketing}
                  onToggle={() =>
                    setPrefs((p) => ({ ...p, marketing: !p.marketing }))
                  }
                />
              </div>
            )}

            <div className="mt-4 flex flex-col-reverse sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={rejectAll}
                className="sm:ml-auto"
              >
                {t("cookie.reject", "Refuser tout")}
              </Button>
              <Button variant="outline" size="sm" onClick={acceptAll}>
                {t("cookie.acceptAll", "Accepter tout")}
              </Button>
              {showDetails && (
                <Button size="sm" onClick={savePreferences}>
                  {t("cookie.save", "Enregistrer")}
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ConsentItem({
  icon,
  title,
  description,
  checked,
  disabled,
  onToggle,
}: {
  icon?: React.ReactNode;
  title: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onToggle?: () => void;
}) {
  return (
    <div className="flex items-start gap-3">
      {icon && (
        <div className="mt-0.5 shrink-0 text-muted-foreground">{icon}</div>
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm font-medium text-foreground">{title}</span>
          <Switch
            checked={checked}
            disabled={disabled}
            onCheckedChange={onToggle}
            aria-label={title}
          />
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}
