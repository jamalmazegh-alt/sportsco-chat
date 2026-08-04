import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import logo from "@/assets/clubero-logo.png";
import { COMPANY_LEGAL, formatCompanyAddress } from "@/config/company";

export function MarketingFooter() {
  const { t, i18n } = useTranslation("marketing");
  const current = i18n.language?.slice(0, 2) === "fr" ? "fr" : "en";
  const tournamentsTo = current === "fr" ? "/fr/tournois" : "/en/tournaments";
  const onboardingTo = current === "fr" ? "/fr/onboarding-club" : "/en/club-onboarding";
  const parentGuideTo = current === "fr" ? "/fr/guide-parents" : "/en/parent-guide";

  return (
    <footer className="border-t border-border/60 bg-muted/30">
      <div className="mx-auto max-w-7xl px-5 py-12 lg:px-8">
        <div className="grid gap-10 md:grid-cols-4">
          <div className="md:col-span-1">
            <Link to="/" className="flex items-center" aria-label="Clubero">
              <span className="flex h-11 items-center justify-center rounded-lg dark:bg-white dark:px-1.5 dark:py-1">
                <img src={logo} alt="Clubero" className="h-auto max-h-full w-auto object-contain" />
              </span>
            </Link>
            <p className="mt-4 text-sm text-muted-foreground">{t("footer.tagline")}</p>
          </div>

          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-foreground">
              {t("footer.product")}
            </h3>
            <ul className="mt-4 space-y-3 text-sm text-muted-foreground">
              <li>
                <Link to="/features" className="hover:text-foreground">
                  {t("nav.features")}
                </Link>
              </li>
              <li>
                <Link to={tournamentsTo} className="hover:text-foreground">
                  {t("nav.tournaments")}
                </Link>
              </li>
              <li>
                <Link to={onboardingTo} className="hover:text-foreground">
                  {t("nav.onboarding")}
                </Link>
              </li>
              <li>
                <Link to={parentGuideTo} className="hover:text-foreground">
                  {t("nav.parentGuide")}
                </Link>
              </li>
              <li>
                <Link to="/install" className="hover:text-foreground">
                  {t("nav.install")}
                </Link>
              </li>
              <li>
                <Link to="/pricing" className="hover:text-foreground">
                  {t("nav.pricing")}
                </Link>
              </li>
              <li>
                <Link to="/demo" className="hover:text-foreground">
                  {t("nav.demo")}
                </Link>
              </li>
              <li>
                <Link to="/login" className="hover:text-foreground">
                  {t("nav.login")}
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-foreground">
              {t("footer.company")}
            </h3>
            <ul className="mt-4 space-y-3 text-sm text-muted-foreground">
              <li>
                <Link to="/faq" className="hover:text-foreground">
                  {t("nav.faq")}
                </Link>
              </li>
              <li>
                <Link to="/contact" className="hover:text-foreground">
                  {t("nav.contact")}
                </Link>
              </li>
              <li>
                <Link to="/build-clubero" className="hover:text-foreground">
                  {t("footer.buildClubero")}
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-foreground">
              {t("footer.legal")}
            </h3>
            <ul className="mt-4 space-y-3 text-sm text-muted-foreground">
              <li>
                <Link
                  to="/legal/$kind"
                  params={{ kind: "terms" }}
                  className="hover:text-foreground"
                >
                  {t("footer.terms")}
                </Link>
              </li>
              <li>
                <Link
                  to="/legal/$kind"
                  params={{ kind: "privacy" }}
                  className="hover:text-foreground"
                >
                  {t("footer.privacy")}
                </Link>
              </li>
              <li>
                <Link
                  to="/legal/$kind"
                  params={{ kind: "legal_notice" }}
                  className="hover:text-foreground"
                >
                  {t("footer.legalNotice")}
                </Link>
              </li>
              <li>
                <Link
                  to="/legal/$kind"
                  params={{ kind: "child_safety" }}
                  className="hover:text-foreground"
                >
                  {t("footer.childSafety")}
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-12 border-t border-border/60 pt-6 text-xs text-muted-foreground">
          <p className="font-medium text-foreground/80">
            {COMPANY_LEGAL.legalName} — Reg. No. {COMPANY_LEGAL.registrationNumber} ·{" "}
            {formatCompanyAddress()}
          </p>
          <p className="mt-1">
            {COMPANY_LEGAL.vatLabel} ·{" "}
            <a href={`mailto:${COMPANY_LEGAL.email}`} className="hover:text-foreground">
              {COMPANY_LEGAL.email}
            </a>
            {" · "}
            <a
              href={`https://wa.me/${COMPANY_LEGAL.phone.replace(/[^0-9]/g, "")}`}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-foreground"
            >
              {COMPANY_LEGAL.phone} (WhatsApp)
            </a>
          </p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p>{t("footer.rights", { year: new Date().getFullYear() })}</p>
            <p>{t("footer.tagline2")}</p>
          </div>
        </div>
      </div>
    </footer>
  );
}
