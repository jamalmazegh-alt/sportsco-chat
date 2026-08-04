import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { format } from "date-fns";
import { CalendarIcon, Check, Loader2, MapPin, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ResponsiveFormDialog } from "@/components/responsive-form-dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { TimePicker } from "@/components/ui/time-picker";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { AttachmentPicker, type Attachment } from "@/components/attachments";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { getGoogleMapsKey } from "@/lib/maps.functions";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { RecurringTrainingPlanner } from "@/components/recurring-training-planner";
import { type EventAttachment } from "@/lib/events/event-payload";
import { createEvent, updateEvent, type CreateEventInput } from "@/lib/events/events.functions";
import { ChampionshipPicker } from "@/components/events/championship-picker";
import { VenuePicker, type VenuePickerValue } from "@/components/events/venue-picker";
import { useAuth } from "@/lib/auth-context";
import { CallUpVisibilityField } from "@/components/call-up-visibility-field";

let cachedMapsKeyPromise: Promise<string | null> | null = null;
function fetchGoogleMapsKey(): Promise<string | null> {
  if (!cachedMapsKeyPromise) {
    cachedMapsKeyPromise = getGoogleMapsKey()
      .then((r) => r.key ?? null)
      .catch(() => null);
  }
  return cachedMapsKeyPromise;
}

const TRAINING_DEFAULT_DURATION_MIN = 90;

