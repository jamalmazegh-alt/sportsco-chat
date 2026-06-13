import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import i18n from "@/lib/i18n";
import { z } from "zod";
import { useActiveRole, useMyRoles, useAuth } from "@/lib/auth-context";
import { TournamentToClubBanner } from "@/components/tournament-to-club-banner";
import { Button } from "@/components/ui/button";
import {
  Trophy,
  Loader2,
  Users,
  ListOrdered,
  Calendar,
  GitBranch,
  AlertTriangle,
  ClipboardList,
  ChevronRight,
} from "lucide-react";
import { BackLink } from "@/components/back-link";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { getTournament, updateTournament } from "@/modules/tournaments/tournaments.functions";
import { resolveScoring, type ScoringRules } from "@/modules/tournaments/lib/formats";
import { mergeRules } from "@/modules/tournaments/lib/rules";

import { TeamsManager } from "@/modules/tournaments/components/TeamsManager";
import { MatchesList } from "@/modules/tournaments/components/MatchesList";
import { StandingsView } from "@/modules/tournaments/components/StandingsView";
import { BracketView } from "@/modules/tournaments/components/BracketView";
import { RegistrationsManager } from "@/modules/tournaments/components/RegistrationsManager";
import { PublishWorkflow } from "@/modules/tournaments/components/PublishWorkflow";
import { PublishProgrammeCard } from "@/modules/tournaments/components/PublishProgrammeCard";
import { FlightsManager } from "@/modules/tournaments/components/FlightsManager";

import { TournamentStepper } from "@/modules/tournaments/components/TournamentStepper";
import { ContinueCTA } from "@/modules/tournaments/components/ContinueCTA";
import { LiveCourts } from "@/modules/tournaments/components/LiveCourts";
import {
  TournamentSettingsMenu,
  type SettingsTopic,
  type FormatView,
} from "@/modules/tournaments/components/TournamentSettingsMenu";
import {
  computeStepper,
  computeContinueAction,
  countMatches,
  computeEstimatedEnd,
  computeAverageDelay,
  computeAlerts,
  type ContinueAction,
  type CockpitAlert,
} from "@/modules/tournaments/lib/control-center";
import { AlertsPanel } from "@/modules/tournaments/components/AlertsPanel";
import type { TournamentDetail } from "@/modules/tournaments/types";

export const Route = createFileRoute("/_authenticated/tournaments/$tournamentId")({
  component: TournamentDetailPage,
  // Backward-compatible search params: previous URLs (?tab=, ?sub=) are still parsed
  // but the Centre de contrôle ignores them and shows the unified workflow.
  validateSearch: (search: Record<string, unknown>) => ({
    tab: typeof search.tab === "string" ? search.tab : undefined,
    sub: typeof search.sub === "string" ? search.sub : undefined,
    focusMatch: typeof search.focusMatch === "string" ? search.focusMatch : undefined,
    display: search.display === "tv" ? ("tv" as const) : undefined,
  }),
  head: () => ({
    meta: [
      { title: i18n.t("meta.tournaments.title", { ns: "common" }) },
      { name: "description", content: i18n.t("meta.tournaments.description", { ns: "common" }) },
    ],
  }),
});

function scrollToAnchor(id: string) {
  if (typeof document === "undefined") return;
  const el = document.getElementById(id);
  if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
}

