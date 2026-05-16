import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import logo from "@/assets/clubero-logo.png";

const NAV = [
  { to: "/features", key: "features" },
  { to: "/pricing", key: "pricing" },
  { to: "/faq", key: "faq" },
  { to: "/contact", key: "contact" },
] as const;

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

        <nav className="hidden items-center gap-8 md:flex">
          {NAV.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
              activeProps={{ className: "text-foreground" }}
            >
              {t(`nav.${item.key}`)}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-3 md:flex">
          {/* Language switch */}
          <div role="radiogroup" className="flex items-center gap-1 rounded-lg border border-border p-1">
            {([
              { value: "fr", label: "FR", flag: "🇫🇷" },
              { value: "en", label: "EN", flag: "🇬🇧" },
            ] as const).map((opt) => {
              const active = current === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setLang(opt.value)}
                  className={cn(
                    "flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors",
                    active
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                  title={opt.label}
                >
                  <span>{opt.flag}</span>
                  {opt.label}
                </button>
              );
            })}
          </div>

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
            {NAV.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                onClick={() => setOpen(false)}
                className="rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                {t(`nav.${item.key}`)}
              </Link>
            ))}
            <div className="mt-3 flex items-center justify-center gap-1 rounded-lg border border-border p-1">
              {([
                { value: "fr", label: "FR", flag: "🇫🇷" },
                { value: "en", label: "EN", flag: "🇬🇧" },
              ] as const).map((opt) => {
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