function addMinutesToTime(time: string, minutes: number): string {
  if (!time) return "";
  const [h, m] = time.split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return "";
  const total = (h * 60 + m + minutes) % (24 * 60);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

declare global {
  interface Window {
    google?: any;
    __squadlyGoogleMapsPromise?: Promise<void>;
  }
}

type GooglePlacePrediction = { description: string; place_id: string };
type GoogleAutocompleteService = {
  getPlacePredictions: (
    request: { input: string; types?: string[]; sessionToken?: unknown },
    callback: (items: GooglePlacePrediction[] | null) => void,
  ) => void;
};

export type EventType = "training" | "match" | "tournament" | "meeting" | "other";
export type CompetitionType = "friendly" | "championship" | "cup";

export type EventFormValues = {
  id?: string;
  team_id: string;
  type: EventType;
  title: string;
  description: string | null;
  location: string | null;
  location_url: string | null;
  opponent: string | null;
  competition_type: CompetitionType | null;
  competition_name: string | null;
  championship_id?: string | null;
  is_home: boolean | null;
  meeting_point: string | null;
  starts_at: string; // ISO
  ends_at: string | null;
  convocation_time: string | null;
  attachments?: Attachment[] | null;
  is_official?: boolean | null;
  venue_id?: string | null;
  facility_id?: string | null;
};

type Team = { id: string; name: string };
type TeamOption = Team & { competitions?: string[] | null };

type Props = {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  trigger?: ReactNode;
  teams: TeamOption[];
  initial?: Partial<EventFormValues>;
  mode: "create" | "edit";
  userId: string;
  onSaved: (eventId: string) => void;
  /** Optional: when set, renders a "back" button at the top of the form (used when opened from the wizard). */
  onBack?: () => void;
  backLabel?: string;
};

function toGoogleMapsUrl(address: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}

function splitDateTime(iso: string | null | undefined): { date: Date | undefined; time: string } {
  if (!iso) return { date: undefined, time: "" };
  const d = new Date(iso);
  return { date: d, time: format(d, "HH:mm") };
}

function getInitialOpponent(initial?: Partial<EventFormValues>): string {
  if (initial?.opponent) return initial.opponent;
  if (initial?.type === "match" && initial.title) return initial.title.replace(/^vs\s+/i, "");
  return "";
}

function combineDateTime(date: Date | undefined, time: string): string | null {
  if (!date || !time) return null;
  const [h, m] = time.split(":").map(Number);
  const d = new Date(date);
  d.setHours(h ?? 0, m ?? 0, 0, 0);
  return d.toISOString();
}

function competitionOptions(team?: TeamOption): CompetitionType[] {
  const allowed = new Set(["friendly", "championship", "cup"]);
  const configured = (team?.competitions ?? []).filter((c): c is CompetitionType => allowed.has(c));
  return configured.length > 0 ? configured : ["friendly", "championship", "cup"];
}

function loadGoogleMapsPlaces(key: string | null | undefined): Promise<void> | null {
  if (!key || typeof window === "undefined") return null;
  if (window.google?.maps?.places) return Promise.resolve();
  if (!window.__squadlyGoogleMapsPromise) {
    window.__squadlyGoogleMapsPromise = new Promise((resolve, reject) => {
      const existing = document.querySelector<HTMLScriptElement>(
        'script[data-squadly-google-maps="true"]',
      );
      if (existing) {
        existing.addEventListener("load", () => resolve());
        existing.addEventListener("error", reject);
        return;
      }
      const script = document.createElement("script");
      script.src = `https://maps.googleapis.com/maps/api/js?key=${key}&libraries=places`;
      script.async = true;
      script.defer = true;
      script.dataset.squadlyGoogleMaps = "true";
      script.onload = () => resolve();
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }
  return window.__squadlyGoogleMapsPromise;
}

function DateTimeField({
  label,
  date,
  time,
  onDate,
  onTime,
  required,
  testId,
}: {
  label: string;
  date: Date | undefined;
  time: string;
  onDate: (d: Date | undefined) => void;
  onTime: (t: string) => void;
  required?: boolean;
  testId?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div className="grid grid-cols-[1fr_110px] gap-2">
        <Popover>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              data-testid={testId ? `${testId}-date` : undefined}
              className={cn("h-10 justify-start font-normal", !date && "text-muted-foreground")}
            >
              <CalendarIcon className="h-4 w-4" />
              {date ? format(date, "EEE d MMM") : "—"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={date}
              onSelect={onDate}
              initialFocus
              className="p-3 pointer-events-auto"
            />
          </PopoverContent>
        </Popover>
        <TimePicker
          value={time}
          onChange={onTime}
          required={required}
          className="w-full"
          data-testid={testId ? `${testId}-time` : undefined}
        />
      </div>
    </div>
  );
}

function DateOnlyField({
  label,
  date,
  onDate,
  required,
  testId,
}: {
  label: string;
  date: Date | undefined;
  onDate: (d: Date | undefined) => void;
  required?: boolean;
  testId?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            data-testid={testId ? `${testId}-date` : undefined}
            className={cn(
              "h-10 w-full justify-start font-normal",
              !date && "text-muted-foreground",
            )}
            aria-required={required}
          >
            <CalendarIcon className="h-4 w-4" />
            {date ? format(date, "EEE d MMM") : "—"}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={date}
            onSelect={onDate}
            initialFocus
            className="p-3 pointer-events-auto"
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}

function TimeField({
  label,
  time,
  onTime,
  required,
  testId,
}: {
  label: string;
  time: string;
  onTime: (t: string) => void;
  required?: boolean;
  testId?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <TimePicker
        value={time}
        onChange={onTime}
        required={required}
        className="w-full"
        data-testid={testId}
      />
    </div>
  );
}

export function AddressField({
  label,
  value,
  onValueChange,
  onPlaceUrl,
  placeholder,
  helper,
  disabled,
}: {
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  onPlaceUrl: (url: string | null) => void;
  placeholder: string;
  helper: string;
  disabled?: boolean;
}) {
  const [suggestions, setSuggestions] = useState<Array<{ description: string; place_id: string }>>(
    [],
  );
  const [open, setOpen] = useState(false);
  const [service, setService] = useState<GoogleAutocompleteService | null>(null);
  const sessionTokenRef = useRef<unknown>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchGoogleMapsKey().then((key) => {
      loadGoogleMapsPlaces(key)
        ?.then(() => {
          const places = window.google?.maps?.places;
          if (places) {
            setService(new places.AutocompleteService());
            sessionTokenRef.current = new places.AutocompleteSessionToken();
          }
        })
        .catch(() => undefined);
    });
  }, []);

  // Debounced predictions
  useEffect(() => {
    if (disabled || !service || value.trim().length < 3) {
      setSuggestions([]);
      return;
    }
    const handle = window.setTimeout(() => {
      service.getPlacePredictions(
        { input: value, sessionToken: sessionTokenRef.current ?? undefined },
        (items) => {
          setSuggestions(
            (items ?? [])
              .slice(0, 5)
              .map((item) => ({ description: item.description, place_id: item.place_id })),
          );
          setOpen(true);
        },
      );
    }, 250);
    return () => window.clearTimeout(handle);
  }, [service, value, disabled]);

  // Close on outside click
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  function selectPlace(suggestion: { description: string; place_id: string }) {
    onValueChange(suggestion.description);
    onPlaceUrl(
      `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(suggestion.description)}&query_place_id=${suggestion.place_id}`,
    );
    setSuggestions([]);
    setOpen(false);
    // Rotate session token after a place selection (Google billing best practice)
    if (window.google?.maps?.places) {
      sessionTokenRef.current = new window.google.maps.places.AutocompleteSessionToken();
    }
  }

  return (
    <div className="space-y-1.5" ref={containerRef}>
      <Label className={cn(disabled && "text-muted-foreground")}>{label}</Label>
      <div className="relative">
        <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
        <Input
          value={value}
          onChange={(e) => {
            onValueChange(e.target.value);
            onPlaceUrl(null);
            setOpen(true);
          }}
          onFocus={() => suggestions.length > 0 && setOpen(true)}
          placeholder={placeholder}
          className="pl-9 disabled:opacity-60 disabled:cursor-not-allowed disabled:bg-muted"
          autoComplete="off"
          disabled={disabled}
        />
        {open && !disabled && suggestions.length > 0 && (
          <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-xl border border-border bg-popover shadow-lg">
            {suggestions.map((suggestion) => (
              <button
                key={suggestion.place_id}
                type="button"
                onClick={() => selectPlace(suggestion)}
                className="flex w-full items-start gap-2 px-3 py-2 text-left text-sm hover:bg-accent"
              >
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <span>{suggestion.description}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      <p className="text-[11px] text-muted-foreground">{helper}</p>
    </div>
  );
}

export function EventFormSheet({
  open,
  onOpenChange,
  trigger,
  teams,
  initial,
  mode,
  userId,
  onSaved,
  onBack,
  backLabel,
}: Props) {
  const { t } = useTranslation();

  const [teamId, setTeamId] = useState(initial?.team_id ?? "");
  const [type, setType] = useState<EventType>((initial?.type as EventType) ?? "training");
  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [location, setLocation] = useState(initial?.location ?? "");
  const [locationUrl, setLocationUrl] = useState(initial?.location_url ?? "");
  const [opponent, setOpponent] = useState(getInitialOpponent(initial));
  const [competitionType, setCompetitionType] = useState<CompetitionType>(
    (initial?.competition_type as CompetitionType) ?? "friendly",
  );
  const [competitionName, setCompetitionName] = useState(initial?.competition_name ?? "");
  const [championshipId, setChampionshipId] = useState<string | null>(
    initial?.championship_id ?? null,
  );
  // Snapshot of the historical championship link (name at creation time), used
  // when editing an event whose championship was archived or deleted, so the
  // user still sees what the event was tied to.
  const historicalChampionship = useMemo(
    () =>
      initial?.competition_type === "championship" && initial?.competition_name
        ? { id: initial?.championship_id ?? "", name: initial?.competition_name ?? null }
        : null,
    [initial?.competition_type, initial?.competition_name, initial?.championship_id],
  );
  const [isHome, setIsHome] = useState<"home" | "away">(
    initial?.is_home === false ? "away" : "home",
  );
  const [meetingPoint, setMeetingPoint] = useState(initial?.meeting_point ?? "");
  const [isOfficial, setIsOfficial] = useState<boolean>(
    initial?.is_official ?? (initial?.type as EventType) === "match",
  );
  const [attachments, setAttachments] = useState<Attachment[]>(
    (initial?.attachments as Attachment[] | undefined) ?? [],
  );
  const [venueId, setVenueId] = useState<string | null>(initial?.venue_id ?? null);
  const [facilityId, setFacilityId] = useState<string | null>(initial?.facility_id ?? null);
  const { activeClubId } = useAuth();

  const startsInit = splitDateTime(initial?.starts_at);
  const endsInit = splitDateTime(initial?.ends_at);
  const convocInit = splitDateTime(initial?.convocation_time);

  const [startDate, setStartDate] = useState<Date | undefined>(startsInit.date);
  const [startTime, setStartTime] = useState(startsInit.time);
  const [endDate, setEndDate] = useState<Date | undefined>(endsInit.date);
  const [endTime, setEndTime] = useState(endsInit.time);
  const [convocDate, setConvocDate] = useState<Date | undefined>(convocInit.date);
  const [convocTime, setConvocTime] = useState(convocInit.time);

  const [repeatWeeks, setRepeatWeeks] = useState<number>(1); // 1 = no repeat (legacy)
  const [isRecurring, setIsRecurring] = useState<boolean>(true);
  const [sendNow, setSendNow] = useState<boolean>(false);

  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const selectedTeam = teams.find((tm) => tm.id === teamId);
  const availableCompetitionTypes = useMemo(() => competitionOptions(selectedTeam), [selectedTeam]);
  const isHomeMatch = type === "match" && isHome === "home";
  const isAwayMatch = type === "match" && isHome === "away";

  // When opening fresh, sync from initial
  useEffect(() => {
    if (!open) return;
    setTeamId(initial?.team_id ?? "");
    setType((initial?.type as EventType) ?? "training");
    setTitle(initial?.title ?? "");
    setDescription(initial?.description ?? "");
    setLocation(initial?.location ?? "");
    setLocationUrl(initial?.location_url ?? "");
    setOpponent(getInitialOpponent(initial));
    setCompetitionType((initial?.competition_type as CompetitionType) ?? "friendly");
    setCompetitionName(initial?.competition_name ?? "");
    setChampionshipId(initial?.championship_id ?? null);
    setIsHome(initial?.is_home === false ? "away" : "home");
    setMeetingPoint(initial?.meeting_point ?? "");
    setIsOfficial(initial?.is_official ?? (initial?.type as EventType) === "match");
    setAttachments((initial?.attachments as Attachment[] | undefined) ?? []);
    setVenueId(initial?.venue_id ?? null);
    setFacilityId(initial?.facility_id ?? null);

    const s = splitDateTime(initial?.starts_at);
    const e = splitDateTime(initial?.ends_at);
    const c = splitDateTime(initial?.convocation_time);
    setStartDate(s.date);
    setStartTime(s.time);
    setEndDate(e.date);
    setEndTime(e.time);
    setConvocDate(c.date);
    setConvocTime(c.time);
    setRepeatWeeks(1);
    setIsRecurring(true);
    setSendNow(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!availableCompetitionTypes.includes(competitionType)) {
      setCompetitionType(availableCompetitionTypes[0] ?? "friendly");
    }
  }, [availableCompetitionTypes, competitionType]);

  // When the source team changes, drop any stale championship link. The picker
  // itself also clears when the current id is not in the fetched list, but doing
  // it here removes the transient inconsistency between the two states.
  const previousTeamRef = useRef(teamId);
  useEffect(() => {
    if (previousTeamRef.current !== teamId) {
      previousTeamRef.current = teamId;
      setChampionshipId(null);
    }
  }, [teamId]);

  useEffect(() => {
    if (!open) return;
    fetchGoogleMapsKey().then((key) => {
      loadGoogleMapsPlaces(key)?.catch(() => undefined);
    });
  }, [open]);

  const createEventFn = useServerFn(createEvent);
  const updateEventFn = useServerFn(updateEvent);
  const queryClient = useQueryClient();

  function translateError(msg: string): string {
    switch (msg) {
      case "championship_required":
        return t("championships.errors.required");
      case "championship_team_mismatch":
        return t("championships.errors.teamMismatch");
      case "championship_club_mismatch":
        return t("championships.errors.clubMismatch");
      case "championship_archived":
        return t("championships.errors.archived");
      case "championship_not_found":
        return t("championships.errors.notFound");
      case "duplicate":
        return t("events.duplicateExists");
      default:
        return msg;
    }
  }

  const titleMissing = type !== "match" && !title.trim();

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!teamId) {
      toast.error(t("events.selectTeam"));
      return;
    }
    if (titleMissing) {
      toast.error(t("events.nameRequired"));
      return;
    }
    const startsIso = combineDateTime(startDate, startTime);
    if (!startsIso) {
      toast.error(t("events.startsAt"));
      return;
    }
    setBusy(true);

    const finalTitle =
      type === "match" ? (opponent ? `vs ${opponent}` : t("events.types.match")) : title.trim();

    const finalLocationUrl = locationUrl?.trim()
      ? locationUrl.trim()
      : location?.trim()
        ? toGoogleMapsUrl(location.trim())
        : null;

    const eventConvocationTime =
      type === "training"
        ? combineDateTime(startDate, convocTime)
        : combineDateTime(convocDate ?? startDate, convocTime);

    // Championship UI guard (server + DB trigger are the actual source of truth,
    // but this saves a round-trip when we know the user hasn't picked one).
    if (type === "match" && competitionType === "championship" && !championshipId) {
      setBusy(false);
      toast.error(t("championships.errors.required"));
      return;
    }

    if (isHomeMatch && !venueId) {
      setBusy(false);
      toast.error(t("events.homeVenueRequired"));
      return;
    }

    const baseInput: CreateEventInput = {
      teamId,
      type,
      title: finalTitle,
      description: description || null,
      location: location || null,
      locationUrl: finalLocationUrl,
      opponent: opponent || null,
      competitionType,
      competitionName: competitionName || null,
      championshipId: competitionType === "championship" ? championshipId : null,
      isHome: type === "match" ? isHomeMatch : null,
      meetingPoint: meetingPoint || null,
      startsAt: startsIso,
      endsAt: type === "training" ? combineDateTime(startDate, endTime) : null,
      convocationTime: eventConvocationTime,
      isOfficial: type === "tournament" ? isOfficial : false,
      attachments: attachments as unknown as Record<string, unknown>[],
      venueId,
      facilityId,
    };

    function invalidateEventsCaches() {
      queryClient.invalidateQueries({ queryKey: ["events"] });
      queryClient.invalidateQueries({ queryKey: ["upcoming"] });
    }

    try {
      if (mode === "create") {
        const shouldRepeat = type === "training" && repeatWeeks > 1;
        if (shouldRepeat) {
          let created = 0;
          let skipped = 0;
          let firstId: string | null = null;
          for (let i = 0; i < repeatWeeks; i++) {
            const offsetMs = i * 7 * 24 * 60 * 60 * 1000;
            const shiftedStarts = new Date(
              new Date(baseInput.startsAt).getTime() + offsetMs,
            ).toISOString();
            const shiftedEnds = baseInput.endsAt
              ? new Date(new Date(baseInput.endsAt).getTime() + offsetMs).toISOString()
              : null;
            const shiftedConvoc = baseInput.convocationTime
              ? new Date(new Date(baseInput.convocationTime).getTime() + offsetMs).toISOString()
              : null;
            try {
              const res = await createEventFn({
                data: {
                  ...baseInput,
                  startsAt: shiftedStarts,
                  endsAt: shiftedEnds,
                  convocationTime: shiftedConvoc,
                },
              });
              created += 1;
              if (!firstId) firstId = res.id;
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err);
              if (msg === "duplicate") {
                skipped += 1;
                continue;
              }
              setBusy(false);
              toast.error(translateError(msg));
              return;
            }
          }
          setBusy(false);
          if (created === 0) {
            toast.error(t("events.duplicateExists"));
            return;
          }
          if (skipped > 0) {
            toast.info(t("events.someDuplicatesSkipped", { count: skipped }));
          }
          toast.success(t("events.repeatCreated", { count: created }));
          invalidateEventsCaches();
          onOpenChange(false);
          if (firstId) onSaved(firstId);
          return;
        }

        const { id } = await createEventFn({ data: baseInput });
        setBusy(false);
        toast.success(t("events.published"));
        invalidateEventsCaches();
        onOpenChange(false);
        onSaved(id);
        if (sendNow && type !== "meeting") {
          navigate({
            to: "/events/$eventId",
            params: { eventId: id },
            search: { send: 1 } as any,
          });
        }
      } else {
        const { id } = await updateEventFn({
          data: { ...baseInput, id: initial!.id! },
        });
        setBusy(false);
        toast.success(t("common.saved"));
        invalidateEventsCaches();
        onOpenChange(false);
        onSaved(id);
      }
    } catch (err) {
      setBusy(false);
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(translateError(msg));
    }
  }

  return (
    <ResponsiveFormDialog
      open={open}
      onOpenChange={onOpenChange}
      trigger={trigger}
      title={mode === "create" ? t("events.create") : t("common.edit")}
    >
      <form onSubmit={onSubmit} className="space-y-4 mt-4 pb-8">
        {onBack && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 px-2 -ml-2"
            onClick={onBack}
          >
            ← {backLabel ?? t("common.back")}
          </Button>
        )}
        <div className="space-y-1.5">
          <Label>{t("events.selectTeam")}</Label>
          <Select value={teamId} onValueChange={setTeamId} required>
            <SelectTrigger>
              <SelectValue placeholder={t("events.selectTeam")} />
            </SelectTrigger>
            <SelectContent>
              {teams.map((tm) => (
                <SelectItem key={tm.id} value={tm.id}>
                  {tm.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label>{t("events.type")}</Label>
          <Select value={type} onValueChange={(v) => setType(v as EventType)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(["training", "match", "tournament", "meeting", "other"] as const).map((k) => (
                <SelectItem key={k} value={k}>
                  {t(`events.types.${k}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {type === "tournament" && (
          <div className="space-y-2 rounded-xl border border-border bg-card px-3 py-2.5">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-normal">{t("events.isOfficialTournament")}</Label>
              <Switch checked={isOfficial} onCheckedChange={setIsOfficial} />
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              {t("events.isOfficialTournamentDescription")}
            </p>
          </div>
        )}

        {type !== "match" && (
          <div className="space-y-1.5">
            <Label>{t("events.name")}</Label>
            <Input
              data-testid="event-name-input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={type === "training" ? t("events.types.training") : ""}
              required
            />
          </div>
        )}

        {type === "match" && (
          <>
            <div className="space-y-1.5">
              <Label>{t("events.competitionType")}</Label>
              <Select
                value={competitionType}
                onValueChange={(v) => {
                  const next = v as CompetitionType;
                  setCompetitionType(next);
                  if (next !== "championship") setChampionshipId(null);
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {availableCompetitionTypes.map((k) => (
                    <SelectItem key={k} value={k}>
                      {t(`events.competitionTypes.${k}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {competitionType === "championship" && teamId && (
              <ChampionshipPicker
                teamId={teamId}
                value={championshipId}
                onChange={setChampionshipId}
                historical={historicalChampionship}
              />
            )}
            {competitionType === "cup" && (
              <div className="space-y-1.5">
                <Label>{t("eventWizard.competitionName")}</Label>
                <Input
                  value={competitionName ?? ""}
                  onChange={(e) => setCompetitionName(e.target.value)}
                  placeholder={t("eventWizard.competitionNamePlaceholder")}
                />
              </div>
            )}
            <div className="space-y-1.5">
              <Label>{t("events.opponent")}</Label>
              <Input
                data-testid="event-opponent-input"
                required
                value={opponent ?? ""}
                onChange={(e) => setOpponent(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t("events.venue")}</Label>
              <div className="grid grid-cols-2 gap-2">
                {(["home", "away"] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => {
                      setIsHome(v);
                      if (v === "away") {
                        setVenueId(null);
                        setFacilityId(null);
                        setLocation("");
                        setLocationUrl("");
                      } else if (!venueId) {
                        setMeetingPoint("");
                        setLocation("");
                        setLocationUrl("");
                      }
                    }}
                    className={cn(
                      "rounded-xl py-2.5 text-sm font-medium border transition",
                      isHome === v
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-card border-border text-muted-foreground",
                    )}
                  >
                    {t(`events.${v}`)}
                  </button>
                ))}
              </div>
            </div>
            {isAwayMatch && (
              <AddressField
                label={t("events.meetingPoint")}
                value={meetingPoint ?? ""}
                onValueChange={setMeetingPoint}
                onPlaceUrl={() => undefined}
                placeholder={t("events.meetingPointHint")}
                helper={t("events.locationGoogleHelper")}
              />
            )}
          </>
        )}

        {type === "match" ? (
          <>
            <DateTimeField
              label={t("events.convocationDateTime")}
              date={convocDate}
              time={convocTime}
              onDate={setConvocDate}
              onTime={setConvocTime}
            />
            <DateTimeField
              label={t("events.matchDateTime")}
              date={startDate}
              time={startTime}
              onDate={setStartDate}
              onTime={setStartTime}
              required
              testId="event-start"
            />
          </>
        ) : type === "training" ? (
          <>
            {mode === "create" && (
              <div className="space-y-1.5">
                <Label>{t("events.series.mode")}</Label>
                <div className="grid grid-cols-2 gap-2">
                  {(
                    [
                      {
                        v: false,
                        label: t("events.series.modeSingle"),
                      },
                      {
                        v: true,
                        label: t("events.series.modeRecurring"),
                      },
                    ] as const
                  ).map((opt) => (
                    <button
                      key={String(opt.v)}
                      type="button"
                      onClick={() => setIsRecurring(opt.v)}
                      className={cn(
                        "rounded-xl py-2.5 text-sm font-medium border transition",
                        isRecurring === opt.v
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-card border-border text-muted-foreground",
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {!(mode === "create" && isRecurring) && (
              <>
                <DateOnlyField
                  label={t("events.trainingDate")}
                  date={startDate}
                  onDate={setStartDate}
                  required
                  testId="event-start"
                />
                <div className="grid grid-cols-3 gap-2">
                  <TimeField
                    label={t("events.convocationTimeShort")}
                    time={convocTime}
                    onTime={setConvocTime}
                  />
                  <TimeField
                    label={t("events.startTime")}
                    time={startTime}
                    onTime={(v) => {
                      setStartTime(v);
                      if (!endTime && v) {
                        setEndTime(addMinutesToTime(v, TRAINING_DEFAULT_DURATION_MIN));
                      }
                    }}
                    required
                    testId="event-start-time"
                  />
                  <TimeField label={t("events.endTime")} time={endTime} onTime={setEndTime} />
                </div>
              </>
            )}
            {mode === "create" && isRecurring && teamId && title.trim() && (
              <RecurringTrainingPlanner
                teamId={teamId}
                title={title.trim()}
                defaultLocation={location || null}
                isOfficial={true}
                onCreated={(res) => {
                  toast.success(
                    t("events.series.created", {
                      count: res.createdCount,
                    }),
                  );
                  onOpenChange(false);
                  onSaved(res.seriesId);
                }}
              />
            )}
            {mode === "create" && isRecurring && (!teamId || !title.trim()) && (
              <p className="text-xs text-muted-foreground rounded-lg border border-dashed border-border p-3">
                {t("events.series.needsTitleAndTeam")}
              </p>
            )}
          </>
        ) : (
          <>
            <DateTimeField
              label={t("events.startsAt")}
              date={startDate}
              time={startTime}
              onDate={setStartDate}
              onTime={setStartTime}
              required
              testId="event-start"
            />
            <DateTimeField
              label={t("events.convocationTime")}
              date={convocDate}
              time={convocTime}
              onDate={setConvocDate}
              onTime={setConvocTime}
            />
          </>
        )}

        {!(mode === "create" && type === "training" && isRecurring) && (
          <>
            {!isAwayMatch && (
              <VenuePicker
                clubId={activeClubId ?? undefined}
                venueId={venueId}
                facilityId={facilityId}
                autoApplyDefaults={isHomeMatch ? !venueId : mode === "create" && !location}
                onChange={(v: VenuePickerValue | null) => {
                  if (!v) return;
                  setVenueId(v.venueId);
                  setFacilityId(v.facilityId);
                  setLocation(v.location);
                  setLocationUrl(v.locationUrl ?? "");
                }}
              />
            )}
            <AddressField
              label={t("events.location")}
              value={location ?? ""}
              onValueChange={(val) => {
                setLocation(val);
                // Manual override: detach from the structured venue link.
                setVenueId(null);
                setFacilityId(null);
              }}
              onPlaceUrl={(url) => setLocationUrl(url ?? "")}
              placeholder={t("events.locationHint")}
              helper={
                isHomeMatch ? t("events.locationLockedHint") : t("events.locationGoogleHelper")
              }
              disabled={isHomeMatch}
            />

            <div className="space-y-1.5">
              <Label>{t("events.details")}</Label>
              <Textarea
                value={description ?? ""}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label>{t("events.attachments")}</Label>
              <AttachmentPicker value={attachments} onChange={setAttachments} prefix="events" />
            </div>

            {mode === "create" && type !== "meeting" && (
              <label className="flex items-start gap-2.5 rounded-xl border border-border bg-card p-3 cursor-pointer">
                <Checkbox
                  checked={sendNow}
                  onCheckedChange={(v) => setSendNow(v === true)}
                  className="mt-0.5"
                />
                <div className="space-y-0.5">
                  <div className="text-sm font-medium">
                    {t("events.openConvocationAfterCreate")}
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    {t("events.openConvocationAfterCreateHint")}
                  </div>
                </div>
              </label>
            )}

            {/*
             * Event-level override for call-up list visibility. Only shown
             * when editing an existing event (needs an id to key the
             * cascade). Read + write go through the staff-gated RPCs.
             */}
            {mode === "edit" && initial?.id && (
              <div className="rounded-xl border border-border bg-card p-4">
                <CallUpVisibilityField scope="event" id={initial.id} isStaff />
              </div>
            )}

            <Button
              type="submit"
              className="w-full h-11"
              disabled={busy || !teamId || titleMissing || (isHomeMatch && !venueId)}
            >
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : mode === "create" ? (
                t("events.publish")
              ) : (
                t("common.save")
              )}
            </Button>
          </>
        )}
      </form>
    </ResponsiveFormDialog>
  );
}
