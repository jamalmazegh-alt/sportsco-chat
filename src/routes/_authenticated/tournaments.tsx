import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import i18n from "@/lib/i18n";
import { useAuth, useActiveRole, useMyRoles } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { Plus, Trophy, ChevronRight, Calendar, Sparkles, Zap } from "lucide-react";
import {
  listMyTournaments,
  listMyPersonalTournaments,
} from "@/modules/tournaments/tournaments.functions";
import { listMyTournamentEntitlements } from "@/modules/tournaments/entitlements.functions";
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

function TournamentsList() {
  const { t } = useTranslation("tournaments");
  const { activeClubId, memberships } = useAuth();
  const role = useActiveRole();
  const roles = useMyRoles();
  const { tournamentOnly } = useTournamentOnlyMode();
  const noClub = memberships.length === 0 || tournamentOnly;
  const canManage = roles.includes("admin") || (role as string) === "dirigeant" || noClub;
  const [open, setOpen] = useState(false);

  const clubFn = useServerFn(listMyTournaments);
  const personalFn = useServerFn(listMyPersonalTournaments);

  const q = useQuery({
    queryKey: noClub
      ? ["tournaments", "personal"]
      : ["tournaments", activeClubId],
    enabled: noClub ? true : !!activeClubId,
    queryFn: () =>
      noClub
        ? personalFn({ data: undefined as never })
        : clubFn({ data: { club_id: activeClubId! } }),
  });

  // Entitlements drive the "can the user start a new tournament?" decision
  // for organisers without a club. Club admins keep their existing flow
  // (gated by club SaaS subscription).
  const entFn = useServerFn(listMyTournamentEntitlements);
  const entQ = useQuery({
    queryKey: ["my-tournament-entitlements"],
    enabled: noClub,
    queryFn: () => entFn({ data: undefined as never }),
  });
  const canCreate = !!entQ.data?.canCreate;
  const hasAnnual = !!entQ.data?.activeAnnual;
  const singlesLeft = entQ.data?.unusedSingles?.length ?? 0;

  const tournaments = q.data?.tournaments ?? [];

  return (
    <div className="px-5 pt-8 space-y-5">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <Trophy className="h-6 w-6 text-primary" />
          {t("list.title")}
        </h1>
      </div>

      {canManage && !noClub && activeClubId && (
        <TournamentCreateChooser
          clubId={activeClubId}
          open={open}
          onOpenChange={setOpen}
        />
      )}

      {noClub && (
        <div className="space-y-3">
          <div
            className="rounded-2xl p-4 text-white shadow-lg"
            style={{
              background:
                "linear-gradient(135deg, #0f4a26 0%, #1d7a45 60%, #2d9d5f 100%)",
            }}
          >
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/15">
                <Sparkles className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs uppercase tracking-wider text-white/80">
                  Organisateur
                </p>
                <p className="font-display text-lg font-bold">
                  Créez votre tournoi en 30 s avec l'IA
                </p>
                <p className="mt-1 text-sm text-white/85">
                  {hasAnnual
                    ? "Pass Annuel actif — création illimitée."
                    : singlesLeft > 0
                      ? `${singlesLeft} crédit${singlesLeft > 1 ? "s" : ""} tournoi disponible${singlesLeft > 1 ? "s" : ""}.`
                      : "Choisissez un plan — à partir de 39 €."}
                </p>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {canCreate ? (
                <Button
                  asChild
                  size="sm"
                  className="bg-white text-emerald-800 hover:bg-white/90"
                >
                  <Link to="/tournaments/new-from-pass">
                    <Zap className="h-4 w-4" />
                    Créer maintenant
                  </Link>
                </Button>
              ) : (
                <Button
                  asChild
                  size="sm"
                  className="bg-white text-emerald-800 hover:bg-white/90"
                >
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
                  className="border-white/40 bg-white/10 text-white hover:bg-white/20 hover:text-white"
                >
                  <Link to="/tournaments/pricing">Voir les plans</Link>
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      {(tournamentOnly || noClub) && <TournamentUpgradeCard />}

      {q.isLoading ? (
        <div className="space-y-2">
          {[0, 1].map((i) => (
            <div key={i} className="h-20 rounded-2xl bg-muted animate-pulse" />
          ))}
        </div>
      ) : tournaments.length === 0 ? (
        <EmptyState
          icon={<Trophy className="h-6 w-6" />}
          title={t("list.emptyTitle")}
          description={
            canManage
              ? t("list.emptyDescManage")
              : t("list.emptyDescView")
          }
          action={
            canManage ? (
              noClub ? (
                canCreate ? (
                  <Button size="sm" asChild>
                    <Link to="/tournaments/new-from-pass">
                      <Plus className="h-4 w-4" />
                      {t("list.create")}
                    </Link>
                  </Button>
                ) : (
                  <Button size="sm" asChild>
                    <Link to="/tournaments/pricing">
                      <Trophy className="h-4 w-4" />
                      Voir les plans
                    </Link>
                  </Button>
                )
              ) : (
                <Button size="sm" onClick={() => setOpen(true)}>
                  <Plus className="h-4 w-4" />
                  {t("list.create")}
                </Button>
              )
            ) : null
          }
        />
      ) : (
        <ul className="space-y-2">
          {tournaments.map((t: any) => (
            <li key={t.id}>
              <Link
                to="/tournaments/$tournamentId"
                params={{ tournamentId: t.id }}
                className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3 active:scale-[0.99] transition-transform"
              >
                <div className="h-14 w-14 rounded-xl bg-primary/10 shrink-0 overflow-hidden flex items-center justify-center">
                  {t.cover_image_url ? (
                    <img
                      src={t.cover_image_url}
                      alt={t.name}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <Trophy className="h-5 w-5 text-primary" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium truncate">{t.name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1.5">
                    <Calendar className="h-3 w-3" />
                    {t.starts_on}
                    {" · "}
                    {t.sport}
                    {" · "}
                    <StatusBadge status={t.status} />
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
              </Link>
            </li>
          ))}
        </ul>
      )}

      {canManage && tournaments.length > 0 && (
        <div className="pt-2">
          {noClub ? (
            canCreate ? (
              <Button size="sm" variant="outline" className="w-full" asChild>
                <Link to="/tournaments/new-from-pass">
                  <Plus className="h-4 w-4" />
                  {t("list.create")}
                </Link>
              </Button>
            ) : (
              <Button size="sm" variant="outline" className="w-full" asChild>
                <Link to="/tournaments/pricing">
                  <Trophy className="h-4 w-4" />
                  Acheter un crédit tournoi
                </Link>
              </Button>
            )
          ) : (
            activeClubId && (
              <Button size="sm" variant="outline" className="w-full" onClick={() => setOpen(true)}>
                <Plus className="h-4 w-4" />
                {t("list.create")}
              </Button>
            )
          )}
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const { t } = useTranslation("tournaments");
  const label = t(`status.${status}`, { defaultValue: status });
  return <span>{label}</span>;
}
