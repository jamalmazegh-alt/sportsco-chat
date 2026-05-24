import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import i18n from "@/lib/i18n";
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

} from "lucide-react";
import { BackLink } from "@/components/back-link";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  getTournament,
  updateTournament,
} from "@/modules/tournaments/tournaments.functions";
import { resolveScoring } from "@/modules/tournaments/lib/formats";
import { TeamsManager } from "@/modules/tournaments/components/TeamsManager";
import { GroupsAndFixtures } from "@/modules/tournaments/components/GroupsAndFixtures";
import { MatchesList } from "@/modules/tournaments/components/MatchesList";
import { StandingsView } from "@/modules/tournaments/components/StandingsView";
import { BracketView } from "@/modules/tournaments/components/BracketView";
import { ShareDialog } from "@/modules/tournaments/components/ShareDialog";
import { TournamentRulesEditor } from "@/modules/tournaments/components/TournamentRulesEditor";
import { FieldsManager } from "@/modules/tournaments/components/FieldsManager";
import { RegistrationsManager } from "@/modules/tournaments/components/RegistrationsManager";
import { CollaboratorsManager } from "@/modules/tournaments/components/CollaboratorsManager";
import { MembersManager } from "@/modules/tournaments/components/MembersManager";
import { PublishWorkflow } from "@/modules/tournaments/components/PublishWorkflow";
import { ClipboardList, UserPlus, UserCog } from "lucide-react";

export const Route = createFileRoute("/_authenticated/tournaments/$tournamentId")({
  component: TournamentDetailPage,
  head: () => ({
    meta: [
      { title: i18n.t("meta.tournaments.title", { ns: "common" }) },
      { name: "description", content: i18n.t("meta.tournaments.description", { ns: "common" }) },
    ],
  }),
});

type Tab = "teams" | "fixtures" | "fields" | "matches" | "standings" | "bracket" | "registrations" | "rules" | "team_staff" | "members";

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

  const [tab, setTab] = useState<Tab>("teams");

  if (q.isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }
  if (!q.data) return null;

  const { tournament, groups, teams, matches } = q.data;
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

  const tabs: { id: Tab; icon: any; label: string }[] = [
    { id: "teams", icon: Users, label: t("tabs.teams") },
    { id: "fixtures", icon: Shuffle, label: t("tabs.format") },
    ...(canManage
      ? [{ id: "fields" as const, icon: MapPin, label: t("tabs.fields") }]
      : []),
    { id: "matches", icon: Calendar, label: t("tabs.matches") },
    { id: "standings", icon: ListOrdered, label: t("tabs.standings") },
    { id: "bracket", icon: GitBranch, label: t("tabs.bracket") },
    ...(canManage
      ? [
          { id: "registrations" as const, icon: ClipboardList, label: t("tabs.registrations") },
          { id: "team_staff" as const, icon: UserPlus, label: t("tabs.teamStaff") },
          { id: "members" as const, icon: UserCog, label: t("tabs.members") },
          { id: "rules" as const, icon: Settings2, label: t("tabs.rules") },
        ]
      : []),
  ];

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

      <TabsNav tabs={tabs} tab={tab} setTab={setTab} />


      <div className="px-5 pt-4">
        {tab === "teams" && (
          <TeamsManager
            tournamentId={tournament.id}
            clubId={tournament.club_id}
            teams={teams as any}
            maxTeams={(tournament as any).num_teams ?? null}
            sport={(tournament as any).sport ?? null}
          />
        )}
        {tab === "fixtures" && canManage && (
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

        {tab === "fixtures" && !canManage && (
          <p className="text-sm text-muted-foreground">
            {t("detail.formatAdminOnly")}
          </p>
        )}
        {tab === "fields" && canManage && (
          <FieldsManager
            tournamentId={tournament.id}
            fields={(tournament as any).fields}
            dailyStartTime={(tournament as any).daily_start_time}
            dailyEndTime={(tournament as any).daily_end_time}
            matches={matches as any}
            teams={teams as any}
          />
        )}
        {tab === "matches" && (
          <MatchesList
            tournamentId={tournament.id}
            matches={matches as any}
            teams={teams as any}
            canManage={canManage}
            fields={((tournament as any).fields as string[] | null) ?? []}
            scoring={scoring}
          />
        )}
        {tab === "standings" && <StandingsView tournamentId={tournament.id} />}
        {tab === "bracket" && (
          <BracketView matches={matches as any} teams={teams as any} />
        )}
        {tab === "registrations" && canManage && (
          <RegistrationsManager tournamentId={tournament.id} />
        )}
        {tab === "team_staff" && canManage && (
          <CollaboratorsManager tournamentId={tournament.id} />
        )}
        {tab === "members" && canManage && (
          <MembersManager
            tournamentId={tournament.id}
            matches={matches as any}
            teams={teams as any}
          />
        )}
        {tab === "rules" && canManage && (
          <TournamentRulesEditor
            tournamentId={tournament.id}
            settings={(tournament as any).settings}
            sport={(tournament as any).sport}
          />
        )}
      </div>
    </div>
  );
}

function TabsNav({
  tabs,
  tab,
  setTab,
}: {
  tabs: { id: Tab; icon: any; label: string }[];
  tab: Tab;
  setTab: (t: Tab) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
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
          className="flex gap-1 overflow-x-auto scroll-smooth snap-x [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {tabs.map((it) => {
            const Icon = it.icon;
            const active = tab === it.id;
            return (
              <button
                key={it.id}
                ref={(el) => {
                  if (active && el) el.scrollIntoView({ block: "nearest", inline: "center" });
                }}
                onClick={() => setTab(it.id)}
                className={cn(
                  "shrink-0 snap-start flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap",
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


