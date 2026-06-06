import { createFileRoute, Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import i18n from "@/lib/i18n";
import { ChevronLeft } from "lucide-react";
import { MarketingLayout } from "@/components/marketing/MarketingLayout";

export const Route = createFileRoute("/legal/cookies")({
  component: CookiesPage,
  head: () => ({
    meta: [
      { title: i18n.t("meta.legalCookies.title") },
      { name: "description", content: i18n.t("meta.legalCookies.description") },
    ],
  }),
});

type CookieRow = {
  name: string;
  provider: string;
  purpose: string;
  duration: string;
  category: "essential" | "functional" | "analytics";
};

const COOKIES: CookieRow[] = [
  {
    name: "sb-access-token / sb-refresh-token",
    provider: "Clubero (Supabase Auth)",
    purpose: "Maintien de la session connectée. Essentiel au fonctionnement.",
    duration: "1 heure (access) / 30 jours (refresh)",
    category: "essential",
  },
  {
    name: "clubero:active_club_id",
    provider: "Clubero (localStorage)",
    purpose: "Mémorise le club actif quand l'utilisateur appartient à plusieurs clubs.",
    duration: "Persistant jusqu'à déconnexion",
    category: "functional",
  },
  {
    name: "clubero:theme",
    provider: "Clubero (localStorage)",
    purpose: "Mémorise le thème clair/sombre choisi.",
    duration: "Persistant",
    category: "functional",
  },
  {
    name: "clubero:cookie-consent",
    provider: "Clubero (localStorage)",
    purpose: "Mémorise votre choix d'acceptation de la bannière cookies.",
    duration: "12 mois",
    category: "essential",
  },
  {
    name: "i18nextLng",
    provider: "Clubero (localStorage)",
    purpose: "Langue d'affichage choisie (fr / en).",
    duration: "Persistant",
    category: "functional",
  },
  {
    name: "clubero-assistant-messages-v1",
    provider: "Clubero (localStorage)",
    purpose: "Conserve l'historique local de votre conversation avec l'assistant IA.",
    duration: "Persistant jusqu'à effacement manuel",
    category: "functional",
  },
];

const CATEGORY_LABELS: Record<CookieRow["category"], { fr: string; en: string }> = {
  essential: { fr: "Essentiel", en: "Essential" },
  functional: { fr: "Fonctionnel", en: "Functional" },
  analytics: { fr: "Statistiques", en: "Analytics" },
};

function CookiesPage() {
  const { i18n, t } = useTranslation();
  const lng = i18n.language?.startsWith("fr") ? "fr" : "en";
  const isFr = lng === "fr";

  return (
    <MarketingLayout>
      <div className="mx-auto max-w-3xl px-5 py-12 lg:px-8 lg:py-16">
        <Link
          to="/"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" /> {t("common.home", { defaultValue: isFr ? "Accueil" : "Home" })}
        </Link>

        <article className="mt-6 space-y-6">
          <header>
            <h1 className="font-display text-3xl font-bold tracking-tight">
              {isFr ? "Politique de cookies" : "Cookie policy"}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {isFr
                ? "Cette page liste l'ensemble des cookies et identifiants techniques utilisés par Clubero, conformément aux recommandations de la CNIL."
                : "This page lists every cookie and technical identifier used by Clubero, in line with GDPR and CNIL guidelines."}
            </p>
          </header>

          <section className="space-y-3">
            <h2 className="font-display text-xl font-bold">
              {isFr ? "Notre approche" : "Our approach"}
            </h2>
            <p className="text-sm leading-relaxed text-foreground/80">
              {isFr
                ? "Clubero n'utilise aucun cookie publicitaire ni traceur tiers (Google Analytics, Meta Pixel, etc.). Les seuls identifiants techniques stockés sur votre appareil sont strictement nécessaires au fonctionnement de l'application ou enregistrent vos préférences d'utilisation."
                : "Clubero does not use any advertising cookies or third-party trackers (Google Analytics, Meta Pixel, etc.). The only technical identifiers stored on your device are strictly necessary for the app to work, or store your usage preferences."}
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="font-display text-xl font-bold">
              {isFr ? "Détail des cookies" : "Cookie inventory"}
            </h2>

            <div className="overflow-hidden rounded-2xl border border-border">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold">{isFr ? "Nom" : "Name"}</th>
                    <th className="px-3 py-2 text-left font-semibold hidden md:table-cell">
                      {isFr ? "Émetteur" : "Provider"}
                    </th>
                    <th className="px-3 py-2 text-left font-semibold">{isFr ? "Finalité" : "Purpose"}</th>
                    <th className="px-3 py-2 text-left font-semibold hidden sm:table-cell">
                      {isFr ? "Durée" : "Lifetime"}
                    </th>
                    <th className="px-3 py-2 text-left font-semibold">{isFr ? "Catégorie" : "Category"}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {COOKIES.map((c) => (
                    <tr key={c.name} className="align-top">
                      <td className="px-3 py-2 font-mono text-xs">{c.name}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground hidden md:table-cell">
                        {c.provider}
                      </td>
                      <td className="px-3 py-2 text-xs text-foreground/80">{c.purpose}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground hidden sm:table-cell">
                        {c.duration}
                      </td>
                      <td className="px-3 py-2">
                        <span className="inline-flex rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary">
                          {CATEGORY_LABELS[c.category][lng]}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="font-display text-xl font-bold">
              {isFr ? "Gérer mes choix" : "Manage my choices"}
            </h2>
            <p className="text-sm leading-relaxed text-foreground/80">
              {isFr
                ? "Les cookies fonctionnels et essentiels ne nécessitent pas de consentement (ils sont indispensables au service). Vous pouvez à tout moment effacer le stockage local via les paramètres de votre navigateur. Pour exercer vos droits RGPD (accès, rectification, effacement), rendez-vous sur la page Profil → Confidentialité."
                : "Functional and essential cookies do not require consent (they are required for the service). You may clear local storage at any time from your browser settings. To exercise your GDPR rights (access, rectification, erasure), go to Profile → Privacy."}
            </p>
            <p className="text-xs text-muted-foreground">
              {isFr ? "Dernière mise à jour : " : "Last updated: "}
              {new Date().toLocaleDateString(isFr ? "fr-FR" : "en-US", {
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </p>
            <div className="flex flex-wrap gap-3 pt-2 text-sm">
              <Link to="/legal/$kind" params={{ kind: "privacy" }} className="text-primary hover:underline">
                {isFr ? "Politique de confidentialité" : "Privacy policy"}
              </Link>
              <span className="text-muted-foreground">·</span>
              <Link to="/legal/$kind" params={{ kind: "terms" }} className="text-primary hover:underline">
                {isFr ? "Conditions générales" : "Terms of service"}
              </Link>
            </div>
          </section>
        </article>
      </div>
    </MarketingLayout>
  );
}
