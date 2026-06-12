import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
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
  Award,
  ChevronRight,
} from "lucide-react";
import { BackLink } from "@/components/back-link";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  getTournament,
  updateTournament,
} from "@/modules/tournaments/tournaments.functions";
import { resolveScoring } from "@/modules/tournaments/lib/formats";
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
import { TournamentSettingsMenu } from "@/modules/tournaments/components/TournamentSettingsMenu";
import {
  computeStepper,
  computeContinueAction,
  countMatches,
  type ContinueAction,
} from "@/modules/tournaments/lib/control-center";

export const Route = createFileRoute("/_authenticated/tournaments/$tournamentId")({
  component: TournamentDetailPage,
  // Backward-compatible search params: previous URLs (?tab=, ?sub=) are still parsed
  // but the Centre de contrôle ignores them and shows the unified workflow.
  validateSearch: (search: Record<string, unknown>) => ({
    tab: typeof search.tab === "string" ? search.tab : undefined,
    sub: typeof search.sub === "string" ? search.sub : undefined,
    focusMatch: typeof search.focusMatch === "string" ? search.focusMatch : undefined,
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

  const q = useQuery({
    queryKey: ["tournament", tournamentId],
    queryFn: () => getFn({ data: { tournament_id: tournamentId } }),
  });

  const publish = useMutation({
    mutationFn: (status: "published" | "in_progress" | "completed" | "draft") =>
      updateFn({ data: { tournament_id: tournamentId, patch: { status } } }),
    onSuccess: () => {
      toast.success(t("detail.statusUpdated"));
      qc.invalidateQueries({ queryKey: ["tournament", tournamentId] });
    },
    onError: (e: any) => toast.error(e?.message ?? t("common.error", { defaultValue: "Erreur" })),
  });

  // Score-entry auto-open id (consumed once by MatchesList)
  const [focusMatchId, setFocusMatchId] = useState<string | null>(null);

  const isLoading = q.isLoading;
  const hasData = !!q.data;
  const { tournament, groups, teams, matches, flights } = (q.data ?? {
    tournament: null as any,
    groups: [] as any[],
    teams: [] as any[],
    matches: [] as any[],
    flights: [] as any[],
  });
  const canManage =
    (q.data as any)?.canManage === true ||
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
        (tournament as any).sport,
        ((tournament as any).settings as any)?.scoring,
      )
    : null;
  const mergedRules = tournament ? mergeRules((tournament as any).settings) : null;
  const registrationEnabled = mergedRules?.registration.enabled ?? false;

  // ─── Sprint 1: control-center derivations ─────────────────────────────────
  const stepper = useMemo(
    () =>
      tournament
        ? computeStepper({
            tournament: tournament as any,
            teamsCount: (teams as any[]).length,
            groupsCount: (groups as any[]).length,
            matches: matches as any[],
            flightsCount: (flights as any[]).length,
          })
        : [],
    [tournament, teams, groups, matches, flights],
  );

  const continueAction: ContinueAction = useMemo(
    () =>
      tournament
        ? computeContinueAction({
            tournament: tournament as any,
            teamsCount: (teams as any[]).length,
            groupsCount: (groups as any[]).length,
            matches: matches as any[],
            flightsCount: (flights as any[]).length,
          })
        : { kind: "all_done" },
    [tournament, teams, groups, matches, flights],
  );

  const counters = useMemo(() => countMatches(matches as any[]), [matches]);

  const hasFlights = (flights as any[]).length > 0;
  const poolMatchesDone =
    (matches as any[]).filter((m: any) => m.round === "group").length > 0 &&
    (matches as any[])
      .filter((m: any) => m.round === "group")
      .every((m: any) => m.status === "completed");
  const showFlightsSection = canManage && (hasFlights || poolMatchesDone);

  // Handle Continue CTA clicks
  const handleContinue = (action: ContinueAction) => {
    switch (action.kind) {
      case "add_team":
        scrollToAnchor("section-teams");
        break;
      case "run_draw":
      case "generate_matches":
        scrollToAnchor("section-matches");
        toast.info(
          t("controlCenter.openSettingsForDraw", {
            defaultValue: "Ouvre la configuration (⋯ › Format) pour lancer le tirage / générer les matchs.",
          }),
        );
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
        scrollToAnchor("section-share");
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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }
  if (!hasData || !tournament) return null;

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
              teams={teams as any[]}
              matches={matches as any[]}
              groups={groups as any[]}
              publicUrl={publicUrl}
            />
          )}
        </div>

        {/* Stepper — progress gauge, not a menu */}
        <TournamentStepper steps={stepper} />
      </header>

      {/* ─── Banners (publish workflow, club banner, registrations off) ─── */}
      <div className="px-5 space-y-3">
        {canManage && (
          <PublishWorkflow
            tournament={tournament as any}
            teamsCount={(teams as any[])?.length ?? 0}
            fieldsCount={
              Array.isArray(((tournament as any).settings as any)?.fields)
                ? ((tournament as any).settings as any).fields.length
                : 0
            }
            publicUrl={publicUrl}
            busy={publish.isPending}
            onPublish={() => publish.mutate("published")}
            onStart={() => publish.mutate("in_progress")}
            onClose={() => publish.mutate("completed")}
          />
        )}

        {canManage && tournament && (
          <TournamentToClubBanner
            tournament={{ id: tournament.id, status: tournament.status }}
            hasRealClubMembership={memberships.length > 0}
            resultsCount={
              (matches as any[]).filter(
                (m: any) =>
                  m?.status === "completed" ||
                  m?.home_score != null ||
                  m?.away_score != null,
              ).length
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

      {/* ─── PROCHAINE ACTION (hero) ─────────────────────────────────────── */}
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
      </div>

      {/* ─── Live courts ─────────────────────────────────────────────────── */}
      <div className="px-5 pt-5">
        <LiveCourts
          matches={matches as any[]}
          teams={teams as any[]}
          onSelect={canManage ? focusMatch : undefined}
        />
      </div>

      {/* ─── Publish programme card (existing) ───────────────────────────── */}
      {canManage && (
        <div className="px-5 pt-4">
          <PublishProgrammeCard
            tournamentId={tournament.id}
            status={tournament.status}
            teams={(teams as any[]).map((tt) => ({ id: tt.id, group_id: tt.group_id ?? null }))}
            matchesCount={(matches as any[])?.length ?? 0}
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
            matches={matches as any}
            teams={teams as any}
            canManage={canManage}
            fields={((tournament as any).fields as string[] | null) ?? []}
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
            teams={teams as any}
            maxTeams={(tournament as any).num_teams ?? null}
            sport={(tournament as any).sport ?? null}
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
              numTeams={(teams as any[]).length}
              numGroups={(groups as any[]).length}
              flights={(flights as any[]) ?? []}
              hasGroups={(groups as any[]).length > 0}
              groupMatchesCompleted={poolMatchesDone}
            />
          </Section>
        )}

        {/* Bracket (knockout) */}
        {(matches as any[]).some((m: any) => m.round !== "group") && (
          <Section
            id="section-bracket"
            icon={GitBranch}
            title={t("tabs.bracket", { defaultValue: "Phase finale" })}
          >
            <BracketView matches={matches as any} teams={teams as any} />
          </Section>
        )}

        {/* Registrations (managers only) */}
        {canManage && (
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
                registration_fee: (tournament as any).registration_fee ?? 0,
                payment_mode: (tournament as any).payment_mode ?? "offline",
                club_stripe_charges_enabled:
                  (tournament as any).club_stripe_charges_enabled ?? false,
              }}
            />
          </Section>
        )}

        <div id="section-share" />
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
  const styles: Record<typeof tone, string> = {
    emerald: "text-emerald-600 dark:text-emerald-400",
    orange: "text-orange-600 dark:text-orange-400",
    muted: "text-muted-foreground",
  } as any;
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
          className={cn(
            "h-4 w-4 text-muted-foreground transition-transform",
            open && "rotate-90",
          )}
        />
      </button>
      {open && <div className="pt-2">{children}</div>}
    </section>
  );
}
