import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LocationAutocomplete } from "@/components/location-autocomplete";
import { VenuePicker, type VenuePickerValue } from "@/components/events/venue-picker";
import { useAuth } from "@/lib/auth-context";

import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { WizardProgress } from "@/components/wizard/wizard-primitives";
import { createTrainingSeries } from "@/lib/training-series.functions";
import { createEvent } from "@/lib/events/events.functions";
import {
  setMeetingAttendees,
  previewMeetingAttendeesList,
} from "@/lib/meetings/meetings.functions";
import {
  AudiencePickerBody,
  useAudienceState,
  type AudienceCtx,
  type AudienceState,
  type PreassignedPerson,
  type TeamKind,
} from "@/components/needs/audience-picker";
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
  | "name"
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
  | "audience"
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

/** Build audience selectors from the wizard's serialized meeting audience draft. */
function buildMeetingAudiencesFromDraft(
  aud: NonNullable<EventWizardState["meetingAudience"]>,
  eventId: string,
): Array<Record<string, unknown>> {
  const scalarNeedsEvent = new Set(["convoked_players", "convoked_parents"]);
  const list: Array<Record<string, unknown>> = [];
  for (const key of aud.scalar) {
    if (scalarNeedsEvent.has(key)) list.push({ type: key, event_id: eventId });
    else list.push({ type: key });
  }
  for (const gid of aud.groupIds) list.push({ type: "club_group", group_id: gid });
  for (const tp of aud.teamPicks) list.push({ type: tp.kind, team_id: tp.team_id });
  if (aud.category.trim()) list.push({ type: "category_educators", category: aud.category.trim() });
  return list;
}

/** Shared hook: preview de la liste des convoqués d'une réunion interne
 *  (utilisé à la fois par l'étape "Qui participe ?" et par le récap final). */
function useMeetingAttendeesPreview(
  clubId: string | null | undefined,
  aud: EventWizardState["meetingAudience"] | null | undefined,
) {
  const previewFn = useServerFn(previewMeetingAttendeesList);
  const payload = useMemo(() => {
    const draft = aud ?? {
      scalar: [] as string[],
      groupIds: [] as string[],
      teamPicks: [] as Array<{ team_id: string; kind: TeamKind }>,
      category: "",
      preassigned: [] as PreassignedPerson[],
    };
    const selectors = buildMeetingAudiencesFromDraft(
      draft as NonNullable<EventWizardState["meetingAudience"]>,
      "00000000-0000-0000-0000-000000000000",
    );
    const manualUserIds = (draft.preassigned ?? []).map((p) => p.user_id);
    return { selectors, manualUserIds };
  }, [aud]);
  const hasAny =
    (aud?.scalar?.length ?? 0) > 0 ||
    (aud?.groupIds?.length ?? 0) > 0 ||
    (aud?.teamPicks?.length ?? 0) > 0 ||
    ((aud?.category ?? "").trim() ?? "").length > 0 ||
    (aud?.preassigned?.length ?? 0) > 0;
  const query = useQuery({
    queryKey: ["meeting-preview-list", clubId, payload.selectors, payload.manualUserIds],
    enabled: Boolean(clubId) && hasAny,
    queryFn: () =>
      previewFn({
        data: {
          club_id: clubId!,
          audiences: payload.selectors,
          manual_user_ids: payload.manualUserIds,
        },
      }),
  });
  return { hasAny, query };
}

