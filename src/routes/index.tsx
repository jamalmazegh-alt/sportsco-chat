import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import i18n from "@/lib/i18n";
import { useAuth } from "@/lib/auth-context";
import { isAppHost } from "@/lib/host";
import {
  Loader2,
  ArrowRight,
  Trophy,
  Radio,
  Tv,
  Smartphone,
  Users,
  QrCode,
  PlayCircle,
  Sparkles,
  Heart,
  MessageCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { MarketingLayout } from "@/components/marketing/MarketingLayout";
import {
  LivePill,
  Display,
  StadiumCard,
  ScoreBadge,
  SectionEyebrow,
} from "@/components/marketing/stadium-ui";

export const Route = createFileRoute("/")({
  component: Index,
  head: () => ({
    meta: [
      { title: i18n.t("meta.publicHome.title") },
      { name: "description", content: i18n.t("meta.publicHome.description") },
      { property: "og:title", content: i18n.t("meta.publicHome.title") },
      { property: "og:description", content: i18n.t("meta.publicHome.ogDescription") },
      { property: "og:url", content: "https://clubero.app/" },
    ],
    links: [{ rel: "canonical", href: "https://clubero.app/" }],
  }),
});

function Index() {
  const [appHost, setAppHost] = useState<boolean | null>(null);

  useEffect(() => {
    setAppHost(isAppHost());
  }, []);

  if (appHost === null) {
    return <Landing />;
  }
  if (appHost) return <AppHostRedirect />;
  return <Landing />;
}

function AppHostRedirect() {
  const { session, loading } = useAuth();
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }
  return <Navigate to={session ? "/home" : "/login"} replace />;
}

function Landing() {
  return (
    <MarketingLayout>
      <Hero />
      <LiveTicker />
      <BentoGrid />
      <CommunitySection />
      <SportsCoverage />
      <FinalCTA />
    </MarketingLayout>
  );
}

/* ────────────────── HERO ────────────────── */

