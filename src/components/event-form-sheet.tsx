import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { format } from "date-fns";
import { CalendarIcon, Check, Loader2, MapPin, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger,
} from "@/components/ui/sheet";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

declare global {
  interface Window {
    google?: any;
    __squadlyGoogleMapsPromise?: Promise<void>;
  }
}

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
  is_home: boolean | null;
  meeting_point: string | null;
  starts_at: string; // ISO
  ends_at: string | null;
  convocation_time: string | null;
};

type Team = { id: string; name: string };
type TeamOption = Team & { competitions?: CompetitionType[] | null };

type Props = {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  trigger?: ReactNode;
  teams: TeamOption[];
  initial?: Partial<EventFormValues>;
  mode: "create" | "edit";
  userId: string;
  onSaved: (eventId: string) => void;
};

function toGoogleMapsUrl(address: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}

function splitDateTime(iso: string | null | undefined): { date: Date | undefined; time: string } {
  if (!iso) return { date: undefined, time: "" };
  const d = new Date(iso);
  return { date: d, time: format(d, "HH:mm") };
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

function loadGoogleMapsPlaces(): Promise<void> | null {
  const key = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  if (!key || typeof window === "undefined") return null;
  if (window.google?.maps?.places) return Promise.resolve();
  if (!window.__squadlyGoogleMapsPromise) {
    window.__squadlyGoogleMapsPromise = new Promise((resolve, reject) => {
      const existing = document.querySelector<HTMLScriptElement>('script[data-squadly-google-maps="true"]');
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
  label, date, time, onDate, onTime, required,
}: {
  label: string; date: Date | undefined; time: string;
  onDate: (d: Date | undefined) => void; onTime: (t: string) => void; required?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div className="grid grid-cols-[1fr_110px] gap-2">
        <Popover>
          <PopoverTrigger asChild>
            <Button type="button" variant="outline" className={cn("h-10 justify-start font-normal", !date && "text-muted-foreground")}>
              <CalendarIcon className="h-4 w-4" />
              {date ? format(date, "EEE d MMM") : "—"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar mode="single" selected={date} onSelect={onDate} initialFocus className="p-3 pointer-events-auto" />
          </PopoverContent>
        </Popover>
        <Input type="time" value={time} onChange={(e) => onTime(e.target.value)} required={required} className="h-10" />
      </div>
    </div>
  );
}

export function EventFormSheet({ open, onOpenChange, trigger, teams, initial, mode, userId, onSaved }: Props) {
  const { t } = useTranslation();
  const googlePlacesEnabled = Boolean(import.meta.env.VITE_GOOGLE_MAPS_API_KEY);

  const [teamId, setTeamId] = useState(initial?.team_id ?? "");
  const [type, setType] = useState<EventType>((initial?.type as EventType) ?? "training");
  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [location, setLocation] = useState(initial?.location ?? "");
  const [locationUrl, setLocationUrl] = useState(initial?.location_url ?? "");
  const [opponent, setOpponent] = useState(initial?.opponent ?? "");
  const [competitionType, setCompetitionType] = useState<CompetitionType>((initial?.competition_type as CompetitionType) ?? "friendly");
  const [competitionName, setCompetitionName] = useState(initial?.competition_name ?? "");
  const [isHome, setIsHome] = useState<"home" | "away">(initial?.is_home === false ? "away" : "home");
  const [meetingPoint, setMeetingPoint] = useState(initial?.meeting_point ?? "");

  const startsInit = splitDateTime(initial?.starts_at);
  const endsInit = splitDateTime(initial?.ends_at);
  const convocInit = splitDateTime(initial?.convocation_time);

  const [startDate, setStartDate] = useState<Date | undefined>(startsInit.date);
  const [startTime, setStartTime] = useState(startsInit.time);
  const [endDate, setEndDate] = useState<Date | undefined>(endsInit.date);
  const [endTime, setEndTime] = useState(endsInit.time);
  const [convocDate, setConvocDate] = useState<Date | undefined>(convocInit.date);
  const [convocTime, setConvocTime] = useState(convocInit.time);

  const [busy, setBusy] = useState(false);
  const selectedTeam = teams.find((tm) => tm.id === teamId);
  const availableCompetitionTypes = competitionOptions(selectedTeam);

  // When opening fresh, sync from initial
  useEffect(() => {
    if (!open) return;
    setTeamId(initial?.team_id ?? "");
    setType((initial?.type as EventType) ?? "training");
    setTitle(initial?.title ?? "");
    setDescription(initial?.description ?? "");
    setLocation(initial?.location ?? "");
    setLocationUrl(initial?.location_url ?? "");
    setOpponent(initial?.opponent ?? "");
    setCompetitionType((initial?.competition_type as CompetitionType) ?? "friendly");
    setCompetitionName(initial?.competition_name ?? "");
    setIsHome(initial?.is_home === false ? "away" : "home");
    setMeetingPoint(initial?.meeting_point ?? "");
    const s = splitDateTime(initial?.starts_at);
    const e = splitDateTime(initial?.ends_at);
    const c = splitDateTime(initial?.convocation_time);
    setStartDate(s.date); setStartTime(s.time);
    setEndDate(e.date); setEndTime(e.time);
    setConvocDate(c.date); setConvocTime(c.time);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!availableCompetitionTypes.includes(competitionType)) {
      setCompetitionType(availableCompetitionTypes[0] ?? "friendly");
    }
  }, [availableCompetitionTypes, competitionType]);

  useEffect(() => {
    if (!open || !googlePlacesEnabled) return;
    loadGoogleMapsPlaces()?.catch(() => undefined);
  }, [googlePlacesEnabled, open]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!teamId) { toast.error(t("events.selectTeam")); return; }
    const startsIso = combineDateTime(startDate, startTime);
    if (!startsIso) { toast.error(t("events.startsAt")); return; }
    setBusy(true);

    const finalTitle = type === "training"
      ? (title.trim() || t("events.types.training"))
      : type === "match"
        ? (opponent ? `vs ${opponent}` : t("events.types.match"))
        : title.trim();

    const finalLocationUrl = locationUrl?.trim()
      ? locationUrl.trim()
      : (location?.trim() ? toGoogleMapsUrl(location.trim()) : null);

    const payload = {
      team_id: teamId,
      type,
      title: finalTitle,
      description: description || null,
      location: location || null,
      location_url: finalLocationUrl,
      opponent: type === "match" ? (opponent || null) : null,
      competition_type: type === "match" ? competitionType : null,
      competition_name: type === "match" ? (competitionName || null) : null,
      is_home: type === "match" ? (isHome === "home") : null,
      meeting_point: type === "match" && isHome === "away" ? (meetingPoint || null) : null,
      starts_at: startsIso,
      ends_at: type === "training" ? combineDateTime(endDate ?? startDate, endTime) : null,
      convocation_time: combineDateTime(convocDate ?? startDate, convocTime),
    };

    if (mode === "create") {
      const { data, error } = await supabase
        .from("events")
        .insert({ ...payload, status: "published", created_by: userId, convocations_sent: false })
        .select("id")
        .single();
      setBusy(false);
      if (error || !data) { toast.error(error?.message ?? "Failed"); return; }
      toast.success(t("events.publish"));
      onOpenChange(false);
      onSaved(data.id);
    } else {
      const { error } = await supabase.from("events").update(payload).eq("id", initial!.id!);
      setBusy(false);
      if (error) { toast.error(error.message); return; }
      toast.success(t("common.saved"));
      onOpenChange(false);
      onSaved(initial!.id!);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      {trigger && <SheetTrigger asChild>{trigger}</SheetTrigger>}
      <SheetContent side="bottom" className="h-[92vh] rounded-t-3xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{mode === "create" ? t("events.create") : t("common.edit")}</SheetTitle>
        </SheetHeader>
        <form onSubmit={onSubmit} className="space-y-4 mt-4 pb-8">
          <div className="space-y-1.5">
            <Label>{t("events.selectTeam")}</Label>
            <Select value={teamId} onValueChange={setTeamId} required>
              <SelectTrigger><SelectValue placeholder={t("events.selectTeam")} /></SelectTrigger>
              <SelectContent>
                {teams.map((tm) => <SelectItem key={tm.id} value={tm.id}>{tm.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>{t("events.type")}</Label>
            <Select value={type} onValueChange={(v) => setType(v as EventType)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(["training", "match", "tournament", "meeting", "other"] as const).map((k) => (
                  <SelectItem key={k} value={k}>{t(`events.types.${k}`)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {type !== "match" && (
            <div className="space-y-1.5">
              <Label>{t("events.name")}</Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={type === "training" ? t("events.types.training") : ""}
                required={type !== "training"}
              />
            </div>
          )}

          {type === "match" && (
            <>
              <div className="space-y-1.5">
                <Label>{t("events.competitionType")}</Label>
                <Select value={competitionType} onValueChange={(v) => setCompetitionType(v as CompetitionType)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(["friendly", "championship", "cup"] as const).map((k) => (
                      <SelectItem key={k} value={k}>{t(`events.competitionTypes.${k}`)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {competitionType !== "friendly" && (
                <div className="space-y-1.5">
                  <Label>{t("events.competitionName")}</Label>
                  <Input value={competitionName ?? ""} onChange={(e) => setCompetitionName(e.target.value)} />
                </div>
              )}
              <div className="space-y-1.5">
                <Label>{t("events.opponent")}</Label>
                <Input required value={opponent ?? ""} onChange={(e) => setOpponent(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>{t("events.venue")}</Label>
                <div className="grid grid-cols-2 gap-2">
                  {(["home", "away"] as const).map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setIsHome(v)}
                      className={cn(
                        "rounded-xl py-2.5 text-sm font-medium border transition",
                        isHome === v
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-card border-border text-muted-foreground"
                      )}
                    >
                      {t(`events.${v}`)}
                    </button>
                  ))}
                </div>
              </div>
              {isHome === "away" && (
                <div className="space-y-1.5">
                  <Label>{t("events.meetingPoint")}</Label>
                  <Input value={meetingPoint ?? ""} onChange={(e) => setMeetingPoint(e.target.value)} placeholder={t("events.meetingPointHint")} />
                </div>
              )}
            </>
          )}

          <DateTimeField
            label={t("events.startsAt")}
            date={startDate} time={startTime}
            onDate={setStartDate} onTime={setStartTime} required
          />
          <DateTimeField
            label={t("events.endsAt")}
            date={endDate} time={endTime}
            onDate={setEndDate} onTime={setEndTime}
          />
          <DateTimeField
            label={t("events.convocationTime")}
            date={convocDate} time={convocTime}
            onDate={setConvocDate} onTime={setConvocTime}
          />

          <div className="space-y-1.5">
            <Label>{t("events.location")}</Label>
            <Input
              value={location ?? ""}
              onChange={(e) => setLocation(e.target.value)}
              placeholder={t("events.locationHint")}
            />
            <p className="text-[11px] text-muted-foreground">{t("events.locationAutoMaps")}</p>
          </div>
          <div className="space-y-1.5">
            <Label>
              {t("events.locationUrl")}{" "}
              <span className="text-xs text-muted-foreground">({t("common.optional")})</span>
            </Label>
            <Input type="url" value={locationUrl ?? ""} onChange={(e) => setLocationUrl(e.target.value)} placeholder="https://maps.google.com/..." />
          </div>

          <div className="space-y-1.5">
            <Label>{t("events.details")}</Label>
            <Textarea value={description ?? ""} onChange={(e) => setDescription(e.target.value)} />
          </div>

          <Button type="submit" className="w-full h-11" disabled={busy || !teamId}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : (mode === "create" ? t("events.publish") : t("common.save"))}
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}