export function EventWizard({ teams, onClose, onCreated, onOpenExpert, initialState }: Props) {
  const { t, i18n } = useTranslation();
  const dateLocale = i18n.language?.startsWith("fr") ? frLocale : enUS;
  const qc = useQueryClient();
  const navigate = useNavigate();
  const createSeriesFn = useServerFn(createTrainingSeries);
  const createEventFn = useServerFn(createEvent);
  const setMeetingAttendeesFn = useServerFn(setMeetingAttendees);
  const { activeClubId } = useAuth();

  const [state, setState] = useState<EventWizardState>(() => initialState ?? defaultState());

  function applyVenuePick(v: VenuePickerValue | null) {
    if (!v) return;
    setState((s) => ({
      ...s,
      venueId: v.venueId,
      facilityId: v.facilityId,
      location: v.location,
      locationUrl: v.locationUrl,
    }));
  }

  /** Enumerate dates (yyyy-mm-dd) from startDate to endDate inclusive. */
  function enumerateDays(startDate?: string, endDate?: string): string[] {
    if (!startDate || !endDate || endDate < startDate) return [];
    const out: string[] = [];
    const cur = new Date(`${startDate}T00:00:00`);
    const end = new Date(`${endDate}T00:00:00`);
    while (cur <= end) {
      out.push(format(cur, "yyyy-MM-dd"));
      cur.setDate(cur.getDate() + 1);
    }
    return out;
  }

  const [perDaySchedule, setPerDaySchedule] = useState(false);

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
    const s: Step[] = ["type"];
    // Meetings keep the team step, but with an extra "Internal meeting" tile
    // that resolves to the club's internal transverse team.
    s.push("team");
    // "Other" events: ask for a name up-front (e.g. camp/stage title).
    if (state.type === "other") s.push("name");
    // Meetings need a title too (no team-derived default when internal).
    if (state.type === "meeting") s.push("name");
    // Training/other: ask recurrence early, right after team.
    if (state.type === "training" || state.type === "other") s.push("series");
    const isRecurring =
      (state.type === "training" || state.type === "other") &&
      !!state.recurrence &&
      state.recurrence.mode !== "single" &&
      state.recurrence.mode !== "multi_day";
    s.push("when");
    if (state.type === "match") {
      s.push("halves", "gameformat", "homeaway");
      // Ask the venue/field right after home/away — only when at home.
      if (state.isHome === "home") s.push("location");
      if (state.isHome === "away") s.push("places");
      s.push("opponent", "official");
    } else if (!isRecurring) {
      // "Other": no separate duration step — end time is captured in the "when" step.
      if (state.type !== "other") s.push("duration");
      // "Other" events (e.g. camps): ask home/away for a proper location choice.
      if (state.type === "other") s.push("homeaway");
    }
    if (state.type === "training" && !isRecurring) {
      s.push("meetingtime");
    }
    // Recurring trainings: only day + time + duration, no extra steps.
    if (!isRecurring) {
      if (state.type !== "match") s.push("location");
      // Meetings: ask who to invite (optional) instead of the convocation flow.
      if (state.type === "meeting" && state.meetingScope === "internal") s.push("audience");
      else s.push("convocation");
      if (state.type === "match" && state.isHome === "away") s.push("carpool");
      if (state.type === "training") s.push("carpool");
      s.push("comment");
    }
    s.push("summary");
    return s;
  }, [state.type, state.isHome, state.recurrence, state.meetingScope]);

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

  // Internal meetings: resolve the club's internal transverse team on demand.
  // Only when the user explicitly picked the "Réunion interne" option.
  useEffect(() => {
    if (
      state.type !== "meeting" ||
      state.meetingScope !== "internal" ||
      state.teamId ||
      !activeClubId
    ) {
      return;
    }
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.rpc("get_or_create_internal_team", {
        _club_id: activeClubId,
      });
      if (cancelled || error || !data) return;
      setState((s) => ({ ...s, teamId: data as string }));
    })();
    return () => {
      cancelled = true;
    };
  }, [state.type, state.meetingScope, state.teamId, activeClubId]);

  const selectedTeam = teams.find((tm) => tm.id === state.teamId);
  const title = autoTitle(state, selectedTeam?.name, t);

  // Active championships for the current team (championship match dropdown).
  const { data: championships = [], isLoading: champsLoading } = useQuery({
    queryKey: ["team-championships", state.teamId, "active"],
    enabled: Boolean(state.teamId) && state.type === "match",
    queryFn: async () => {
      const { data, error } = await supabase
        .from("team_championships" as never)
        .select("id, name, season_label")
        .eq("team_id", state.teamId)
        .eq("is_active", true)
        .order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; name: string; season_label: string | null }>;
    },
  });

  // If the currently selected championship no longer belongs to the selected
  // team (e.g. user changed team), clear it.
  useEffect(() => {
    if (
      state.competitionType === "championship" &&
      state.championshipId &&
      championships.length > 0 &&
      !championships.some((c) => c.id === state.championshipId)
    ) {
      setState((s) => ({ ...s, championshipId: null, competitionName: undefined }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.teamId, championships.length]);

  function answer<K extends keyof EventWizardState>(k: K, v: EventWizardState[K]) {
    setState((s) => ({ ...s, [k]: v, step: s.step + 1 }));
  }

  function selectType(type: WizardEventType) {
    setState((s) => ({
      ...s,
      type,
      durationMin: defaultDuration(type),
      startTime: s.startTime || defaultStartTime(type),
      // Meetings use the dedicated attendees table, not player convocations.
      convocScope: type === "meeting" ? "none" : s.convocScope,
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
      setState((s) => ({
        ...s,
        recurrence: { mode, weekdays: [] },
        endDate: undefined,
        step: s.step + 1,
      }));
      return;
    }
    if (mode === "multi_day") {
      // Multi-day = single event with a start + end date. No weekly recurrence.
      // Seed friendly defaults for camps/stages: 10:00 → 16:00.
      setState((s) => ({
        ...s,
        recurrence: { mode, weekdays: [] },
        startTime:
          s.startTime && s.startTime !== defaultStartTime((s.type as WizardEventType) || "other")
            ? s.startTime
            : "10:00",
        endTime: s.endTime ?? "16:00",
      }));
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
    recurrence.mode !== "multi_day" &&
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

      // Meetings with "internal" scope: resolve the club's internal team at
      // submit time so it also works even if the effect hasn't landed yet.
      let workingState = state;
      if (
        state.type === "meeting" &&
        state.meetingScope === "internal" &&
        !state.teamId &&
        activeClubId
      ) {
        const { data: internalId, error: rpcErr } = await supabase.rpc(
          "get_or_create_internal_team",
          { _club_id: activeClubId },
        );
        if (rpcErr || !internalId) throw new Error(rpcErr?.message ?? "internal_team_failed");
        workingState = { ...state, teamId: internalId as string };
        setState(workingState);
      }

      // Single event — goes through the shared createEvent server fn (no local insert).
      const input = toEventPayloadInput(workingState, title);
      if (!input) throw new Error("missing-fields");
      const { id } = await createEventFn({ data: input });

      // Meetings: if the user picked an audience, register attendees now.
      if (
        workingState.type === "meeting" &&
        workingState.meetingScope === "internal" &&
        workingState.meetingAudience
      ) {
        const aud = workingState.meetingAudience;
        const hasAny =
          aud.scalar.length > 0 ||
          aud.groupIds.length > 0 ||
          aud.teamPicks.length > 0 ||
          aud.category.trim().length > 0 ||
          aud.preassigned.length > 0;
        if (hasAny) {
          const selectors = buildMeetingAudiencesFromDraft(aud, id);
          try {
            await setMeetingAttendeesFn({
              data: {
                event_id: id,
                audiences: selectors,
                manual_user_ids: aud.preassigned.map((p) => p.user_id),
              },
            });
          } catch (e) {
            console.error("[EventWizard] setMeetingAttendees failed", e);
          }
        }
      }

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
          }),
        );
        onCreated();
      } else {
        toast.success(t("events.published"), {
          action: {
            label: t("staffAssignment.assignNow"),
            onClick: () => {
              navigate({
                to: "/events/$eventId",
                params: { eventId: res.eventId },
              });
            },
          },
        });
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
    type: t("eventWizard.hint.type"),
    team: t("eventWizard.hint.team"),
    name: t("eventWizard.hint.name"),
    when: t("eventWizard.hint.when"),
    duration: t("eventWizard.hint.duration"),
    halves: t("eventWizard.hint.halves"),
    gameformat: t("eventWizard.hint.gameformat"),
    series: t("eventWizard.hint.series"),
    homeaway: t("eventWizard.hint.homeaway"),
    meetingpoint: t("eventWizard.hint.meetingpoint"),
    meetingtime: t("eventWizard.hint.meetingtime"),
    places: t("eventWizard.hint.places"),
    opponent: t("eventWizard.hint.opponent"),
    official: t("eventWizard.hint.official"),
    location: t("eventWizard.hint.location"),
    convocation: t("eventWizard.hint.convocation"),
    audience: t("eventWizard.hint.audience"),
    carpool: t("eventWizard.hint.carpool"),
    comment: t("eventWizard.hint.comment"),
    summary: t("eventWizard.hint.summary"),
  };

  // Short dramatic step titles (mockup style — "Où ?", "Contre qui ?"). The "?" / "!"
  // is rendered as <em> with reduced opacity in the hero.
  const stepTitles: Record<Step, { text: string; mark?: string }> = {
    type: { text: t("eventWizard.qShort.type"), mark: "?" },
    team: { text: t("eventWizard.qShort.team"), mark: "?" },
    name: { text: t("eventWizard.qShort.name"), mark: "?" },
    when: { text: t("eventWizard.qShort.when"), mark: "?" },
    duration: {
      text: t("eventWizard.qShort.duration"),
      mark: "?",
    },
    halves: { text: t("eventWizard.qShort.halves"), mark: "?" },
    gameformat: {
      text: t("eventWizard.qShort.gameformat"),
      mark: "?",
    },
    series: { text: t("eventWizard.qShort.series"), mark: "?" },
    homeaway: {
      text: t("eventWizard.qShort.homeaway"),
      mark: "?",
    },
    meetingpoint: {
      text: t("eventWizard.qShort.meetingpoint"),
      mark: "?",
    },
    meetingtime: {
      text: t("eventWizard.qShort.meetingtime"),
      mark: "?",
    },
    places: {
      text: t("eventWizard.qShort.places"),
      mark: "?",
    },
    opponent: { text: t("eventWizard.qShort.opponent"), mark: "?" },
    official: { text: t("eventWizard.qShort.official"), mark: "?" },
    location: { text: t("eventWizard.qShort.location"), mark: "?" },
    convocation: {
      text: t("eventWizard.qShort.convocation"),
      mark: "?",
    },
    audience: {
      text: t("eventWizard.qShort.audience"),
      mark: "?",
    },
    carpool: { text: t("eventWizard.qShort.carpool"), mark: "?" },
    comment: { text: t("eventWizard.qShort.comment"), mark: "?" },
    summary: {
      text: t("eventWizard.qShort.summary"),
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
        eyebrow={t("eventWizard.title")}
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
          <span className="flex-1">{t("eventWizard.draftPrompt")}</span>
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
            {t("eventWizard.resume")}
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
            {t("eventWizard.back")}
          </Button>
        )}

        {current === "type" && (
          <StepQuestion title={t("eventWizard.q.type")}>
            {(
              [
                [
                  "training",
                  "⚽",
                  t("events.types.training"),
                  t("eventWizard.typeSubtitle.training"),
                  "green",
                ],
                [
                  "match",
                  "🆚",
                  t("events.types.match"),
                  t("eventWizard.typeSubtitle.match"),
                  "red",
                ],
                [
                  "meeting",
                  "👥",
                  t("events.types.meeting"),
                  t("eventWizard.typeSubtitle.meeting"),
                  "blue",
                ],
                [
                  "other",
                  "📌",
                  t("events.types.other"),
                  t("eventWizard.typeSubtitle.other"),
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
          <StepQuestion title={t("eventWizard.q.team")}>
            {teams.length === 0 && state.type !== "meeting" ? (
              <p className="text-sm text-muted-foreground">{t("eventWizard.noTeams")}</p>
            ) : (
              <>
                {teams.map((tm, i) => {
                  const palette: DoorColor[] = ["green", "blue", "purple", "amber", "red", "pink"];
                  return (
                    <DoorButton
                      key={tm.id}
                      icon="👥"
                      label={tm.name}
                      subtitle={tm.sport ?? undefined}
                      color={palette[i % palette.length]}
                      active={state.teamId === tm.id && state.meetingScope !== "internal"}
                      onClick={() => {
                        setState((s) => ({
                          ...s,
                          teamId: tm.id,
                          meetingScope: s.type === "meeting" ? "team" : s.meetingScope,
                          step: s.step + 1,
                        }));
                      }}
                    />
                  );
                })}
                {state.type === "meeting" && (
                  <DoorButton
                    icon="🏛️"
                    label={t("eventWizard.meetingInternal.label")}
                    subtitle={t("eventWizard.meetingInternal.subtitle")}
                    color="purple"
                    active={state.meetingScope === "internal"}
                    onClick={() => {
                      setState((s) => ({
                        ...s,
                        meetingScope: "internal",
                        teamId: "",
                        step: s.step + 1,
                      }));
                    }}
                  />
                )}
              </>
            )}
          </StepQuestion>
        )}

        {current === "name" && (
          <StepQuestion title={t("eventWizard.q.name")}>
            <Input
              autoFocus
              value={state.customTitle ?? ""}
              onChange={(e) => patch("customTitle", e.target.value)}
              placeholder={t("eventWizard.namePlaceholder")}
              className="h-11"
            />
            <Button
              className="w-full mt-3"
              disabled={!state.customTitle?.trim()}
              onClick={() => go(1)}
            >
              {t("eventWizard.continue")}
            </Button>
          </StepQuestion>
        )}

        {current === "when" && (
          <StepQuestion
            title={
              recurrence?.mode === "multi_day"
                ? t("eventWizard.q.whenRange")
                : t("eventWizard.q.when")
            }
          >
            {recurrence?.mode === "multi_day" ? (
              <>
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">
                    {t("eventWizard.range.dates")}
                  </Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="h-11 w-full justify-start font-normal">
                        <CalendarIcon className="h-4 w-4" />
                        {state.startDate && state.endDate ? (
                          <span>
                            {format(new Date(`${state.startDate}T00:00:00`), "EEE d MMM", {
                              locale: dateLocale,
                            })}
                            {" → "}
                            {format(new Date(`${state.endDate}T00:00:00`), "EEE d MMM", {
                              locale: dateLocale,
                            })}
                          </span>
                        ) : state.startDate ? (
                          <span>
                            {format(new Date(`${state.startDate}T00:00:00`), "EEE d MMM", {
                              locale: dateLocale,
                            })}
                            {" → "}
                            <span className="text-muted-foreground">
                              {t("eventWizard.range.pickEnd")}
                            </span>
                          </span>
                        ) : (
                          t("eventWizard.range.pickBoth")
                        )}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="range"
                        numberOfMonths={1}
                        selected={{
                          from: state.startDate
                            ? new Date(`${state.startDate}T00:00:00`)
                            : undefined,
                          to: state.endDate ? new Date(`${state.endDate}T00:00:00`) : undefined,
                        }}
                        onSelect={(range: { from?: Date; to?: Date } | undefined) => {
                          if (!range) return;
                          if (range.from) patch("startDate", format(range.from, "yyyy-MM-dd"));
                          else patch("startDate", undefined);
                          if (range.to) patch("endDate", format(range.to, "yyyy-MM-dd"));
                          else if (range.from && !range.to) patch("endDate", undefined);
                        }}
                        initialFocus
                        className="p-3 pointer-events-auto"
                      />
                    </PopoverContent>
                  </Popover>
                </div>
                <div className="grid grid-cols-2 gap-2 pt-2">
                  <div>
                    <Label className="text-xs text-muted-foreground">
                      {t("eventWizard.range.startTime")}
                    </Label>
                    <TimePicker
                      value={state.startTime}
                      onChange={(v: string) => patch("startTime", v)}
                      className="w-full mt-1"
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">
                      {t("eventWizard.range.endTime")}
                    </Label>
                    <TimePicker
                      value={state.endTime ?? "16:00"}
                      onChange={(v: string) => patch("endTime", v)}
                      className="w-full mt-1"
                    />
                  </div>
                </div>
                <p className="text-[11px] text-muted-foreground -mt-1">
                  {t("eventWizard.range.defaultsHint")}
                </p>

                {/* Per-day schedule for multi-day events */}
                {state.startDate && state.endDate && state.endDate > state.startDate && (
                  <div className="mt-3 rounded-xl border border-border bg-muted/30 p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-xs">
                        <div className="font-semibold">{t("eventWizard.range.sameHoursTitle")}</div>
                        <div className="text-muted-foreground">
                          {t("eventWizard.range.sameHoursHint")}
                        </div>
                      </div>
                      <Switch
                        checked={!perDaySchedule}
                        onCheckedChange={(v) => {
                          setPerDaySchedule(!v);
                          if (v) patch("dayTimes", undefined);
                          else {
                            // seed with global times
                            const days = enumerateDays(state.startDate, state.endDate);
                            const seed: Record<string, { start: string; end: string }> = {};
                            const end = state.endTime || state.startTime;
                            for (const d of days) seed[d] = { start: state.startTime, end };
                            patch("dayTimes", seed);
                          }
                        }}
                      />
                    </div>
                    <div className="space-y-1.5 pt-1">
                      {enumerateDays(state.startDate, state.endDate).map((d) => {
                        const dt = state.dayTimes?.[d];
                        const start = perDaySchedule
                          ? (dt?.start ?? state.startTime)
                          : state.startTime;
                        const end = perDaySchedule
                          ? (dt?.end ?? state.endTime ?? "")
                          : (state.endTime ?? "");
                        const label = format(new Date(`${d}T00:00:00`), "EEE d MMM", {
                          locale: dateLocale,
                        });
                        return (
                          <div
                            key={d}
                            className="grid grid-cols-[minmax(0,1fr)_90px_90px] items-center gap-2"
                          >
                            <span className="text-xs font-medium truncate">{label}</span>
                            <TimePicker
                              value={start}
                              onChange={(v) => {
                                if (!perDaySchedule) return;
                                const next = { ...(state.dayTimes ?? {}) };
                                next[d] = { start: v, end: next[d]?.end ?? end };
                                patch("dayTimes", next);
                              }}
                              className={cn(
                                "w-full",
                                !perDaySchedule && "opacity-60 pointer-events-none",
                              )}
                            />
                            <TimePicker
                              value={end}
                              onChange={(v) => {
                                if (!perDaySchedule) return;
                                const next = { ...(state.dayTimes ?? {}) };
                                next[d] = { start: next[d]?.start ?? start, end: v };
                                patch("dayTimes", next);
                              }}
                              className={cn(
                                "w-full",
                                !perDaySchedule && "opacity-60 pointer-events-none",
                              )}
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="flex flex-wrap gap-2">
                  <Chip
                    label={t("eventWizard.chip.tonight")}
                    onClick={() => {
                      patch("startDate", format(new Date(), "yyyy-MM-dd"));
                      patch("startTime", "20:00");
                    }}
                  />
                  <Chip
                    label={t("eventWizard.chip.tomorrow")}
                    onClick={() => {
                      patch("startDate", format(addDays(new Date(), 1), "yyyy-MM-dd"));
                    }}
                  />
                  <Chip
                    label={t("eventWizard.chip.saturday")}
                    onClick={() => {
                      patch("startDate", format(nextSaturday(new Date()), "yyyy-MM-dd"));
                    }}
                  />
                  <Chip
                    label={t("eventWizard.chip.nextWeek")}
                    onClick={() => {
                      patch(
                        "startDate",
                        format(
                          addDays(startOfWeek(new Date(), { weekStartsOn: 1 }), 7),
                          "yyyy-MM-dd",
                        ),
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
                          : t("eventWizard.pickDate")}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={
                          state.startDate ? new Date(`${state.startDate}T00:00:00`) : undefined
                        }
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
              </>
            )}
            <Button
              className="w-full mt-3"
              disabled={
                !state.startDate ||
                !state.startTime ||
                (recurrence?.mode === "multi_day" &&
                  (!state.endDate || state.endDate <= state.startDate))
              }
              onClick={() => go(1)}
            >
              {t("eventWizard.continue")}
            </Button>
          </StepQuestion>
        )}

        {current === "duration" && (
          <StepQuestion title={t("eventWizard.q.duration")}>
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
            title={
              state.type === "other" ? t("eventWizard.q.seriesOther") : t("eventWizard.q.series")
            }
          >
            {(
              (state.type === "other"
                ? [
                    ["single", t("eventWizard.series.single")],
                    ["multi_day", t("eventWizard.series.multiDay")],
                    ["weekly_one", t("eventWizard.series.weeklyOne")],
                  ]
                : [
                    ["single", t("eventWizard.series.single")],
                    ["weekly_one", t("eventWizard.series.weeklyOne")],
                  ]) as ReadonlyArray<readonly [RecurrenceMode, string]>
            ).map(([m, l]) => (
              <DoorButton
                key={m}
                icon={m === "single" ? "📅" : m === "multi_day" ? "🗓️" : "🔁"}
                label={l}
                active={recurrence?.mode === m}
                onClick={() => setRecurrenceMode(m)}
              />
            ))}
            {recurrence?.mode === "multi_day" && (
              <Button className="w-full mt-2" onClick={() => go(1)}>
                {t("eventWizard.continue")}
              </Button>
            )}
            {recurrence && recurrence.mode !== "single" && recurrence.mode !== "multi_day" && (
              <div className="mt-3 space-y-3 rounded-xl border border-border bg-card p-3">
                <div>
                  <Label className="text-xs">{t("eventWizard.series.dayOfWeek")}</Label>
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
                    <Label className="text-xs">{t("eventWizard.series.time")}</Label>
                    <TimePicker
                      value={state.startTime}
                      onChange={(v: string) => patch("startTime", v)}
                      className="w-full"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">{t("eventWizard.q.duration")}</Label>
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
                    <Label className="text-xs">{t("eventWizard.series.startsOn")}</Label>
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
                    <Label className="text-xs">{t("eventWizard.series.endsOn")}</Label>
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
                  })}
                </div>
              </div>
            )}
            {recurrence?.mode !== "multi_day" && (
              <Button className="w-full mt-2" onClick={() => go(1)}>
                {t("eventWizard.continue")}
              </Button>
            )}
          </StepQuestion>
        )}

        {current === "homeaway" && (
          <StepQuestion title={t("eventWizard.q.homeaway")}>
            <DoorButton
              icon="🏠"
              label={t("eventWizard.home")}
              subtitle={t("eventWizard.homeSubtitle")}
              color="green"
              active={state.isHome === "home"}
              onClick={() => answer("isHome", "home")}
            />
            <DoorButton
              icon="🚌"
              label={t("eventWizard.away")}
              subtitle={t("eventWizard.awaySubtitle")}
              color="blue"
              active={state.isHome === "away"}
              onClick={() => {
                setState((s) => ({
                  ...s,
                  isHome: "away",
                  venueId: null,
                  facilityId: null,
                  location: "",
                  locationUrl: null,
                  step: s.step + 1,
                }));
              }}
            />
          </StepQuestion>
        )}

        {current === "halves" && (
          <StepQuestion title={t("eventWizard.q.halves")}>
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
              <Label className="text-xs">{t("eventWizard.halvesManual")}</Label>
              <Input
                placeholder={t("eventWizard.halvesPlaceholder")}
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
              {t("eventWizard.skip")}
            </Button>
          </StepQuestion>
        )}

        {current === "gameformat" && (
          <StepQuestion title={t("eventWizard.q.gameformat")}>
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
              <Label className="text-xs">{t("eventWizard.gameformatManual")}</Label>
              <Input
                placeholder={t("eventWizard.gameformatPlaceholder")}
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
              {t("eventWizard.skip")}
            </Button>
          </StepQuestion>
        )}

        {current === "meetingpoint" && (
          <StepQuestion title={t("eventWizard.q.meetingpoint")}>
            <Label className="text-xs">{t("eventWizard.meeting.address")}</Label>
            <LocationAutocomplete
              value={state.meetingPoint ?? ""}
              onChange={(v) => patch("meetingPoint", v)}
              placeholder={t("eventWizard.meeting.addressPlaceholder")}
            />
            <Label className="text-xs mt-2">{t("eventWizard.meeting.time")}</Label>
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
              {t("eventWizard.continue")}
            </Button>
          </StepQuestion>
        )}

        {current === "meetingtime" && (
          <StepQuestion title={t("eventWizard.q.meetingtime")}>
            <p className="text-xs text-muted-foreground">{t("eventWizard.meetingtimeHint")}</p>
            <TimePicker
              value={state.meetingTime ?? ""}
              onChange={(v: string) => patch("meetingTime", v)}
              className="w-full"
            />
            <Button className="w-full mt-2" onClick={() => go(1)}>
              {t("eventWizard.continue")}
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
              {t("eventWizard.skip")}
            </Button>
          </StepQuestion>
        )}

        {current === "places" && (
          <StepQuestion title={t("eventWizard.q.places")}>
            {/* RDV section */}
            <div className="rounded-xl border border-border bg-muted/30 p-3 space-y-2">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <span>👥</span>
                <span>{t("eventWizard.places.meetingSection")}</span>
              </div>
              <div>
                <Label className="text-xs">{t("eventWizard.meeting.address")}</Label>
                <LocationAutocomplete
                  value={state.meetingPoint ?? ""}
                  onChange={(v) => patch("meetingPoint", v)}
                  placeholder={t("eventWizard.meeting.addressPlaceholder")}
                />
              </div>
              <div>
                <Label className="text-xs">{t("eventWizard.meeting.time")}</Label>
                <TimePicker
                  value={state.meetingTime ?? ""}
                  onChange={(v: string) => patch("meetingTime", v)}
                  className="w-full"
                />
              </div>
            </div>

            {/* Match section */}
            <div className="rounded-xl border border-border bg-muted/30 p-3 space-y-2 mt-3">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <span>📍</span>
                <span>{t("eventWizard.places.matchSection")}</span>
              </div>
              <div>
                <Label className="text-xs">{t("eventWizard.meeting.address")}</Label>
                <LocationAutocomplete
                  value={state.location ?? ""}
                  onChange={(v) => {
                    patch("location", v);
                    patch("venueId", null);
                    patch("facilityId", null);
                  }}
                  placeholder={t("eventWizard.matchLocationPlaceholder")}
                />
              </div>
            </div>

            <Button
              className="w-full mt-3"
              disabled={!state.meetingPoint?.trim() || !state.location?.trim()}
              onClick={() => go(1)}
            >
              {t("eventWizard.continue")}
            </Button>
          </StepQuestion>
        )}

        {current === "opponent" && (
          <StepQuestion title={t("eventWizard.q.opponent")}>
            <Input
              autoFocus
              value={state.opponent ?? ""}
              onChange={(e) => patch("opponent", e.target.value)}
              placeholder={t("eventWizard.opponentPlaceholder")}
            />
            <Button
              className="w-full mt-2"
              disabled={!state.opponent?.trim()}
              onClick={() => go(1)}
            >
              {t("eventWizard.continue")}
            </Button>
          </StepQuestion>
        )}

        {current === "official" && (
          <StepQuestion title={t("eventWizard.q.official")}>
            <DoorButton
              icon="🤝"
              label={t("eventWizard.officialNo")}
              subtitle={t("eventWizard.officialNoSubtitle")}
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
              label={t("eventWizard.officialChampionship")}
              subtitle={t("eventWizard.officialChampionshipSubtitle")}
              color="amber"
              active={state.competitionType === "championship"}
              onClick={() => {
                markTouched("official");
                patch("isOfficial", true);
                patch("competitionType", "championship");
                // Auto-select if there's exactly one active championship.
                if (!state.championshipId && championships.length === 1) {
                  patch("championshipId", championships[0].id);
                }
              }}
            />
            <DoorButton
              icon="🥇"
              label={t("eventWizard.officialCup")}
              subtitle={t("eventWizard.officialCupSubtitle")}
              color="red"
              active={state.competitionType === "cup"}
              onClick={() => {
                markTouched("official");
                patch("isOfficial", true);
                patch("competitionType", "cup");
                patch("championshipId", null);
              }}
            />
            {state.competitionType === "championship" && (
              <div className="mt-2 space-y-1.5">
                <Label className="text-xs">{t("championships.championship")}</Label>
                {champsLoading ? (
                  <div className="text-xs text-muted-foreground">{t("common.loading")}</div>
                ) : championships.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-border p-3 space-y-2">
                    <p className="text-xs text-muted-foreground">{t("championships.noneActive")}</p>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="w-full"
                      onClick={() => {
                        writeDraft(state);
                        if (state.teamId) {
                          navigate({
                            to: "/teams/$teamId",
                            params: { teamId: state.teamId },
                          });
                          onClose();
                        }
                      }}
                    >
                      {t("championships.ctaAddToTeam")}
                    </Button>
                  </div>
                ) : (
                  <Select
                    value={state.championshipId ?? ""}
                    onValueChange={(v) => patch("championshipId", v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t("championships.select")} />
                    </SelectTrigger>
                    <SelectContent>
                      {championships.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                          {c.season_label ? ` · ${c.season_label}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            )}
            {state.competitionType === "cup" && (
              <div className="mt-2 space-y-1.5">
                <Label className="text-xs">{t("eventWizard.competitionName")}</Label>
                <Input
                  value={state.competitionName ?? ""}
                  onChange={(e) => patch("competitionName", e.target.value)}
                  placeholder={t("eventWizard.competitionNamePlaceholder")}
                />
              </div>
            )}
            <Button
              className="w-full mt-2"
              disabled={
                !state.competitionType ||
                (state.competitionType === "championship" && !state.championshipId)
              }
              onClick={() => go(1)}
            >
              {t("eventWizard.continue")}
            </Button>
          </StepQuestion>
        )}

        {current === "location" && (
          <StepQuestion
            title={
              state.type === "match"
                ? t("eventWizard.q.matchLocation")
                : t("eventWizard.q.location")
            }
          >
            {/* When "away" for a non-match event, show only a free address input (Google) */}
            {!(state.type === "other" && state.isHome === "away") && (
              <VenuePicker
                clubId={activeClubId ?? undefined}
                venueId={state.venueId ?? null}
                facilityId={state.facilityId ?? null}
                autoApplyDefaults={!state.location}
                onChange={applyVenuePick}
              />
            )}
            <LocationAutocomplete
              value={state.location ?? ""}
              onChange={(v) => {
                patch("location", v);
                patch("venueId", null);
                patch("facilityId", null);
              }}
              placeholder={
                state.type === "other" && state.isHome === "away"
                  ? t("eventWizard.awayAddressPlaceholder")
                  : state.type === "match"
                    ? t("eventWizard.matchLocationPlaceholder")
                    : t("eventWizard.locationPlaceholder")
              }
            />

            <Button
              className="w-full mt-2"
              disabled={!state.location?.trim()}
              onClick={() => go(1)}
            >
              {t("eventWizard.continue")}
            </Button>
          </StepQuestion>
        )}

        {current === "convocation" && (
          <StepQuestion title={t("eventWizard.q.convocation")}>
            {(
              [
                [
                  "all",
                  "👥",
                  t("eventWizard.convoc.all"),
                  t("eventWizard.convoc.allSubtitle"),
                  "green",
                ],
                [
                  "selection",
                  "✋",
                  t("eventWizard.convoc.selection"),
                  t("eventWizard.convoc.selectionSubtitle"),
                  "amber",
                ],
                [
                  "none",
                  "⏸️",
                  t("eventWizard.convoc.none"),
                  t("eventWizard.convoc.noneSubtitle"),
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

        {current === "audience" && (
          <MeetingAudienceStep
            clubId={activeClubId ?? null}
            teams={teams}
            value={state.meetingAudience}
            onChange={(v) => setState((s) => ({ ...s, meetingAudience: v }))}
            onContinue={() => go(1)}
            onSkip={() => {
              setState((s) => ({ ...s, meetingAudience: undefined }));
              go(1);
            }}
            t={t}
          />
        )}

        {current === "carpool" && (
          <StepQuestion title={t("eventWizard.q.carpool")}>
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
                  {t("eventWizard.carpoolLabel")}
                </div>
                <div
                  className={cn(
                    "text-[11px] font-medium mt-0.5",
                    state.carpoolEnabled ? "text-emerald-600" : "text-muted-foreground",
                  )}
                >
                  {t("eventWizard.carpoolSubtitle")}
                </div>
              </div>
              <Switch
                checked={!!state.carpoolEnabled}
                onCheckedChange={(v) => patch("carpoolEnabled", v)}
              />
            </div>
            <Button className="w-full mt-3" onClick={() => go(1)}>
              {t("eventWizard.continue")}
            </Button>
          </StepQuestion>
        )}

        {current === "comment" && (
          <StepQuestion title={t("eventWizard.q.comment")}>
            <p className="text-xs text-muted-foreground">{t("eventWizard.commentHint")}</p>
            <Textarea
              value={state.description ?? ""}
              onChange={(e) => patch("description", e.target.value)}
              placeholder={t("eventWizard.commentPlaceholder")}
              rows={4}
            />
            <Button className="w-full mt-2" onClick={() => go(1)}>
              {t("eventWizard.continue")}
            </Button>
          </StepQuestion>
        )}

        {current === "summary" && (
          <div className="space-y-3">
            <div className="text-center pt-2">
              <CheckCircle2 className="mx-auto h-10 w-10 text-primary" />
              <h3 className="mt-2 font-semibold">{t("eventWizard.readyTitle")}</h3>
            </div>
            <SummaryCard
              state={state}
              title={title}
              teamName={selectedTeam?.name}
              seriesCount={seriesCount}
              t={t}
            />
            {state.type === "meeting" &&
              state.meetingScope === "internal" &&
              state.meetingAudience && (
                <MeetingAttendeesSummaryCard
                  clubId={activeClubId ?? null}
                  audience={state.meetingAudience}
                  t={t}
                />
              )}
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
                  t("eventWizard.create")
                )}
              </Button>
              {state.convocScope !== "none" && (
                <Button
                  className="flex-1"
                  variant="default"
                  disabled={createMut.isPending}
                  onClick={createAndConvocate}
                >
                  {t("eventWizard.createAndConvoke")}
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
              {t("eventWizard.expert")}
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
            {t("eventWizard.expert")}
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

function MeetingAudienceStep({
  clubId,
  teams,
  value,
  onChange,
  onContinue,
  onSkip,
  t,
}: {
  clubId: string | null;
  teams: Team[];
  value: EventWizardState["meetingAudience"];
  onChange: (v: NonNullable<EventWizardState["meetingAudience"]>) => void;
  onContinue: () => void;
  onSkip: () => void;
  t: (k: string, opts?: Record<string, unknown>) => string;
}) {
  const audience = useAudienceState({
    scalar: new Set(
      (value?.scalar ?? []) as Array<
        | "convoked_players"
        | "convoked_parents"
        | "club_members"
        | "club_educators"
        | "club_staff"
        | "club_admins"
        | "club_tournament_managers"
      >,
    ),
    groupIds: new Set(value?.groupIds ?? []),
    teamPicks: (value?.teamPicks ?? []).map((tp) => ({
      team_id: tp.team_id,
      kind: tp.kind as TeamKind,
    })),
    category: value?.category ?? "",
    preassigned: (value?.preassigned ?? []) as PreassignedPerson[],
  });

  // Fetch active club_groups to populate the picker context.
  const { data: groups = [] } = useQuery({
    queryKey: ["club-groups-active", clubId],
    enabled: Boolean(clubId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("club_groups")
        .select("id, name")
        .eq("club_id", clubId!)
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; name: string }>;
    },
  });

  const nonInternalTeams = useMemo(() => teams.filter((t) => t.id), [teams]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const tm of teams) {
      const cat = (tm as unknown as { age_group?: string | null }).age_group;
      if (cat && cat.trim()) set.add(cat.trim());
    }
    return Array.from(set).sort();
  }, [teams]);

  const ctx: AudienceCtx = useMemo(
    () => ({
      club_id: clubId ?? undefined,
      teams: nonInternalTeams.map((tm) => ({
        id: tm.id,
        name: tm.name,
        age_group: (tm as unknown as { age_group?: string | null }).age_group ?? null,
      })),
      groups,
      categories,
    }),
    [clubId, nonInternalTeams, groups, categories],
  );

  // Sync picker state back to the wizard whenever it changes.
  const audienceState: AudienceState = audience.state;
  useEffect(() => {
    onChange({
      scalar: Array.from(audienceState.scalar),
      groupIds: Array.from(audienceState.groupIds),
      teamPicks: audienceState.teamPicks,
      category: audienceState.category,
      preassigned: audienceState.preassigned,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audienceState]);

  const hasAny =
    audienceState.scalar.size > 0 ||
    audienceState.groupIds.size > 0 ||
    audienceState.teamPicks.length > 0 ||
    audienceState.category.trim().length > 0 ||
    audienceState.preassigned.length > 0;

  const draftAudience = useMemo(
    () => ({
      scalar: Array.from(audienceState.scalar),
      groupIds: Array.from(audienceState.groupIds),
      teamPicks: audienceState.teamPicks,
      category: audienceState.category,
      preassigned: audienceState.preassigned,
    }),
    [audienceState],
  );
  const preview = useMeetingAttendeesPreview(clubId, draftAudience);

  return (
    <StepQuestion title={t("eventWizard.q.audience")}>
      <AudiencePickerBody
        ctx={ctx}
        state={audienceState}
        controls={audience.controls}
        enablePreassign
      />
      {hasAny && (
        <div className="rounded-lg border bg-muted/30 px-3 py-2 flex items-center gap-2 text-sm">
          <Users className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium">
            {preview.query.isFetching
              ? t("eventWizard.meetingPreview.loading")
              : t("eventWizard.meetingPreview.countShort", {
                  count: preview.query.data?.count ?? 0,
                })}
          </span>
          <span className="ml-auto text-xs text-muted-foreground">
            {t("eventWizard.meetingPreview.reviewOnSummary")}
          </span>
        </div>
      )}
      <div className="flex gap-2 pt-2">
        <Button variant="outline" className="flex-1" onClick={onSkip}>
          {t("eventWizard.skip")}
        </Button>
        <Button className="flex-1" onClick={onContinue} disabled={!hasAny}>
          {t("eventWizard.continue")}
        </Button>
      </div>
    </StepQuestion>
  );
}

function MeetingAttendeesSummaryCard({
  clubId,
  audience,
  t,
}: {
  clubId: string | null;
  audience: NonNullable<EventWizardState["meetingAudience"]>;
  t: (k: string, opts?: Record<string, unknown>) => string;
}) {
  const { hasAny, query } = useMeetingAttendeesPreview(clubId, audience);
  if (!hasAny) return null;
  const people = query.data?.people ?? [];
  const count = query.data?.count ?? people.length;
  const MAX = 12;
  const shown = people.slice(0, MAX);
  const remaining = Math.max(0, count - shown.length);
  return (
    <div className="rounded-2xl border-[1.5px] border-emerald-200 bg-gradient-to-br from-emerald-50/70 to-white dark:from-emerald-950/20 dark:to-transparent dark:border-emerald-900/40 p-3 space-y-3">
      <div className="flex items-center gap-2">
        <div className="h-8 w-8 rounded-full bg-emerald-100 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 flex items-center justify-center">
          <Users className="h-4 w-4" />
        </div>
        <div className="flex-1">
          <div className="text-sm font-semibold">
            {t("eventWizard.meetingSummary.title", {
              count,
            })}
          </div>
          <div className="text-[11px] text-muted-foreground">
            {t("eventWizard.meetingSummary.subtitle")}
          </div>
        </div>
      </div>

      {query.isFetching && people.length === 0 ? (
        <div className="text-xs text-muted-foreground flex items-center gap-2">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          {t("eventWizard.meetingPreview.loading")}
        </div>
      ) : people.length === 0 ? (
        <div className="text-xs text-muted-foreground">{t("eventWizard.meetingSummary.empty")}</div>
      ) : (
        <ul className="space-y-1 max-h-64 overflow-y-auto rounded-lg bg-white/60 dark:bg-background/40 p-1">
          {shown.map((p) => {
            const name = p.full_name ?? t("common.unknown");
            const initials =
              name
                .split(/\s+/)
                .filter(Boolean)
                .slice(0, 2)
                .map((w) => w[0]?.toUpperCase() ?? "")
                .join("") || "?";
            return (
              <li key={p.user_id} className="flex items-center gap-2 rounded-md px-2 py-1.5">
                <div className="h-7 w-7 rounded-full bg-emerald-100 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300 text-[11px] font-semibold flex items-center justify-center">
                  {initials}
                </div>
                <span className="text-sm truncate">{name}</span>
              </li>
            );
          })}
          {remaining > 0 && (
            <li className="px-2 py-1 text-xs text-muted-foreground">
              {t("eventWizard.meetingSummary.andOthers", {
                defaultValue: "… et {{count}} autre(s)",
                count: remaining,
              })}
            </li>
          )}
        </ul>
      )}

      <div className="flex items-start gap-2 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 p-2.5 text-[12px] text-amber-900 dark:text-amber-200">
        <Mail className="h-4 w-4 flex-shrink-0 mt-0.5" />
        <span>{t("eventWizard.meetingPreview.notice")}</span>
      </div>
    </div>
  );
}

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
  name: Sparkles,
  when: CalendarDays,
  duration: Timer,
  halves: Hourglass,
  gameformat: Users,
  series: Repeat,
  homeaway: Home,
  meetingpoint: MapPin,
  meetingtime: Clock,
  places: MapPin,
  opponent: Shield,
  official: Trophy,
  location: MapPin,
  convocation: Mail,
  audience: Users,
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
  const { t } = useTranslation();
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
              aria-label={t("common.close")}
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
  if (seriesCount > 0) chips.push(t("eventWizard.recap.series", { count: seriesCount }));
  if (state.type === "match" && state.isHome) chips.push(state.isHome === "home" ? "🏠" : "🚌");
  if (state.opponent) chips.push(`vs ${state.opponent}`);
  if (state.location) chips.push(`📍 ${state.location}`);
  if (chips.length === 0) return null;
  return (
    <div className="border-b border-border bg-muted/40 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold mb-1">
        {t("eventWizard.recap.title")}
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
          📅{" "}
          {state.endDate && state.endDate > state.startDate
            ? `${format(new Date(`${state.startDate}T00:00:00`), "d MMM")} → ${format(
                new Date(`${state.endDate}T00:00:00`),
                "d MMM",
              )}`
            : `${format(new Date(`${state.startDate}T00:00:00`), "EEE d MMM")} · ${state.durationMin} min`}
        </div>
      )}
      {state.meetingPoint && (
        <div>
          👥 {t("eventWizard.summary.meeting")} :{" "}
          {state.meetingTime ? `${state.meetingTime} · ` : ""}
          {state.meetingPoint}
        </div>
      )}
      {state.location && (
        <div>
          📍 {t("eventWizard.summary.place")} : {state.startTime ? `${state.startTime} · ` : ""}
          {state.location}
        </div>
      )}
      {!state.location && !state.meetingPoint && state.startTime && <div>🕒 {state.startTime}</div>}
      {state.opponent && (
        <div>
          🆚 {state.opponent} ({state.isHome === "home" ? "🏠" : "🚌"})
        </div>
      )}
      {seriesCount > 0 && (
        <div className="text-primary font-semibold">
          {t("eventWizard.series.preview", {
            count: seriesCount,
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
