import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ResponsiveFormDialog } from "@/components/responsive-form-dialog";
import {
  Collapsible,
  CollapsibleContent,
} from "@/components/ui/collapsible";
import {
  Loader2,
  Check,
  MapPin,
  Clock,
  ShieldCheck,
  AlertTriangle,
  Plus,
  Trash2,
  Flag,
  Zap,
  MoreVertical,
  Pencil,
  Eye,
  CalendarClock,
  Gavel,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScoreStepper } from "@/components/score-stepper";

import { toast } from "sonner";
import {
  recordMatchScore,
  updateMatchSchedule,
  validateMatch,
  setMatchDispute,
  setMatchStatus,
  recordMatchEvent,
  deleteMatchEvent,
  listMatchEvents,
  listTournamentReferees,
  assignMatchReferee,
} from "../tournaments.functions";

import type { ScoringRules, SetScore } from "../lib/formats";
import { aggregateSetsScore, formatSets, DEFAULT_SETS_RULES } from "../lib/formats";

interface Team {
  id: string;
  name: string;
  short_name: string | null;
  logo_url: string | null;
}
interface Match {
  id: string;
  round: string;
  group_id: string | null;
  match_number: number | null;
  team_a_id: string | null;
  team_b_id: string | null;
  score_a: number | null;
  score_b: number | null;
  penalty_score_a?: number | null;
  penalty_score_b?: number | null;
  sets?: SetScore[] | null;
  status: string;
  scheduled_at: string | null;
  field?: string | null;
  validated_at?: string | null;
  dispute_flag?: boolean | null;
  referee_user_id?: string | null;
  referee_name?: string | null;
}

interface MatchEvent {
  id: string;
  match_id: string;
  team_id: string | null;
  kind: string;
  player_name: string | null;
  minute: number | null;
}
interface RefereeOption {
  member_id: string;
  user_id: string | null;
  label: string;
  offline: boolean;
}

interface Props {
  tournamentId: string;
  matches: Match[];
  teams: Team[];
  canManage?: boolean;
  fields?: string[];
  scoring?: ScoringRules;
  /** When provided, auto-opens the score-entry dialog for that match
   *  (Sprint 1: lets the Continue CTA jump straight into score entry). */
  autoOpenMatchId?: string | null;
  /** Called after the auto-open has been consumed, so the parent can reset its state. */
  onAutoOpenConsumed?: () => void;
}

export function MatchesList({ tournamentId, matches, teams, canManage, fields, scoring, autoOpenMatchId, onAutoOpenConsumed }: Props) {
  const { t } = useTranslation("tournaments");
  const { user } = useAuth();
  const currentUserId = user?.id ?? null;
  const teamMap = new Map(teams.map((t) => [t.id, t]));

  const listFn = useServerFn(listMatchEvents);
  const eventsQ = useQuery({
    queryKey: ["tournament-events", tournamentId],
    queryFn: () => listFn({ data: { tournament_id: tournamentId } }),
  });
  const eventsByMatch = new Map<string, MatchEvent[]>();
  for (const ev of (eventsQ.data?.events ?? []) as MatchEvent[]) {
    if (!eventsByMatch.has(ev.match_id)) eventsByMatch.set(ev.match_id, []);
    eventsByMatch.get(ev.match_id)!.push(ev);
  }

  // Referees (tournament_members with role=referee) — populates per-match assignment menu.
  const refFn = useServerFn(listTournamentReferees);
  const refereesQ = useQuery({
    queryKey: ["tournament-referees", tournamentId],
    queryFn: () => refFn({ data: { tournament_id: tournamentId } }),
    enabled: !!canManage,
  });
  const refereeOptions: RefereeOption[] = ((refereesQ.data?.referees ?? []) as any[]).map(
    (r) => ({
      member_id: r.id as string,
      user_id: (r.user_id as string | null) ?? null,
      label: r.label as string,
      offline: !!r.offline,
    }),
  );

  // "My matches" filter — visible when current user is referee on at least one match.
  const assignedToMe = useMemo(
    () =>
      currentUserId
        ? matches.filter((m) => m.referee_user_id === currentUserId).length
        : 0,
    [matches, currentUserId],
  );
  const [onlyMine, setOnlyMine] = useState(false);
  const showFilter = assignedToMe > 0;
  const visibleMatches =
    showFilter && onlyMine
      ? matches.filter((m) => m.referee_user_id === currentUserId)
      : matches;

  const grouped = visibleMatches.reduce<Record<string, Match[]>>((acc, m) => {
    const key = m.round === "group" ? t("matches.groupPhase") : roundLabel(m.round, t);
    (acc[key] ??= []).push(m);
    return acc;
  }, {});

  return (
    <div className="space-y-5">
      {showFilter && (
        <div className="flex items-center gap-2 px-1">
          <Button
            type="button"
            size="sm"
            variant={onlyMine ? "default" : "outline"}
            onClick={() => setOnlyMine((v) => !v)}
            className="h-8 text-xs gap-1.5"
          >
            <Gavel className="h-3.5 w-3.5" />
            {onlyMine
              ? t("matches.allMatches", { defaultValue: "Tous les matchs" })
              : t("matches.myMatches", { defaultValue: "Mes matchs" })}
            <span className="ml-1 rounded-full bg-background/30 px-1.5 text-[10px] font-semibold tabular-nums">
              {assignedToMe}
            </span>
          </Button>
        </div>
      )}
      {Object.entries(grouped).map(([round, ms]) => (
        <section key={round} className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground px-1">
            {round}
          </h3>
          <ul className="space-y-2">
            {ms.map((m) => (
              <MatchCard
                key={m.id}
                match={m}
                tournamentId={tournamentId}
                teamA={m.team_a_id ? teamMap.get(m.team_a_id) : undefined}
                teamB={m.team_b_id ? teamMap.get(m.team_b_id) : undefined}
                canManage={!!canManage}
                fields={fields ?? []}
                events={eventsByMatch.get(m.id) ?? []}
                scoring={scoring}
                refereeOptions={refereeOptions}
                autoOpen={autoOpenMatchId === m.id}
                onAutoOpenConsumed={onAutoOpenConsumed}
              />
            ))}
          </ul>
        </section>
      ))}
      {visibleMatches.length === 0 && (
        <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          {t("matches.empty")}
        </div>
      )}
    </div>
  );
}

