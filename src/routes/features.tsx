import { createFileRoute, Link } from "@tanstack/react-router";
import { CalendarCheck, Users, Bell, ShieldCheck, MessageSquareText, BarChart3, CheckCircle2, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MarketingLayout } from "@/components/marketing/MarketingLayout";
import coachShot from "@/assets/features/coach-attendance.png";
import parentShot from "@/assets/features/parent-convocation.png";
import clubShot from "@/assets/features/club-dashboard.png";
import playerShot from "@/assets/features/player-home.png";

const SCREENSHOTS = [
  { src: coachShot, title: "Coach — Suivi des présences", body: "Vue consolidée des entraînements et matchs, par joueur et par période." },
  { src: parentShot, title: "Parent — Convocation", body: "Réponse en un clic, motif facultatif, calendrier familial unifié." },
  { src: clubShot, title: "Club — Tableau de bord", body: "Multi-équipes, membres, communication centralisée." },
  { src: playerShot, title: "Joueur — Accueil", body: "Prochain événement, confirmation de présence, mur d'équipe." },
];

export const Route = createFileRoute("/features")({
  component: FeaturesPage,
  head: () => ({
    meta: [
      { title: "Fonctionnalités — Clubero" },
      {
        name: "description",
        content:
          "Convocations, présences, communication, statistiques. Découvrez tout ce que Clubero offre aux clubs, coachs, parents et joueurs.",
      },
      { property: "og:title", content: "Fonctionnalités — Clubero" },
      {
        property: "og:description",
        content: "Tout ce dont votre club a besoin. Rien de superflu.",
      },
    ],
    links: [{ rel: "canonical", href: "https://www.clubero.app/features" }],
  }),
});

const PILLARS = [
  {
    icon: CalendarCheck,
    title: "Convocations & Événements",
    body: "Créez matchs, entraînements et tournois en quelques secondes. Les convocations atteignent les bons joueurs et parents instantanément.",
  },
  {
    icon: Users,
    title: "Équipe & Effectif",
    body: "Gérez joueurs, numéros, postes et liens parents. Photo, date de naissance, contact — tout sur une seule fiche.",
  },
  {
    icon: Bell,
    title: "Rappels",
    body: "Des relances automatiques s'occupent des réponses manquantes pour que les coachs n'aient pas à le faire.",
  },
  {
    icon: MessageSquareText,
    title: "Communication",
    body: "Mur du club, posts d'équipe et chat par événement gardent la conversation focalisée, jamais éparpillée.",
  },
  {
    icon: BarChart3,
    title: "Suivi des présences",
    body: "Marquez les présences en un clic. Visualisez les tendances par joueur et par équipe sur toute la saison.",
  },
  {
    icon: ShieldCheck,
    title: "Rôles & Permissions",
    body: "Admins, coachs, joueurs et parents voient exactement ce qu'il leur faut — et rien d'autre.",
  },
];

const AUDIENCES = [
  {
    title: "Pour les clubs",
    color: "var(--brand-blue-deep)",
    points: [
      "Tableau de bord multi-équipes",
      "Annuaire des membres et gestion des rôles",
      "Canal de communication centralisé",
      "Rapports de présence sur toute la saison",
      "Conforme RGPD, hébergement européen",
    ],
  },
  {
    title: "Pour les coachs",
    color: "var(--brand-blue)",
    points: [
      "Convocation prête en moins d'une minute",
      "Réponses de présence en temps réel",
      "Chat par événement avec joueurs et parents",
      "Modèles réutilisables pour les entraînements récurrents",
      "Gestion des remplaçants et attribution des numéros",
    ],
  },
  {
    title: "Pour les parents",
    color: "var(--secondary)",
    points: [
      "Un clic pour confirmer ou décliner",
      "Calendrier familial avec tous les événements de vos enfants",
      "Zéro groupe WhatsApp envahissant",
      "Messagerie directe avec le coach",
      "Gestion des autorisations pour les mineurs",
    ],
  },
  {
    title: "Pour les joueurs",
    color: "var(--primary)",
    points: [
      "Visualisez votre prochain match en un coup d'œil",
      "Confirmation rapide de présence",
      "Chat d'équipe sans bruit",
      "Historique personnel des présences",
      "Profil, photo et stats",
    ],
  },
];

