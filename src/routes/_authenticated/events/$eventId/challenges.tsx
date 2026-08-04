import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { ArrowLeft, Loader2, Minus, Plus, Trophy, Users, Lock, Eye } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScoreStepper } from "@/components/score-stepper";
import { getTemplatesForSport } from "@/lib/challenges/templates";
import {
  listChallenges,
  createChallengeFromTemplate,
  getOrCreatePassageForEvent,
  upsertResults,
  getChallengeRanking,
  updateChallengeVisibility,
  getPassageResults,
  getEventChallengesEntryCounts,
  getChallengePlayerBests,
} from "@/lib/challenges/challenges.functions";
import { NewRecordBadge } from "@/components/challenge-badges";
import i18n from "@/lib/i18n";

/**
 * Reorder a list so all items whose template_key starts with "juggling"
 * appear consecutively, at the position of the first juggling item.
 * Preserves relative order otherwise. Used in both the challenges list
 * and the "add activity" picker so the 4 juggling variants stay grouped.
 */
function groupJugglingVariants<T>(items: T[], getKey: (item: T) => string | null): T[] {
  const firstIdx = items.findIndex((it) => getKey(it)?.startsWith("juggling"));
  if (firstIdx < 0) return items;
  const juggling = items.filter((it) => getKey(it)?.startsWith("juggling"));
  const others = items.filter((it) => !getKey(it)?.startsWith("juggling"));
  const out = [...others];
  out.splice(firstIdx, 0, ...juggling);
  return out;
}

/** Display name for an existing challenge: prefer i18n template name so
 * renames (e.g. "Jonglerie" → "Jonglerie libre") take effect for challenges
 * created before the rename. Falls back to the stored DB name. */
function challengeDisplayName(
  c: { name: string; template_key?: string | null },
  t: (k: string, opts?: any) => string,
): string {
  if (c.template_key) {
    const translated = t(`templates.${c.template_key}.name`, { defaultValue: "" });
    if (translated) return translated;
  }
  return c.name;
}

export const Route = createFileRoute("/_authenticated/events/$eventId/challenges")({
  component: EventChallengesPage,
  head: () => ({
    meta: [
      { title: i18n.t("challenges:meta.title") },
      { name: "description", content: i18n.t("challenges:meta.description") },
    ],
  }),
});

