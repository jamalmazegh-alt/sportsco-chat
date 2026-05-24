import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import i18n from "@/lib/i18n";
import { z } from "zod";
import { useActiveRole, useMyRoles } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import {
  Trophy,
  Loader2,
  Users,
  Shuffle,
  ListOrdered,
  Calendar,
  Settings2,
  Eye,
  GitBranch,
  MapPin,
  ChevronRight,
  ChevronLeft,
  Tv,
  AlertTriangle,
  Cog,
  UsersRound,
  PlayCircle,
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
import { GroupsAndFixtures } from "@/modules/tournaments/components/GroupsAndFixtures";
import { MatchesList } from "@/modules/tournaments/components/MatchesList";
import { StandingsView } from "@/modules/tournaments/components/StandingsView";
import { BracketView } from "@/modules/tournaments/components/BracketView";
import { ShareDialog } from "@/modules/tournaments/components/ShareDialog";
import { TournamentRulesEditor } from "@/modules/tournaments/components/TournamentRulesEditor";
import { FieldsManager } from "@/modules/tournaments/components/FieldsManager";
import { RegistrationsManager } from "@/modules/tournaments/components/RegistrationsManager";
import { RegistrationSettingsPanel } from "@/modules/tournaments/components/RegistrationSettingsPanel";
import { StaffAndOfficialsPanel } from "@/modules/tournaments/components/StaffAndOfficialsPanel";
import { PublishWorkflow } from "@/modules/tournaments/components/PublishWorkflow";
import { PublishProgrammeCard } from "@/modules/tournaments/components/PublishProgrammeCard";
import { PaymentSettingsPanel } from "@/modules/tournaments/components/PaymentSettingsPanel";
import { ClipboardList, UserCog, CreditCard, Dices, CalendarClock } from "lucide-react";


export const Route = createFileRoute("/_authenticated/tournaments/$tournamentId")({
  component: TournamentDetailPage,
  validateSearch: (search: Record<string, unknown>) => ({
    tab: z
      .enum(["configurer", "gerer", "jouer"])
      .optional()
      .parse(search.tab),
    sub: typeof search.sub === "string" ? (search.sub as string) : undefined,
  }),
  head: () => ({
    meta: [
      { title: i18n.t("meta.tournaments.title", { ns: "common" }) },
      { name: "description", content: i18n.t("meta.tournaments.description", { ns: "common" }) },
    ],
  }),
});

const SECTION_TO_URL: Record<"configure" | "manage" | "play", "configurer" | "gerer" | "jouer"> = {
  configure: "configurer",
  manage: "gerer",
  play: "jouer",
};
const URL_TO_SECTION: Record<"configurer" | "gerer" | "jouer", "configure" | "manage" | "play"> = {
  configurer: "configure",
  gerer: "manage",
  jouer: "play",
};

type Section = "configure" | "manage" | "play";
type Sub =
  | "format"
  | "rules"
  | "fields"
  | "payments"
  | "regSettings"
  | "registrations"
  | "teams"
  | "staff"
  | "draw"
  | "schedule"
  | "matches"
  | "standings"
  | "bracket"
  | "tv";

function TournamentDetailPage() {
  const { t } = useTranslation("tournaments");
  const { tournamentId } = Route.useParams();
  const role = useActiveRole();
  const roles = useMyRoles();

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

  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const urlSection: Section | null = search.tab
    ? URL_TO_SECTION[search.tab as "configurer" | "gerer" | "jouer"]
    : null;
  const [section, setSectionState] = useState<Section>(urlSection ?? "play");
  const [sub, setSubState] = useState<Sub>((search.sub as Sub) ?? "matches");
  const setSection = (next: Section) => {
    setSectionState(next);
    navigate({
      search: (prev: any) => ({ ...prev, tab: SECTION_TO_URL[next] }),
      replace: true,
      resetScroll: false,
    });
  };
  const setSub = (next: Sub) => {
    setSubState(next);
    navigate({
      search: (prev: any) => ({ ...prev, sub: next }),
      replace: true,
      resetScroll: false,
    });
  };

  // On first mount with no ?tab= in URL, default by tournament status.
  // Must be declared BEFORE any early return to keep hook order stable.
  const didInitDefault = useRef(false);
  const tournamentStatus = (q.data as any)?.tournament?.status as string | undefined;
  const canManageEarly =
    (q.data as any)?.canManage === true ||
    roles.includes("admin") ||
    roles.includes("tournament_manager") ||
    (role as string) === "dirigeant";
  useEffect(() => {
    if (didInitDefault.current) return;
    if (!tournamentStatus) return;
    didInitDefault.current = true;
    if (search.tab) return;
    const defaultSection: Section =
      tournamentStatus === "in_progress" || tournamentStatus === "completed"
        ? "play"
        : canManageEarly
          ? "configure"
          : "play";
    if (defaultSection !== section) setSection(defaultSection);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tournamentStatus]);

  const isLoading = q.isLoading;
  const hasData = !!q.data;

  const { tournament, groups, teams, matches } = (q.data ?? {
    tournament: null as any,
    groups: [] as any[],
    teams: [] as any[],
    matches: [] as any[],
  });
  const canManage =
    (q.data as any).canManage === true ||
    roles.includes("admin") || roles.includes("tournament_manager") ||
    (role as string) === "dirigeant";
  const publicUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/tournament/${tournament.slug}`
      : `/tournament/${tournament.slug}`;
  const scoring = resolveScoring(
    (tournament as any).sport,
    ((tournament as any).settings as any)?.scoring,
  );
  const mergedRules = mergeRules((tournament as any).settings);
  const registrationEnabled = mergedRules.registration.enabled;

  // Section definitions
  const playSubs: { id: Sub; icon: any; label: string }[] = [
    { id: "matches", icon: Calendar, label: t("tabs.matches") },
    { id: "standings", icon: ListOrdered, label: t("tabs.standings") },
    { id: "bracket", icon: GitBranch, label: t("tabs.bracket") },
    { id: "tv", icon: Tv, label: t("sections.tvLive", { defaultValue: "Live / TV" }) },
  ];
  const manageSubs: { id: Sub; icon: any; label: string }[] = canManage
    ? [
        { id: "registrations", icon: ClipboardList, label: t("tabs.registrations") },
        { id: "teams", icon: Users, label: t("tabs.teams") },
        { id: "staff", icon: UserCog, label: t("sections.staffAndOfficials", { defaultValue: "Staff & arbitres" }) },
      ]
    : [{ id: "teams", icon: Users, label: t("tabs.teams") }];
  const configureSubs: { id: Sub; icon: any; label: string }[] = canManage
    ? [
        { id: "regSettings", icon: ClipboardList, label: t("sections.registrationSettings", { defaultValue: "Inscriptions" }) },
        { id: "format", icon: Shuffle, label: t("tabs.format") },
        { id: "rules", icon: Settings2, label: t("tabs.rules") },
        { id: "fields", icon: MapPin, label: t("tabs.fields") },
        { id: "payments", icon: CreditCard, label: t("tabs.payments") },
      ]
    : [];

  const sectionDefs: { id: Section; icon: any; label: string; subs: typeof playSubs }[] = [
    ...(canManage
      ? [
          { id: "configure" as Section, icon: Cog, label: t("sections.configure", { defaultValue: "Configurer" }), subs: configureSubs },
          { id: "manage" as Section, icon: UsersRound, label: t("sections.manage", { defaultValue: "Gérer" }), subs: manageSubs },
        ]
      : [{ id: "manage" as Section, icon: UsersRound, label: t("sections.manage", { defaultValue: "Gérer" }), subs: manageSubs }]),
    { id: "play", icon: PlayCircle, label: t("sections.play", { defaultValue: "Jouer" }), subs: playSubs },
  ];

  const activeSubs = sectionDefs.find((s) => s.id === section)?.subs ?? [];
  // Auto-correct sub when switching section
  useEffect(() => {
    if (!activeSubs.find((s) => s.id === sub)) {
      const first = activeSubs[0];
      if (first) setSub(first.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section]);

  const goToRegSettings = () => {
    setSection("configure");
    setSub("regSettings");
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
    <div className="pb-6">
      <header className="px-5 pt-6 pb-4 space-y-3">
        <BackLink to="/tournaments" label={t("detail.back")} />

        <div className="flex items-start gap-3">
          <div className="h-14 w-14 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <Trophy className="h-6 w-6 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-semibold truncate">{tournament.name}</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              {tournament.sport} · {tournament.starts_on}
              {tournament.location ? ` · ${tournament.location}` : ""}
            </p>
            {!canManage && (
              <p className="text-xs mt-1">
                <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium">
                  {t(`status.${tournament.status}`, { defaultValue: tournament.status })}
                </span>
              </p>
            )}
          </div>
        </div>

        {canManage && (
          <div className="space-y-3">
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
            <div className="flex flex-wrap gap-2">
              <ShareDialog url={publicUrl} title={tournament.name} />
              <Button size="sm" variant="ghost" asChild>
                <a href={`/tournament/${tournament.slug}`} target="_blank" rel="noreferrer">
                  <Eye className="h-4 w-4" />
                  {t("detail.viewPublic")}
                </a>
              </Button>
            </div>
          </div>
        )}
      </header>

      {/* Top-level section tabs */}
      <div className="px-5 pb-3">
        <div className="grid grid-cols-3 gap-1.5 rounded-xl bg-muted/40 p-1.5">
          {sectionDefs.map((s) => {
            const Icon = s.icon;
            const active = section === s.id;
            return (
              <button
                key={s.id}
                onClick={() => setSection(s.id)}
                className={cn(
                  "flex flex-col items-center justify-center gap-1 py-2.5 rounded-lg text-xs font-semibold transition-all",
                  active
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="h-4 w-4" />
                {s.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Sub-tabs scroller */}
      <SubTabsNav tabs={activeSubs} tab={sub} setTab={setSub} />

      <div className="px-5 pt-4 space-y-4">
        {/* Registration-disabled banner when admin lands on Registrations */}
        {canManage &&
          section === "manage" &&
          sub === "registrations" &&
          !registrationEnabled && (
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
              <Button size="sm" onClick={goToRegSettings}>
                {t("registrations.disabledBanner.cta", { defaultValue: "Activer" })}
              </Button>
            </div>
          )}

        {/* Configure section */}
        {section === "configure" && canManage && sub === "regSettings" && (
          <RegistrationSettingsPanel
            tournamentId={tournament.id}
            tournamentSlug={tournament.slug}
            settings={(tournament as any).settings}
          />
        )}
        {section === "configure" && canManage && sub === "format" && (
          <GroupsAndFixtures
            tournamentId={tournament.id}
            format={tournament.format}
            status={tournament.status}
            numTeams={teams.length}
            teams={teams as any}
            groupsCount={groups.length}
            matchesCount={matches.length}
            startsOn={tournament.starts_on}
            matchDurationMin={(tournament as any).match_duration_min}
            breakMin={(tournament as any).break_min}
            dailyStartTime={(tournament as any).daily_start_time}
            dailyEndTime={(tournament as any).daily_end_time}
            fields={(tournament as any).fields}
            settings={(tournament as any).settings}
          />
        )}
        {section === "configure" && canManage && sub === "rules" && (
          <TournamentRulesEditor
            tournamentId={tournament.id}
            settings={(tournament as any).settings}
            sport={(tournament as any).sport}
          />
        )}
        {section === "configure" && canManage && sub === "fields" && (
          <FieldsManager
            tournamentId={tournament.id}
            fields={(tournament as any).fields}
            dailyStartTime={(tournament as any).daily_start_time}
            dailyEndTime={(tournament as any).daily_end_time}
            matches={matches as any}
            teams={teams as any}
          />
        )}
        {section === "configure" && canManage && sub === "payments" && (
          <PaymentSettingsPanel
            tournamentId={tournament.id}
            clubId={(tournament as any).club_id ?? null}
            initial={{
              registration_fee: (tournament as any).registration_fee ?? 0,
              registration_currency: (tournament as any).registration_currency ?? "eur",
              registration_fee_description: (tournament as any).registration_fee_description ?? null,
              payment_mode: (tournament as any).payment_mode ?? "offline",
            }}
          />
        )}

        {/* Manage section */}
        {section === "manage" && sub === "teams" && (
          <TeamsManager
            tournamentId={tournament.id}
            clubId={tournament.club_id}
            teams={teams as any}
            maxTeams={(tournament as any).num_teams ?? null}
            sport={(tournament as any).sport ?? null}
          />
        )}
        {section === "manage" && canManage && sub === "registrations" && (
          <RegistrationsManager
            tournamentId={tournament.id}
            tournament={{
              registration_fee: (tournament as any).registration_fee ?? 0,
              payment_mode: (tournament as any).payment_mode ?? "offline",
              club_stripe_charges_enabled:
                (tournament as any).club_stripe_charges_enabled ?? false,
            }}
          />
        )}
        {section === "manage" && canManage && sub === "staff" && (
          <StaffAndOfficialsPanel tournamentId={tournament.id} />
        )}


        {/* Play section */}
        {section === "play" && canManage && (
          <PublishProgrammeCard
            tournamentId={tournament.id}
            status={tournament.status}
            teams={(teams as any[]).map((tt) => ({ id: tt.id, group_id: tt.group_id ?? null }))}
            matchesCount={(matches as any[])?.length ?? 0}
            hasStartDate={Boolean(tournament.starts_on)}
          />
        )}
        {section === "play" && sub === "matches" && (
          <MatchesList
            tournamentId={tournament.id}
            matches={matches as any}
            teams={teams as any}
            canManage={canManage}
            fields={((tournament as any).fields as string[] | null) ?? []}
            scoring={scoring}
          />
        )}
        {section === "play" && sub === "standings" && (
          <StandingsView tournamentId={tournament.id} />
        )}
        {section === "play" && sub === "bracket" && (
          <BracketView matches={matches as any} teams={teams as any} />
        )}
        {section === "play" && sub === "tv" && (
          <div className="rounded-lg border bg-card p-6 text-center space-y-3">
            <Tv className="h-8 w-8 text-primary mx-auto" />
            <div>
              <p className="font-medium">
                {t("sections.tvLiveTitle", { defaultValue: "Diaporama TV / Live" })}
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                {t("sections.tvLiveHint", {
                  defaultValue: "Ouvre l'écran plein-écran pour afficher matchs et classements en direct.",
                })}
              </p>
            </div>
            <Button asChild>
              <a href={`/tournament/${tournament.slug}/tv`} target="_blank" rel="noreferrer">
                <Tv className="h-4 w-4" />
                {t("sections.openTv", { defaultValue: "Ouvrir l'écran live" })}
              </a>
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}


function SubTabsNav({
  tabs,
  tab,
  setTab,
}: {
  tabs: { id: Sub; icon: any; label: string }[];
  tab: Sub;
  setTab: (t: Sub) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const activeBtnRef = useRef<HTMLButtonElement>(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);
  const [hintPulse, setHintPulse] = useState(true);

  const updateScrollState = () => {
    const el = scrollRef.current;
    if (!el) return;
    setCanLeft(el.scrollLeft > 4);
    setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  };

  useEffect(() => {
    updateScrollState();
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener("scroll", updateScrollState, { passive: true });
    const ro = new ResizeObserver(updateScrollState);
    ro.observe(el);
    window.addEventListener("resize", updateScrollState);
    const stopHint = setTimeout(() => setHintPulse(false), 3500);
    return () => {
      el.removeEventListener("scroll", updateScrollState);
      ro.disconnect();
      window.removeEventListener("resize", updateScrollState);
      clearTimeout(stopHint);
    };
  }, [tabs.length]);

  // Center the active tab only when it changes (not on every render)
  useEffect(() => {
    activeBtnRef.current?.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
  }, [tab]);

  const scrollBy = (dir: 1 | -1) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * Math.max(160, el.clientWidth * 0.6), behavior: "smooth" });
    setHintPulse(false);
  };

  return (
    <nav className="px-5 pb-3 sticky top-0 bg-background/95 backdrop-blur z-10 border-b border-border">
      <div className="relative">
        <div
          ref={scrollRef}
          className="flex gap-1 overflow-x-auto scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {tabs.map((it) => {
            const Icon = it.icon;
            const active = tab === it.id;
            return (
              <button
                key={it.id}
                ref={active ? activeBtnRef : undefined}
                onClick={() => setTab(it.id)}
                className={cn(
                  "shrink-0 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap",
                  active
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted/40",
                )}
              >
                <Icon className="h-4 w-4" />
                {it.label}
              </button>
            );
          })}
        </div>

        {/* Left edge */}
        <div
          aria-hidden
          className={cn(
            "pointer-events-none absolute inset-y-0 left-0 w-10 bg-gradient-to-r from-background to-transparent transition-opacity duration-200",
            canLeft ? "opacity-100" : "opacity-0",
          )}
        />
        <button
          type="button"
          aria-label="Scroll left"
          onClick={() => scrollBy(-1)}
          className={cn(
            "absolute left-0 top-1/2 -translate-y-1/2 -mt-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-background/90 border border-border shadow-sm text-foreground transition-opacity duration-200",
            canLeft ? "opacity-100" : "opacity-0 pointer-events-none",
          )}
        >
          <ChevronLeft className="h-4 w-4" />
        </button>

        {/* Right edge */}
        <div
          aria-hidden
          className={cn(
            "pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-background to-transparent transition-opacity duration-200",
            canRight ? "opacity-100" : "opacity-0",
          )}
        />
        <button
          type="button"
          aria-label="Scroll right"
          onClick={() => scrollBy(1)}
          className={cn(
            "absolute right-0 top-1/2 -translate-y-1/2 -mt-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-background/95 border border-border shadow-sm text-foreground transition-opacity duration-200",
            canRight ? "opacity-100" : "opacity-0 pointer-events-none",
            canRight && hintPulse ? "animate-pulse" : "",
          )}
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </nav>
  );
}