function roundLabel(r: string, t: (k: string) => string) {
  const keys: Record<string, string> = {
    r32: "matches.rounds.r32",
    r16: "matches.rounds.r16",
    qf: "matches.rounds.qf",
    sf: "matches.rounds.sf",
    final: "matches.rounds.final",
    third_place: "matches.rounds.third_place",
  };
  return keys[r] ? t(keys[r]) : r;
}

const EVENT_KIND_VALUES = [
  { value: "goal", emoji: "⚽" },
  { value: "own_goal", emoji: "🥅" },
  { value: "assist", emoji: "🅰️" },
  { value: "yellow_card", emoji: "🟨" },
  { value: "second_yellow", emoji: "🟨🟨" },
  { value: "red_card", emoji: "🟥" },
  { value: "penalty", emoji: "🎯" },
  { value: "foul", emoji: "⚠️" },
] as const;

function eventMeta(kind: string, t: (k: string) => string) {
  const found = EVENT_KIND_VALUES.find((k) => k.value === kind);
  return found
    ? { emoji: found.emoji, label: t(`matches.events.${found.value}`) }
    : { emoji: "•", label: kind };
}

function MatchCard({
  match,
  tournamentId,
  teamA,
  teamB,
  canManage,
  fields,
  events,
  scoring,
  refereeOptions,
}: {
  match: Match;
  tournamentId: string;
  teamA?: Team;
  teamB?: Team;
  canManage: boolean;
  fields: string[];
  events: MatchEvent[];
  scoring?: ScoringRules;
  refereeOptions: RefereeOption[];
}) {
  const { t } = useTranslation("tournaments");
  const setsMode = scoring?.mode === "sets";
  const setsRules = scoring?.sets ?? DEFAULT_SETS_RULES;
  const [open, setOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [a, setA] = useState(match.score_a ?? 0);
  const [b, setB] = useState(match.score_b ?? 0);
  const [penA, setPenA] = useState(match.penalty_score_a ?? 0);
  const [penB, setPenB] = useState(match.penalty_score_b ?? 0);
  const [sets, setSets] = useState<SetScore[]>(
    (match.sets ?? []).map((s) => ({ a: s.a, b: s.b })),
  );
  const isKnockout = match.round !== "group";
  const tied = a === b;
  const hasPenalty = (match.penalty_score_a ?? null) !== null && (match.penalty_score_b ?? null) !== null;

  const fn = useServerFn(recordMatchScore);
  const schedFn = useServerFn(updateMatchSchedule);
  const valFn = useServerFn(validateMatch);
  const dispFn = useServerFn(setMatchDispute);
  const evFn = useServerFn(recordMatchEvent);
  const evDelFn = useServerFn(deleteMatchEvent);
  const qc = useQueryClient();

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ["tournament", tournamentId] });
    qc.invalidateQueries({ queryKey: ["tournament-events", tournamentId] });
  };

  const save = useMutation({
    mutationFn: async () => {
      if (setsMode && sets.length > 0) {
        const agg = aggregateSetsScore(sets);
        const result = await fn({
          data: {
            tournament_id: tournamentId,
            match_id: match.id,
            score_a: agg.score_a,
            score_b: agg.score_b,
            sets,
            status: "completed",
          },
        });
        await valFn({
          data: { tournament_id: tournamentId, match_id: match.id, validated: true },
        });
        return result;
      }
      const result = await fn({
        data: {
          tournament_id: tournamentId,
          match_id: match.id,
          score_a: a,
          score_b: b,
          penalty_score_a: isKnockout && a === b ? penA : null,
          penalty_score_b: isKnockout && a === b ? penB : null,
          sets: null,
          status: "completed",
        },
      });
      await valFn({
        data: { tournament_id: tournamentId, match_id: match.id, validated: true },
      });
      return result;
    },

    onSuccess: () => {
      toast.success(t("matches.scoreSavedValidated"));
      invalidateAll();
      setOpen(false);
    },
    onError: (e: any) => toast.error(e?.message ?? t("matches.errorGeneric")),
  });

  // Quick inline live score update (no dialog, keeps status "live")
  const liveUpdate = useMutation({
    mutationFn: (next: { score_a: number; score_b: number }) =>
      fn({
        data: {
          tournament_id: tournamentId,
          match_id: match.id,
          score_a: next.score_a,
          score_b: next.score_b,
          sets: null,
          status: "live",
        },
      }),
    onSuccess: () => invalidateAll(),
    onError: (e: any) => toast.error(e?.message ?? t("matches.errorGeneric")),
  });


  const validateM = useMutation({
    mutationFn: (validated: boolean) =>
      valFn({
        data: { tournament_id: tournamentId, match_id: match.id, validated },
      }),
    onSuccess: () => {
      toast.success(t("matches.statusUpdated"));
      invalidateAll();
    },
    onError: (e: any) => toast.error(e?.message ?? t("matches.errorGeneric")),
  });

  const disputeM = useMutation({
    mutationFn: (dispute: boolean) =>
      dispFn({
        data: { tournament_id: tournamentId, match_id: match.id, dispute },
      }),
    onSuccess: () => {
      toast.success(t("matches.statusUpdated"));
      invalidateAll();
    },
  });

  const statusFn = useServerFn(setMatchStatus);
  const statusM = useMutation({
    mutationFn: (status: string) =>
      statusFn({
        data: { tournament_id: tournamentId, match_id: match.id, status: status as any },
      }),
    onSuccess: () => {
      toast.success(t("matches.matchStatusUpdated"));
      invalidateAll();
    },
    onError: (e: any) => toast.error(e?.message ?? t("matches.errorGeneric")),
  });

  const initialDate = match.scheduled_at ? new Date(match.scheduled_at) : null;
  const pad = (n: number) => String(n).padStart(2, "0");
  const [editField, setEditField] = useState<string>(match.field ?? "");
  const [editDate, setEditDate] = useState<string>(
    initialDate
      ? `${initialDate.getFullYear()}-${pad(initialDate.getMonth() + 1)}-${pad(initialDate.getDate())}`
      : "",
  );
  const [editTime, setEditTime] = useState<string>(
    initialDate ? `${pad(initialDate.getHours())}:${pad(initialDate.getMinutes())}` : "",
  );

  const saveSched = useMutation({
    mutationFn: () => {
      let scheduled_at: string | null = null;
      if (editDate && editTime) {
        scheduled_at = new Date(`${editDate}T${editTime}:00`).toISOString();
      }
      return schedFn({
        data: {
          tournament_id: tournamentId,
          match_id: match.id,
          field: editField ? editField : null,
          scheduled_at,
        },
      });
    },
    onSuccess: () => {
      toast.success(t("matches.matchUpdated"));
      invalidateAll();
      setEditOpen(false);
    },
    onError: (e: any) => toast.error(e?.message ?? t("matches.errorGeneric")),
  });

  // Referee assignment
  const refFn = useServerFn(assignMatchReferee);
  const initialRefValue = match.referee_user_id
    ? `user:${match.referee_user_id}`
    : match.referee_name
      ? "free"
      : "__none__";
  const [refMode, setRefMode] = useState<string>(initialRefValue);
  const [refFreeName, setRefFreeName] = useState<string>(match.referee_name ?? "");
  const saveRef = useMutation({
    mutationFn: () => {
      let payload: { referee_user_id: string | null; referee_name: string | null };
      if (refMode === "__none__") {
        payload = { referee_user_id: null, referee_name: null };
      } else if (refMode === "free") {
        payload = { referee_user_id: null, referee_name: refFreeName.trim() || null };
      } else {
        payload = { referee_user_id: refMode.replace(/^user:/, ""), referee_name: null };
      }
      return refFn({
        data: { tournament_id: tournamentId, match_id: match.id, ...payload },
      });
    },
    onSuccess: () => {
      toast.success(t("matches.refereeUpdated"));
      invalidateAll();
    },
    onError: (e: any) => toast.error(e?.message ?? t("matches.errorGeneric")),
  });

  // Quick referee assignment from dropdown menu (no dialog).
  const quickAssignRef = useMutation({
    mutationFn: (opt: RefereeOption | null) => {
      const payload =
        opt === null
          ? { referee_user_id: null, referee_name: null }
          : opt.offline || !opt.user_id
            ? { referee_user_id: null, referee_name: opt.label }
            : { referee_user_id: opt.user_id, referee_name: opt.label };
      return refFn({
        data: { tournament_id: tournamentId, match_id: match.id, ...payload },
      });
    },
    onSuccess: () => {
      toast.success(t("matches.refereeUpdated"));
      invalidateAll();
    },
    onError: (e: any) => toast.error(e?.message ?? t("matches.errorGeneric")),
  });

  // Add event form
  const [evTeam, setEvTeam] = useState<string>(match.team_a_id ?? "");
  const [evKind, setEvKind] = useState<string>("yellow_card");
  const [evPlayer, setEvPlayer] = useState("");
  const [evMinute, setEvMinute] = useState<string>("");

  const addEvent = useMutation({
    mutationFn: () =>
      evFn({
        data: {
          tournament_id: tournamentId,
          match_id: match.id,
          team_id: evTeam || null,
          kind: evKind as any,
          player_name: evPlayer || null,
          minute: evMinute ? parseInt(evMinute, 10) : null,
        },
      }),
    onSuccess: () => {
      setEvPlayer("");
      setEvMinute("");
      invalidateAll();
    },
    onError: (e: any) => toast.error(e?.message ?? t("matches.errorGeneric")),
  });

  const removeEvent = useMutation({
    mutationFn: (event_id: string) =>
      evDelFn({ data: { tournament_id: tournamentId, event_id } }),
    onSuccess: () => invalidateAll(),
  });

  const done = match.status === "completed";
  const validated = !!match.validated_at;
  const disputed = !!match.dispute_flag;
  const whenLabel = initialDate
    ? `${pad(initialDate.getDate())}/${pad(initialDate.getMonth() + 1)} ${pad(initialDate.getHours())}:${pad(initialDate.getMinutes())}`
    : null;

  // ── Unified lifecycle state (exactly one) ──────────────────────────────
  type Lifecycle = "scheduled" | "live" | "submitted" | "validated" | "disputed" | "other";
  const lifecycle: Lifecycle = disputed
    ? "disputed"
    : match.status === "live"
      ? "live"
      : match.status === "completed"
        ? validated
          ? "validated"
          : "submitted"
        : match.status === "scheduled"
          ? "scheduled"
          : "other";

  const LIFECYCLE_STYLES: Record<Lifecycle, {
    border: string;
    headerBg: string;
    badge: string;
    cta: string;
    dot: string;
  }> = {
    scheduled: {
      border: "border-l-slate-400 dark:border-l-slate-500",
      headerBg: "bg-muted/40",
      badge: "bg-muted text-muted-foreground border border-border",
      cta: "bg-foreground text-background hover:bg-foreground/90",
      dot: "bg-slate-400",
    },
    live: {
      border: "border-l-orange-500",
      headerBg: "bg-orange-500/5",
      badge: "bg-orange-500/15 text-orange-700 dark:text-orange-300 border border-orange-500/30",
      cta: "bg-orange-600 hover:bg-orange-700 text-white shadow-md shadow-orange-500/20",
      dot: "bg-orange-500",
    },
    submitted: {
      border: "border-l-primary/70",
      headerBg: "bg-primary/5",
      badge: "bg-primary/15 text-primary border border-primary/30",
      cta: "bg-primary hover:bg-primary/90 text-primary-foreground",
      dot: "bg-primary",
    },
    validated: {
      border: "border-l-emerald-500",
      headerBg: "bg-emerald-500/5",
      badge: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30",
      cta: "bg-card border border-border text-muted-foreground hover:bg-muted/60",
      dot: "bg-emerald-500",
    },
    disputed: {
      border: "border-l-red-600",
      headerBg: "bg-red-500/10",
      badge: "bg-red-600 text-white border border-red-700",
      cta: "bg-red-600 hover:bg-red-700 text-white shadow-md shadow-red-500/20",
      dot: "bg-red-500",
    },
    other: {
      border: "border-l-amber-500",
      headerBg: "bg-amber-500/5",
      badge: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30",
      cta: "bg-foreground text-background hover:bg-foreground/90",
      dot: "bg-amber-500",
    },
  };
  const lifecycleStyle = LIFECYCLE_STYLES[lifecycle];

  const lifecycleLabel =
    lifecycle === "other"
      ? t(`matches.statusLabels.${match.status}`, { defaultValue: match.status })
      : t(`matches.lifecycle.${lifecycle}`);

  const LifecycleIcon = (() => {
    switch (lifecycle) {
      case "scheduled":
        return <Clock className="h-3 w-3" />;
      case "live":
        return (
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75 animate-ping" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-orange-600" />
          </span>
        );
      case "submitted":
        return <Eye className="h-3 w-3" />;
      case "validated":
        return <ShieldCheck className="h-3 w-3" />;
      case "disputed":
        return <AlertTriangle className="h-3 w-3" />;
      default:
        return <Flag className="h-3 w-3" />;
    }
  })();

  // State-dependent primary CTA
  const [eventFormOpen, setEventFormOpen] = useState(false);
  const hasScore = match.score_a != null && match.score_b != null;

  const primaryCta = (() => {
    if (!canManage) return null;
    if (!teamA || !teamB) return null;
    switch (lifecycle) {
      case "scheduled":
        return {
          label: t("matches.cta.scheduled"),
          onClick: () => setOpen(true),
          icon: <Pencil className="h-3.5 w-3.5" />,
        };
      case "live":
        return {
          label: t("matches.cta.live"),
          onClick: () => setOpen(true),
          icon: <Pencil className="h-3.5 w-3.5" />,
        };
      case "submitted":
        return {
          label: t("matches.cta.submitted"),
          onClick: () => validateM.mutate(true),
          icon: <Check className="h-3.5 w-3.5" />,
        };
      case "validated":
        return {
          label: t("matches.cta.validated"),
          onClick: () => setOpen(true),
          icon: <Eye className="h-3.5 w-3.5" />,
        };
      case "disputed":
        return {
          label: t("matches.cta.disputed"),
          onClick: () => setOpen(true),
          icon: <AlertTriangle className="h-3.5 w-3.5" />,
        };
      default:
        return null;
    }
  })();

  return (
    <li>
      <div
        className={`w-full rounded-xl border border-border bg-card overflow-hidden border-l-4 ${lifecycleStyle.border} ${lifecycle === "live" ? "shadow-md" : "shadow-sm"} transition-shadow`}
      >
        {/* HEADER: meta + single status badge */}
        <div
          className={`px-3 py-2 flex items-center justify-between gap-2 border-b border-border ${lifecycleStyle.headerBg}`}
        >
          <div className="flex items-center gap-2 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider min-w-0">
            <span className="shrink-0">#{match.match_number ?? "—"}</span>
            {whenLabel && (
              <>
                <span className="opacity-40">·</span>
                <span className="inline-flex items-center gap-1 shrink-0">
                  <Clock className="h-3 w-3" />
                  {whenLabel}
                </span>
              </>
            )}
            {match.field && (
              <>
                <span className="opacity-40">·</span>
                <span className="inline-flex items-center gap-1 truncate">
                  <MapPin className="h-3 w-3 shrink-0" />
                  <span className="truncate">{match.field}</span>
                </span>
              </>
            )}
          </div>
          <span
            className={`shrink-0 inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-tight ${lifecycleStyle.badge}`}
          >
            {LifecycleIcon}
            {lifecycleLabel}
          </span>
        </div>

        {/* SCORE ROW */}
        <div className="p-3">
          {canManage && lifecycle === "live" && !setsMode && teamA && teamB ? (
            <div className="flex items-center justify-around gap-2">
              <ScoreStepper
                label={teamA.short_name ?? teamA.name}
                value={match.score_a ?? 0}
                onChange={(v) =>
                  liveUpdate.mutate({ score_a: v, score_b: match.score_b ?? 0 })
                }
                disabled={liveUpdate.isPending}
                size="md"
              />
              <span className="text-xl text-muted-foreground">:</span>
              <ScoreStepper
                label={teamB.short_name ?? teamB.name}
                value={match.score_b ?? 0}
                onChange={(v) =>
                  liveUpdate.mutate({ score_a: match.score_a ?? 0, score_b: v })
                }
                disabled={liveUpdate.isPending}
                size="md"
              />
            </div>
          ) : (
            <button
              type="button"
              onClick={() => canManage && teamA && teamB && setOpen(true)}
              disabled={!teamA || !teamB || !canManage}
              className="w-full grid grid-cols-[1fr_auto_1fr] items-center gap-3 active:scale-[0.99] transition disabled:opacity-80 disabled:active:scale-100"
            >
              <span className="truncate text-sm font-bold text-right">
                {teamA?.short_name ?? teamA?.name ?? t("matches.tbd")}
              </span>
              {hasScore ? (
                <span className="inline-flex items-center gap-2 tabular-nums">
                  <span
                    className={`text-2xl font-black ${lifecycle === "disputed" ? "text-red-600 dark:text-red-400" : lifecycle === "validated" ? "text-emerald-700 dark:text-emerald-300" : "text-foreground"}`}
                  >
                    {match.score_a}
                  </span>
                  <span className="text-muted-foreground/50 font-bold">:</span>
                  <span
                    className={`text-2xl font-black ${lifecycle === "disputed" ? "text-red-600 dark:text-red-400" : lifecycle === "validated" ? "text-emerald-700 dark:text-emerald-300" : "text-foreground"}`}
                  >
                    {match.score_b}
                  </span>
                  {hasPenalty && (
                    <span className="ml-1 text-[10px] text-muted-foreground tabular-nums">
                      ({t("matches.penShort")} {match.penalty_score_a}-{match.penalty_score_b})
                    </span>
                  )}
                </span>
              ) : (
                <span className="text-lg font-black text-muted-foreground/40 tracking-tight">
                  {t("matches.vs")}
                </span>
              )}
              <span className="truncate text-sm font-bold">
                {teamB?.short_name ?? teamB?.name ?? t("matches.tbd")}
              </span>
            </button>
          )}

          {setsMode && match.sets && match.sets.length > 0 && (
            <p className="mt-1.5 text-center text-[11px] text-muted-foreground tabular-nums">
              {formatSets(match.sets)}
            </p>
          )}

          {(match.referee_user_id || match.referee_name) && (
            <p className="mt-1.5 text-center text-[10px] text-muted-foreground inline-flex items-center justify-center gap-1 w-full">
              <Flag className="h-3 w-3" />
              {match.referee_name ||
                refereeOptions.find((r) => r.user_id === match.referee_user_id)?.label ||
                t("matches.referee")}
            </p>
          )}

          {/* Disputed helper */}
          {lifecycle === "disputed" && (
            <div className="mt-2 rounded-md border border-red-500/30 bg-red-500/5 px-2 py-1.5 flex items-start gap-2">
              <span className="mt-1 inline-block h-1.5 w-1.5 rounded-full bg-red-500 shrink-0 animate-pulse" />
              <p className="text-[11px] text-red-700 dark:text-red-300 leading-snug font-medium">
                {t("matches.disputedHelper")}
              </p>
            </div>
          )}
        </div>

        {/* PRIMARY CTA + KEBAB */}
        {canManage && (
          <div className="px-3 pb-3 flex gap-2">
            {primaryCta ? (
              <Button
                type="button"
                size="sm"
                onClick={primaryCta.onClick}
                disabled={validateM.isPending || statusM.isPending || liveUpdate.isPending}
                className={`flex-1 h-10 text-xs font-bold gap-1.5 ${lifecycleStyle.cta}`}
              >
                {validateM.isPending || statusM.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  primaryCta.icon
                )}
                {primaryCta.label}
              </Button>
            ) : (
              <div className="flex-1" />
            )}

            {/* Live → quick "Terminer" inline */}
            {lifecycle === "live" && teamA && teamB && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-10 text-xs"
                onClick={() => {
                  setA(match.score_a ?? 0);
                  setB(match.score_b ?? 0);
                  save.mutate();
                }}
                disabled={save.isPending}
                title={t("matches.finishMatch")}
              >
                <Check className="h-4 w-4" />
              </Button>
            )}

            {/* Scheduled → quick "Start live" inline */}
            {lifecycle === "scheduled" && teamA && teamB && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-10 text-xs border-orange-500/40 text-orange-600 dark:text-orange-400 hover:bg-orange-500/10"
                onClick={() => statusM.mutate("live")}
                disabled={statusM.isPending}
                title={t("matches.startLive")}
              >
                <Zap className="h-4 w-4" />
              </Button>
            )}

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  className="h-10 w-10 shrink-0"
                  aria-label={t("matches.moreActions")}
                >
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>{t("matches.moreActions")}</DropdownMenuLabel>
                <DropdownMenuSeparator />

                {done && (
                  <DropdownMenuItem
                    onClick={() => validateM.mutate(!validated)}
                    disabled={validateM.isPending}
                  >
                    <ShieldCheck className="h-3.5 w-3.5" />
                    {validated ? t("matches.unvalidate") : t("matches.validate")}
                  </DropdownMenuItem>
                )}

                <DropdownMenuItem
                  onClick={() => disputeM.mutate(!disputed)}
                  disabled={disputeM.isPending}
                  className={disputed ? "text-destructive" : ""}
                >
                  <AlertTriangle className="h-3.5 w-3.5" />
                  {disputed ? t("matches.liftDispute") : t("matches.raiseDispute")}
                </DropdownMenuItem>

                <DropdownMenuSeparator />

                <DropdownMenuItem onClick={() => setEditOpen(true)}>
                  <CalendarClock className="h-3.5 w-3.5" />
                  {t("matches.fieldAndTime")}
                </DropdownMenuItem>

                <DropdownMenuItem onClick={() => setEventFormOpen((o) => !o)}>
                  <Plus className="h-3.5 w-3.5" />
                  {t("matches.addEventAction")}
                </DropdownMenuItem>

                <DropdownMenuSeparator />

                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <Flag className="h-3.5 w-3.5" />
                    {t("matches.changeStatusAction")}
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    {(["scheduled", "live", "completed", "forfeit_a", "forfeit_b", "no_show_a", "no_show_b", "abandoned", "cancelled"] as const).map((s) => (
                      <DropdownMenuItem
                        key={s}
                        onClick={() => statusM.mutate(s)}
                        disabled={statusM.isPending || match.status === s}
                        className={match.status === s ? "font-semibold" : ""}
                      >
                        {match.status === s && <Check className="h-3.5 w-3.5" />}
                        {t(`matches.statusOptions.${s}`)}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>

                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <Gavel className="h-3.5 w-3.5" />
                    {t("matches.assignRefereeAction", { defaultValue: "Assigner un arbitre" })}
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="max-h-72 overflow-y-auto">
                    <DropdownMenuItem
                      onClick={() => quickAssignRef.mutate(null)}
                      disabled={quickAssignRef.isPending}
                    >
                      {!match.referee_user_id && !match.referee_name && (
                        <Check className="h-3.5 w-3.5" />
                      )}
                      {t("matches.refereeNone")}
                    </DropdownMenuItem>
                    {refereeOptions.length > 0 && <DropdownMenuSeparator />}
                    {refereeOptions.map((r) => {
                      const isCurrent = r.user_id
                        ? match.referee_user_id === r.user_id
                        : match.referee_name === r.label && !match.referee_user_id;
                      return (
                        <DropdownMenuItem
                          key={r.member_id}
                          onClick={() => quickAssignRef.mutate(r)}
                          disabled={quickAssignRef.isPending}
                          className={isCurrent ? "font-semibold" : ""}
                        >
                          {isCurrent && <Check className="h-3.5 w-3.5" />}
                          <span className="truncate">{r.label}</span>
                          {r.offline && (
                            <span className="ml-auto text-[10px] text-muted-foreground">
                              {t("matches.refereeOffline", { defaultValue: "(sans compte)" })}
                            </span>
                          )}
                        </DropdownMenuItem>
                      );
                    })}
                    {refereeOptions.length === 0 && (
                      <div className="px-2 py-1.5 text-[11px] text-muted-foreground">
                        {t("matches.refereeNoAccepted")}
                      </div>
                    )}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}

        {/* Events chips */}
        {events.length > 0 && (
          <ul className="px-3 pb-3 flex flex-wrap gap-1.5">
            {events.map((ev) => {
              const meta = eventMeta(ev.kind, t);
              const isA = ev.team_id === match.team_a_id;
              return (
                <li
                  key={ev.id}
                  className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px]"
                >
                  <span>{meta.emoji}</span>
                  {ev.minute != null && <span className="font-mono">{ev.minute}'</span>}
                  {ev.player_name && <span>{ev.player_name}</span>}
                  <span className="text-muted-foreground">
                    {isA ? teamA?.short_name ?? teamA?.name : teamB?.short_name ?? teamB?.name}
                  </span>
                  {canManage && (
                    <button
                      type="button"
                      onClick={() => removeEvent.mutate(ev.id)}
                      className="text-muted-foreground hover:text-destructive ml-0.5"
                      aria-label={t("matches.events.deleteAria")}
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {/* Event add form (toggled from kebab) */}
        {canManage && (
          <Collapsible open={eventFormOpen} onOpenChange={setEventFormOpen}>
            <CollapsibleContent className="mx-3 mb-3 rounded-lg border border-border bg-muted/30 p-2 space-y-2">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <Select value={evKind} onValueChange={setEvKind}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {EVENT_KIND_VALUES.map((k) => (
                      <SelectItem key={k.value} value={k.value}>
                        {k.emoji} {t(`matches.events.${k.value}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={evTeam} onValueChange={setEvTeam}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder={t("matches.events.team")} />
                  </SelectTrigger>
                  <SelectContent>
                    {teamA && <SelectItem value={teamA.id}>{teamA.name}</SelectItem>}
                    {teamB && <SelectItem value={teamB.id}>{teamB.name}</SelectItem>}
                  </SelectContent>
                </Select>
                <Input
                  className="h-8 text-xs"
                  placeholder={t("matches.events.player")}
                  value={evPlayer}
                  onChange={(e) => setEvPlayer(e.target.value)}
                />
                <Input
                  className="h-8 text-xs"
                  type="number"
                  min={0}
                  max={200}
                  placeholder={t("matches.events.minute")}
                  value={evMinute}
                  onChange={(e) => setEvMinute(e.target.value)}
                />
              </div>
              <Button
                size="sm"
                className="h-8 text-xs w-full"
                onClick={() => addEvent.mutate()}
                disabled={addEvent.isPending || !evTeam}
              >
                {addEvent.isPending ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Plus className="h-3 w-3" />
                )}
                {t("matches.events.add")}
              </Button>
            </CollapsibleContent>
          </Collapsible>
        )}
      </div>



      <ResponsiveFormDialog open={open} onOpenChange={setOpen} title={t("matches.title")}>
        <div className="space-y-4 mt-4 pb-6">
          {validated && (
            <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/5 px-3 py-2.5 flex items-start gap-2">
              <ShieldCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400 mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                  {t("matches.lockedTitle", { defaultValue: "Match validé" })}
                </p>
                <p className="text-[11px] text-emerald-700/80 dark:text-emerald-300/80 leading-snug mt-0.5">
                  {t("matches.lockedHelper", { defaultValue: "Pour modifier le score, dévalidez d'abord le match." })}
                </p>
              </div>
            </div>
          )}
          {setsMode ? (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                {t("matches.bestOfSets", { bestOf: setsRules.bestOf, points: setsRules.pointsToWin })}
                {setsRules.tieBreakPoints !== setsRules.pointsToWin
                  ? t("matches.tieBreak", { points: setsRules.tieBreakPoints })
                  : ""}
              </p>
              {sets.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-2">
                  {t("matches.noSets")}
                </p>
              )}
              {sets.map((s, i) => (
                <div
                  key={i}
                  className="rounded-lg border border-border bg-muted/30 p-3"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-muted-foreground">
                      {t("matches.setLabel", { n: i + 1 })}
                    </span>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      onClick={() => setSets(sets.filter((_, j) => j !== i))}
                      disabled={validated}
                    >
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </div>
                  <div className="flex items-center justify-around gap-2">
                    <ScoreStepper
                      label={teamA?.short_name ?? teamA?.name}
                      value={s.a}
                      onChange={(v) => {
                        const next = [...sets];
                        next[i] = { ...next[i], a: v };
                        setSets(next);
                      }}
                      size="sm"
                      disabled={validated}
                    />
                    <span className="text-xl text-muted-foreground">:</span>
                    <ScoreStepper
                      label={teamB?.short_name ?? teamB?.name}
                      value={s.b}
                      onChange={(v) => {
                        const next = [...sets];
                        next[i] = { ...next[i], b: v };
                        setSets(next);
                      }}
                      size="sm"
                      disabled={validated}
                    />
                  </div>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={() => setSets([...sets, { a: 0, b: 0 }])}
                disabled={validated || sets.length >= 7}
              >
                <Plus className="h-4 w-4" />
                {t("matches.addSet")}
              </Button>
              {sets.length > 0 && (
                <p className="text-center text-sm font-medium">
                  {t("matches.setsWon")}{" "}
                  <span className="tabular-nums">
                    {aggregateSetsScore(sets).score_a} - {aggregateSetsScore(sets).score_b}
                  </span>
                </p>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-around gap-3 py-2">
              <ScoreStepper
                label={teamA?.name}
                value={a}
                onChange={setA}
                size="lg"
                disabled={validated}
              />
              <span className="text-2xl font-semibold text-muted-foreground">:</span>
              <ScoreStepper
                label={teamB?.name}
                value={b}
                onChange={setB}
                size="lg"
                disabled={validated}
              />
            </div>
          )}
          {!setsMode && isKnockout && tied && teamA && teamB && (
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 space-y-2">
              <p className="text-xs font-semibold text-amber-700 dark:text-amber-300 text-center">
                {t("matches.tied")}
              </p>
              <div className="flex items-center justify-around gap-3">
                <ScoreStepper
                  label={t("matches.tab", { team: teamA.short_name ?? teamA.name })}
                  value={penA}
                  onChange={setPenA}
                  size="md"
                  disabled={validated}
                />
                <span className="text-xl text-muted-foreground">:</span>
                <ScoreStepper
                  label={t("matches.tab", { team: teamB.short_name ?? teamB.name })}
                  value={penB}
                  onChange={setPenB}
                  size="md"
                  disabled={validated}
                />
              </div>
              {penA !== penB && (
                <p className="text-center text-xs text-emerald-700 dark:text-emerald-300">
                  {t("matches.winner", { team: penA > penB ? teamA.name : teamB.name })}
                </p>
              )}
            </div>
          )}

          {validated ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => validateM.mutate(false)}
              disabled={validateM.isPending}
              className="w-full h-12"
            >
              {validateM.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ShieldCheck className="h-4 w-4" />
              )}
              {t("matches.unvalidateToEdit", { defaultValue: "Dévalider pour modifier" })}
            </Button>
          ) : (
            <Button
              onClick={() => save.mutate()}
              disabled={save.isPending || (setsMode && sets.length === 0) || (!setsMode && isKnockout && tied && penA === penB)}
              className="w-full h-12"
            >
              {save.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                t("matches.saveAndValidate")
              )}
            </Button>
          )}
        </div>
      </ResponsiveFormDialog>



      <ResponsiveFormDialog open={editOpen} onOpenChange={setEditOpen} title={t("matches.scheduleTitle")}>
        <div className="space-y-4 mt-4 pb-6">
          <div className="space-y-1.5">
            <Label>{t("matches.field")}</Label>
            {fields.length > 0 ? (
              <Select
                value={editField || "__none__"}
                onValueChange={(v) => setEditField(v === "__none__" ? "" : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t("matches.refereeNone")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">{t("matches.refereeNone")}</SelectItem>
                  {fields.map((f) => (
                    <SelectItem key={f} value={f}>
                      {f}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input
                value={editField}
                onChange={(e) => setEditField(e.target.value)}
                placeholder={t("matches.fieldPlaceholder")}
              />
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{t("matches.date")}</Label>
              <Input type="date" value={editDate} onChange={(e) => setEditDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("matches.time")}</Label>
              <Input type="time" value={editTime} onChange={(e) => setEditTime(e.target.value)} />
            </div>
          </div>
          <Button onClick={() => saveSched.mutate()} disabled={saveSched.isPending} className="w-full">
            {saveSched.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : t("matches.saveSchedule")}
          </Button>

          <div className="pt-4 border-t border-border space-y-3">
            <div className="space-y-1.5">
              <Label>{t("matches.referee")}</Label>
              <Select value={refMode} onValueChange={setRefMode}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">{t("matches.refereeNone")}</SelectItem>
                  {refereeOptions
                    .filter((r) => !!r.user_id)
                    .map((r) => (
                      <SelectItem key={r.user_id as string} value={`user:${r.user_id}`}>
                        {r.label}
                      </SelectItem>
                    ))}
                  <SelectItem value="free">{t("matches.refereeFree")}</SelectItem>
                </SelectContent>
              </Select>
              {refMode === "free" && (
                <Input
                  className="mt-2"
                  value={refFreeName}
                  onChange={(e) => setRefFreeName(e.target.value)}
                  placeholder={t("matches.refereePlaceholder")}
                />
              )}
              {refereeOptions.length === 0 && refMode !== "free" && refMode !== "__none__" && (
                <p className="text-[11px] text-muted-foreground">
                  {t("matches.refereeNoAccepted")}
                </p>
              )}
            </div>
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => saveRef.mutate()}
              disabled={saveRef.isPending || (refMode === "free" && !refFreeName.trim())}
            >
              {saveRef.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : t("matches.assignReferee")}
            </Button>
          </div>
        </div>
      </ResponsiveFormDialog>
    </li>
  );
}
