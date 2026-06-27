import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import i18n from "@/lib/i18n";
import { useAuth, useActiveRole, useMyRoles } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import {
  Plus,
  Trophy,
  ChevronRight,
  Calendar,
  Sparkles,
  Zap,
  Users,
  Layers,
  MapPin,
} from "lucide-react";
import {
  listMyTournaments,
  listMyPersonalTournaments,
} from "@/modules/tournaments/tournaments.functions";
import {
  listMyTournamentEntitlements,
  ensurePersonalClubId,
} from "@/modules/tournaments/entitlements.functions";

import { TournamentCreateChooser } from "@/modules/tournaments/components/TournamentCreateChooser";
import { TournamentUpgradeCard } from "@/modules/tournaments/components/TournamentUpgradeCard";
import { useTournamentOnlyMode } from "@/modules/tournaments/hooks/useTournamentOnlyMode";

export const Route = createFileRoute("/_authenticated/tournaments")({
  component: TournamentsRoute,
  head: () => ({
    meta: [
      { title: i18n.t("meta.tournaments.title", { ns: "common" }) },
      { name: "description", content: i18n.t("meta.tournaments.description", { ns: "common" }) },
    ],
  }),
});

function TournamentsRoute() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  if (pathname !== "/tournaments") return <Outlet />;
  return <TournamentsList />;
}

const GREEN_GRADIENT = "linear-gradient(135deg, #0f4a26 0%, #1d7a45 60%, #2d9d5f 100%)";
const CARD_SHADOW = "0 4px 16px rgba(29,122,69,0.10)";

/** SVG trophée diagonal en filigrane pour les headers verts. */
function TrophyPattern() {
  return (
    <svg
      aria-hidden
      className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.18]"
      viewBox="0 0 400 120"
      preserveAspectRatio="none"
    >
      <defs>
        <radialGradient id="halo" cx="80%" cy="0%" r="60%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.5" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="400" height="120" fill="url(#halo)" />
      <path
        d="M -20 90 L 80 10 M 40 130 L 160 10 M 120 130 L 260 0 M 220 130 L 360 0 M 320 130 L 440 10"
        stroke="#ffffff"
        strokeOpacity="0.22"
        strokeWidth="1.2"
      />
      <g transform="translate(330,28)" opacity="0.55">
        <path
          d="M0 4 h22 v6 a11 11 0 0 1 -22 0 z M 4 16 h14 v8 h-14 z M 6 24 h10 v3 h-10 z"
          fill="#ffffff"
        />
        <path d="M -3 6 q -6 4 0 10" stroke="#ffffff" strokeWidth="1.4" fill="none" />
        <path d="M 25 6 q 6 4 0 10" stroke="#ffffff" strokeWidth="1.4" fill="none" />
        <path
          d="M 28 -2 l 1.5 4 l 4 1.5 l -4 1.5 l -1.5 4 l -1.5 -4 l -4 -1.5 l 4 -1.5 z"
          fill="#ffffff"
        />
      </g>
    </svg>
  );
}

/** Mini bandeau dégradé vert (56px) en haut d'une card. */
function CardHeaderStrip({ status }: { status: string }) {
  const tone = statusTone(status);
  return (
    <div
      className="relative h-14 overflow-hidden rounded-t-[16px]"
      style={{ background: GREEN_GRADIENT }}
    >
      <TrophyPattern />
      <div className="absolute right-3 top-3">
        <StatusPill status={status} tone={tone} />
      </div>
    </div>
  );
}

function statusTone(status: string): "live" | "upcoming" | "done" {
  if (status === "in_progress" || status === "live") return "live";
  if (status === "completed" || status === "finished") return "done";
  return "upcoming";
}

