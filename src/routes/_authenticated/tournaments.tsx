import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import i18n from "@/lib/i18n";
import { useAuth, useActiveRole, useMyRoles } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { Plus, Trophy, ChevronRight, Calendar } from "lucide-react";
import {
  listMyTournaments,
  listMyPersonalTournaments,
} from "@/modules/tournaments/tournaments.functions";
import { listMyAvailablePasses } from "@/modules/tournaments/passes.functions";
import { TournamentWizard } from "@/modules/tournaments/components/TournamentWizard";
import { TournamentPassButton } from "@/modules/tournaments/components/TournamentPassButton";
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
  const noClub = memberships.length === 0;
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

  // For tournament-only organizers: check available passes to decide whether
  // to show "Create" or "Buy a pass" CTAs.
  const passesFn = useServerFn(listMyAvailablePasses);
  const passesQ = useQuery({
    queryKey: ["my-tournament-passes"],
    enabled: tournamentOnly || noClub,
    queryFn: () => passesFn({ data: undefined as never }),
  });
  const availablePasses = passesQ.data?.passes ?? [];
  const hasPass = availablePasses.length > 0;

  const tournaments = q.data?.tournaments ?? [];

  return (
    <div className="px-5 pt-8 space-y-5">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <Trophy className="h-6 w-6 text-primary" />
          {t("list.title")}
        </h1>
        {canManage && noClub && (
          <div className="flex items-center gap-2">
            <TournamentPassButton
              variant="outline"
              className="h-9"
            />
          </div>
        )}
      </div>

      {canManage && !noClub && activeClubId && (
        <TournamentWizard
          clubId={activeClubId}
          open={open}
          onOpenChange={setOpen}
        />
      )}


      {noClub && (
        <div className="space-y-3">
          <div className="rounded-2xl border border-border bg-card p-4 text-sm">
            <p className="font-medium">{t("list.organizerModeTitle")}</p>
            <p className="mt-1 text-muted-foreground">
              {t("list.organizerModeBody")}
            </p>
            <p className="mt-3 flex items-center gap-2 text-sm">
              <span className="inline-flex h-7 min-w-7 items-center justify-center rounded-full bg-primary px-2 text-xs font-semibold text-primary-foreground">
                {availablePasses.length}
              </span>
              <span className={availablePasses.length > 0 ? "text-primary font-medium" : "text-muted-foreground"}>
                {availablePasses.length > 1
                  ? t("list.passAvailable_other")
                  : availablePasses.length === 1
                    ? t("list.passAvailable_one")
                    : t("list.noPassAvailable")}
              </span>
            </p>
          </div>
          <TournamentPassButton inline />
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
                hasPass ? (
                  <Button size="sm" asChild>
                    <Link to="/tournaments/new-from-pass">
                      <Plus className="h-4 w-4" />
                      {t("list.create")}
                    </Link>
                  </Button>
                ) : null
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
            hasPass ? (
              <Button size="sm" variant="outline" className="w-full" asChild>
                <Link to="/tournaments/new-from-pass">
                  <Plus className="h-4 w-4" />
                  {t("list.create")}
                </Link>
              </Button>
            ) : null
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