function TournamentDetailPage() {
  const { t } = useTranslation("tournaments");
  const { tournamentId } = Route.useParams();
  const role = useActiveRole();
  const roles = useMyRoles();
  const { memberships } = useAuth();

  const getFn = useServerFn(getTournament);
  const updateFn = useServerFn(updateTournament);
  const qc = useQueryClient();

  const search = Route.useSearch();
  const isTvMode = search.display === "tv";

  const q = useQuery({
    queryKey: ["tournament", tournamentId],
    queryFn: (): Promise<TournamentDetail> => getFn({ data: { tournament_id: tournamentId } }),
    // Sprint 2 — cockpit live updates via polling (no realtime channel).
    refetchInterval: 20_000,
    refetchIntervalInBackground: false,
  });

  const publish = useMutation({
    mutationFn: (status: "published" | "in_progress" | "completed" | "draft") =>
      updateFn({ data: { tournament_id: tournamentId, patch: { status } } }),
    onSuccess: () => {
      toast.success(t("detail.statusUpdated"));
      qc.invalidateQueries({ queryKey: ["tournament", tournamentId] });
    },
    onError: (e: unknown) =>
      toast.error(
        (e as { message?: string })?.message ?? t("common.error", { defaultValue: "Erreur" }),
      ),
  });

  // Score-entry auto-open id (consumed once by MatchesList)
  const [focusMatchId, setFocusMatchId] = useState<string | null>(null);

  // Controlled settings sheet (so the CTA can deep-link into a specific panel/view)
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTopic, setSettingsTopic] = useState<SettingsTopic | null>(null);
  const [settingsFormatView, setSettingsFormatView] = useState<FormatView>("format");

  const openSettings = (topic: SettingsTopic, formatView: FormatView = "format") => {
    setSettingsTopic(topic);
    setSettingsFormatView(formatView);
    setSettingsOpen(true);
  };

  const isLoading = q.isLoading;
  const data = q.data;
  const hasData = !!data;
  const tournament = data?.tournament ?? null;
  const groups = data?.groups ?? [];
  const teams = data?.teams ?? [];
  const matches = data?.matches ?? [];
  const flights = data?.flights ?? [];
  const canManage =
    data?.canManage === true ||
    roles.includes("admin") ||
    roles.includes("tournament_manager") ||
    (role as string) === "dirigeant";

  const publicUrl = tournament?.slug
    ? typeof window !== "undefined"
      ? `${window.location.origin}/tournament/${tournament.slug}`
      : `/tournament/${tournament.slug}`
    : "";
  const scoring = tournament
    ? resolveScoring(
        tournament.sport,
        // settings is jsonb (Json) — read the optional scoring block.
        (tournament.settings as { scoring?: Partial<ScoringRules> } | null)?.scoring,
      )
    : null;
  const mergedRules = tournament ? mergeRules(tournament.settings) : null;
  const registrationEnabled = mergedRules?.registration.enabled ?? false;

  // ─── Sprint 1: control-center derivations ─────────────────────────────────
  // Depend on the (react-query stable) `data` reference rather than the derived
  // `?? []` fallbacks, which would otherwise create new identities each render.
  const stepper = useMemo(
    () =>
      data?.tournament
        ? computeStepper({
            tournament: data.tournament,
            teamsCount: data.teams.length,
            groupsCount: data.groups.length,
            matches: data.matches,
            flightsCount: data.flights.length,
          })
        : [],
    [data],
  );

  const continueAction: ContinueAction = useMemo(
    () =>
      data?.tournament
        ? computeContinueAction({
            tournament: data.tournament,
            teamsCount: data.teams.length,
            groupsCount: data.groups.length,
            matches: data.matches,
            flightsCount: data.flights.length,
          })
        : { kind: "all_done" },
    [data],
  );

  const counters = useMemo(() => countMatches(data?.matches ?? []), [data]);

  // Sprint 2 — Cockpit metrics + alerts (pure, recomputed when data changes).
  const estimatedEnd = useMemo(
    () =>
      data?.tournament
        ? computeEstimatedEnd(data.matches, data.tournament.match_duration_min)
        : null,
    [data],
  );
  const averageDelay = useMemo(
    () => (data?.matches ? computeAverageDelay(data.matches) : null),
    [data],
  );
  const alerts = useMemo(
    () =>
      data?.tournament
        ? computeAlerts({
            tournament: data.tournament,
            matches: data.matches,
            flightsCount: data.flights.length,
          })
        : [],
    [data],
  );

  const hasFlights = flights.length > 0;
  const poolMatchesDone =
    matches.filter((m) => m.round === "group").length > 0 &&
    matches.filter((m) => m.round === "group").every((m) => m.status === "completed");
  const showFlightsSection = canManage && (hasFlights || poolMatchesDone);

  // Handle Continue CTA clicks
  const handleContinue = (action: ContinueAction) => {
    switch (action.kind) {
      case "add_team":
        scrollToAnchor("section-teams");
        break;
      case "run_draw":
        openSettings("format", "draw");
        break;
      case "generate_matches":
        // Deep-link into the Format panel's schedule sub-view — 1 tap, no toast.
        openSettings("format", "schedule");
        break;
      case "enter_next_score":
        if (action.matchId) {
          setFocusMatchId(action.matchId);
          scrollToAnchor("section-matches");
        }
        break;
      case "create_flights":
        scrollToAnchor("section-flights");
        break;
      case "share_results":
        openSettings("share");
        break;
      case "publish_tournament":
        publish.mutate("published");
        break;
      default:
        break;
    }
  };

  // Quick "open this live match" handler from LiveCourts
  const focusMatch = (id: string) => {
    setFocusMatchId(id);
    scrollToAnchor("section-matches");
  };

  // Sprint 2 — 1-tap alert routing. Detection only, no auto-correction.
  const handleAlertClick = (a: CockpitAlert) => {
    switch (a.kind) {
      case "late_match":
        if (a.matchId) focusMatch(a.matchId);
        break;
      case "missing_referee":
        openSettings("staff");
        break;
      case "finals_not_generated":
        scrollToAnchor("section-flights");
        break;
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }
  if (!hasData || !tournament) return null;

  // Sprint 2 — TV / projector mode (?display=tv). Read-only big-blocks layout.
  if (isTvMode) {
    return (
      <div className="min-h-screen bg-background p-6 space-y-6">
        <div className="flex items-center gap-3">
          <Trophy className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-3xl font-bold">{tournament.name}</h1>
            <p className="text-sm text-muted-foreground">
              {tournament.sport}
              {tournament.location ? ` · ${tournament.location}` : ""}
            </p>
          </div>
          <div className="ml-auto text-right">
            <div className="text-3xl font-bold tabular-nums">
              {new Date().toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
            </div>
            {estimatedEnd && (
              <div className="text-xs text-muted-foreground">
                {t("cockpit.estimatedEnd", { defaultValue: "Fin prévue" })}{" "}
                {estimatedEnd.toLocaleTimeString(undefined, {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </div>
            )}
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Counter
            label={t("controlCenter.counters.done", { defaultValue: "Terminés" })}
            value={counters.done}
            tone="emerald"
          />
          <Counter
            label={t("controlCenter.counters.live", { defaultValue: "En cours" })}
            value={counters.live}
            tone="orange"
          />
          <Counter
            label={t("controlCenter.counters.upcoming", { defaultValue: "À venir" })}
            value={counters.upcoming}
            tone="muted"
          />
        </div>
        <div className="grid lg:grid-cols-2 gap-6">
          <LiveCourts
            matches={matches as unknown as React.ComponentProps<typeof LiveCourts>["matches"]}
            teams={teams as unknown as React.ComponentProps<typeof LiveCourts>["teams"]}
          />
          <div className="space-y-4">
            <ContinueCTA action={continueAction} onAction={() => {}} variant="hero" />
            <AlertsPanel alerts={alerts} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="pb-24">
      {/* ─── Header ─────────────────────────────────────────────────────── */}
      <header className="px-5 pt-6 pb-3 space-y-3">
        <BackLink to="/tournaments" label={t("detail.back")} />
        <div className="flex items-start gap-3">
          <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <Trophy className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-semibold truncate">{tournament.name}</h1>
            <p className="text-xs text-muted-foreground mt-0.5 truncate">
              {tournament.sport} · {tournament.starts_on}
              {tournament.location ? ` · ${tournament.location}` : ""}
            </p>
          </div>
          {canManage && (
            <TournamentSettingsMenu
              tournament={tournament}
              teams={teams}
              matches={matches}
              groups={groups}
              publicUrl={publicUrl}
              open={settingsOpen}
              onOpenChange={setSettingsOpen}
              initialTopic={settingsTopic}
              initialFormatView={settingsFormatView}
            />
          )}
        </div>

        {/* Stepper — progress gauge, not a menu */}
        <TournamentStepper steps={stepper} />
      </header>

      {/* ─── PROCHAINE ACTION (hero) ─────────────────────────────────────── */}
      {/* Fix D — ordre : stepper → prochaine action → compteurs → terrains.
          Les bannières (publication, club, inscriptions) passent sous ce bloc. */}
      {canManage && (
        <div className="px-5 pt-4">
          <ContinueCTA action={continueAction} onAction={handleContinue} variant="hero" />
        </div>
      )}

      {/* ─── Counters ─────────────────────────────────────────────────── */}
      <div className="px-5 pt-4">
        <div className="grid grid-cols-3 gap-2">
          <Counter
            label={t("controlCenter.counters.done", { defaultValue: "Terminés" })}
            value={counters.done}
            tone="emerald"
          />
          <Counter
            label={t("controlCenter.counters.live", { defaultValue: "En cours" })}
            value={counters.live}
            tone="orange"
          />
          <Counter
            label={t("controlCenter.counters.upcoming", { defaultValue: "À venir" })}
            value={counters.upcoming}
            tone="muted"
          />
        </div>
        {/* Sprint 2 — Cockpit metrics: only when scheduled_at data exists. */}
        {(estimatedEnd || averageDelay !== null) && (
          <div className="mt-2 flex items-center justify-between gap-3 rounded-lg border border-border bg-card/50 px-3 py-2 text-xs">
            {estimatedEnd && (
              <span className="text-muted-foreground">
                {t("cockpit.estimatedEnd", { defaultValue: "Fin prévue" })}{" "}
                <strong className="text-foreground tabular-nums">
                  {estimatedEnd.toLocaleTimeString(undefined, {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </strong>
              </span>
            )}
            {averageDelay !== null && (
              <span
                className={cn(
                  "tabular-nums",
                  averageDelay >= 10 ? "text-amber-600 font-semibold" : "text-muted-foreground",
                )}
              >
                {t("cockpit.averageDelay", {
                  defaultValue: "Retard moyen {{minutes}} min",
                  minutes: averageDelay,
                })}
              </span>
            )}
          </div>
        )}
      </div>

      {/* ─── Alerts (Sprint 2) ─────────────────────────────────────────── */}
      {canManage && alerts.length > 0 && (
        <div className="px-5 pt-4">
          <AlertsPanel alerts={alerts} onAlertClick={(a) => handleAlertClick(a)} />
        </div>
      )}

      {/* ─── Live courts ─────────────────────────────────────────────────── */}
      <div className="px-5 pt-5">
        {/* DB rows vs LiveCourts' local shapes — cast to the component's own
            prop types (jsonb/enum columns diverge), no runtime change. */}
        <LiveCourts
          matches={matches as unknown as React.ComponentProps<typeof LiveCourts>["matches"]}
          teams={teams as unknown as React.ComponentProps<typeof LiveCourts>["teams"]}
          onSelect={canManage ? focusMatch : undefined}
        />
      </div>

      {/* ─── Banners (publish workflow, club banner, registrations off) ─────
          Fix D — déplacées sous la prochaine action / compteurs / terrains. */}
      <div className="px-5 pt-5 space-y-3">
        {canManage && (
          <PublishWorkflow
            tournament={tournament}
            teamsCount={teams.length}
            fieldsCount={
              // settings.fields is jsonb — probe defensively.
              Array.isArray((tournament.settings as { fields?: unknown } | null)?.fields)
                ? ((tournament.settings as { fields?: unknown }).fields as unknown[]).length
                : 0
            }
            publicUrl={publicUrl}
            busy={publish.isPending}
            onStart={() => publish.mutate("in_progress")}
            onClose={() => publish.mutate("completed")}
          />
        )}

        {canManage && tournament && (
          <TournamentToClubBanner
            tournament={{ id: tournament.id, status: tournament.status }}
            hasRealClubMembership={memberships.length > 0}
            resultsCount={
              // home_score/away_score are legacy field probes (not on the row);
              // read them defensively without changing the original behaviour.
              matches.filter((m) => {
                const legacy = m as unknown as {
                  home_score?: number | null;
                  away_score?: number | null;
                };
                return (
                  m.status === "completed" || legacy.home_score != null || legacy.away_score != null
                );
              }).length
            }
            surface="tournament_admin"
          />
        )}

        {canManage && !registrationEnabled && tournament.status === "draft" && (
          <div className="flex items-start gap-3 rounded-lg border border-amber-300/60 bg-amber-50 dark:bg-amber-950/20 p-3">
            <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-amber-900 dark:text-amber-200">
                {t("registrations.disabledBanner.title", {
                  defaultValue: "Les inscriptions en ligne sont désactivées",
                })}
              </p>
              <p className="text-xs text-amber-800/80 dark:text-amber-300/80 mt-0.5">
                {t("registrations.disabledBanner.body", {
                  defaultValue:
                    "Aucun bouton « S'inscrire » n'apparaît sur la page publique. Active-les pour recevoir des candidatures.",
                })}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* ─── Publish programme card (existing) ───────────────────────────── */}
      {canManage && (
        <div className="px-5 pt-4">
          <PublishProgrammeCard
            tournamentId={tournament.id}
            status={tournament.status}
            teams={teams.map((tt) => ({ id: tt.id, group_id: tt.group_id ?? null }))}
            matchesCount={matches.length}
            hasStartDate={Boolean(tournament.starts_on)}
          />
        </div>
      )}

      {/* ─── Sections (anchors, not tabs) ────────────────────────────────── */}
      <div className="px-5 pt-6 space-y-8">
        <Section
          id="section-matches"
          icon={Calendar}
          title={t("tabs.matches", { defaultValue: "Matchs" })}
        >
          <MatchesList
            tournamentId={tournament.id}
            // DB rows vs the component's local Match/Team shapes (jsonb sets,
            // enum columns) — cast to the component's own prop types.
            matches={matches as unknown as React.ComponentProps<typeof MatchesList>["matches"]}
            teams={teams as unknown as React.ComponentProps<typeof MatchesList>["teams"]}
            canManage={canManage}
            fields={(tournament.fields as string[] | null) ?? []}
            scoring={scoring ?? undefined}
            autoOpenMatchId={focusMatchId}
            onAutoOpenConsumed={() => setFocusMatchId(null)}
          />
        </Section>

        <Section
          id="section-teams"
          icon={Users}
          title={t("tabs.teams", { defaultValue: "Équipes" })}
        >
          <TeamsManager
            tournamentId={tournament.id}
            clubId={tournament.club_id}
            // TeamRow vs TeamsManager's local Team shape — cast to its prop type.
            teams={teams as unknown as React.ComponentProps<typeof TeamsManager>["teams"]}
            maxTeams={tournament.num_teams ?? null}
            sport={tournament.sport ?? null}
          />
        </Section>

        <Section
          id="section-standings"
          icon={ListOrdered}
          title={t("tabs.standings", { defaultValue: "Classement" })}
        >
          <StandingsView tournamentId={tournament.id} />
        </Section>

        {/* Flights (auto-shown when pool matches are completed or flights exist) */}
        {showFlightsSection && (
          <Section
            id="section-flights"
            icon={Trophy}
            title={t("sections.flights", { defaultValue: "Flights" })}
            highlight={poolMatchesDone && !hasFlights}
          >
            {poolMatchesDone && !hasFlights && (
              <div className="rounded-lg border border-primary/40 bg-primary/5 p-3 mb-3 text-sm">
                {t("controlCenter.flightsReady", {
                  defaultValue:
                    "Les poules sont terminées. Crée les Flights pour générer les 3 tableaux (Champions / Europa / Conference).",
                })}
              </div>
            )}
            <FlightsManager
              tournamentId={tournament.id}
              numTeams={teams.length}
              numGroups={groups.length}
              // FlightRow vs FlightsManager's local flight shape — cast to its prop type.
              flights={flights as unknown as React.ComponentProps<typeof FlightsManager>["flights"]}
              hasGroups={groups.length > 0}
              groupMatchesCompleted={poolMatchesDone}
              bracketsGenerated={matches.some(
                (m) => (m as { flight_id?: string | null }).flight_id != null,
              )}
            />
          </Section>
        )}

        {/* Bracket (knockout) */}
        {matches.some((m) => m.round !== "group") && (
          <Section
            id="section-bracket"
            icon={GitBranch}
            title={t("tabs.bracket", { defaultValue: "Phase finale" })}
          >
            {/* DB rows vs BracketView's local shapes — cast to its prop types. */}
            <BracketView
              matches={matches as unknown as React.ComponentProps<typeof BracketView>["matches"]}
              teams={teams as unknown as React.ComponentProps<typeof BracketView>["teams"]}
            />
          </Section>
        )}

        {/* Registrations (managers only, draft/published — B8: hidden once started) */}
        {canManage &&
          (tournament.status === "draft" || tournament.status === "published") && (
          <Section
            id="section-registrations"
            icon={ClipboardList}
            title={t("tabs.registrations", { defaultValue: "Inscriptions" })}
            collapsedByDefault
          >
            <RegistrationsManager
              tournamentId={tournament.id}
              tournament={{
                club_id: tournament.club_id ?? null,
                registration_fee: tournament.registration_fee ?? 0,
                // payment_mode is a free-form string column; narrow to the union.
                payment_mode: (tournament.payment_mode ?? "offline") as
                  | "offline"
                  | "online"
                  | "both",
                club_stripe_charges_enabled: tournament.club_stripe_charges_enabled ?? false,
              }}
            />
          </Section>
        )}
      </div>

      {/* ─── Sticky bottom CTA ───────────────────────────────────────────── */}
      {canManage && (
        <ContinueCTA action={continueAction} onAction={handleContinue} variant="sticky" />
      )}
    </div>
  );
}

// ─── Local subcomponents ────────────────────────────────────────────────────

function Counter({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "emerald" | "orange" | "muted";
}) {
  const styles: Record<"emerald" | "orange" | "muted", string> = {
    emerald: "text-emerald-600 dark:text-emerald-400",
    orange: "text-orange-600 dark:text-orange-400",
    muted: "text-muted-foreground",
  };
  return (
    <div className="rounded-xl border border-border bg-card px-3 py-2.5 text-center">
      <div className={cn("text-2xl font-bold tabular-nums", styles[tone])}>{value}</div>
      <div className="text-[11px] font-medium text-muted-foreground mt-0.5">{label}</div>
    </div>
  );
}

function Section({
  id,
  icon: Icon,
  title,
  children,
  highlight,
  collapsedByDefault,
}: {
  id: string;
  icon: typeof Trophy;
  title: string;
  children: React.ReactNode;
  highlight?: boolean;
  collapsedByDefault?: boolean;
}) {
  const [open, setOpen] = useState(!collapsedByDefault);
  return (
    <section id={id} className="scroll-mt-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "w-full flex items-center gap-2 px-1 py-2 text-left rounded-lg",
          highlight && "text-primary",
        )}
        aria-expanded={open}
      >
        <Icon className={cn("h-4 w-4", highlight ? "text-primary" : "text-muted-foreground")} />
        <h2 className="text-sm font-semibold uppercase tracking-wide flex-1">{title}</h2>
        <ChevronRight
          className={cn("h-4 w-4 text-muted-foreground transition-transform", open && "rotate-90")}
        />
      </button>
      {open && <div className="pt-2">{children}</div>}
    </section>
  );
}
