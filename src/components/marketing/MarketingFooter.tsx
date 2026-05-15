import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import logo from "@/assets/clubero-logo.png";

export function MarketingFooter() {
  const { t } = useTranslation("marketing");

  return (
    <footer className="border-t border-border/60 bg-muted/30">
      <div className="mx-auto max-w-7xl px-5 py-12 lg:px-8">
        <div className="grid gap-10 md:grid-cols-4">
          <div className="md:col-span-1">
            <Link to="/" className="flex items-center" aria-label="Clubero">
              <img src={logo} alt="Clubero" className="h-11 w-auto object-contain" />
            </Link>
            <p className="mt-4 text-sm text-muted-foreground">
              {t("footer.tagline")}
            </p>
          </div>

          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-foreground">
              {t("footer.product")}
            </h3>
            <ul className="mt-4 space-y-3 text-sm text-muted-foreground">
              <li><Link to="/features" className="hover:text-foreground">{t("nav.features")}</Link></li>
              <li><Link to="/pricing" className="hover:text-foreground">{t("nav.pricing")}</Link></li>
              <li><Link to="/demo" className="hover:text-foreground">{t("nav.demo")}</Link></li>
              <li><Link to="/login" className="hover:text-foreground">{t("nav.login")}</Link></li>
            </ul>
          </div>

          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-foreground">
              {t("footer.company")}
            </h3>
            <ul className="mt-4 space-y-3 text-sm text-muted-foreground">
              <li><Link to="/faq" className="hover:text-foreground">{t("nav.faq")}</Link></li>
              <li><Link to="/contact" className="hover:text-foreground">{t("nav.contact")}</Link></li>
            </ul>
          </div>

          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-foreground">
              {t("footer.legal")}
            </h3>
            <ul className="mt-4 space-y-3 text-sm text-muted-foreground">
              <li>
                <Link to="/legal/$kind" params={{ kind: "terms" }} className="hover:text-foreground">
                  {t("footer.terms")}
                </Link>
              </li>
              <li>
                <Link to="/legal/$kind" params={{ kind: "privacy" }} className="hover:text-foreground">
                  {t("footer.privacy")}
                </Link>
              </li>
              <li>
                <Link to="/legal/$kind" params={{ kind: "legal_notice" }} className="hover:text-foreground">
                  {t("footer.legalNotice")}
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-12 flex flex-col gap-3 border-t border-border/60 pt-6 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>{t("footer.rights", { year: new Date().getFullYear() })}</p>
          <p>{t("footer.tagline2")}</p>
        </div>
      </div>
    </footer>
  );
}