function FeaturesPage() {
  return (
    <MarketingLayout>
      <section className="border-b border-border/60">
        <div className="mx-auto max-w-4xl px-5 py-16 text-center lg:px-8 lg:py-24">
          <p className="text-xs font-semibold uppercase tracking-wider text-[color:var(--brand-blue-deep)]">
            Fonctionnalités
          </p>
          <h1 className="mt-3 font-display text-4xl font-bold tracking-tight sm:text-5xl">
            Une appli pour toute la saison.
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-muted-foreground">
            De la première convocation au bilan de fin de saison — Clubero couvre
            tout ce qui compte pour les clubs amateurs.
          </p>
        </div>
      </section>

      <section className="border-b border-border/60">
        <div className="mx-auto max-w-7xl px-5 py-20 lg:px-8">
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {PILLARS.map((f) => (
              <div key={f.title} className="rounded-2xl border border-border bg-card p-6">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[color:var(--brand-blue-soft)] text-[color:var(--brand-blue-deep)]">
                  <f.icon className="h-5 w-5" />
                </div>
                <h2 className="mt-5 font-display text-lg font-semibold">{f.title}</h2>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-b border-border/60 bg-muted/20">
        <div className="mx-auto max-w-7xl px-5 py-20 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
              Aperçu de l'application.
            </h2>
            <p className="mt-4 text-muted-foreground">
              Une expérience pensée pour chaque rôle, sur mobile en priorité.
            </p>
          </div>
          <div className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {SCREENSHOTS.map((s) => (
              <figure key={s.title} className="space-y-3">
                <div className="overflow-hidden rounded-3xl border border-border bg-card shadow-sm">
                  <img
                    src={s.src}
                    alt={s.title}
                    className="aspect-[4/5] w-full object-cover"
                    loading="lazy"
                  />
                </div>
                <figcaption>
                  <p className="font-display text-sm font-semibold">{s.title}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{s.body}</p>
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      </section>

      <section className="border-b border-border/60">
        <div className="mx-auto max-w-5xl px-5 py-20 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
              Sports couverts en V1
            </h2>
            <p className="mt-4 text-muted-foreground">
              Saisie de score et stats joueurs adaptées au sport de chaque équipe.
            </p>
          </div>
          <div className="mt-10 flex flex-wrap justify-center gap-2.5">
            {[
              "Football",
              "Futsal",
              "Basketball",
              "Rugby",
              "Handball",
              "Volley-ball",
              "Hockey sur glace",
            ].map((s) => (
              <span
                key={s}
                className="rounded-full border border-border bg-card px-4 py-1.5 text-sm font-medium text-foreground/80"
              >
                {s}
              </span>
            ))}
          </div>
          <p className="mt-6 text-center text-xs text-muted-foreground">
            Un autre sport vous intéresse ?{" "}
            <Link to="/contact" className="underline underline-offset-2 hover:text-foreground">
              Dites-le nous
            </Link>
            .
          </p>
        </div>
      </section>

      <section className="bg-muted/20">
        <div className="mx-auto max-w-7xl px-5 py-20 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
              Pensé pour chaque rôle dans le club.
            </h2>
            <p className="mt-4 text-muted-foreground">
              Chaque utilisateur dispose d&apos;une expérience adaptée à ses besoins.
            </p>
          </div>

          <div className="mt-14 grid gap-6 lg:grid-cols-2">
            {AUDIENCES.map((a) => (
              <div key={a.title} className="rounded-3xl border border-border bg-card p-8">
                <div className="flex items-center gap-3">
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: a.color }}
                  />
                  <h3 className="font-display text-2xl font-bold">{a.title}</h3>
                </div>
                <ul className="mt-6 space-y-3">
                  {a.points.map((p) => (
                    <li key={p} className="flex items-start gap-3 text-sm">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                      <span className="text-foreground/80">{p}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <div className="mt-16 flex flex-wrap justify-center gap-3">
            <Button asChild size="lg" className="h-12 px-6">
              <Link to="/demo">
                Demander une démo <ArrowRight className="ml-1.5 h-4 w-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="h-12 px-6">
              <Link to="/pricing">Voir les tarifs</Link>
            </Button>
          </div>
        </div>
      </section>
    </MarketingLayout>
  );
}