function EventChallengesPage() {
  const { eventId } = Route.useParams();
  const { t } = useTranslation("challenges");
  const { user, memberships } = useAuth();
  const [view, setView] = useState<
    | { kind: "list" }
    | { kind: "add" }
    | { kind: "entry"; challengeId: string }
    | { kind: "ranking"; challengeId: string; passageId?: string }
  >({ kind: "list" });
  const [showAll, setShowAll] = useState(false);

  // Event → team → club, plus team players.
  const { data: eventInfo, isLoading: loadingEvent } = useQuery({
    queryKey: ["event-team", eventId],
    queryFn: async () => {
      const { data: ev } = await supabase
        .from("events")
        .select("id, team_id, title, teams:team_id (id, name, club_id, sport)")
        .eq("id", eventId)
        .single();
      if (!ev) return null;
      const teamId = ev.team_id as string;
      const clubId = (ev.teams as any)?.club_id as string;
      let sport = ((ev.teams as any)?.sport ?? null) as string | null;
      // Many teams have no sport set. Fall back to the club's dominant team
      // sport so the activity catalogue isn't reduced to generic templates.
      if (!sport && clubId) {
        const { data: siblings } = await supabase
          .from("teams")
          .select("sport")
          .eq("club_id", clubId)
          .not("sport", "is", null);
        const counts = new Map<string, number>();
        for (const s of siblings ?? []) {
          const key = String((s as any).sport ?? "")
            .trim()
            .toLowerCase();
          if (!key) continue;
          counts.set(key, (counts.get(key) ?? 0) + 1);
        }
        let best: string | null = null;
        let bestN = 0;
        for (const [k, n] of counts) {
          if (n > bestN) {
            best = k;
            bestN = n;
          }
        }
        sport = best;
      }

      const { data: members } = await supabase
        .from("team_members")
        .select("player_id, players:player_id (id, first_name, last_name, photo_url)")
        .eq("team_id", teamId)
        .eq("role", "player");
      const players =
        (members ?? [])
          .map((m: any) => m.players)
          .filter(Boolean)
          .sort((a: any, b: any) => (a.last_name ?? "").localeCompare(b.last_name ?? "")) ?? [];
      return { event: ev, teamId, clubId, sport, players };
    },
  });

  const eventClubRoles = memberships.find((m) => m.club_id === eventInfo?.clubId)?.roles ?? [];
  const isStaff =
    eventClubRoles.includes("admin") ||
    eventClubRoles.includes("coach") ||
    eventClubRoles.includes("assistant_coach");

  const list = useServerFn(listChallenges);
  const { data: challengesData, refetch: refetchChallenges } = useQuery({
    queryKey: ["challenges", eventInfo?.clubId, eventInfo?.teamId],
    enabled: !!eventInfo?.clubId,
    queryFn: () => list({ data: { clubId: eventInfo!.clubId, teamId: eventInfo!.teamId } }),
  });

  const loadCounts = useServerFn(getEventChallengesEntryCounts);
  const { data: countsData, refetch: refetchCounts } = useQuery({
    queryKey: ["event-challenge-entry-counts", eventId],
    queryFn: () => loadCounts({ data: { eventId } }),
  });

  if (loadingEvent) {
    return <FullscreenLoader />;
  }
  if (!eventInfo)
    return <div className="p-4 text-sm text-muted-foreground">{t("errors.eventNotFound")}</div>;

  const challenges = challengesData?.challenges ?? [];
  const entryCounts = countsData?.counts ?? {};

  return (
    <div className="mx-auto max-w-2xl px-4 py-4">
      <div className="mb-4 flex items-center gap-2">
        {view.kind === "list" ? (
          <Button asChild variant="ghost" size="sm">
            <Link to="/events/$eventId" params={{ eventId }}>
              <ArrowLeft className="h-4 w-4" /> {t("list.back")}
            </Link>
          </Button>
        ) : (
          <Button variant="ghost" size="sm" onClick={() => setView({ kind: "list" })}>
            <ArrowLeft className="h-4 w-4" /> {t("list.back")}
          </Button>
        )}
      </div>

      {view.kind === "list" && (
        <ChallengesList
          eventId={eventId}
          challenges={challenges}
          entryCounts={entryCounts}
          isStaff={isStaff}
          showAll={showAll}
          onToggleShowAll={() => setShowAll((s) => !s)}
          onAdd={() => setView({ kind: "add" })}
          onEntry={(id) => setView({ kind: "entry", challengeId: id })}
          onRanking={(id) => setView({ kind: "ranking", challengeId: id })}
        />
      )}
      {view.kind === "add" && (
        <AddChallenge
          clubId={eventInfo.clubId}
          teamId={eventInfo.teamId}
          sport={eventInfo.sport}
          existingChallenges={challenges}
          entryCounts={entryCounts}
          onPickExisting={(id) => setView({ kind: "entry", challengeId: id })}
          onDone={() => {
            refetchChallenges();
            setShowAll(true);
            setView({ kind: "list" });
          }}
        />
      )}

      {view.kind === "entry" && (
        <EntryScreen
          challengeId={view.challengeId}
          challenge={challenges.find((c: any) => c.id === view.challengeId)}
          eventId={eventId}
          players={eventInfo.players}
          onDone={(passageId) => {
            refetchCounts();
            setView({ kind: "ranking", challengeId: view.challengeId, passageId });
          }}
        />
      )}
      {view.kind === "ranking" && (
        <RankingScreen challengeId={view.challengeId} passageId={view.passageId} />
      )}
    </div>
  );
}

function FullscreenLoader() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );
}

