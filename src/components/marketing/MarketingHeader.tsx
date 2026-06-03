import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Menu, X, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import logo from "@/assets/clubero-logo.png";

const NAV_LEFT = [
  { to: "/features", key: "features" },
  { to: "/pricing", key: "pricing" },
  { to: "/players", key: "players" },
] as const;

const NAV_RIGHT = [
  { to: "/faq", key: "faq" },
  { to: "/contact", key: "contact" },
] as const;

const LOCALIZED_NAV = {
  fr: [
    { to: "/fr/tournois", key: "tournaments" },
    { to: "/fr/onboarding-club", key: "onboarding" },
  ],
  en: [
    { to: "/en/tournaments", key: "tournaments" },
    { to: "/en/club-onboarding", key: "onboarding" },
  ],
} as const;

const LANG_OPTS = [
  { value: "fr", label: "FR", flag: "🇫🇷" },
  { value: "en", label: "EN", flag: "🇬🇧" },
  { value: "de", label: "DE", flag: "🇩🇪" },
  { value: "es", label: "ES", flag: "🇪🇸" },
  { value: "pt", label: "PT", flag: "🇵🇹" },
  { value: "it", label: "IT", flag: "🇮🇹" },
  { value: "nl", label: "NL", flag: "🇳🇱" },
] as const;

function LanguageSwitcher({
  current,
  onChange,
}: {
  current: string;
  onChange: (lang: string) => void;
}) {
  const active = LANG_OPTS.find((o) => o.value === current) ?? LANG_OPTS[0];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
        >
          <span>{active.flag}</span>
          {active.label}
          <ChevronDown className="h-3 w-3 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[8rem]">
        {LANG_OPTS.map((opt) => (
          <DropdownMenuItem
            key={opt.value}
            onClick={() => onChange(opt.value)}
            className={cn(
              "cursor-pointer gap-2",
              current === opt.value && "bg-primary/10 text-primary font-medium"
            )}
          >
            <span>{opt.flag}</span>
            {opt.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function MarketingHeader() {
  const [open, setOpen] = useState(false);
  const { t, i18n } = useTranslation("marketing");

  const current = i18n.language?.slice(0, 2) ?? "fr";

  function setLang(lang: string) {
    i18n.changeLanguage(lang);
  }

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/60 bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-[4.5rem] max-w-7xl items-center justify-between px-5 lg:px-8">
        <Link to="/" className="flex items-center" aria-label="Clubero">
          <img src={logo} alt="Clubero" className="h-14 w-auto object-contain" />
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          {[
            ...NAV_LEFT,
            ...LOCALIZED_NAV[current === "fr" ? "fr" : "en"],
            ...NAV_RIGHT,
          ].map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
              activeProps={{ className: "bg-primary/20 text-primary font-semibold" }}
            >
              {t(`nav.${item.key}`)}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-3 md:flex">
          {/* Language switch */}
          <LanguageSwitcher current={current} onChange={setLang} />

          <Button asChild variant="ghost" size="sm" className="h-9">
            <Link to="/login">{t("nav.login")}</Link>
          </Button>
          <Button asChild variant="outline" size="sm" className="h-9">
            <Link to="/register">{t("nav.signup")}</Link>
          </Button>
          <Button asChild size="sm" className="h-9">
            <Link to="/demo">{t("nav.demo")}</Link>
          </Button>
        </div>

        <button
          type="button"
          className="rounded-md p-2 md:hidden"
          onClick={() => setOpen((s) => !s)}
          aria-label="Menu"
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {open && (
        <div className="border-t border-border/60 bg-background md:hidden">
          <nav className="mx-auto flex max-w-7xl flex-col gap-1 px-5 py-3">
            {[
              ...NAV_LEFT,
              ...LOCALIZED_NAV[current === "fr" ? "fr" : "en"],
              ...NAV_RIGHT,
            ].map((item) => (
              <Link
                key={item.to}
                to={item.to}
                onClick={() => setOpen(false)}
                className="rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
                activeProps={{ className: "bg-primary/20 text-primary font-semibold" }}
              >
                {t(`nav.${item.key}`)}
              </Link>
            ))}
            <div className="mt-3 flex flex-wrap items-center justify-center gap-1 rounded-lg border border-border p-1">
              {LANG_OPTS.map((opt) => {
                const active = current === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setLang(opt.value)}
                    className={cn(
                      "flex items-center gap-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                      active
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <span>{opt.flag}</span>
                    {opt.label}
                  </button>
                );
              })}
            </div>
            <div className="mt-2 flex flex-col gap-2 px-1">
              <Button asChild variant="outline" onClick={() => setOpen(false)}>
                <Link to="/login">{t("nav.login")}</Link>
              </Button>
              <Button asChild variant="outline" onClick={() => setOpen(false)}>
                <Link to="/register">{t("nav.signup")}</Link>
              </Button>
              <Button asChild onClick={() => setOpen(false)}>
                <Link to="/demo">{t("nav.demo")}</Link>
              </Button>
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