function StatusPill({ status, tone }: { status: string; tone: "live" | "upcoming" | "done" }) {
  const { t } = useTranslation("tournaments");
  const label = t(`status.${status}`, { defaultValue: status });
  const styles =
    tone === "live"
      ? "bg-emerald-500 text-white"
      : tone === "upcoming"
        ? "bg-sky-500 text-white"
        : "bg-slate-200 text-muted-foreground";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider shadow-sm ${styles}`}
    >
      {tone === "live" && (
        <span className="relative flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-card opacity-75" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-card" />
        </span>
      )}
      {label}
    </span>
  );
}

/** Bouton vert premium avec shimmer animé. */
function ShimmerButton({
  children,
  asChild,
  className = "",
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { asChild?: boolean }) {
  return (
    <Button
      asChild={asChild}
      size="lg"
      className={`relative h-12 overflow-hidden rounded-2xl border-0 px-5 text-[15px] font-bold text-white ring-1 ring-emerald-300/40 shadow-[0_10px_30px_-12px_rgba(16,122,69,0.55)] transition-all hover:shadow-[0_14px_36px_-12px_rgba(16,122,69,0.7)] active:scale-[0.98] ${className}`}
      style={{ background: GREEN_GRADIENT }}
      {...rest}
    >
      <span className="relative z-[1] inline-flex items-center gap-2">
        {children}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-[1] translate-x-[-120%] bg-gradient-to-r from-transparent via-white/40 to-transparent"
          style={{ animation: "tournament-shimmer 2.6s ease-in-out infinite" }}
        />
      </span>
    </Button>
  );
}

function TournamentsList() {
  const { t } = useTranslation("tournaments");
  const { activeClubId, memberships } = useAuth();
  const role = useActiveRole();
  const roles = useMyRoles();
  const { tournamentOnly, collaboratorOnly } = useTournamentOnlyMode();
  const noClub = memberships.length === 0 || tournamentOnly;
  const canManage =
    !collaboratorOnly && (roles.includes("admin") || (role as string) === "dirigeant" || noClub);
  const [open, setOpen] = useState(false);

  const clubFn = useServerFn(listMyTournaments);
  const personalFn = useServerFn(listMyPersonalTournaments);

  const q = useQuery({
    queryKey: noClub ? ["tournaments", "personal"] : ["tournaments", activeClubId],
    enabled: noClub ? true : !!activeClubId,
    queryFn: () =>
      noClub
        ? personalFn({ data: undefined as never })
        : clubFn({ data: { club_id: activeClubId! } }),
  });

  const entFn = useServerFn(listMyTournamentEntitlements);
  const entQ = useQuery({
    queryKey: ["my-tournament-entitlements"],
    enabled: noClub,
    queryFn: () => entFn({ data: undefined as never }),
  });
  const canCreate = !!entQ.data?.canCreate;
  const hasAnnual = !!entQ.data?.activeAnnual;
  const singlesLeft = entQ.data?.unusedSingles?.length ?? 0;

  // Pass-only users have no real club. Pre-resolve their personal club id so
  // the unified TournamentCreateChooser/Wizard can run for them too.
  const personalClubFn = useServerFn(ensurePersonalClubId);
  const personalClubQ = useQuery({
    queryKey: ["personal-club-id"],
    enabled: noClub && canCreate,
    queryFn: () => personalClubFn({ data: undefined as never }),
    staleTime: 5 * 60 * 1000,
  });
  const effectiveClubId = noClub ? (personalClubQ.data?.clubId ?? null) : activeClubId;

  function openCreate() {
    if (noClub && !canCreate) return;
    setOpen(true);
  }

  const tournaments = q.data?.tournaments ?? [];

  return (
    <div className="space-y-5 px-4 pb-24 pt-5">
      {/* keyframes pour le shimmer du bouton vert */}
      <style>{`@keyframes tournament-shimmer { 0% { transform: translateX(-120%);} 60%,100% { transform: translateX(120%);} }`}</style>

      {/* ─── Page header (bandeau vert + SVG trophée) ─────────────── */}
      <div
        className="relative overflow-hidden rounded-[18px] p-5 text-white"
        style={{ background: GREEN_GRADIENT, boxShadow: CARD_SHADOW }}
      >
        <TrophyPattern />
        <div className="relative flex items-center gap-3">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-card/15 ring-1 ring-white/25 backdrop-blur">
            <Trophy className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/75">
              Clubero · Tournois
            </p>
            <h1
              className="truncate text-[22px] font-extrabold leading-tight"
              style={{ letterSpacing: "-0.3px" }}
            >
              {t("list.title")}
            </h1>
          </div>
        </div>
      </div>

      {canManage && effectiveClubId && (
        <TournamentCreateChooser clubId={effectiveClubId} open={open} onOpenChange={setOpen} />
      )}

      {/* ─── Bandeau organisateur "30s avec l'IA" ─────────────────── */}
      {noClub && !collaboratorOnly && (
        <div
          className="relative overflow-hidden rounded-[18px] p-5 text-white"
          style={{ background: GREEN_GRADIENT, boxShadow: CARD_SHADOW }}
        >
          <TrophyPattern />
          <div className="relative flex items-start gap-3">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-card/15 ring-1 ring-white/25">
              <Sparkles className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/75">
                Organisateur
              </p>
              <p
                className="font-display text-[17px] font-extrabold leading-snug"
                style={{ letterSpacing: "-0.3px" }}
              >
                Créez votre tournoi en 30 s avec l'IA
              </p>
              <p className="mt-1 text-[13px] text-white/85">
                {hasAnnual
                  ? "Pass Annuel actif — création illimitée."
                  : singlesLeft > 0
                    ? `${singlesLeft} crédit${singlesLeft > 1 ? "s" : ""} tournoi disponible${singlesLeft > 1 ? "s" : ""}.`
                    : "Choisissez un plan — à partir de 39 €."}
              </p>
            </div>
          </div>
          <div className="relative mt-4 flex flex-wrap gap-2">
            {canCreate ? (
              <Button
                size="sm"
                className="bg-card text-emerald-800 hover:bg-card/90"
                onClick={openCreate}
                disabled={!effectiveClubId}
              >
                <Zap className="h-4 w-4" />
                Créer maintenant
              </Button>
            ) : (
              <Button asChild size="sm" className="bg-card text-emerald-800 hover:bg-card/90">
                <Link to="/tournaments/pricing">
                  <Trophy className="h-4 w-4" />
                  Voir les plans
                </Link>
              </Button>
            )}

            {!hasAnnual && canCreate && (
              <Button
                asChild
                size="sm"
                variant="outline"
                className="border-white/40 bg-card/10 text-white hover:bg-card/20 hover:text-white"
              >
                <Link to="/tournaments/pricing">Voir les plans</Link>
              </Button>
            )}
          </div>
        </div>
      )}

      {(tournamentOnly || noClub) && !collaboratorOnly && <TournamentUpgradeCard />}

      {/* ─── Liste ─────────────────────────────────────────────────── */}
      {q.isLoading ? (
        <div className="space-y-3">
          {[0, 1].map((i) => (
            <div
              key={i}
              className="h-32 animate-pulse rounded-[16px] border border-border bg-card"
              style={{ borderWidth: 1.5 }}
            />
          ))}
        </div>
      ) : tournaments.length === 0 ? (
        <EmptyState
          icon={<Trophy className="h-6 w-6" />}
          title={t("list.emptyTitle")}
          description={canManage ? t("list.emptyDescManage") : t("list.emptyDescView")}
          action={
            canManage ? (
              noClub ? (
                canCreate ? (
                  <ShimmerButton onClick={openCreate} disabled={!effectiveClubId}>
                    <Plus className="h-4 w-4" />
                    {t("list.create")}
                  </ShimmerButton>
                ) : (
                  <ShimmerButton asChild>
                    <Link to="/tournaments/pricing">
                      <Trophy className="h-4 w-4" />
                      Voir les plans
                    </Link>
                  </ShimmerButton>
                )
              ) : (
                <ShimmerButton onClick={() => setOpen(true)}>
                  <Plus className="h-4 w-4" />
                  {t("list.create")}
                </ShimmerButton>
              )
            ) : null
          }
        />
      ) : (
        <ul className="space-y-3">
          {tournaments.map((trn: any) => (
            <li key={trn.id}>
              <Link
                to="/tournaments/$tournamentId"
                params={{ tournamentId: trn.id }}
                className="group block overflow-hidden rounded-[16px] border bg-card transition-transform active:scale-[0.99]"
                style={{ borderColor: "#e2e8f0", borderWidth: 1.5, boxShadow: CARD_SHADOW }}
              >
                <CardHeaderStrip status={trn.status} />
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 p-4">
                  <div className="min-w-0">
                    <p
                      className="truncate text-[15px] font-extrabold text-foreground"
                      style={{ letterSpacing: "-0.2px" }}
                    >
                      {trn.name}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[12px] text-muted-foreground">
                      <span className="inline-flex items-center gap-1.5">
                        <span className="grid h-5 w-5 place-items-center rounded-md bg-emerald-50 text-emerald-700">
                          <Calendar className="h-3 w-3" />
                        </span>
                        <span className="tabular-nums">{trn.starts_on ?? "—"}</span>
                      </span>
                      {typeof trn.team_count === "number" && (
                        <span className="inline-flex items-center gap-1.5">
                          <span className="grid h-5 w-5 place-items-center rounded-md bg-sky-50 text-sky-700">
                            <Users className="h-3 w-3" />
                          </span>
                          {trn.team_count}
                        </span>
                      )}
                      {trn.sport && (
                        <span className="inline-flex items-center gap-1.5">
                          <span className="grid h-5 w-5 place-items-center rounded-md bg-amber-50 text-amber-700">
                            <Layers className="h-3 w-3" />
                          </span>
                          {trn.sport}
                        </span>
                      )}
                      {trn.location && (
                        <span className="inline-flex items-center gap-1.5">
                          <span className="grid h-5 w-5 place-items-center rounded-md bg-rose-50 text-rose-700">
                            <MapPin className="h-3 w-3" />
                          </span>
                          <span className="truncate max-w-[140px]">{trn.location}</span>
                        </span>
                      )}
                    </div>
                  </div>
                  <ChevronRight className="h-5 w-5 shrink-0 text-slate-300 transition-transform group-hover:translate-x-0.5 group-hover:text-emerald-600" />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {/* ─── CTA "Créer" en bas si liste non vide ─────────────────── */}
      {canManage && tournaments.length > 0 && (
        <div className="pt-1">
          {noClub ? (
            canCreate ? (
              <ShimmerButton onClick={openCreate} disabled={!effectiveClubId} className="w-full">
                <Plus className="h-4 w-4" />
                {t("list.create")}
              </ShimmerButton>
            ) : (
              <ShimmerButton asChild className="w-full">
                <Link to="/tournaments/pricing">
                  <Trophy className="h-4 w-4" />
                  Acheter un crédit tournoi
                </Link>
              </ShimmerButton>
            )
          ) : (
            activeClubId && (
              <ShimmerButton onClick={() => setOpen(true)} className="w-full">
                <Plus className="h-4 w-4" />
                {t("list.create")}
              </ShimmerButton>
            )
          )}
        </div>
      )}
    </div>
  );
}
