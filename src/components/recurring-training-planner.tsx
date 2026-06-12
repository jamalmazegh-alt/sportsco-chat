import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { format } from "date-fns";
import { CalendarIcon, Plus, Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TimePicker } from "@/components/ui/time-picker";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { createTrainingSeries } from "@/lib/training-series.functions";
import {
  generateOccurrences,
  summarizeByWeekday,
  type SeriesSlotInput,
} from "@/lib/training-series-generator";

type Props = {
  teamId: string;
  title: string;
  defaultLocation: string | null;
  isOfficial: boolean;
  onCreated: (result: { seriesId: string; createdCount: number; skippedConflicts: number }) => void;
};

type LocalSlot = SeriesSlotInput & { uid: string };

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function parseYmd(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function DateField({ value, onChange, label }: { value?: string; onChange: (v: string) => void; label: string }) {
  return (
    <div className="space-y-1.5 flex-1">
      <Label className="text-xs">{label}</Label>
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" className={cn("w-full justify-start font-normal", !value && "text-muted-foreground")} type="button">
            <CalendarIcon className="h-4 w-4" />
            {value ? format(parseYmd(value), "dd/MM/yyyy") : "—"}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={value ? parseYmd(value) : undefined}
            onSelect={(d) => d && onChange(ymd(d))}
            className="pointer-events-auto"
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}

export function RecurringTrainingPlanner({ teamId, title, defaultLocation, isOfficial, onCreated }: Props) {
  const { t, i18n } = useTranslation();
  const create = useServerFn(createTrainingSeries);
  const [busy, setBusy] = useState(false);

  const today = new Date();
  const [startsOn, setStartsOn] = useState<string>(ymd(today));
  const [endsOn, setEndsOn] = useState<string>(ymd(new Date(today.getFullYear() + (today.getMonth() >= 6 ? 1 : 0), 5, 30)));

  const [slots, setSlots] = useState<LocalSlot[]>([
    { uid: crypto.randomUUID(), weekday: 1, meeting_time: "", start_time: "19:00", end_time: "20:30", location: "" },
  ]);

  const [excludedDates, setExcludedDates] = useState<string[]>([]);
  const [excludedRanges, setExcludedRanges] = useState<{ from: string; to: string }[]>([]);

  const occurrences = useMemo(
    () =>
      generateOccurrences({
        startsOn,
        endsOn,
        slots: slots.map((s) => ({ ...s, meeting_time: s.meeting_time || null })),
        excludedDates,
        excludedRanges,
        defaultLocation,
      }),
    [startsOn, endsOn, slots, excludedDates, excludedRanges, defaultLocation],
  );

  const occurrenceDates = useMemo(() => new Set(occurrences.map((o) => o.date)), [occurrences]);
  const byWd = useMemo(() => summarizeByWeekday(occurrences), [occurrences]);

  const weekdayLabels = useMemo(() => {
    const base = new Date(2024, 0, 7); // Sun
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(base);
      d.setDate(base.getDate() + i);
      return d.toLocaleDateString(i18n.language, { weekday: "long" });
    });
  }, [i18n.language]);

  function addSlot() {
    setSlots((s) => [
      ...s,
      { uid: crypto.randomUUID(), weekday: 3, meeting_time: "", start_time: "19:00", end_time: "20:30", location: "" },
    ]);
  }
  function removeSlot(uid: string) {
    setSlots((s) => (s.length > 1 ? s.filter((x) => x.uid !== uid) : s));
  }
  function updateSlot(uid: string, patch: Partial<LocalSlot>) {
    setSlots((s) => s.map((x) => (x.uid === uid ? { ...x, ...patch } : x)));
  }

  function toggleExcludedDate(date: Date) {
    const key = ymd(date);
    if (!occurrenceDates.has(key) && !excludedDates.includes(key)) return;
    setExcludedDates((curr) => (curr.includes(key) ? curr.filter((d) => d !== key) : [...curr, key]));
  }

  const [rangeFrom, setRangeFrom] = useState<string>("");
  const [rangeTo, setRangeTo] = useState<string>("");
  function addRange() {
    if (!rangeFrom || !rangeTo) return;
    setExcludedRanges((r) => [...r, { from: rangeFrom, to: rangeTo }]);
    setRangeFrom("");
    setRangeTo("");
  }

  async function submit() {
    if (!teamId) {
      toast.error(t("events.selectTeam"));
      return;
    }
    if (!title.trim()) {
      toast.error(t("events.nameRequired"));
      return;
    }
    if (occurrences.length === 0) {
      toast.error(t("events.series.noOccurrences", { defaultValue: "Aucune séance générée" }));
      return;
    }
    setBusy(true);
    try {
      const res = await create({
        data: {
          teamId,
          title: title.trim(),
          description: null,
          location: defaultLocation,
          startsOn,
          endsOn,
          isOfficial,
          slots: slots.map((s) => ({
            weekday: s.weekday,
            meeting_time: s.meeting_time || null,
            start_time: s.start_time,
            end_time: s.end_time,
            location: s.location || null,
          })),
          excludedDates,
          excludedRanges,
        },
      });
      onCreated(res);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed");
    } finally {
      setBusy(false);
    }
  }

  const previewMonth = startsOn ? parseYmd(startsOn) : new Date();

  return (
    <div className="space-y-4 rounded-xl border border-border bg-card/40 p-3">
      <div className="space-y-1.5">
        <Label className="text-sm">{t("events.series.period", { defaultValue: "Période" })}</Label>
        <div className="flex gap-2">
          <DateField label={t("events.series.startDate", { defaultValue: "Début" })} value={startsOn} onChange={setStartsOn} />
          <DateField label={t("events.series.endDate", { defaultValue: "Fin" })} value={endsOn} onChange={setEndsOn} />
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-sm">{t("events.series.slots", { defaultValue: "Créneaux hebdomadaires" })}</Label>
          <Button type="button" size="sm" variant="outline" onClick={addSlot}>
            <Plus className="h-4 w-4" />
            {t("events.series.addSlot", { defaultValue: "Ajouter" })}
          </Button>
        </div>
        <div className="space-y-2">
          {slots.map((s, idx) => (
            <div key={s.uid} className="space-y-2 rounded-lg border border-border bg-background p-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">#{idx + 1}</span>
                {slots.length > 1 && (
                  <Button type="button" size="icon-sm" variant="ghost" onClick={() => removeSlot(s.uid)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="col-span-2">
                  <Label className="text-xs">{t("events.series.weekday", { defaultValue: "Jour" })}</Label>
                  <Select value={String(s.weekday)} onValueChange={(v) => updateSlot(s.uid, { weekday: Number(v) })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[1, 2, 3, 4, 5, 6, 0].map((wd) => (
                        <SelectItem key={wd} value={String(wd)}>
                          {weekdayLabels[wd]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <Label className="text-xs">{t("events.convocationTimeShort")}</Label>
                  <TimePicker value={s.meeting_time ?? ""} onChange={(v) => updateSlot(s.uid, { meeting_time: v })} />
                </div>
                <div>
                  <Label className="text-xs">{t("events.startTime")}</Label>
                  <TimePicker value={s.start_time} onChange={(v) => updateSlot(s.uid, { start_time: v })} />
                </div>
                <div>
                  <Label className="text-xs">{t("events.endTime")}</Label>
                  <TimePicker value={s.end_time} onChange={(v) => updateSlot(s.uid, { end_time: v })} />
                </div>
              </div>
              <div>
                <Label className="text-xs">{t("events.location")}</Label>
                <Input
                  value={s.location ?? ""}
                  onChange={(e) => updateSlot(s.uid, { location: e.target.value })}
                  placeholder={defaultLocation ?? ""}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label className="text-sm">{t("events.series.preview", { defaultValue: "Prévisualisation" })}</Label>
        <p className="text-xs text-muted-foreground">{t("events.series.previewHint", { defaultValue: "Cliquez sur une date pour l'exclure / la réintégrer" })}</p>
        <div className="rounded-lg border border-border bg-background p-1 flex justify-center">
          <Calendar
            mode="single"
            month={previewMonth}
            onMonthChange={() => undefined}
            onDayClick={(d) => toggleExcludedDate(d)}
            modifiers={{
              included: (d) => occurrenceDates.has(ymd(d)),
              excludedDate: (d) => excludedDates.includes(ymd(d)),
            }}
            modifiersClassNames={{
              included: "bg-primary/20 text-foreground font-semibold rounded-md",
              excludedDate: "line-through opacity-60",
            }}
            className="pointer-events-auto"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label className="text-sm">{t("events.series.excludedDates", { defaultValue: "Dates exclues" })}</Label>
        <div className="flex gap-2 items-end">
          <DateField label={t("events.series.rangeFrom", { defaultValue: "Du" })} value={rangeFrom} onChange={setRangeFrom} />
          <DateField label={t("events.series.rangeTo", { defaultValue: "Au" })} value={rangeTo} onChange={setRangeTo} />
          <Button type="button" size="sm" variant="outline" onClick={addRange} disabled={!rangeFrom || !rangeTo}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        {excludedRanges.length > 0 && (
          <ul className="text-xs space-y-1">
            {excludedRanges.map((r, i) => (
              <li key={i} className="flex items-center justify-between rounded bg-muted px-2 py-1">
                <span>
                  {format(parseYmd(r.from), "dd/MM/yyyy")} → {format(parseYmd(r.to), "dd/MM/yyyy")}
                </span>
                <Button type="button" size="icon-sm" variant="ghost" onClick={() => setExcludedRanges((x) => x.filter((_, j) => j !== i))}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </li>
            ))}
          </ul>
        )}
        {excludedDates.length > 0 && (
          <p className="text-[11px] text-muted-foreground">
            {t("events.series.excludedDatesCount", { defaultValue: "{{count}} date(s) exclue(s) manuellement", count: excludedDates.length })}
          </p>
        )}
      </div>

      <div className="rounded-lg border border-border bg-background p-2.5 text-xs space-y-1">
        <div className="font-semibold">{t("events.series.summary", { defaultValue: "Récapitulatif" })}</div>
        <ul className="text-muted-foreground space-y-0.5">
          {Object.entries(byWd)
            .sort(([a], [b]) => Number(a) - Number(b))
            .map(([wd, n]) => (
              <li key={wd}>
                {n} × {weekdayLabels[Number(wd)]}
              </li>
            ))}
        </ul>
        <div className="pt-1 font-medium text-foreground">
          {t("events.series.totalSessions", { defaultValue: "Total : {{count}} séances", count: occurrences.length })}
        </div>
      </div>

      <Button type="button" className="w-full h-11" onClick={submit} disabled={busy || occurrences.length === 0}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : t("events.series.createSeries", { defaultValue: "Créer la série" })}
      </Button>
    </div>
  );
}
