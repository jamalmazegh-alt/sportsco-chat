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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { TimePicker } from "@/components/ui/time-picker";
import { LocationAutocomplete } from "@/components/location-autocomplete";
import { cn } from "@/lib/utils";
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
import {
  readDraft,
  writeDraft,
  clearDraft,
  draftHasProgress,
} from "./event-wizard-draft";

type Team = { id: string; name: string };

interface Props {
  teams: Team[];
  onClose: () => void;
  onCreated: (eventId?: string) => void;
  /** Hand-off to EventFormSheet pre-filled with current answers. */
  onOpenExpert: (initial: Record<string, unknown>) => void;
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
  | "opponent"
  | "official"
  | "location"
  | "convocation"
  | "carpool"
  | "summary";

export function EventWizard({ teams, onClose, onCreated, onOpenExpert }: Props) {
  const { t, i18n } = useTranslation();
  const dateLocale = i18n.language?.startsWith("fr") ? frLocale : enUS;
  const qc = useQueryClient();
  const navigate = useNavigate();
  const createSeriesFn = useServerFn(createTrainingSeries);
  const createEventFn = useServerFn(createEvent);

  const [state, setState] = useState<EventWizardState>(() => defaultState());
  const [draftOffered, setDraftOffered] = useState(false);
  const [hasDraftPrompt, setHasDraftPrompt] = useState(false);
  const screenRef = useRef<HTMLDivElement>(null);

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
    s.push("when");
    if (state.type === "match") {
      s.push("halves", "gameformat", "homeaway");
      if (state.isHome === "away") s.push("meetingpoint");
      s.push("opponent", "official");
    } else {
      s.push("duration");
    }
    // No location step for matches (home: implicit; away: address captured in meetingpoint step)
    if (state.type !== "match") s.push("location");
    s.push("convocation");
    if (state.type === "match" && state.isHome === "away") s.push("carpool");
    if (state.type === "training") s.push("carpool");
    s.push("summary");
    return s;
  }, [state.type, state.isHome]);

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
        weekdays: mode === "weekly_one" ? [wd] : s.recurrence?.weekdays ?? [wd],
        startsOn: s.recurrence?.startsOn ?? today,
        endsOn: s.recurrence?.endsOn ?? format(addDays(startOfDate, 30 * 9), "yyyy-MM-dd"),
      },
    }));
  }

  function toggleWeekday(wd: number) {
    setState((s) => {
      const cur = s.recurrence?.weekdays ?? [];
      const next = cur.includes(wd) ? cur.filter((w) => w !== wd) : [...cur, wd].sort();
      return { ...s, recurrence: { ...(s.recurrence ?? { mode: "weekly_multi", weekdays: next }), weekdays: next } };
    });
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
            carpoolEnabled:
              typeof state.carpoolEnabled === "boolean" ? state.carpoolEnabled : null,
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
    gameformat: t("eventWizard.hint.gameformat", { defaultValue: "Combien de joueurs sur le terrain ?" }),
    series: t("eventWizard.hint.series", { defaultValue: "Unique ou toute la saison ?" }),
    homeaway: t("eventWizard.hint.homeaway", { defaultValue: "À domicile ou en déplacement ?" }),
    meetingpoint: t("eventWizard.hint.meetingpoint", { defaultValue: "Adresse et heure de rendez-vous." }),
    opponent: t("eventWizard.hint.opponent", { defaultValue: "L'adversaire." }),
    official: t("eventWizard.hint.official", { defaultValue: "Officiel ou amical ?" }),
    location: t("eventWizard.hint.location", { defaultValue: "Où ça se passe ?" }),
    convocation: t("eventWizard.hint.convocation", { defaultValue: "À qui on envoie ?" }),
    carpool: t("eventWizard.hint.carpool", { defaultValue: "Activer le covoiturage ?" }),
    summary: t("eventWizard.hint.summary", { defaultValue: "Tout est prêt." }),
  };

  // ---- Render ----
  return (
    <div className="flex flex-col h-full max-h-[88vh]">
      {/* Header guide (sticky) */}
      <div className="rounded-t-xl bg-gradient-to-br from-primary to-primary/80 px-4 pt-3 pb-3 text-primary-foreground">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4" />
          <b className="text-sm">{t("eventWizard.title", { defaultValue: "Nouvel événement" })}</b>
          <span className="ml-auto text-[11px] opacity-80">
            {Math.min(state.step + 1, steps.length)}/{steps.length}
          </span>
        </div>
        <p className="mt-1 text-[12px] leading-snug opacity-90 min-h-[28px]">{hints[current]}</p>
        <div className="mt-2 flex gap-1">
          {steps.map((_, i) => (
            <div
              key={i}
              className={cn(
                "h-1 flex-1 rounded-full",
                i <= state.step ? "bg-white" : "bg-white/25",
              )}
            />
          ))}
        </div>
      </div>

      {/* Live recap chips */}
      <LiveRecap state={state} teamName={selectedTeam?.name} title={title} seriesCount={seriesCount} t={t} />

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
          <StepQuestion title={t("eventWizard.q.type", { defaultValue: "Quel type d'événement ?" })}>
            {(
              [
                ["training", "⚽", t("events.types.training")],
                ["match", "🆚", t("events.types.match")],
                ["meeting", "👥", t("events.types.meeting")],
                ["other", "📌", t("events.types.other", { defaultValue: "Autre" })],
              ] as const
            ).map(([v, e, l]) => (
              <DoorButton key={v} icon={e} label={l} active={state.type === v} onClick={() => selectType(v)} />
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
              teams.map((tm) => (
                <DoorButton
                  key={tm.id}
                  icon="👥"
                  label={tm.name}
                  active={state.teamId === tm.id}
                  onClick={() => answer("teamId", tm.id)}
                />
              ))
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
                      ? format(new Date(`${state.startDate}T00:00:00`), "EEE d MMM", { locale: dateLocale })
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
              <TimePicker value={state.startTime} onChange={(v: string) => patch("startTime", v)} className="w-full" />
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
              {[60, 90, 105, 120, 150, 180].map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => answer("durationMin", m)}
                  className={cn(
                    "rounded-lg border-2 py-3 text-sm font-semibold transition-colors",
                    state.durationMin === m
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-card hover:bg-muted/40",
                  )}
                >
                  {m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? m % 60 : ""}` : `${m} min`}
                </button>
              ))}
            </div>
          </StepQuestion>
        )}

        {current === "series" && (
          <StepQuestion title={t("eventWizard.q.series", { defaultValue: "Cet entraînement fait-il partie d'une série ?" })}>
            {(
              [
                ["single", t("eventWizard.series.single", { defaultValue: "Événement unique" })],
                ["weekly_one", t("eventWizard.series.weeklyOne", { defaultValue: "Toutes les semaines (1 jour)" })],
                ["weekly_multi", t("eventWizard.series.weeklyMulti", { defaultValue: "Plusieurs jours / semaine" })],
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
                    {t("eventWizard.series.daysOfWeek", { defaultValue: "Jours de la semaine" })}
                  </Label>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {[1, 2, 3, 4, 5, 6, 0].map((wd) => (
                      <button
                        key={wd}
                        type="button"
                        onClick={() => toggleWeekday(wd)}
                        className={cn(
                          "h-9 w-10 rounded-md border text-xs font-semibold",
                          recurrence.weekdays.includes(wd)
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
                      {t("eventWizard.series.startsOn", { defaultValue: "Début" })}
                    </Label>
                    <Input
                      type="date"
                      value={recurrence.startsOn ?? ""}
                      onChange={(e) =>
                        setState((s) => ({
                          ...s,
                          recurrence: { ...(s.recurrence ?? { mode: "weekly_one", weekdays: [] }), startsOn: e.target.value },
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
                          recurrence: { ...(s.recurrence ?? { mode: "weekly_one", weekdays: [] }), endsOn: e.target.value },
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
          <StepQuestion title={t("eventWizard.q.homeaway", { defaultValue: "Domicile ou extérieur ?" })}>
            <DoorButton icon="🏠" label={t("eventWizard.home", { defaultValue: "Domicile" })} active={state.isHome === "home"} onClick={() => answer("isHome", "home")} />
            <DoorButton icon="🚌" label={t("eventWizard.away", { defaultValue: "Extérieur" })} active={state.isHome === "away"} onClick={() => answer("isHome", "away")} />
          </StepQuestion>
        )}

        {current === "meetingpoint" && (
          <StepQuestion title={t("eventWizard.q.meetingpoint", { defaultValue: "Point de rendez-vous ?" })}>
            {([
              ["stadium", "📍", t("eventWizard.meeting.stadium", { defaultValue: "Stade habituel" })],
              ["club_parking", "🅿️", t("eventWizard.meeting.parking", { defaultValue: "Parking du club" })],
              ["custom", "📌", t("eventWizard.meeting.custom", { defaultValue: "Adresse personnalisée" })],
            ] as const).map(([v, e, l]) => (
              <DoorButton key={v} icon={e} label={l} active={state.meetingPoint === v} onClick={() => answer("meetingPoint", v)} />
            ))}
          </StepQuestion>
        )}

        {current === "opponent" && (
          <StepQuestion title={t("eventWizard.q.opponent", { defaultValue: "Contre quelle équipe ?" })}>
            <Input
              autoFocus
              value={state.opponent ?? ""}
              onChange={(e) => patch("opponent", e.target.value)}
              placeholder="FC Voisin"
            />
            <Button className="w-full mt-2" disabled={!state.opponent?.trim()} onClick={() => go(1)}>
              {t("eventWizard.continue", { defaultValue: "Continuer" })}
            </Button>
          </StepQuestion>
        )}

        {current === "official" && (
          <StepQuestion title={t("eventWizard.q.official", { defaultValue: "Officiel ou amical ?" })}>
            <DoorButton
              icon="🏆"
              label={t("eventWizard.officialYes", { defaultValue: "Officiel" })}
              active={state.competitionType === "championship"}
              onClick={() => {
                patch("isOfficial", true);
                answer("competitionType", "championship");
              }}
            />
            <DoorButton
              icon="🤝"
              label={t("eventWizard.officialNo", { defaultValue: "Amical" })}
              active={state.competitionType === "friendly"}
              onClick={() => {
                patch("isOfficial", false);
                answer("competitionType", "friendly");
              }}
            />
          </StepQuestion>
        )}

        {current === "location" && (
          <StepQuestion title={t("eventWizard.q.location", { defaultValue: "Où ?" })}>
            <LocationAutocomplete
              value={state.location ?? ""}
              onChange={(v) => patch("location", v)}
              placeholder={t("eventWizard.locationPlaceholder", { defaultValue: "Stade municipal" })}
            />
            <Button className="w-full mt-2" disabled={!state.location?.trim()} onClick={() => go(1)}>
              {t("eventWizard.continue", { defaultValue: "Continuer" })}
            </Button>
          </StepQuestion>
        )}

        {current === "convocation" && (
          <StepQuestion title={t("eventWizard.q.convocation", { defaultValue: "Convoquer les joueurs ?" })}>
            {([
              ["all", "👥", t("eventWizard.convoc.all", { defaultValue: "Toute l'équipe" })],
              ["selection", "✋", t("eventWizard.convoc.selection", { defaultValue: "Choisir les joueurs" })],
              ["none", "⏸️", t("eventWizard.convoc.none", { defaultValue: "Pas maintenant" })],
            ] as const).map(([v, e, l]) => (
              <DoorButton key={v} icon={e} label={l} active={state.convocScope === v} onClick={() => answer("convocScope", v)} />
            ))}
          </StepQuestion>
        )}

        {current === "carpool" && (
          <StepQuestion title={t("eventWizard.q.carpool", { defaultValue: "Activer le covoiturage ?" })}>
            <div className="flex items-center justify-between rounded-xl border border-border bg-card px-3 py-3">
              <span className="text-sm">
                {t("eventWizard.carpoolLabel", { defaultValue: "Les parents proposent/réservent des places" })}
              </span>
              <Switch checked={!!state.carpoolEnabled} onCheckedChange={(v) => patch("carpoolEnabled", v)} />
            </div>
            <Button className="w-full mt-3" onClick={() => go(1)}>
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
            <SummaryCard state={state} title={title} teamName={selectedTeam?.name} seriesCount={seriesCount} t={t} />
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
                {createMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : t("eventWizard.create", { defaultValue: "Créer" })}
              </Button>
              {state.convocScope !== "none" && state.type !== "meeting" && (
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
              onClick={() => onOpenExpert(toEventFormInitial(state, title))}
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
            onClick={() => onOpenExpert(toEventFormInitial(state, title))}
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
      <h3 className="text-base font-semibold">{title}</h3>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function DoorButton({
  icon,
  label,
  onClick,
  active,
}: {
  icon: string;
  label: string;
  onClick: () => void;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-3 rounded-xl border-2 px-3 py-3 text-left transition-colors",
        active ? "border-primary bg-primary/10" : "border-border bg-card hover:border-primary/50",
      )}
    >
      <span className="text-xl">{icon}</span>
      <span className="font-medium text-sm flex-1">{label}</span>
    </button>
  );
}

function Chip({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-full border border-border bg-card px-3 py-1 text-xs font-medium hover:border-primary"
    >
      {label}
    </button>
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
  if (seriesCount > 0) chips.push(t("eventWizard.recap.series", { count: seriesCount, defaultValue: "série {{count}}" }));
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
          <span key={i} className="rounded-full bg-background border border-border px-2 py-0.5 text-[11px]">
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
        <div>📅 {format(new Date(`${state.startDate}T00:00:00`), "EEE d MMM")} · {state.startTime} · {state.durationMin} min</div>
      )}
      {state.location && <div>📍 {state.location}</div>}
      {state.opponent && <div>🆚 {state.opponent} ({state.isHome === "home" ? "🏠" : "🚌"})</div>}
      {seriesCount > 0 && (
        <div className="text-primary font-semibold">
          {t("eventWizard.series.preview", { count: seriesCount, defaultValue: "Créer {{count}} entraînements" })}
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