function Hero() {
  return (
    <section className="relative overflow-hidden border-b border-foreground/5">
      <div aria-hidden className="stadium-glow absolute inset-0" />
      <div aria-hidden className="stadium-grid-bg absolute inset-0 opacity-40" />
      <div className="relative mx-auto flex max-w-6xl flex-col items-center px-5 py-24 text-center lg:px-8 lg:py-32">
        <LivePill>Live · 1 240 tournois en cours</LivePill>

        <Display
          as="h1"
          className="mt-8"
        >
          The Modern <span className="text-primary">OS</span>
          <br />
          For Amateur Sports
        </Display>

        <p className="mx-auto mt-8 max-w-2xl font-sans text-lg font-light text-foreground/70 sm:text-xl">
          Tournois en direct, gestion de club premium et communauté vibrante —
          dans une seule plateforme calibrée pour le stade.
        </p>

        <div className="mt-12 flex flex-col items-center gap-6">
          <div className="flex flex-wrap justify-center gap-3 sm:gap-4">
            <Button asChild size="lg" className="h-14 rounded-sm px-8 font-display text-base uppercase tracking-wider">
              <Link to="/tournaments/start">
                Start a tournament <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button
              asChild
              variant="outline"
              size="lg"
              className="h-14 rounded-sm border-foreground/20 bg-card px-8 font-display text-base uppercase tracking-wider"
            >
              <Link to="/register">Create your club</Link>
            </Button>
          </div>
          <div className="flex flex-wrap justify-center gap-8 text-xs font-semibold uppercase tracking-[0.25em] text-foreground/50">
            <Link
              to="/demo"
              className="border-b border-primary/30 pb-1 transition-colors hover:text-primary"
            >
              Watch demo
            </Link>
            <Link
              to="/tournament-experience"
              className="border-b border-primary/30 pb-1 transition-colors hover:text-primary"
            >
              Explore live tournament
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ────────────────── LIVE TICKER ────────────────── */

const TICKER_ITEMS = [
  "FC Riverside 2 — 1 AS Montagne · 84'",
  "Titan Academy 3 — 0 Storm FC · FT",
  "Metro United 1 — 1 Red Dragons · 67'",
  "Etoile FC 4 — 2 Lions Academy · FT",
  "Northside 0 — 2 Padel Open Group A · 31'",
  "U13 Easter Cup — Final tonight · 19:30",
];

function LiveTicker() {
  const loop = [...TICKER_ITEMS, ...TICKER_ITEMS];
  return (
    <div className="border-y border-foreground/5 bg-card/40 py-3 overflow-hidden">
      <div className="flex w-max stadium-marquee gap-12 whitespace-nowrap font-sans text-xs font-semibold uppercase tracking-widest text-foreground/60">
        {loop.map((item, i) => (
          <span key={i} className="flex items-center gap-3">
            <span className="h-1.5 w-1.5 rounded-full bg-primary stadium-blip" />
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ────────────────── BENTO GRID ────────────────── */

function BentoGrid() {
  return (
    <section className="relative mx-auto max-w-7xl px-5 py-20 lg:px-8 lg:py-28">
      <div className="mb-12 max-w-3xl">
        <SectionEyebrow>The Platform</SectionEyebrow>
        <Display>One stadium. Every weekend.</Display>
        <p className="mt-4 font-sans text-base text-foreground/60">
          Du coup d'envoi au dernier coup de sifflet, Clubero orchestre
          chaque moment du sport amateur — sur le terrain, sur grand écran,
          dans la poche.
        </p>
      </div>

      <div className="grid auto-rows-[180px] grid-cols-1 gap-4 md:grid-cols-12">
        <LiveMatchCard />
        <StandingsCard />
        <TvModeCard />
        <SocialWallCard />
        <MobileAppCard />
        <MultiSportCard />
      </div>
    </section>
  );
}

function LiveMatchCard() {
  return (
    <StadiumCard className="md:col-span-8 md:row-span-2" glow>
      <div className="flex h-full flex-col justify-between p-8">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="font-display text-3xl uppercase leading-none text-primary">
              Live Tournament
            </h3>
            <p className="mt-1 font-sans text-[10px] font-semibold uppercase tracking-[0.25em] text-foreground/40">
              U13 Easter Cup · Group A
            </p>
          </div>
          <ScoreBadge minute="84' In play" />
        </div>

        <div className="flex items-center justify-around py-4">
          <div className="flex flex-col items-center gap-3">
            <div className="flex h-20 w-20 items-center justify-center rounded-full border border-foreground/10 bg-background text-2xl">
              🦁
            </div>
            <div className="font-display text-xl uppercase tracking-wider">
              FC Riverside
            </div>
          </div>

          <div className="flex gap-4 font-display text-7xl tabular-nums sm:text-8xl">
            <span>2</span>
            <span className="text-foreground/10">:</span>
            <span className="text-primary">1</span>
          </div>

          <div className="flex flex-col items-center gap-3">
            <div className="flex h-20 w-20 items-center justify-center rounded-full border border-foreground/10 bg-background text-2xl">
              🦅
            </div>
            <div className="font-display text-xl uppercase tracking-wider">
              AS Montagne
            </div>
          </div>
        </div>

        <div className="relative h-1 w-full overflow-hidden rounded-full bg-foreground/5">
          <div className="absolute inset-y-0 left-0 w-[88%] bg-primary" />
        </div>
      </div>
    </StadiumCard>
  );
}

function StandingsCard() {
  const teams = [
    { rank: 1, name: "Titan Academy", pts: 28, hot: true },
    { rank: 2, name: "Metro United", pts: 25 },
    { rank: 3, name: "Riverside FC", pts: 22 },
    { rank: 4, name: "Storm Athletic", pts: 19 },
    { rank: 5, name: "Red Dragons", pts: 18 },
    { rank: 6, name: "AS Montagne", pts: 14, dim: true },
  ];
  return (
    <StadiumCard className="md:col-span-4 md:row-span-3">
      <div className="flex h-full flex-col p-6">
        <div className="mb-5 flex items-baseline justify-between">
          <h3 className="font-display text-2xl uppercase">Standings</h3>
          <span className="font-sans text-[10px] font-semibold uppercase tracking-[0.2em] text-foreground/40">
            U13 League
          </span>
        </div>
        <ul className="flex flex-col gap-1.5">
          {teams.map((t) => (
            <li
              key={t.rank}
              className={`flex items-center gap-4 rounded px-3 py-2.5 ${
                t.hot
                  ? "bg-background border border-foreground/5"
                  : "border-b border-foreground/5"
              } ${t.dim ? "opacity-30" : ""}`}
            >
              <span
                className={`font-sans text-xs font-bold ${
                  t.hot ? "text-primary" : "text-foreground/40"
                }`}
              >
                {String(t.rank).padStart(2, "0")}
              </span>
              <span className="flex-1 font-sans text-sm font-semibold uppercase tracking-wider">
                {t.name}
              </span>
              <span className="font-display text-sm">{t.pts} PTS</span>
            </li>
          ))}
        </ul>
      </div>
    </StadiumCard>
  );
}

function TvModeCard() {
  return (
    <StadiumCard className="md:col-span-8 md:row-span-1">
      <div className="flex h-full items-center justify-between bg-gradient-to-r from-transparent to-primary/10 p-8">
        <div>
          <h3 className="font-display text-2xl uppercase leading-none text-primary">
            TV Mode · Slideshow
          </h3>
          <p className="mt-1 font-sans text-sm text-foreground/60">
            Diffusez scores, brackets et live sur n'importe quel grand écran via un lien unique.
          </p>
        </div>
        <div className="flex gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded border border-foreground/10 bg-background">
            <Tv className="h-5 w-5 text-primary" />
          </div>
          <div className="flex h-12 w-12 items-center justify-center rounded border border-foreground/10 bg-background">
            <Radio className="h-5 w-5 text-primary" />
          </div>
        </div>
      </div>
    </StadiumCard>
  );
}

function SocialWallCard() {
  return (
    <StadiumCard className="md:col-span-4 md:row-span-2">
      <div className="flex h-full flex-col p-6">
        <h3 className="mb-4 font-display text-2xl uppercase text-primary">
          Social Wall
        </h3>
        <div className="flex-1 space-y-3 overflow-hidden">
          <div className="rounded border-l-2 border-primary bg-background p-3">
            <p className="font-sans text-xs font-bold">Coach Alex</p>
            <p className="mt-1 font-sans text-xs text-foreground/70">
              Rendez-vous demain 08:30 entrée nord, on prend le bus à 09:00.
            </p>
          </div>
          <div className="rounded border-l-2 border-foreground/10 bg-background p-3">
            <p className="font-sans text-xs font-bold">Léo M.</p>
            <p className="mt-1 font-sans text-xs text-foreground/70">
              Quelqu'un a une paire de protège-tibias en plus ? J'ai oublié les miens 😅
            </p>
          </div>
          <div className="rounded border-l-2 border-foreground/10 bg-background p-3 opacity-50">
            <p className="font-sans text-xs font-bold">Team Support</p>
            <p className="mt-1 font-sans text-xs text-foreground/70">
              Inscriptions Spring Cup ouvertes !
            </p>
          </div>
        </div>
      </div>
    </StadiumCard>
  );
}

function MobileAppCard() {
  return (
    <StadiumCard className="md:col-span-4 md:row-span-2 group bg-primary border-primary">
      <div className="relative h-full p-8">
        <div className="relative z-10 flex h-full flex-col justify-end">
          <h3 className="font-display text-4xl uppercase leading-[0.9] text-primary-foreground">
            Built for
            <br />
            the field
          </h3>
          <p className="mt-3 font-sans text-[10px] font-bold uppercase tracking-[0.25em] text-primary-foreground/80">
            iOS · Android · PWA
          </p>
        </div>
        <div className="absolute right-2 top-4 h-64 w-36 rotate-[10deg] rounded-2xl border-4 border-card bg-background shadow-2xl transition-transform group-hover:rotate-[4deg]">
          <div className="mx-auto mt-2 h-1 w-8 rounded-full bg-primary/40" />
          <div className="mt-4 space-y-2 px-3">
            <div className="h-2 w-full rounded bg-foreground/10" />
            <div className="h-2 w-3/4 rounded bg-foreground/10" />
            <div className="mt-3 h-14 w-full rounded bg-primary/20" />
            <div className="mt-3 h-2 w-2/3 rounded bg-foreground/10" />
            <div className="h-2 w-1/2 rounded bg-foreground/10" />
          </div>
        </div>
      </div>
    </StadiumCard>
  );
}

const SPORTS = [
  { emoji: "⚽", label: "Soccer" },
  { emoji: "🏀", label: "Hoops" },
  { emoji: "🎾", label: "Tennis" },
  { emoji: "🏐", label: "Volley" },
  { emoji: "🏉", label: "Rugby" },
  { emoji: "🏑", label: "Hockey" },
  { emoji: "🏸", label: "Badmt." },
  { emoji: "⚾", label: "Base." },
  { emoji: "+ 12", label: "More" },
];

function MultiSportCard() {
  return (
    <StadiumCard className="md:col-span-4 md:row-span-2">
      <div className="flex h-full flex-col p-6">
        <h3 className="mb-5 font-display text-2xl uppercase">
          Any sport. <br />One app.
        </h3>
        <div className="grid grid-cols-3 gap-2">
          {SPORTS.map((s) => (
            <div
              key={s.label}
              className="flex aspect-square cursor-pointer flex-col items-center justify-center gap-1 rounded border border-foreground/10 bg-background transition-colors hover:border-primary"
            >
              <span className="text-xl">{s.emoji}</span>
              <span className="font-sans text-[9px] font-bold uppercase tracking-tight text-foreground/60">
                {s.label}
              </span>
            </div>
          ))}
        </div>
      </div>
    </StadiumCard>
  );
}

/* ────────────────── COMMUNITY ────────────────── */

function CommunitySection() {
  return (
    <section className="relative border-t border-foreground/5 bg-card/30 py-24">
      <div className="mx-auto max-w-7xl px-5 lg:px-8">
        <div className="grid items-center gap-12 lg:grid-cols-2">
          <div>
            <SectionEyebrow>Community Platform</SectionEyebrow>
            <Display>Not just management.<br />A living club.</Display>
            <p className="mt-6 font-sans text-base text-foreground/60">
              Le Mur Clubero, c'est le vestiaire numérique : annonces, photos,
              MVP, réactions, moments de match. Les supporters vibrent, les
              joueurs partagent, le club s'anime — sans WhatsApp, sans chaos.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Feature icon={<Heart className="h-4 w-4" />} label="Réactions live" />
              <Feature icon={<Sparkles className="h-4 w-4" />} label="MVP & highlights" />
              <Feature icon={<MessageCircle className="h-4 w-4" />} label="Annonces ciblées" />
            </div>
          </div>
          <StadiumCard className="p-6">
            <div className="space-y-4">
              <WallPost
                name="Coach Sarah"
                time="2 min"
                content="Victoire 3-1 ce matin ! Mention spéciale à Lucas, MVP du match 🔥"
                reactions={["🔥 24", "💪 12", "🏆 8"]}
              />
              <WallPost
                name="Marie (parent)"
                time="18 min"
                content="Photos du match U11 dispo dans l'album — merci pour cette belle journée !"
                reactions={["❤️ 31", "📸 5"]}
              />
              <WallPost
                name="Le Club"
                time="1 h"
                content="📣 Tournoi de fin de saison — inscriptions ouvertes jusqu'à samedi !"
                reactions={["✅ 42"]}
              />
            </div>
          </StadiumCard>
        </div>
      </div>
    </section>
  );
}

function Feature({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-foreground/10 bg-card px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-foreground/70">
      <span className="text-primary">{icon}</span>
      {label}
    </span>
  );
}

function WallPost({
  name,
  time,
  content,
  reactions,
}: {
  name: string;
  time: string;
  content: string;
  reactions: string[];
}) {
  return (
    <div className="rounded-xl border border-foreground/5 bg-background p-4">
      <div className="mb-2 flex items-center justify-between">
        <span className="font-sans text-sm font-bold">{name}</span>
        <span className="font-sans text-[10px] uppercase tracking-wider text-foreground/40">
          {time}
        </span>
      </div>
      <p className="font-sans text-sm text-foreground/80">{content}</p>
      <div className="mt-3 flex gap-2">
        {reactions.map((r) => (
          <span
            key={r}
            className="rounded-full border border-foreground/10 bg-card px-2.5 py-0.5 font-sans text-[11px] font-semibold"
          >
            {r}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ────────────────── SPORTS COVERAGE ────────────────── */

function SportsCoverage() {
  const features = [
    { icon: <Trophy className="h-5 w-5" />, label: "Tournois & ligues" },
    { icon: <Smartphone className="h-5 w-5" />, label: "Scoring mobile" },
    { icon: <QrCode className="h-5 w-5" />, label: "QR code spectateurs" },
    { icon: <Tv className="h-5 w-5" />, label: "TV slideshow" },
    { icon: <Users className="h-5 w-5" />, label: "Convocations" },
    { icon: <PlayCircle className="h-5 w-5" />, label: "Live broadcast" },
  ];
  return (
    <section className="border-t border-foreground/5 py-24">
      <div className="mx-auto max-w-7xl px-5 lg:px-8">
        <div className="mb-12 text-center">
          <SectionEyebrow>Sports coverage</SectionEyebrow>
          <Display>Built for every sports community.</Display>
        </div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          {features.map((f) => (
            <StadiumCard key={f.label}>
              <div className="flex flex-col items-center gap-3 p-6 text-center">
                <span className="text-primary">{f.icon}</span>
                <span className="font-sans text-xs font-semibold uppercase tracking-wider text-foreground/70">
                  {f.label}
                </span>
              </div>
            </StadiumCard>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ────────────────── FINAL CTA ────────────────── */

function FinalCTA() {
  return (
    <section className="relative overflow-hidden border-t border-foreground/5 py-28">
      <div aria-hidden className="stadium-glow absolute inset-0" />
      <div className="relative mx-auto max-w-4xl px-5 text-center lg:px-8">
        <SectionEyebrow>Kick off your season</SectionEyebrow>
        <Display>
          The future of amateur
          <br />
          sports communities.
        </Display>
        <p className="mx-auto mt-6 max-w-xl font-sans text-base text-foreground/70">
          Plus modern qu'un logiciel de club. Plus vivant qu'un outil tournoi.
          Plus émotionnel qu'une plateforme admin.
        </p>
        <div className="mt-10 flex flex-wrap justify-center gap-3 sm:gap-4">
          <Button asChild size="lg" className="h-14 rounded-sm px-8 font-display text-base uppercase tracking-wider">
            <Link to="/tournaments/start">
              Start a tournament <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
          <Button
            asChild
            variant="outline"
            size="lg"
            className="h-14 rounded-sm border-foreground/20 bg-card px-8 font-display text-base uppercase tracking-wider"
          >
            <Link to="/pricing">See pricing</Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