function ChallengesList({
  challenges,
  entryCounts,
  isStaff,
  showAll,
  onToggleShowAll,
  onAdd,
  onEntry,
  onRanking,
}: {
  eventId: string;
  challenges: any[];
  entryCounts: Record<string, number>;
  isStaff: boolean;
  showAll: boolean;
  onToggleShowAll: () => void;
  onAdd: () => void;
  onEntry: (id: string) => void;
  onRanking: (id: string) => void;
}) {
  const { t } = useTranslation("challenges");

  const sorted = useMemo(() => {
    const base = [...challenges].sort(
      (a: any, b: any) => (entryCounts[b.id] ?? 0) - (entryCounts[a.id] ?? 0),
    );
    return groupJugglingVariants(base, (c: any) => c.template_key ?? null);
  }, [challenges, entryCounts]);

  const displayed = useMemo(() => {
    return showAll ? sorted : sorted.filter((c: any) => (entryCounts[c.id] ?? 0) > 0);
  }, [sorted, showAll, entryCounts]);

  const hasHidden = displayed.length < sorted.length;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">{t("list.title")}</h1>
        <div className="flex items-center gap-1.5">
          {hasHidden && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onToggleShowAll}
              className="h-8 px-2 text-xs"
            >
              {showAll ? t("list.active_only") : t("list.show_all")}
            </Button>
          )}
          {isStaff && (
            <Button size="sm" onClick={onAdd}>
              <Plus className="h-4 w-4" /> {t("list.add")}
            </Button>
          )}
        </div>
      </div>
      {displayed.length === 0 && (
        <Card>
          <CardContent className="p-6 text-center text-sm text-muted-foreground">
            <p>{showAll ? t("list.empty") : t("list.no_active")}</p>
            {!showAll && hasHidden && <p className="mt-1">{t("list.show_all_hint")}</p>}
            {showAll && isStaff && <p className="mt-1">{t("list.empty_hint")}</p>}
          </CardContent>
        </Card>
      )}
      {displayed.map((c: any) => {
        const hasEntries = (entryCounts[c.id] ?? 0) > 0;
        return (
          <Card key={c.id}>
            <CardContent className="flex items-center gap-3 p-4">
              <div className="text-2xl">{c.icon ?? (c.kind === "physical_test" ? "🫀" : "🎯")}</div>
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{challengeDisplayName(c, t)}</div>
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span>{t(`types.${c.kind}`)}</span>
                  <span>·</span>
                  <span>{t(`aggregates.${c.aggregate}`)}</span>
                  <VisibilityBadge visibility={c.ranking_visibility} />
                </div>
              </div>
              <div className="flex gap-1">
                <Button size="sm" variant="outline" onClick={() => onRanking(c.id)}>
                  <Trophy className="h-4 w-4" />
                </Button>
                {isStaff && (
                  <Button
                    size="sm"
                    variant={hasEntries ? "outline" : "default"}
                    onClick={() => onEntry(c.id)}
                  >
                    {hasEntries ? t("list.edit") : t("entry.title")}
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function VisibilityBadge({ visibility }: { visibility: "staff" | "category" }) {
  const { t } = useTranslation("challenges");
  const Icon = visibility === "staff" ? Lock : Eye;
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5">
      <Icon className="h-3 w-3" />
      {t(`visibility.${visibility}_short`)}
    </span>
  );
}

function AddChallenge({
  clubId,
  teamId,
  sport,
  existingChallenges,
  entryCounts,
  onPickExisting,
  onDone,
}: {
  clubId: string;
  teamId: string;
  sport: string | null;
  existingChallenges: any[];
  entryCounts: Record<string, number>;
  onPickExisting: (challengeId: string) => void;
  onDone: () => void;
}) {
  const { t } = useTranslation("challenges");
  const fromTpl = useServerFn(createChallengeFromTemplate);
  const [selected, setSelected] = useState<string | null>(null);
  const [name, setName] = useState("");

  // Existing team challenges that have NO entries on this session yet — the
  // coach can reuse them (crossbar, juggling, etc.) instead of re-creating.
  const reusable = useMemo(() => {
    return (existingChallenges ?? []).filter((c) => (entryCounts[c.id] ?? 0) === 0);
  }, [existingChallenges, entryCounts]);

  // Full sport catalogue: every template for the sport, minus the ones already
  // materialized as a team challenge (those are shown as "existing" cards).
  const templates = useMemo(() => {
    const usedKeys = new Set(
      (existingChallenges ?? []).map((c) => c?.template_key).filter((k): k is string => !!k),
    );
    return getTemplatesForSport(sport).filter((tpl) => !usedKeys.has(tpl.key));
  }, [sport, existingChallenges]);

  // Challenges already used on this event: kept visible (greyed) so the coach
  // always sees the full catalogue, and can jump back to the entry screen.
  const alreadyInSession = useMemo(() => {
    return (existingChallenges ?? []).filter((c) => (entryCounts[c.id] ?? 0) > 0);
  }, [existingChallenges, entryCounts]);

  const create = useMutation({
    mutationFn: (tplKey: string) =>
      fromTpl({
        data: {
          club_id: clubId,
          team_id: teamId,
          template_key: tplKey,
          name: name.trim() || t(`templates.${tplKey}.name`),
        },
      }),
    onSuccess: () => {
      toast.success(t("add.create"));
      onDone();
    },
    onError: (e: any) => toast.error(e?.message ?? t("errors.generic")),
  });

  // Unified list: reusable existing challenges first (marked "Populaire"),
  // then the full sport catalogue, then the ones already used on this event
  // (greyed out, non-selectable, but always visible).
  type Item =
    | {
        kind: "existing";
        id: string;
        templateKey: string | null;
        name: string;
        icon: string;
        typeLabel: string;
        popular: true;
      }
    | {
        kind: "template";
        key: string;
        name: string;
        icon: string;
        description: string;
        typeLabel: string;
        popular: boolean;
      }
    | {
        kind: "used";
        id: string;
        templateKey: string | null;
        name: string;
        icon: string;
        typeLabel: string;
      };

  const items: Item[] = useMemo(() => {
    const existing: Item[] = reusable.map((c) => ({
      kind: "existing" as const,
      id: c.id,
      templateKey: c.template_key ?? null,
      name: challengeDisplayName(c, t),
      icon: c.icon ?? (c.kind === "physical_test" ? "🫀" : "🎯"),
      typeLabel: t(`types.${c.kind}`),
      popular: true,
    }));
    const tpls: Item[] = templates.map((tpl) => ({
      kind: "template" as const,
      key: tpl.key,
      name: t(`templates.${tpl.key}.name`),
      icon: tpl.icon,
      description: t(`templates.${tpl.key}.description`),
      typeLabel: t(`types.${tpl.kind}`),
      popular: false,
    }));
    const used: Item[] = alreadyInSession.map((c) => ({
      kind: "used" as const,
      id: c.id,
      templateKey: c.template_key ?? null,
      name: challengeDisplayName(c, t),
      icon: c.icon ?? (c.kind === "physical_test" ? "🫀" : "🎯"),
      typeLabel: t(`types.${c.kind}`),
    }));
    const selectable = groupJugglingVariants<Item>([...existing, ...tpls], (it) =>
      it.kind === "existing" ? it.templateKey : it.kind === "template" ? it.key : null,
    );
    return [...selectable, ...used];
  }, [reusable, templates, alreadyInSession, t]);

  const selectedTemplateName = selected ? t(`templates.${selected}.name`) : "";

  return (
    <div className="space-y-3">
      <h1 className="text-xl font-semibold">{t("add.title")}</h1>

      <div className="space-y-2">
        {items.length === 0 && (
          <Card>
            <CardContent className="p-6 text-center text-sm text-muted-foreground">
              {t("add.all_added")}
            </CardContent>
          </Card>
        )}
        {items.map((it) => {
          const key =
            it.kind === "template" ? `t-${it.key}` : `${it.kind === "used" ? "u" : "e"}-${it.id}`;
          const isSelected = it.kind === "template" && selected === it.key;
          const isUsed = it.kind === "used";
          return (
            <Card
              key={key}
              className={
                "cursor-pointer transition " +
                (isUsed
                  ? "opacity-60"
                  : isSelected
                    ? "border-primary ring-2 ring-primary/40"
                    : "hover:border-muted-foreground/40")
              }
              onClick={() => {
                if (it.kind === "existing" || it.kind === "used") {
                  onPickExisting(it.id);
                } else {
                  setSelected(it.key);
                  setName(it.name);
                }
              }}
            >
              <CardContent className="flex items-center gap-3 p-4">
                <div className="text-2xl">{it.icon}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="font-medium">{it.name}</div>
                    {it.kind === "existing" && it.popular && (
                      <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
                        {t("add.popular")}
                      </span>
                    )}
                    {isUsed && (
                      <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        {t("add.already_in_session")}
                      </span>
                    )}
                    {isSelected && (
                      <span className="inline-flex items-center rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary-foreground">
                        {t("add.selected")}
                      </span>
                    )}
                  </div>
                  {it.kind === "template" && (
                    <div className="text-xs text-muted-foreground">{it.description}</div>
                  )}
                </div>
                <span className="text-[10px] uppercase text-muted-foreground shrink-0">
                  {it.typeLabel}
                </span>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Spacer so the sticky action bar never hides the last card. */}
      {selected && <div className="h-44" aria-hidden />}

      {selected && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 backdrop-blur">
          <div className="mx-auto max-w-2xl space-y-2 px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+5rem)]">
            <div className="flex items-center justify-between gap-2">
              <label className="text-sm font-medium truncate">
                {t("add.custom_name_label")}
                {selectedTemplateName ? ` · ${selectedTemplateName}` : ""}
              </label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSelected(null);
                  setName("");
                }}
              >
                {t("add.cancel")}
              </Button>
            </div>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
            <Button
              className="w-full"
              disabled={create.isPending || !name.trim()}
              onClick={() => create.mutate(selected)}
            >
              {create.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> {t("add.creating")}
                </>
              ) : (
                t("add.create")
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function EntryScreen({
  challengeId,
  challenge,
  eventId,
  players,
  onDone,
}: {
  challengeId: string;
  challenge: any;
  eventId: string;
  players: { id: string; first_name: string; last_name: string; photo_url?: string | null }[];
  onDone: (passageId?: string) => void;
}) {
  const { t } = useTranslation("challenges");
  const getPassage = useServerFn(getOrCreatePassageForEvent);
  const upsert = useServerFn(upsertResults);
  const loadResults = useServerFn(getPassageResults);
  const loadBests = useServerFn(getChallengePlayerBests);

  const qc = useQueryClient();

  const { data: passageData, isLoading } = useQuery({
    queryKey: ["challenge-passage", challengeId, eventId],
    queryFn: () => getPassage({ data: { challengeId, eventId } }),
  });
  const passage = passageData?.passage;

  const { data: existingData, isLoading: loadingExisting } = useQuery({
    queryKey: ["challenge-passage-results", passage?.id],
    enabled: !!passage?.id,
    queryFn: () => loadResults({ data: { passageId: passage!.id } }),
    staleTime: 0,
    refetchOnMount: "always",
  });

  const { data: bestsData } = useQuery({
    queryKey: ["challenge-player-bests", challengeId, passage?.id],
    enabled: !!passage?.id && challenge?.aggregate === "record",
    queryFn: () =>
      loadBests({
        data: { challengeId },
      }),
    staleTime: 0,
    refetchOnMount: "always",
  });

  const [values, setValues] = useState<Record<string, number | "">>({});
  const [hydrated, setHydrated] = useState(false);
  const dirtyRef = useRef(false);

  const edit = (updater: (s: Record<string, number | "">) => Record<string, number | "">) => {
    dirtyRef.current = true;
    setValues(updater);
  };

  // Pre-fill saved values whenever fresh results arrive (and reset when the
  // passage changes), unless the user already started editing.
  useEffect(() => {
    dirtyRef.current = false;
    setHydrated(false);
  }, [passage?.id]);

  useEffect(() => {
    if (!passage?.id || !existingData?.results || dirtyRef.current) return;

    const seed: Record<string, number | ""> = {};
    for (const r of existingData.results) seed[r.player_id] = Number(r.value);
    setValues(seed);
    setHydrated(true);
  }, [existingData, passage?.id]);

  const done = useMemo(
    () => Object.values(values).filter((v) => v !== "" && v != null).length,
    [values],
  );

  const save = useMutation({
    mutationFn: async () => {
      if (!passage) throw new Error("no-passage");
      const entries = Object.entries(values)
        .filter(([, v]) => v !== "" && v != null)
        .map(([player_id, v]) => ({ player_id, value: Number(v) }));
      if (entries.length === 0) throw new Error("empty");
      return upsert({ data: { passageId: passage.id, entries } });
    },
    onSuccess: () => {
      dirtyRef.current = false;
      toast.success(t("entry.saved"));
      qc.invalidateQueries({ queryKey: ["challenge-passage-results", passage?.id] });
      qc.invalidateQueries({ queryKey: ["challenge-player-bests", challengeId] });
      qc.invalidateQueries({ queryKey: ["challenge-ranking", challengeId] });
      qc.invalidateQueries({ queryKey: ["event-challenge-entry-counts", eventId] });
      qc.invalidateQueries({ queryKey: ["player-challenge-stats"] });
      onDone(passage?.id);
    },
    onError: (e: any) => toast.error(e?.message ?? t("errors.generic")),
  });

  if (isLoading || loadingExisting || !challenge || !passage || !existingData)
    return <FullscreenLoader />;
  if (!hydrated) return <FullscreenLoader />;

  if (players.length === 0) {
    return <div className="text-center text-sm text-muted-foreground">{t("entry.no_players")}</div>;
  }

  const isStepper =
    challenge.unit === "count" || challenge.unit === "stage" || challenge.unit === "score";
  const stepSize =
    challenge.unit === "distance_meters" ? 10 : challenge.unit === "time_seconds" ? 0.1 : 1;
  const decimals = challenge.unit === "time_seconds" ? 2 : 0;
  const bump = (id: string, delta: number) =>
    edit((s) => {
      const cur = typeof s[id] === "number" ? (s[id] as number) : 0;
      const next = Math.max(0, Number((cur + delta).toFixed(decimals)));
      return { ...s, [id]: next };
    });

  return (
    <div className="space-y-3">
      <div>
        <h1 className="text-xl font-semibold">
          {challenge.icon} {challenge.name}
        </h1>
        <p className="text-xs text-muted-foreground">
          {t("entry.counter", { present: players.length, done })}
        </p>
      </div>
      <div className="space-y-2">
        {players.map((p) => {
          const current = values[p.id];
          const prevBest = bestsData?.bests?.[p.id];
          const isRecordChallenge = challenge.aggregate === "record";
          const higher = challenge.direction === "higher_better";
          const hasNumericValue =
            typeof current === "number" && !Number.isNaN(current) && current !== 0;
          const beatsPrev =
            isRecordChallenge &&
            hasNumericValue &&
            (prevBest == null
              ? hasNumericValue
              : higher
                ? (current as number) > prevBest
                : (current as number) < prevBest);
          return (
            <Card key={p.id}>
              <CardContent className="flex flex-wrap items-center gap-3 p-3">
                <div className="min-w-0 flex-1 truncate text-sm font-medium">
                  {p.first_name} {p.last_name}
                </div>
                {isStepper ? (
                  <ScoreStepper
                    value={typeof values[p.id] === "number" ? (values[p.id] as number) : 0}
                    onChange={(n) => edit((s) => ({ ...s, [p.id]: n }))}
                    size="sm"
                  />
                ) : (
                  <div className="inline-flex items-center gap-1">
                    <Button
                      type="button"
                      size="icon"
                      variant="outline"
                      className="h-8 w-8 shrink-0"
                      onClick={() => bump(p.id, -stepSize)}
                      aria-label="−"
                    >
                      <Minus className="h-4 w-4" />
                    </Button>
                    <Input
                      type="number"
                      inputMode="decimal"
                      step={stepSize}
                      className="w-20 text-center"
                      placeholder={t("entry.value_placeholder")}
                      value={values[p.id] ?? ""}
                      onChange={(e) =>
                        edit((s) => ({
                          ...s,
                          [p.id]: e.target.value === "" ? "" : Number(e.target.value),
                        }))
                      }
                    />
                    <Button
                      type="button"
                      size="icon"
                      variant="outline"
                      className="h-8 w-8 shrink-0"
                      onClick={() => bump(p.id, stepSize)}
                      aria-label="+"
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                )}
                {beatsPrev && (
                  <div className="w-full">
                    <NewRecordBadge value={current as number} />
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
      <Button
        className="w-full"
        disabled={save.isPending || done === 0}
        onClick={() => save.mutate()}
      >
        {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : t("entry.save")}
      </Button>
    </div>
  );
}

function RankingScreen({ challengeId, passageId }: { challengeId: string; passageId?: string }) {
  const { t } = useTranslation("challenges");
  const rank = useServerFn(getChallengeRanking);
  const toggleVis = useServerFn(updateChallengeVisibility);
  const qc = useQueryClient();
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["challenge-ranking", challengeId, passageId],
    queryFn: () => rank({ data: { challengeId, highlightPassageId: passageId } }),
  });

  const flip = useMutation({
    mutationFn: () =>
      toggleVis({
        data: {
          challengeId,
          ranking_visibility:
            data?.challenge?.ranking_visibility === "category" ? "staff" : "category",
        },
      }),
    onSuccess: () => {
      refetch();
      qc.invalidateQueries({ queryKey: ["challenges"] });
    },
    onError: (e: any) => toast.error(e?.message ?? t("errors.generic")),
  });

  if (isLoading || !data) return <FullscreenLoader />;
  const ch = data.challenge;
  const ranking = data.ranking;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">
            {ch.icon} {ch.name}
          </h1>
          <p className="text-xs text-muted-foreground">
            {t(`aggregates.${ch.aggregate}`)} · {t(`types.${ch.kind}`)}
          </p>
        </div>
        {data.isStaff && ch.kind === "challenge" && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => flip.mutate()}
            disabled={flip.isPending}
          >
            {ch.ranking_visibility === "category" ? (
              <>
                <Lock className="h-4 w-4" /> {t("visibility.staff_short")}
              </>
            ) : (
              <>
                <Users className="h-4 w-4" /> {t("visibility.category_short")}
              </>
            )}
          </Button>
        )}
      </div>
      {ranking.length === 0 && (
        <Card>
          <CardContent className="p-6 text-center text-sm text-muted-foreground">
            {t("ranking.no_results")}
          </CardContent>
        </Card>
      )}
      <div className="space-y-2">
        {ranking.map((row: any, i: number) => (
          <Card key={row.player_id} className={i === 0 ? "border-primary" : ""}>
            <CardContent className="flex items-center gap-3 p-3">
              <div className="w-8 text-center text-sm font-bold text-muted-foreground">
                {t("ranking.position", { n: i + 1 })}
              </div>
              <div className="min-w-0 flex-1 truncate text-sm font-medium">
                {row.player
                  ? `${row.player.first_name ?? ""} ${row.player.last_name ?? ""}`
                  : row.player_id.slice(0, 6)}
              </div>
              {row.is_new_record && ch.aggregate === "record" && (
                <NewRecordBadge value={row.score} />
              )}
              <div className="text-right">
                <div className="font-mono text-base font-bold">{row.score}</div>
                <div className="text-[10px] text-muted-foreground">
                  {row.count === 1
                    ? t("ranking.attempts_one", { count: row.count })
                    : t("ranking.attempts_other", { count: row.count })}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
