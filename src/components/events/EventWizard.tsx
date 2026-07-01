import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import { format, addDays, startOfWeek, nextSaturday } from "date-fns";
import { fr as frLocale, enUS } from "date-fns/locale";
import { toast } from "sonner";
import {
  ChevronLeft,
  CalendarIcon,
  Sparkles,
  Settings2,
  CheckCircle2,
  Loader2,
  Check,
  Users,
  CalendarDays,
  Timer,
  Hourglass,
  Repeat,
  Home,
  MapPin,
  Clock,
  Shield,
  Trophy,
  Mail,
  Car,
  MessageSquare,
  Bus,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { TimePicker } from "@/components/ui/time-picker";
import { LocationAutocomplete } from "@/components/location-autocomplete";
import { cn } from "@/lib/utils";
import { WizardProgress } from "@/components/wizard/wizard-primitives";
import { createTrainingSeries } from "@/lib/training-series.functions";
import { createEvent } from "@/lib/events/events.functions";
import {
  defaultDuration,
  defaultStartTime,
  defaultState,
  toEventPayloadInput,
  toEventFormInitial,
  autoTitle,
  countOccurrences,
  type EventWizardState,
  type WizardEventType,
  type RecurrenceMode,
} from "./event-wizard-config";
import { readDraft, writeDraft, clearDraft, draftHasProgress } from "./event-wizard-draft";

type Team = {
  id: string;
  name: string;
  sport?: string | null;
  championship?: string | null;
  competitions?: string[] | null;
};

interface Props {
  teams: Team[];
  onClose: () => void;
  onCreated: (eventId?: string) => void;
  /** Hand-off to EventFormSheet pre-filled with current answers. Includes a snapshot of wizard state for round-trips. */
  onOpenExpert: (initial: Record<string, unknown>, snapshot?: EventWizardState) => void;
  /** Optional initial state — restores prior wizard answers (e.g. coming back from expert). */
  initialState?: EventWizardState;
}

type Step =
  | "type"
  | "team"
  | "when"
  | "duration"
  | "halves"
  | "gameformat"
  | "series"
  | "homeaway"
  | "meetingpoint"
  | "meetingtime"
  | "places"
  | "opponent"
  | "official"
  | "location"
  | "convocation"
  | "carpool"
  | "comment"
  | "summary";

// Per-sport halves & game-format presets. "manual" = custom text input.
function getHalvesPresets(sport: string | null | undefined): string[] {
  switch (sport) {
    case "football":
    case "futsal":
      return ["1x60", "2x30", "2x35", "2x40", "2x45"];
    case "rugby":
      return ["2x30", "2x35", "2x40"];
    case "handball":
      return ["2x20", "2x25", "2x30"];
    case "basketball":
      return ["4x8", "4x10", "4x12"];
    case "ice_hockey":
      return ["3x15", "3x20"];
    case "field_hockey":
      return ["4x15", "2x30", "2x35"];
    case "volleyball":
    case "tennis":
    case "padel":
      return ["best-of-3", "best-of-5"];
    default:
      return ["1x60", "2x30", "2x40", "2x45"];
  }
}

function getGameFormatPresets(sport: string | null | undefined): string[] {
  switch (sport) {
    case "football":
      return ["3v3", "5v5", "7v7", "8v8", "9v9", "11v11"];
    case "futsal":
      return ["5v5"];
    case "rugby":
      return ["7v7", "10v10", "13v13", "15v15"];
    case "handball":
      return ["7v7"];
    case "basketball":
      return ["3v3", "5v5"];
    case "volleyball":
      return ["6v6"];
    case "ice_hockey":
      return ["5v5"];
    case "field_hockey":
      return ["7v7", "11v11"];
    case "tennis":
    case "padel":
      return ["1v1", "2v2"];
    default:
      return ["5v5", "7v7", "8v8", "9v9", "11v11"];
  }
}

/** Display label: "2x40" → "2 x 40 min", "best-of-3" → "Best of 3". */
function formatHalvesLabel(label: string): string {
  const m = /^(\d+)x(\d+)$/.exec(label);
  if (m) return `${m[1]} x ${m[2]} min`;
  if (label.startsWith("best-of-")) return `Best of ${label.slice(8)}`;
  return label;
}

/** Display label: "11v11" → "11 vs 11". */
function formatGameFormatLabel(label: string): string {
  const m = /^(\d+)v(\d+)$/.exec(label);
  if (m) return `${m[1]} vs ${m[2]}`;
  return label;
}

function halvesToMinutes(label: string): number | null {
  const m = /^(\d+)x(\d+)$/.exec(label);
  if (!m) return null;
  return parseInt(m[1], 10) * parseInt(m[2], 10);
}

export function EventWizard({ teams, onClose, onCreated, onOpenExpert, initialState }: Props) {
  const { t, i18n } = useTranslation();
  const dateLocale = i18n.language?.startsWith("fr") ? frLocale : enUS;
  const qc = useQueryClient();
  const navigate = useNavigate();
  const createSeriesFn = useServerFn(createTrainingSeries);
  const createEventFn = useServerFn(createEvent);

  const [state, setState] = useState<EventWizardState>(() => initialState ?? defaultState());
  const [draftOffered, setDraftOffered] = useState(false);
  const [hasDraftPrompt, setHasDraftPrompt] = useState(false);
  const [touched, setTouched] = useState<Set<string>>(() => new Set());
  const screenRef = useRef<HTMLDivElement>(null);
  function markTouched(k: string) {
    setTouched((s) => {
      if (s.has(k)) return s;
      const n = new Set(s);
      n.add(k);
      return n;
    });
  }
  function isAnswered(k: string) {
    return touched.has(k);
  }

  // Load draft once on mount
  useEffect(() => {
    if (draftOffered) return;
    const d = readDraft();
    if (d && draftHasProgress(d)) {
      setHasDraftPrompt(true);
    }
    setDraftOffered(true);
  }, [draftOffered]);

  // Auto-save on changes
  useEffect(() => {
    if (state.type || state.teamId || state.startDate) {
      writeDraft(state);
    }
  }, [state]);

  // Compute visible steps based on type/branches
  const steps = useMemo<Step[]>(() => {
    const s: Step[] = ["type", "team"];
    // Training/other: ask recurrence early, right after team.
    if (state.type === "training" || state.type === "other") s.push("series");
    const isRecurring =
      (state.type === "training" || state.type === "other") &&
      !!state.recurrence &&
      state.recurrence.mode !== "single";
    s.push("when");
    if (state.type === "match") {
      s.push("halves", "gameformat", "homeaway");
      if (state.isHome === "away") s.push("places");
      s.push("opponent", "official");
    } else if (!isRecurring) {
      s.push("duration");
    }
    if (state.type === "training" && !isRecurring) {
      s.push("meetingtime");
    }
    // Recurring trainings: only day + time + duration, no extra steps.
    if (!isRecurring) {
      if (state.type !== "match") s.push("location");
      s.push("convocation");
      if (state.type === "match" && state.isHome === "away") s.push("carpool");
      if (state.type === "training") s.push("carpool");
      s.push("comment");
    }
    s.push("summary");
    return s;
  }, [state.type, state.isHome, state.recurrence]);

  const current: Step = steps[Math.min(state.step, steps.length - 1)] ?? "type";

  function go(delta: number) {
    setState((s) => ({ ...s, step: Math.max(0, Math.min(steps.length - 1, s.step + delta)) }));
  }

  function patch<K extends keyof EventWizardState>(k: K, v: EventWizardState[K]) {
    setState((s) => ({ ...s, [k]: v }));
  }

  // Auto-scroll on step change
  useEffect(() => {
    screenRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }, [current]);

  const selectedTeam = teams.find((tm) => tm.id === state.teamId);
  const title = autoTitle(state, selectedTeam?.name, t);

  function answer<K extends keyof EventWizardState>(k: K, v: EventWizardState[K]) {
    setState((s) => ({ ...s, [k]: v, step: s.step + 1 }));
  }

  function selectType(type: WizardEventType) {
    setState((s) => ({
      ...s,
      type,
      durationMin: defaultDuration(type),
      startTime: s.startTime || defaultStartTime(type),
      step: s.step + 1,
    }));
  }

  // ---- Series helpers ----
  const recurrence = state.recurrence;
  const seriesCount = useMemo(() => {
    if (!recurrence || recurrence.mode === "single") return 0;
    return countOccurrences(recurrence.startsOn, recurrence.endsOn, recurrence.weekdays);
  }, [recurrence]);

  function setRecurrenceMode(mode: RecurrenceMode) {
    if (mode === "single") {
      setState((s) => ({ ...s, recurrence: { mode, weekdays: [] }, step: s.step + 1 }));
      return;
    }
    const today = state.startDate ?? format(new Date(), "yyyy-MM-dd");
    const startOfDate = new Date(`${today}T00:00:00`);
    const wd = startOfDate.getDay();
    setState((s) => ({
      ...s,
      recurrence: {
        mode,
        weekdays: mode === "weekly_one" ? [wd] : (s.recurrence?.weekdays ?? [wd]),
        startsOn: s.recurrence?.startsOn ?? today,
        endsOn: s.recurrence?.endsOn ?? format(addDays(startOfDate, 30 * 9), "yyyy-MM-dd"),
      },
    }));
  }

  // A series is offered (and honored) for recurring trainings AND "other" events.
  const seriesEligible = state.type === "training" || state.type === "other";
  const isSeriesSubmit =
    seriesEligible &&
    !!recurrence &&
    recurrence.mode !== "single" &&
    recurrence.weekdays.length > 0 &&
    !!recurrence.startsOn &&
    !!recurrence.endsOn;

  // ---- Submit ----
  const createMut = useMutation({
    mutationFn: async () => {
      // Series path (training or other).
      if (isSeriesSubmit && recurrence) {
        const slots = recurrence.weekdays.map((wd) => ({
          weekday: wd,
          start_time: state.startTime,
          end_time: addMinutes(state.startTime, state.durationMin),
          location: state.location ?? null,
        }));
        const res = await createSeriesFn({
          data: {
            teamId: state.teamId,
            type: state.type === "other" ? "other" : "training",
            title,
            description: null,
            location: state.location ?? null,
            startsOn: recurrence.startsOn!,
            endsOn: recurrence.endsOn!,
            isOfficial: false,
            carpoolEnabled: typeof state.carpoolEnabled === "boolean" ? state.carpoolEnabled : null,
            slots,
            excludedDates: [],
            excludedRanges: [],
          },
        });
        return { kind: "series" as const, ...res };
      }

      // Single event — goes through the shared createEvent server fn (no local insert).
      const input = toEventPayloadInput(state, title);
      if (!input) throw new Error("missing-fields");
      const { id } = await createEventFn({ data: input });
      return { kind: "single" as const, eventId: id };
    },
    onSuccess: (res) => {
      clearDraft();
      qc.invalidateQueries({ queryKey: ["events"] });
      qc.invalidateQueries({ queryKey: ["upcoming"] });
      if (res.kind === "series") {
        toast.success(
          t("eventWizard.seriesCreated", {
            count: res.createdCount,
            defaultValue: "{{count}} événements créés",
          }),
        );
        onCreated();
      } else {
        toast.success(t("events.publish", { defaultValue: "Publié" }));
        onCreated(res.eventId);
      }
    },
    onError: (e: unknown) => {
      const msg = e instanceof Error ? e.message : "error";
      toast.error(msg === "duplicate" ? t("events.duplicateExists", { defaultValue: msg }) : msg);
    },
  });

  function goToConvocation(eventId: string) {
    // 'all' → picker pre-checked with the whole team; 'selection' → empty picker.
    navigate({
      to: "/events/$eventId",
      params: { eventId },
      search: (state.convocScope === "all" ? { send: 1, action: "all" } : { send: 1 }) as never,
    });
  }

  function createAndConvocate() {
    createMut.mutate(undefined, {
      onSuccess: (res) => {
        if (state.convocScope === "none") return;
        if (res.kind === "single") {
          goToConvocation(res.eventId);
        } else if (res.kind === "series" && res.firstEventId) {
          // At minimum, convoke the first occurrence of the series.
          goToConvocation(res.firstEventId);
        }
      },
    });
  }

  // ---- Header guide text ----
  const hints: Record<Step, string> = {
    type: t("eventWizard.hint.type", { defaultValue: "On adapte les questions au type." }),
    team: t("eventWizard.hint.team", { defaultValue: "L'équipe concernée." }),
    when: t("eventWizard.hint.when", { defaultValue: "Date et heure de début." }),
    duration: t("eventWizard.hint.duration", { defaultValue: "Combien de temps ?" }),
    halves: t("eventWizard.hint.halves", { defaultValue: "Format du temps de jeu." }),
    gameformat: t("eventWizard.hint.gameformat", {
      defaultValue: "Combien de joueurs sur le terrain ?",
    }),
    series: t("eventWizard.hint.series", { defaultValue: "Unique ou récurrent ?" }),
    homeaway: t("eventWizard.hint.homeaway", { defaultValue: "À domicile ou en déplacement ?" }),
    meetingpoint: t("eventWizard.hint.meetingpoint", {
      defaultValue: "Adresse et heure de rendez-vous.",
    }),
    meetingtime: t("eventWizard.hint.meetingtime", {
      defaultValue: "À quelle heure les joueurs doivent-ils se présenter ?",
    }),
    places: t("eventWizard.hint.places", {
      defaultValue: "Point de rendez-vous et lieu du match.",
    }),
    opponent: t("eventWizard.hint.opponent", { defaultValue: "L'adversaire." }),
    official: t("eventWizard.hint.official", { defaultValue: "Officiel ou amical ?" }),
    location: t("eventWizard.hint.location", { defaultValue: "Où ça se passe ?" }),
    convocation: t("eventWizard.hint.convocation", { defaultValue: "À qui on envoie ?" }),
    carpool: t("eventWizard.hint.carpool", { defaultValue: "Activer le covoiturage ?" }),
    comment: t("eventWizard.hint.comment", {
      defaultValue: "Un commentaire à ajouter ? (facultatif)",
    }),
    summary: t("eventWizard.hint.summary", { defaultValue: "Tout est prêt." }),
  };

  // Short dramatic step titles (mockup style — "Où ?", "Contre qui ?"). The "?" / "!"
  // is rendered as <em> with reduced opacity in the hero.
  const stepTitles: Record<Step, { text: string; mark?: string }> = {
    type: { text: t("eventWizard.qShort.type", { defaultValue: "Quel type" }), mark: "?" },
    team: { text: t("eventWizard.qShort.team", { defaultValue: "Quelle équipe" }), mark: "?" },
    when: { text: t("eventWizard.qShort.when", { defaultValue: "Quand" }), mark: "?" },
    duration: {
      text: t("eventWizard.qShort.duration", { defaultValue: "Combien de temps" }),
      mark: "?",
    },
    halves: { text: t("eventWizard.qShort.halves", { defaultValue: "Format" }), mark: "?" },
    gameformat: {
      text: t("eventWizard.qShort.gameformat", { defaultValue: "Effectif" }),
      mark: "?",
    },
    series: { text: t("eventWizard.qShort.series", { defaultValue: "Récurrence" }), mark: "?" },
    homeaway: {
      text: t("eventWizard.qShort.homeaway", { defaultValue: "Domicile ou extérieur" }),
      mark: "?",
    },
    meetingpoint: {
      text: t("eventWizard.qShort.meetingpoint", { defaultValue: "Point de RDV" }),
      mark: "?",
    },
    meetingtime: {
      text: t("eventWizard.qShort.meetingtime", { defaultValue: "Heure de RDV" }),
      mark: "?",
    },
    places: {
      text: t("eventWizard.qShort.places", { defaultValue: "Lieux" }),
      mark: "?",
    },
    opponent: { text: t("eventWizard.qShort.opponent", { defaultValue: "Contre qui" }), mark: "?" },
    official: { text: t("eventWizard.qShort.official", { defaultValue: "Officiel" }), mark: "?" },
    location: { text: t("eventWizard.qShort.location", { defaultValue: "Où" }), mark: "?" },
    convocation: {
      text: t("eventWizard.qShort.convocation", { defaultValue: "Convoquer auto" }),
      mark: "?",
    },
    carpool: { text: t("eventWizard.qShort.carpool", { defaultValue: "Covoiturage" }), mark: "?" },
    comment: { text: t("eventWizard.qShort.comment", { defaultValue: "Un message" }), mark: "?" },
    summary: {
      text: t("eventWizard.qShort.summary", { defaultValue: "Tout est prêt" }),
      mark: "!",
    },
  };

  // ---- Render ----
  return (
    <div className="flex flex-col h-full max-h-[88vh]">
      {/* Premium gradient header — Apple meets Blue Lock */}
      <WizardHero
        step={current}
        stepIndex={Math.min(state.step + 1, steps.length)}
        totalSteps={steps.length}
        eyebrow={t("eventWizard.title", { defaultValue: "Nouvel événement" })}
        title={stepTitles[current].text}
        titleMark={stepTitles[current].mark}
        hint={hints[current]}
        progress={state.step}
        onClose={onClose}
      />

      {/* Live recap chips — hidden on small screens to match clean mockup */}
      {(false as boolean) && (
        <LiveRecap
          state={state}
          teamName={selectedTeam?.name}
          title={title}
          seriesCount={seriesCount}
          t={t}
        />
      )}

      {/* Draft resume bar */}
      {hasDraftPrompt && (
        <div className="mx-3 mt-2 flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950 dark:text-amber-200">
          <span className="flex-1">
            {t("eventWizard.draftPrompt", { defaultValue: "Reprendre votre brouillon ?" })}
          </span>
          <Button
            size="sm"
            variant="default"
            className="h-7"
            onClick={() => {
              const d = readDraft();
              if (d) setState(d);
              setHasDraftPrompt(false);
            }}
          >
            {t("eventWizard.resume", { defaultValue: "Reprendre" })}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2"
            onClick={() => {
              clearDraft();
              setHasDraftPrompt(false);
            }}
          >
            ×
          </Button>
        </div>
      )}

      {/* Body */}
      <div ref={screenRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {state.step > 0 && current !== "summary" && (
          <Button variant="ghost" size="sm" className="h-7 px-2 -ml-2" onClick={() => go(-1)}>
            <ChevronLeft className="h-3.5 w-3.5" />
            {t("eventWizard.back", { defaultValue: "Retour" })}
          </Button>
        )}

        {current === "type" && (
          <StepQuestion
            title={t("eventWizard.q.type", { defaultValue: "Quel type d'événement ?" })}
          >
            {(
              [
                ["training", "⚽", t("events.types.training"), "Entraînement régulier", "green"],
                ["match", "🆚", t("events.types.match"), "Match officiel ou amical", "red"],
                ["meeting", "👥", t("events.types.meeting"), "Réunion club ou équipe", "blue"],
                [
                  "other",
                  "📌",
                  t("events.types.other", { defaultValue: "Autre" }),
                  "Stage, tournoi, événement…",
                  "amber",
                ],
              ] as const
            ).map(([v, e, l, s, c]) => (
              <DoorButton
                key={v}
                icon={e}
                label={l}
                subtitle={s}
                color={c}
                active={state.type === v}
                onClick={() => selectType(v)}
              />
            ))}
          </StepQuestion>
        )}

        {current === "team" && (
          <StepQuestion title={t("eventWizard.q.team", { defaultValue: "Quelle équipe ?" })}>
            {teams.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {t("eventWizard.noTeams", { defaultValue: "Aucune équipe disponible." })}
              </p>
            ) : (
              teams.map((tm, i) => {
                const palette: DoorColor[] = ["green", "blue", "purple", "amber", "red", "pink"];
                return (
                  <DoorButton
                    key={tm.id}
                    icon="👥"
                    label={tm.name}
                    subtitle={tm.sport ?? undefined}
                    color={palette[i % palette.length]}
                    active={state.teamId === tm.id}
                    onClick={() => answer("teamId", tm.id)}
                  />
                );
              })
            )}
          </StepQuestion>
        )}

        {current === "when" && (
          <StepQuestion title={t("eventWizard.q.when", { defaultValue: "Quand ?" })}>
            <div className="flex flex-wrap gap-2">
              <Chip
                label={t("eventWizard.chip.tonight", { defaultValue: "Ce soir" })}
                onClick={() => {
                  patch("startDate", format(new Date(), "yyyy-MM-dd"));
                  patch("startTime", "20:00");
                }}
              />
              <Chip
                label={t("eventWizard.chip.tomorrow", { defaultValue: "Demain" })}
                onClick={() => {
                  patch("startDate", format(addDays(new Date(), 1), "yyyy-MM-dd"));
                }}
              />
              <Chip
                label={t("eventWizard.chip.saturday", { defaultValue: "Samedi" })}
                onClick={() => {
                  patch("startDate", format(nextSaturday(new Date()), "yyyy-MM-dd"));
                }}
              />
              <Chip
                label={t("eventWizard.chip.nextWeek", { defaultValue: "Sem. prochaine" })}
                onClick={() => {
                  patch(
                    "startDate",
                    format(addDays(startOfWeek(new Date(), { weekStartsOn: 1 }), 7), "yyyy-MM-dd"),
                  );
                }}
              />
            </div>
            <div className="grid grid-cols-[1fr_110px] gap-2 pt-2">
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="h-10 justify-start font-normal">
                    <CalendarIcon className="h-4 w-4" />
                    {state.startDate
                      ? format(new Date(`${state.startDate}T00:00:00`), "EEE d MMM", {
                          locale: dateLocale,
                        })
                      : t("eventWizard.pickDate", { defaultValue: "Choisir une date" })}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={state.startDate ? new Date(`${state.startDate}T00:00:00`) : undefined}
                    onSelect={(d) => d && patch("startDate", format(d, "yyyy-MM-dd"))}
                    initialFocus
                    className="p-3 pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
              <TimePicker
                value={state.startTime}
                onChange={(v: string) => patch("startTime", v)}
                className="w-full"
              />
            </div>
            <Button
              className="w-full mt-3"
              disabled={!state.startDate || !state.startTime}
              onClick={() => go(1)}
            >
              {t("eventWizard.continue", { defaultValue: "Continuer" })}
            </Button>
          </StepQuestion>
        )}

        {current === "duration" && (
          <StepQuestion title={t("eventWizard.q.duration", { defaultValue: "Durée ?" })}>
            <div className="grid grid-cols-3 gap-2">
              {[60, 90, 105, 120, 150, 180].map((m) => {
                const selected = state.durationMin === m;
                const pre = selected && !isAnswered("duration");
                return (
                  <button
                    key={m}
                    type="button"
                    onClick={() => {
                      markTouched("duration");
                      setState((s) => ({ ...s, durationMin: m, step: s.step + 1 }));
                    }}
                    className={cn(
                      "rounded-lg border-2 py-3 text-sm font-semibold transition-colors",
                      selected && !pre
                        ? "border-primary bg-primary/10 text-primary"
                        : pre
                          ? "border-border bg-card text-muted-foreground/60"
                          : "border-border bg-card hover:bg-muted/40",
                    )}
                  >
                    {m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? m % 60 : ""}` : `${m} min`}
                  </button>
                );
              })}
            </div>
          </StepQuestion>
        )}

        {current === "series" && (
          <StepQuestion
            title={t("eventWizard.q.series", {
              defaultValue: "Cet entraînement est-il récurrent ?",
            })}
          >
            {(
              [
                ["single", t("eventWizard.series.single", { defaultValue: "Événement unique" })],
                [
                  "weekly_one",
                  t("eventWizard.series.weeklyOne", { defaultValue: "Toutes les semaines" }),
                ],
              ] as const
            ).map(([m, l]) => (
              <DoorButton
                key={m}
                icon={m === "single" ? "📅" : "🔁"}
                label={l}
                active={recurrence?.mode === m}
                onClick={() => setRecurrenceMode(m)}
              />
            ))}
            {recurrence && recurrence.mode !== "single" && (
              <div className="mt-3 space-y-3 rounded-xl border border-border bg-card p-3">
                <div>
                  <Label className="text-xs">
                    {t("eventWizard.series.dayOfWeek", { defaultValue: "Jour de la semaine" })}
                  </Label>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {[1, 2, 3, 4, 5, 6, 0].map((wd) => (
                      <button
                        key={wd}
                        type="button"
                        onClick={() =>
                          setState((s) => ({
                            ...s,
                            recurrence: {
                              ...(s.recurrence ?? { mode: "weekly_one", weekdays: [] }),
                              weekdays: [wd],
                            },
                          }))
                        }
                        className={cn(
                          "h-9 w-10 rounded-md border text-xs font-semibold",
                          recurrence.weekdays[0] === wd
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border bg-background",
                        )}
                      >
                        {t(`eventWizard.weekdayShort.${wd}`, {
                          defaultValue: ["D", "L", "M", "M", "J", "V", "S"][wd],
                        })}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">
                      {t("eventWizard.series.time", { defaultValue: "Heure" })}
                    </Label>
                    <TimePicker
                      value={state.startTime}
                      onChange={(v: string) => patch("startTime", v)}
                      className="w-full"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">
                      {t("eventWizard.q.duration", { defaultValue: "Durée" })}
                    </Label>
                    <select
                      className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                      value={state.durationMin}
                      onChange={(e) => patch("durationMin", parseInt(e.target.value, 10))}
                    >
                      {[60, 75, 90, 105, 120].map((m) => (
                        <option key={m} value={m}>
                          {`${Math.floor(m / 60)}h${m % 60 ? m % 60 : ""}`}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">
                      {t("eventWizard.series.startsOn", { defaultValue: "Début" })}
                    </Label>
                    <Input
                      type="date"
                      value={recurrence.startsOn ?? ""}
                      onChange={(e) =>
                        setState((s) => ({
                          ...s,
                          recurrence: {
                            ...(s.recurrence ?? { mode: "weekly_one", weekdays: [] }),
                            startsOn: e.target.value,
                          },
                        }))
                      }
                    />
                  </div>
                  <div>
                    <Label className="text-xs">
                      {t("eventWizard.series.endsOn", { defaultValue: "Fin" })}
                    </Label>
                    <Input
                      type="date"
                      value={recurrence.endsOn ?? ""}
                      onChange={(e) =>
                        setState((s) => ({
                          ...s,
                          recurrence: {
                            ...(s.recurrence ?? { mode: "weekly_one", weekdays: [] }),
                            endsOn: e.target.value,
                          },
                        }))
                      }
                    />
                  </div>
                </div>
                <div className="rounded-lg bg-primary/10 px-3 py-2 text-center text-sm font-semibold text-primary">
                  {t("eventWizard.series.preview", {
                    count: seriesCount,
                    defaultValue: "Créer {{count}} entraînements",
                  })}
                </div>
              </div>
            )}
            <Button className="w-full mt-2" onClick={() => go(1)}>
              {t("eventWizard.continue", { defaultValue: "Continuer" })}
            </Button>
          </StepQuestion>
        )}

        {current === "homeaway" && (
          <StepQuestion
            title={t("eventWizard.q.homeaway", { defaultValue: "Domicile ou extérieur ?" })}
          >
            <DoorButton
              icon="🏠"
              label={t("eventWizard.home", { defaultValue: "Domicile" })}
              subtitle="On reçoit"
              color="green"
              active={state.isHome === "home"}
              onClick={() => answer("isHome", "home")}
            />
            <DoorButton
              icon="🚌"
              label={t("eventWizard.away", { defaultValue: "Extérieur" })}
              subtitle="On se déplace"
              color="blue"
              active={state.isHome === "away"}
              onClick={() => answer("isHome", "away")}
            />
          </StepQuestion>
        )}

        {current === "halves" && (
          <StepQuestion title={t("eventWizard.q.halves", { defaultValue: "Format du match ?" })}>
            <div className="grid grid-cols-3 gap-2">
              {getHalvesPresets(selectedTeam?.sport).map((label) => {
                const selected = state.halvesFormat === label;
                const pre = selected && !isAnswered("halves");
                return (
                  <button
                    key={label}
                    type="button"
                    onClick={() => {
                      markTouched("halves");
                      const mins = halvesToMinutes(label) ?? state.durationMin;
                      setState((s) => ({
                        ...s,
                        halvesFormat: label,
                        durationMin: mins,
                        step: s.step + 1,
                      }));
                    }}
                    className={cn(
                      "rounded-lg border-2 py-3 text-sm font-semibold transition-colors",
                      selected && !pre
                        ? "border-primary bg-primary/10 text-primary"
                        : pre
                          ? "border-border bg-card text-muted-foreground/60"
                          : "border-border bg-card hover:bg-muted/40",
                    )}
                  >
                    {formatHalvesLabel(label)}
                  </button>
                );
              })}
            </div>
            <div className="mt-3">
              <Label className="text-xs">
                {t("eventWizard.halvesManual", { defaultValue: "Autre format (ex. 3x30)" })}
              </Label>
              <Input
                placeholder="3x30"
                value={
                  state.halvesFormat &&
                  !getHalvesPresets(selectedTeam?.sport).includes(state.halvesFormat)
                    ? state.halvesFormat
                    : ""
                }
                onChange={(e) => {
                  markTouched("halves");
                  const v = e.target.value.trim();
                  const mins = halvesToMinutes(v);
                  setState((s) => ({
                    ...s,
                    halvesFormat: v || undefined,
                    ...(mins ? { durationMin: mins } : {}),
                  }));
                }}
              />
            </div>
            <Button variant="ghost" size="sm" className="w-full mt-2 text-xs" onClick={() => go(1)}>
              {t("eventWizard.skip", { defaultValue: "Passer" })}
            </Button>
          </StepQuestion>
        )}

        {current === "gameformat" && (
          <StepQuestion title={t("eventWizard.q.gameformat", { defaultValue: "Format de jeu ?" })}>
            <div className="grid grid-cols-3 gap-2">
              {getGameFormatPresets(selectedTeam?.sport).map((g) => {
                const selected = state.gameFormat === g;
                const pre = selected && !isAnswered("gameformat");
                return (
                  <button
                    key={g}
                    type="button"
                    onClick={() => {
                      markTouched("gameformat");
                      answer("gameFormat", g);
                    }}
                    className={cn(
                      "rounded-lg border-2 py-3 text-sm font-semibold transition-colors",
                      selected && !pre
                        ? "border-primary bg-primary/10 text-primary"
                        : pre
                          ? "border-border bg-card text-muted-foreground/60"
                          : "border-border bg-card hover:bg-muted/40",
                    )}
                  >
                    {formatGameFormatLabel(g)}
                  </button>
                );
              })}
            </div>
            <div className="mt-3">
              <Label className="text-xs">
                {t("eventWizard.gameformatManual", { defaultValue: "Autre format" })}
              </Label>
              <Input
                placeholder="6v6"
                value={
                  state.gameFormat &&
                  !getGameFormatPresets(selectedTeam?.sport).includes(state.gameFormat)
                    ? state.gameFormat
                    : ""
                }
                onChange={(e) => {
                  markTouched("gameformat");
                  patch("gameFormat", e.target.value.trim() || undefined);
                }}
              />
            </div>
            <Button variant="ghost" size="sm" className="w-full mt-2 text-xs" onClick={() => go(1)}>
              {t("eventWizard.skip", { defaultValue: "Passer" })}
            </Button>
          </StepQuestion>
        )}

        {current === "meetingpoint" && (
          <StepQuestion
            title={t("eventWizard.q.meetingpoint", {
              defaultValue: "Adresse et heure de rendez-vous",
            })}
          >
            <Label className="text-xs">
              {t("eventWizard.meeting.address", { defaultValue: "Adresse" })}
            </Label>
            <LocationAutocomplete
              value={state.meetingPoint ?? ""}
              onChange={(v) => patch("meetingPoint", v)}
              placeholder={t("eventWizard.meeting.addressPlaceholder", {
                defaultValue: "Adresse du point de rendez-vous",
              })}
            />
            <Label className="text-xs mt-2">
              {t("eventWizard.meeting.time", { defaultValue: "Heure de rendez-vous" })}
            </Label>
            <TimePicker
              value={state.meetingTime ?? ""}
              onChange={(v: string) => patch("meetingTime", v)}
              className="w-full"
            />
            <Button
              className="w-full mt-2"
              disabled={!state.meetingPoint?.trim()}
              onClick={() => go(1)}
            >
              {t("eventWizard.continue", { defaultValue: "Continuer" })}
            </Button>
          </StepQuestion>
        )}

        {current === "meetingtime" && (
          <StepQuestion
            title={t("eventWizard.q.meetingtime", { defaultValue: "Heure de rendez-vous ?" })}
          >
            <p className="text-xs text-muted-foreground">
              {t("eventWizard.meetingtimeHint", {
                defaultValue: "À quelle heure les joueurs doivent-ils se présenter ? (facultatif)",
              })}
            </p>
            <TimePicker
              value={state.meetingTime ?? ""}
              onChange={(v: string) => patch("meetingTime", v)}
              className="w-full"
            />
            <Button className="w-full mt-2" onClick={() => go(1)}>
              {t("eventWizard.continue", { defaultValue: "Continuer" })}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-xs"
              onClick={() => {
                patch("meetingTime", undefined);
                go(1);
              }}
            >
              {t("eventWizard.skip", { defaultValue: "Passer" })}
            </Button>
          </StepQuestion>
        )}

        {current === "opponent" && (
          <StepQuestion
            title={t("eventWizard.q.opponent", { defaultValue: "Contre quelle équipe ?" })}
          >
            <Input
              autoFocus
              value={state.opponent ?? ""}
              onChange={(e) => patch("opponent", e.target.value)}
              placeholder="FC Voisin"
            />
            <Button
              className="w-full mt-2"
              disabled={!state.opponent?.trim()}
              onClick={() => go(1)}
            >
              {t("eventWizard.continue", { defaultValue: "Continuer" })}
            </Button>
          </StepQuestion>
        )}

        {current === "official" && (
          <StepQuestion title={t("eventWizard.q.official", { defaultValue: "Type de match ?" })}>
            <DoorButton
              icon="🤝"
              label={t("eventWizard.officialNo", { defaultValue: "Amical" })}
              subtitle="Sans enjeu officiel"
              color="green"
              active={state.competitionType === "friendly"}
              onClick={() => {
                markTouched("official");
                patch("isOfficial", false);
                patch("competitionType", "friendly");
                patch("competitionName", undefined);
              }}
            />
            <DoorButton
              icon="🏆"
              label={t("eventWizard.officialChampionship", { defaultValue: "Championnat" })}
              subtitle="Compte au classement"
              color="amber"
              active={state.competitionType === "championship"}
              onClick={() => {
                markTouched("official");
                patch("isOfficial", true);
                patch("competitionType", "championship");
                const fromTeam = selectedTeam?.championship;
                if (!state.competitionName && fromTeam) patch("competitionName", fromTeam);
              }}
            />
            <DoorButton
              icon="🥇"
              label={t("eventWizard.officialCup", { defaultValue: "Coupe" })}
              subtitle="Match à élimination"
              color="red"
              active={state.competitionType === "cup"}
              onClick={() => {
                markTouched("official");
                patch("isOfficial", true);
                patch("competitionType", "cup");
              }}
            />
            {(state.competitionType === "championship" || state.competitionType === "cup") && (
              <div className="mt-2 space-y-1.5">
                <Label className="text-xs">
                  {t("eventWizard.competitionName", { defaultValue: "Nom de la compétition" })}
                </Label>
                <Input
                  value={state.competitionName ?? ""}
                  onChange={(e) => patch("competitionName", e.target.value)}
                  placeholder={t("eventWizard.competitionNamePlaceholder", {
                    defaultValue: "Ex: U15 D2, Coupe régionale…",
                  })}
                />
              </div>
            )}
            <Button className="w-full mt-2" disabled={!state.competitionType} onClick={() => go(1)}>
              {t("eventWizard.continue", { defaultValue: "Continuer" })}
            </Button>
          </StepQuestion>
        )}

        {current === "location" && (
          <StepQuestion
            title={
              state.type === "match"
                ? t("eventWizard.q.matchLocation", { defaultValue: "Lieu du match ?" })
                : t("eventWizard.q.location", { defaultValue: "Où ?" })
            }
          >
            <LocationAutocomplete
              value={state.location ?? ""}
              onChange={(v) => patch("location", v)}
              placeholder={
                state.type === "match"
                  ? t("eventWizard.matchLocationPlaceholder", {
                      defaultValue: "Stade / adresse du match",
                    })
                  : t("eventWizard.locationPlaceholder", { defaultValue: "Stade municipal" })
              }
            />

            <Button
              className="w-full mt-2"
              disabled={!state.location?.trim()}
              onClick={() => go(1)}
            >
              {t("eventWizard.continue", { defaultValue: "Continuer" })}
            </Button>
          </StepQuestion>
        )}

        {current === "convocation" && (
          <StepQuestion
            title={t("eventWizard.q.convocation", { defaultValue: "Convoquer les joueurs ?" })}
          >
            {(
              [
                [
                  "all",
                  "👥",
                  t("eventWizard.convoc.all", { defaultValue: "Toute l'équipe" }),
                  "Tout le monde reçoit",
                  "green",
                ],
                [
                  "selection",
                  "✋",
                  t("eventWizard.convoc.selection", { defaultValue: "Choisir les joueurs" }),
                  "Sélection manuelle",
                  "amber",
                ],
                [
                  "none",
                  "⏸️",
                  t("eventWizard.convoc.none", { defaultValue: "Pas maintenant" }),
                  "Brouillon, à envoyer plus tard",
                  "blue",
                ],
              ] as const
            ).map(([v, e, l, s, c]) => (
              <DoorButton
                key={v}
                icon={e}
                label={l}
                subtitle={s}
                color={c}
                active={state.convocScope === v}
                onClick={() => answer("convocScope", v)}
              />
            ))}
          </StepQuestion>
        )}

        {current === "carpool" && (
          <StepQuestion
            title={t("eventWizard.q.carpool", { defaultValue: "Activer le covoiturage ?" })}
          >
            <div
              className={cn(
                "flex items-center justify-between rounded-2xl border-[1.5px] px-3 py-3 transition-all",
                state.carpoolEnabled
                  ? "border-emerald-300 bg-gradient-to-br from-emerald-50 to-white"
                  : "border-muted bg-muted/40",
              )}
            >
              <div className="flex-1 min-w-0 pr-3">
                <div
                  className={cn(
                    "text-[13px] font-bold",
                    state.carpoolEnabled ? "text-emerald-900" : "text-foreground",
                  )}
                >
                  {t("eventWizard.carpoolLabel", { defaultValue: "Activer le covoiturage" })}
                </div>
                <div
                  className={cn(
                    "text-[11px] font-medium mt-0.5",
                    state.carpoolEnabled ? "text-emerald-600" : "text-muted-foreground",
                  )}
                >
                  Les familles s'organisent
                </div>
              </div>
              <Switch
                checked={!!state.carpoolEnabled}
                onCheckedChange={(v) => patch("carpoolEnabled", v)}
              />
            </div>
            <Button className="w-full mt-3" onClick={() => go(1)}>
              {t("eventWizard.continue", { defaultValue: "Continuer" })}
            </Button>
          </StepQuestion>
        )}

        {current === "comment" && (
          <StepQuestion
            title={t("eventWizard.q.comment", { defaultValue: "Un commentaire à ajouter ?" })}
          >
            <p className="text-xs text-muted-foreground">
              {t("eventWizard.commentHint", {
                defaultValue: "Facultatif — visible par les joueurs / parents.",
              })}
            </p>
            <Textarea
              value={state.description ?? ""}
              onChange={(e) => patch("description", e.target.value)}
              placeholder={t("eventWizard.commentPlaceholder", {
                defaultValue: "Prévoir tongs et serviette, paiement du tournoi, etc.",
              })}
              rows={4}
            />
            <Button className="w-full mt-2" onClick={() => go(1)}>
              {t("eventWizard.continue", { defaultValue: "Continuer" })}
            </Button>
          </StepQuestion>
        )}

        {current === "summary" && (
          <div className="space-y-3">
            <div className="text-center pt-2">
              <CheckCircle2 className="mx-auto h-10 w-10 text-primary" />
              <h3 className="mt-2 font-semibold">
                {t("eventWizard.readyTitle", { defaultValue: "Tout est prêt" })}
              </h3>
            </div>
            <SummaryCard
              state={state}
              title={title}
              teamName={selectedTeam?.name}
              seriesCount={seriesCount}
              t={t}
            />
          </div>
        )}
      </div>

      {/* CTA footer */}
      <div className="border-t border-border bg-card px-3 py-3 space-y-2">
        {current === "summary" ? (
          <>
            <div className="flex gap-2">
              <Button
                className="flex-1"
                disabled={createMut.isPending}
                onClick={() => createMut.mutate()}
              >
                {createMut.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  t("eventWizard.create", { defaultValue: "Créer" })
                )}
              </Button>
              {state.convocScope !== "none" && (
                <Button
                  className="flex-1"
                  variant="default"
                  disabled={createMut.isPending}
                  onClick={createAndConvocate}
                >
                  {t("eventWizard.createAndConvoke", { defaultValue: "Créer & convoquer" })}
                </Button>
              )}
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-xs"
              onClick={() => onOpenExpert(toEventFormInitial(state, title), state)}
            >
              <Settings2 className="h-3.5 w-3.5" />
              {t("eventWizard.expert", { defaultValue: "Réglages détaillés" })}
            </Button>
          </>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            className="w-full text-xs"
            onClick={() => onOpenExpert(toEventFormInitial(state, title), state)}
          >
            <Settings2 className="h-3.5 w-3.5" />
            {t("eventWizard.expert", { defaultValue: "Réglages détaillés" })}
          </Button>
        )}
      </div>
    </div>
  );

  function addMinutes(time: string, mins: number): string {
    const [h, m] = time.split(":").map(Number);
    const total = (h ?? 0) * 60 + (m ?? 0) + mins;
    const nh = Math.floor((total % (24 * 60)) / 60);
    const nm = total % 60;
    return `${String(nh).padStart(2, "0")}:${String(nm).padStart(2, "0")}`;
  }
}

// ---- Sub-components ----

function StepQuestion({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h3 className="sr-only">{title}</h3>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

type DoorColor = "green" | "blue" | "red" | "amber" | "purple" | "pink";

const DOOR_ICON_BG: Record<DoorColor, string> = {
  green: "bg-gradient-to-br from-emerald-100 to-emerald-200 text-emerald-700",
  blue: "bg-gradient-to-br from-blue-100 to-blue-200 text-blue-700",
  red: "bg-gradient-to-br from-rose-100 to-rose-200 text-rose-700",
  amber: "bg-gradient-to-br from-amber-100 to-amber-200 text-amber-700",
  purple: "bg-gradient-to-br from-violet-100 to-violet-200 text-violet-700",
  pink: "bg-gradient-to-br from-pink-100 to-pink-200 text-pink-700",
};

function DoorButton({
  icon,
  label,
  subtitle,
  onClick,
  active,
  color = "green",
}: {
  icon: string;
  label: string;
  subtitle?: string;
  onClick: () => void;
  active?: boolean;
  color?: DoorColor;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group relative w-full overflow-hidden flex items-center gap-3 rounded-2xl border-[1.5px] px-3 py-3 text-left transition-all duration-200 active:scale-[0.99]",
        active
          ? "border-emerald-300 bg-gradient-to-br from-emerald-50 to-white shadow-[0_8px_24px_-12px_rgba(29,122,69,0.35)]"
          : "border-muted bg-muted/40 hover:border-emerald-200 hover:bg-muted/60",
      )}
    >
      {/* Left accent bar on active (mockup: 3px gradient green) */}
      <span
        aria-hidden
        className={cn(
          "absolute left-0 top-0 bottom-0 w-[3px] bg-gradient-to-b from-[#1d7a45] to-[#2d9d5f] transition-all duration-200",
          active ? "opacity-100" : "opacity-0",
        )}
      />
      <span
        className={cn(
          "relative h-9 w-9 rounded-xl flex items-center justify-center text-lg shrink-0 transition-all",
          DOOR_ICON_BG[color],
        )}
      >
        {icon}
      </span>
      <span className="relative flex-1 min-w-0">
        <span
          className={cn(
            "block font-bold text-[13px] leading-tight truncate",
            active ? "text-emerald-900" : "text-foreground",
          )}
        >
          {label}
        </span>
        {subtitle && (
          <span
            className={cn(
              "block text-[11px] font-medium mt-0.5 truncate",
              active ? "text-emerald-600" : "text-muted-foreground",
            )}
          >
            {subtitle}
          </span>
        )}
      </span>
      <span
        aria-hidden
        className={cn(
          "relative shrink-0 h-[18px] w-[18px] rounded-full border-[1.5px] flex items-center justify-center transition-all",
          active
            ? "bg-gradient-to-br from-[#1d7a45] to-[#2d9d5f] border-transparent text-white"
            : "bg-background border-border opacity-70",
        )}
      >
        {active && <Check className="h-2.5 w-2.5" strokeWidth={3.5} />}
      </span>
    </button>
  );
}

function Chip({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-full border border-border bg-card px-3 py-1 text-xs font-medium transition-all hover:border-primary hover:bg-primary/5 active:scale-95"
    >
      {label}
    </button>
  );
}

/* ───────────── Premium gradient header ─────────────
 * Apple-meets-Blue-Lock: green gradient, soft halo, diagonal accent and
 * a per-step thematic Lucide glyph. Logic-free, purely presentational.
 */
const STEP_ICONS: Record<Step, LucideIcon> = {
  type: Sparkles,
  team: Users,
  when: CalendarDays,
  duration: Timer,
  halves: Hourglass,
  gameformat: Users,
  series: Repeat,
  homeaway: Home,
  meetingpoint: MapPin,
  meetingtime: Clock,
  opponent: Shield,
  official: Trophy,
  location: MapPin,
  convocation: Mail,
  carpool: Car,
  comment: MessageSquare,
  summary: CheckCircle2,
};

function WizardHero({
  step,
  stepIndex,
  totalSteps,
  eyebrow,
  title,
  titleMark,
  hint,
  progress,
  onClose,
}: {
  step: Step;
  stepIndex: number;
  totalSteps: number;
  eyebrow: string;
  title: string;
  titleMark?: string;
  hint: string;
  progress: number;
  onClose: () => void;
}) {
  const Icon = STEP_ICONS[step] ?? Sparkles;
  return (
    <div className="relative overflow-hidden rounded-t-xl text-primary-foreground">
      {/* Deep green gradient base (mockup: #0f4a26 → #1d7a45) */}
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(135deg, color-mix(in oklab, var(--primary) 70%, black) 0%, var(--primary) 100%)",
        }}
      />
      {/* Diagonal accent panel + light stripe + halo */}
      <svg
        aria-hidden
        viewBox="0 0 400 160"
        preserveAspectRatio="none"
        className="absolute inset-0 h-full w-full"
      >
        <path d="M250 0 L400 0 L400 160 L310 160 Z" fill="rgba(255,255,255,0.05)" />
        <ellipse cx="355" cy="55" rx="70" ry="55" fill="rgba(255,255,255,0.08)" />
        <line x1="220" y1="160" x2="400" y2="28" stroke="rgba(255,255,255,0.05)" strokeWidth="28" />
      </svg>

      <div className="relative z-10 px-4 pt-3 pb-3">
        <div className="flex items-center justify-between">
          <b className="text-[10px] uppercase tracking-[0.16em] opacity-70 font-semibold">
            {eyebrow}
          </b>
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-white/12 px-2 py-0.5 text-[10px] font-semibold tracking-wide opacity-80">
              {stepIndex} / {totalSteps}
            </span>
            <button
              type="button"
              onClick={onClose}
              className="flex h-6 w-6 items-center justify-center rounded-full bg-white/15 ring-1 ring-white/30 backdrop-blur-sm transition hover:bg-white/30 hover:ring-white/50"
              aria-label="Fermer"
            >
              <X className="h-3.5 w-3.5 text-white" strokeWidth={3} />
            </button>
          </div>
        </div>

        <div className="mt-1 flex items-end gap-2">
          <h2 className="flex-1 text-[22px] font-extrabold leading-[1.1] tracking-[-0.5px]">
            {title}
            {titleMark && <em className="not-italic ml-1 opacity-60">{titleMark}</em>}
          </h2>
          <div
            aria-hidden
            className="shrink-0 h-10 w-10 rounded-xl bg-white/12 ring-1 ring-white/25 backdrop-blur-sm flex items-center justify-center shadow-[0_6px_18px_-6px_rgba(0,0,0,0.4)]"
          >
            <Icon className="h-[19px] w-[19px] text-white" strokeWidth={2.25} />
          </div>
        </div>

        <p className="mt-1.5 text-[11.5px] leading-snug opacity-75 line-clamp-1">{hint}</p>

        <WizardProgress step={progress} total={totalSteps} variant="onPrimary" className="mt-2.5" />
      </div>
    </div>
  );
}

function LiveRecap({
  state,
  teamName,
  title,
  seriesCount,
  t,
}: {
  state: EventWizardState;
  teamName: string | undefined;
  title: string;
  seriesCount: number;
  t: (k: string, opt?: Record<string, unknown>) => string;
}) {
  const chips: string[] = [];
  if (state.type) chips.push(t(`events.types.${state.type === "other" ? "training" : state.type}`));
  if (teamName) chips.push(teamName);
  if (state.startDate) chips.push(format(new Date(`${state.startDate}T00:00:00`), "EEE d MMM"));
  if (state.startTime && state.startDate) chips.push(state.startTime);
  if (state.durationMin) chips.push(`${state.durationMin}min`);
  if (seriesCount > 0)
    chips.push(
      t("eventWizard.recap.series", { count: seriesCount, defaultValue: "série {{count}}" }),
    );
  if (state.type === "match" && state.isHome) chips.push(state.isHome === "home" ? "🏠" : "🚌");
  if (state.opponent) chips.push(`vs ${state.opponent}`);
  if (state.location) chips.push(`📍 ${state.location}`);
  if (chips.length === 0) return null;
  return (
    <div className="border-b border-border bg-muted/40 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold mb-1">
        {t("eventWizard.recap.title", { defaultValue: "Ton événement" })}
      </div>
      <div className="flex flex-wrap gap-1">
        {chips.map((c, i) => (
          <span
            key={i}
            className="rounded-full bg-background border border-border px-2 py-0.5 text-[11px]"
          >
            {c}
          </span>
        ))}
      </div>
    </div>
  );
}

function SummaryCard({
  state,
  title,
  teamName,
  seriesCount,
  t,
}: {
  state: EventWizardState;
  title: string;
  teamName: string | undefined;
  seriesCount: number;
  t: (k: string, opt?: Record<string, unknown>) => string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-1.5 text-sm">
      <div className="font-semibold text-base">{title}</div>
      {teamName && <div className="text-muted-foreground">{teamName}</div>}
      {state.startDate && (
        <div>
          📅 {format(new Date(`${state.startDate}T00:00:00`), "EEE d MMM")} · {state.durationMin} min
        </div>
      )}
      {state.meetingPoint && (
        <div>
          👥 {t("eventWizard.summary.meeting", { defaultValue: "RDV" })} :{" "}
          {state.meetingTime ? `${state.meetingTime} · ` : ""}
          {state.meetingPoint}
        </div>
      )}
      {state.location && (
        <div>
          📍 {t("eventWizard.summary.place", { defaultValue: "Lieu" })} :{" "}
          {state.startTime ? `${state.startTime} · ` : ""}
          {state.location}
        </div>
      )}
      {!state.location && !state.meetingPoint && state.startTime && (
        <div>🕒 {state.startTime}</div>
      )}
      {state.opponent && (
        <div>
          🆚 {state.opponent} ({state.isHome === "home" ? "🏠" : "🚌"})
        </div>
      )}
      {seriesCount > 0 && (
        <div className="text-primary font-semibold">
          {t("eventWizard.series.preview", {
            count: seriesCount,
            defaultValue: "Créer {{count}} entraînements",
          })}
        </div>
      )}
      <div className="text-muted-foreground text-xs pt-1">
        {t(`eventWizard.convoc.${state.convocScope}`, {
          defaultValue:
            state.convocScope === "all"
              ? "Toute l'équipe sera convoquée"
              : state.convocScope === "selection"
                ? "Sélection à faire"
                : "Pas de convocation",
        })}
      </div>
    </div>
  );
}

// Unused but imported to keep tree-shaking happy if checkbox needed later
void Checkbox;
