import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { ArrowLeft, Loader2, Plus, Trophy, Users, Lock, Eye } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScoreStepper } from "@/components/score-stepper";
import { CHALLENGE_TEMPLATES } from "@/lib/challenges/templates";
import {
  listChallenges,
  createChallengeFromTemplate,
  getOrCreatePassageForEvent,
  upsertResults,
  getChallengeRanking,
  updateChallengeVisibility,
  getPassageResults,
  getEventChallengesEntryCounts,
} from "@/lib/challenges/challenges.functions";
import i18n from "@/lib/i18n";

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
  const { user } = useAuth();
  const [view, setView] = useState<
    | { kind: "list" }
    | { kind: "add" }
    | { kind: "entry"; challengeId: string }
    | { kind: "ranking"; challengeId: string }
  >({ kind: "list" });

  // Event → team → club, plus team players.
  const { data: eventInfo, isLoading: loadingEvent } = useQuery({
    queryKey: ["event-team", eventId],
    queryFn: async () => {
      const { data: ev } = await supabase
        .from("events")
        .select("id, team_id, title, teams:team_id (id, name, club_id)")
        .eq("id", eventId)
        .single();
      if (!ev) return null;
      const teamId = ev.team_id as string;
      const clubId = (ev.teams as any)?.club_id as string;
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
      return { event: ev, teamId, clubId, players };
    },
  });

  const list = useServerFn(listChallenges);
  const { data: challengesData, refetch: refetchChallenges } = useQuery({
    queryKey: ["challenges", eventInfo?.clubId, eventInfo?.teamId],
    enabled: !!eventInfo?.clubId,
    queryFn: () =>
      list({ data: { clubId: eventInfo!.clubId, teamId: eventInfo!.teamId } }),
  });

  const loadCounts = useServerFn(getEventChallengesEntryCounts);
  const { data: countsData, refetch: refetchCounts } = useQuery({
    queryKey: ["event-challenge-entry-counts", eventId],
    queryFn: () => loadCounts({ data: { eventId } }),
  });

  if (loadingEvent) {
    return <FullscreenLoader />;
  }
  if (!eventInfo) return <div className="p-4 text-sm text-muted-foreground">Event not found.</div>;

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
          onAdd={() => setView({ kind: "add" })}
          onEntry={(id) => setView({ kind: "entry", challengeId: id })}
          onRanking={(id) => setView({ kind: "ranking", challengeId: id })}
        />
      )}
      {view.kind === "add" && (
        <AddChallenge
          clubId={eventInfo.clubId}
          teamId={eventInfo.teamId}
          onDone={() => {
            refetchChallenges();
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
          onDone={() => {
            refetchCounts();
            setView({ kind: "ranking", challengeId: view.challengeId });
          }}
        />
      )}
      {view.kind === "ranking" && (
        <RankingScreen challengeId={view.challengeId} />
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
  onAdd,
  onEntry,
  onRanking,
}: {
  eventId: string;
  challenges: any[];
  entryCounts: Record<string, number>;
  onAdd: () => void;
  onEntry: (id: string) => void;
  onRanking: (id: string) => void;
}) {
  const { t } = useTranslation("challenges");
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">{t("list.title")}</h1>
        <Button size="sm" onClick={onAdd}>
          <Plus className="h-4 w-4" /> {t("list.add")}
        </Button>
      </div>
      {challenges.length === 0 && (
        <Card>
          <CardContent className="p-6 text-center text-sm text-muted-foreground">
            <p>{t("list.empty")}</p>
            <p className="mt-1">{t("list.empty_hint")}</p>
          </CardContent>
        </Card>
      )}
      {challenges.map((c) => {
        const hasEntries = (entryCounts[c.id] ?? 0) > 0;
        return (
        <Card key={c.id}>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="text-2xl">{c.icon ?? (c.kind === "physical_test" ? "🫀" : "🎯")}</div>
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium">{c.name}</div>
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
              <Button
                size="sm"
                variant={hasEntries ? "outline" : "default"}
                onClick={() => onEntry(c.id)}
              >
                {hasEntries ? t("list.edit") : t("entry.title")}
              </Button>
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
  onDone,
}: {
  clubId: string;
  teamId: string;
  onDone: () => void;
}) {
  const { t } = useTranslation("challenges");
  const fromTpl = useServerFn(createChallengeFromTemplate);
  const [selected, setSelected] = useState<string | null>(null);
  const [name, setName] = useState("");

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

  return (
    <div className="space-y-3">
      <h1 className="text-xl font-semibold">{t("add.title")}</h1>
      <div className="space-y-2">
        <p className="text-sm font-medium">{t("add.pick_template")}</p>
        {CHALLENGE_TEMPLATES.map((tpl) => (
          <Card
            key={tpl.key}
            className={
              "cursor-pointer transition " +
              (selected === tpl.key ? "border-primary" : "hover:border-muted-foreground/40")
            }
            onClick={() => {
              setSelected(tpl.key);
              setName(t(`templates.${tpl.key}.name`));
            }}
          >
            <CardContent className="flex items-center gap-3 p-4">
              <div className="text-2xl">{tpl.icon}</div>
              <div className="flex-1">
                <div className="font-medium">{t(`templates.${tpl.key}.name`)}</div>
                <div className="text-xs text-muted-foreground">
                  {t(`templates.${tpl.key}.description`)}
                </div>
              </div>
              <span className="text-[10px] uppercase text-muted-foreground">
                {t(`types.${tpl.kind}`)}
              </span>
            </CardContent>
          </Card>
        ))}
      </div>
      {selected && (
        <div className="space-y-2">
          <label className="text-sm font-medium">{t("add.custom_name_label")}</label>
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
  onDone: () => void;
}) {
  const { t } = useTranslation("challenges");
  const getPassage = useServerFn(getOrCreatePassageForEvent);
  const upsert = useServerFn(upsertResults);
  const loadResults = useServerFn(getPassageResults);

  const { data: passageData, isLoading } = useQuery({
    queryKey: ["challenge-passage", challengeId, eventId],
    queryFn: () => getPassage({ data: { challengeId, eventId } }),
  });
  const passage = passageData?.passage;

  const { data: existingData, isLoading: loadingExisting } = useQuery({
    queryKey: ["challenge-passage-results", passage?.id],
    enabled: !!passage?.id,
    queryFn: () => loadResults({ data: { passageId: passage!.id } }),
  });

  const [values, setValues] = useState<Record<string, number | "">>({});
  const [hydratedPassageId, setHydratedPassageId] = useState<string | null>(null);

  // Pre-fill saved values once existing results arrive, and reset correctly
  // when switching to another challenge/passage.
  useEffect(() => {
    if (!passage?.id || hydratedPassageId === passage.id || !existingData?.results) return;

    const seed: Record<string, number | ""> = {};
    for (const r of existingData.results) seed[r.player_id] = Number(r.value);
    setValues(seed);
    setHydratedPassageId(passage.id);
  }, [existingData?.results, hydratedPassageId, passage?.id]);

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
      toast.success(t("entry.saved"));
      onDone();
    },
    onError: (e: any) => toast.error(e?.message ?? t("errors.generic")),
  });

  if (isLoading || loadingExisting || !challenge) return <FullscreenLoader />;

  if (players.length === 0) {
    return (
      <div className="text-center text-sm text-muted-foreground">{t("entry.no_players")}</div>
    );
  }

  const isStepper = challenge.unit === "count" || challenge.unit === "stage";

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
        {players.map((p) => (
          <Card key={p.id}>
            <CardContent className="flex items-center gap-3 p-3">
              <div className="min-w-0 flex-1 truncate text-sm font-medium">
                {p.first_name} {p.last_name}
              </div>
              {isStepper ? (
                <ScoreStepper
                  value={typeof values[p.id] === "number" ? (values[p.id] as number) : 0}
                  onChange={(n) => setValues((s) => ({ ...s, [p.id]: n }))}
                  size="sm"
                />
              ) : (
                <Input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  className="w-24 text-right"
                  placeholder={t("entry.value_placeholder")}
                  value={values[p.id] ?? ""}
                  onChange={(e) =>
                    setValues((s) => ({
                      ...s,
                      [p.id]: e.target.value === "" ? "" : Number(e.target.value),
                    }))
                  }
                />
              )}
            </CardContent>
          </Card>
        ))}
      </div>
      <Button className="w-full" disabled={save.isPending || done === 0} onClick={() => save.mutate()}>
        {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : t("entry.save")}
      </Button>
    </div>
  );
}

function RankingScreen({ challengeId }: { challengeId: string }) {
  const { t } = useTranslation("challenges");
  const rank = useServerFn(getChallengeRanking);
  const toggleVis = useServerFn(updateChallengeVisibility);
  const qc = useQueryClient();
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["challenge-ranking", challengeId],
    queryFn: () => rank({ data: { challengeId } }),
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
          <Button size="sm" variant="outline" onClick={() => flip.mutate()} disabled={flip.isPending}>
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
