import { useState, useEffect, type KeyboardEvent, type ReactNode } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Loader2,
  Shuffle,
  Trophy,
  Clock,
  CalendarClock,
  HelpCircle,
  Plus,
  Minus,
  X,
  MapPin,
  UtensilsCrossed,
  Dices,
  Save,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

import {
  autoCreateGroupsAndFixtures,
  generateKnockoutFromGroups,
  updateTournament,
  autoScheduleMatches,
} from "../tournaments.functions";
import { DrawDialog } from "./DrawDialog";
import { DestructiveConfirmSheet } from "@/components/destructive-confirm-sheet";

interface Props {
  tournamentId: string;
  format: "group" | "knockout" | "mixed";
  status: string;
  numTeams: number;
  groupsCount: number;
  matchesCount: number;
  startsOn?: string;
  matchDurationMin?: number | null;
  breakMin?: number | null;
  dailyStartTime?: string | null;
  dailyEndTime?: string | null;
  fields?: string[] | null;
  settings?: Record<string, any> | null;
  teams: Array<{ id: string; name: string; short_name?: string | null; logo_url?: string | null }>;
  /** Restrict which blocks render. Defaults to "all" (legacy behaviour). */
  view?: "all" | "format" | "draw" | "schedule";
}

/* ---------- Reusable block primitives ---------- */

function Block({
  icon,
  iconBg,
  title,
  subtitle,
  children,
  tone,
}: {
  icon: ReactNode;
  iconBg: string;
  title: string;
  subtitle?: string;
  children: ReactNode;
  tone?: "primary" | "default";
}) {
  return (
    <section
      className={cn(
        "rounded-2xl border bg-card overflow-hidden",
        tone === "primary" ? "border-primary/30" : "border-border",
      )}
    >
      <header className="flex items-center gap-3 px-4 py-3 border-b border-border/60 bg-muted/30">
        <div
          className={cn(
            "h-9 w-9 rounded-lg flex items-center justify-center shrink-0",
            iconBg,
          )}
        >
          {icon}
        </div>
        <div className="min-w-0">
          <h3 className="text-sm font-semibold leading-tight truncate">{title}</h3>
          {subtitle && (
            <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{subtitle}</p>
          )}
        </div>
      </header>
      <div className="p-4 space-y-4">{children}</div>
    </section>
  );
}

function Stepper({
  label,
  value,
  onChange,
  step = 5,
  min = 0,
  max = 240,
  unit,
  className,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  step?: number;
  min?: number;
  max?: number;
  unit?: string;
  className?: string;
}) {
  const clamp = (n: number) => Math.min(max, Math.max(min, n));
  return (
    <div className={cn("space-y-1.5", className)}>
      <label className="text-[11px] font-medium text-muted-foreground block">{label}</label>
      <div className="flex items-stretch rounded-xl border-[1.5px] border-border bg-muted/40 overflow-hidden focus-within:border-primary transition-colors">
        <button
          type="button"
          onClick={() => onChange(clamp(value - step))}
          className="w-10 flex items-center justify-center text-foreground hover:bg-muted active:bg-border transition-colors shrink-0"
          aria-label="−"
        >
          <Minus className="h-4 w-4" />
        </button>
        <input
          type="number"
          inputMode="numeric"
          value={value}
          onChange={(e) => onChange(clamp(parseInt(e.target.value || String(min), 10)))}
          className="flex-1 min-w-0 bg-transparent text-center text-base font-bold tabular-nums outline-none border-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
        />
        <button
          type="button"
          onClick={() => onChange(clamp(value + step))}
          className="w-10 flex items-center justify-center text-foreground hover:bg-muted active:bg-border transition-colors shrink-0"
          aria-label="+"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>
      {unit && (
        <p className="text-[10px] text-muted-foreground text-center">{unit}</p>
      )}
    </div>
  );
}

function TimeField({
  label,
  value,
  onChange,
  tone,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  tone?: "default" | "amber";
}) {
  return (
    <div className="flex-1 min-w-0 space-y-1.5">
      <label
        className={cn(
          "text-[11px] font-medium block",
          tone === "amber" ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground",
        )}
      >
        {label}
      </label>
      <Input
        type="time"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          "h-11 text-center text-base font-bold tabular-nums border-[1.5px] rounded-xl",
          tone === "amber"
            ? "bg-amber-50 dark:bg-amber-950/30 border-amber-300 dark:border-amber-800"
            : "bg-muted/40",
        )}
      />
    </div>
  );
}

/* ---------- Main component ---------- */

export function GroupsAndFixtures({
  tournamentId,
  format,
  status,
  numTeams,
  groupsCount,
  matchesCount,
  startsOn,
  matchDurationMin,
  breakMin,
  dailyStartTime,
  dailyEndTime,
  fields,
  settings,
  teams,
  view = "all",
}: Props) {
  const { t } = useTranslation("tournaments");
  const qc = useQueryClient();
  const [drawOpen, setDrawOpen] = useState(false);
  const [regenGroupsOpen, setRegenGroupsOpen] = useState(false);
  const [genBracketOpen, setGenBracketOpen] = useState(false);

  const [numGroups, setNumGroups] = useState(2);
  const [qualifiers, setQualifiers] = useState(2);
  const [thirdPlace, setThirdPlace] = useState(false);

  // Match scheduling settings
  const [duration, setDuration] = useState(matchDurationMin ?? 20);
  const [pause, setPause] = useState(breakMin ?? 5);
  const [startTime, setStartTime] = useState(dailyStartTime ?? "09:00");
  const [endTime, setEndTime] = useState(dailyEndTime ?? "18:00");
  const [fieldsList, setFieldsList] = useState<string[]>(
    fields && fields.length ? fields : [t("groups.defaultFieldName")],
  );

  const [newField, setNewField] = useState("");
  const [lunchEnabled, setLunchEnabled] = useState<boolean>(!!settings?.lunch_start);
  const [lunchStart, setLunchStart] = useState<string>(settings?.lunch_start ?? "12:00");
  const [lunchEnd, setLunchEnd] = useState<string>(settings?.lunch_end ?? "13:30");
  const [minRest, setMinRest] = useState<number>(
    settings?.forfeit?.minRestMinutes ?? 30,
  );

  useEffect(() => {
    setDuration(matchDurationMin ?? 20);
    setPause(breakMin ?? 5);
    setStartTime(dailyStartTime ?? "09:00");
    setEndTime(dailyEndTime ?? "18:00");
    setFieldsList(fields && fields.length ? fields : [t("groups.defaultFieldName")]);
    setLunchEnabled(!!settings?.lunch_start);
    setLunchStart(settings?.lunch_start ?? "12:00");
    setLunchEnd(settings?.lunch_end ?? "13:30");
    setMinRest(settings?.forfeit?.minRestMinutes ?? 30);
  }, [matchDurationMin, breakMin, dailyStartTime, dailyEndTime, fields, settings]);

  function addField() {
    const v = newField.trim();
    if (!v) return;
    if (fieldsList.includes(v)) {
      toast.error(t("groups.fieldDuplicate"));
      return;
    }
    setFieldsList([...fieldsList, v]);
    setNewField("");
    toast.success(t("groups.fieldAddedToast", { name: v }));
  }

  function removeField(name: string) {
    setFieldsList(fieldsList.filter((f) => f !== name));
  }
  function onFieldKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      addField();
    }
  }

  const genGroupsFn = useServerFn(autoCreateGroupsAndFixtures);
  const genKnockoutFn = useServerFn(generateKnockoutFromGroups);
  const updateFn = useServerFn(updateTournament);
  const scheduleFn = useServerFn(autoScheduleMatches);

  const genGroups = useMutation({
    mutationFn: () =>
      genGroupsFn({
        data: {
          tournament_id: tournamentId,
          num_groups: numGroups,
          qualifiers_per_group: qualifiers,
        },
      }),
    onSuccess: (res) => {
      toast.success(t("groups.generatedToast", { groups: res.groups_created, matches: res.matches_created }));
      qc.invalidateQueries({ queryKey: ["tournament", tournamentId] });
    },
    onError: (e: any) => toast.error(e?.message ?? t("common.error")),
  });

  const genKnockout = useMutation({
    mutationFn: (force: boolean = false) =>
      genKnockoutFn({
        data: { tournament_id: tournamentId, third_place: thirdPlace, force },
      }),
    onSuccess: (res) => {
      toast.success(t("groups.bracketCreatedToast", { count: res.matches_created }));
      qc.invalidateQueries({ queryKey: ["tournament", tournamentId] });
    },
    onError: (e: any) => {
      const msg = String(e?.message ?? "");
      // B3 — backstop : régénérer une phase finale avec résultats exige une
      // confirmation forte (le serveur refuse sinon via 409).
      if (msg.includes("FINALS_ALREADY_STARTED")) {
        if (
          window.confirm(
            t("groups.regenFinalsConfirm", {
              defaultValue:
                "La phase finale a déjà des résultats. Régénérer EFFACERA tous ces résultats. Continuer ?",
            }),
          )
        ) {
          genKnockout.mutate(true);
        }
        return;
      }
      toast.error(e?.message ?? t("common.error"));
    },
  });

  const saveSettings = useMutation({
    mutationFn: () => {
      const fl = fieldsList.length ? fieldsList : [t("groups.defaultFieldName")];
      const nextSettings = {
        ...(settings ?? {}),
        lunch_start: lunchEnabled ? lunchStart : null,
        lunch_end: lunchEnabled ? lunchEnd : null,
        forfeit: {
          ...(settings?.forfeit ?? {}),
          minRestMinutes: minRest,
        },
      };
      return updateFn({
        data: {
          tournament_id: tournamentId,
          patch: {
            match_duration_min: duration,
            break_min: pause,
            daily_start_time: startTime,
            daily_end_time: endTime,
            fields: fl,
            settings: nextSettings,
          },
        },
      });
    },
    onSuccess: () => {
      toast.success(t("groups.settingsSavedToast"));
      qc.invalidateQueries({ queryKey: ["tournament", tournamentId] });
    },
    onError: (e: any) => toast.error(e?.message ?? t("common.error")),
  });

  const schedule = useMutation({
    mutationFn: async () => {
      if (!startsOn) throw new Error(t("groups.missingStartDate"));
      const fl = fieldsList.length ? fieldsList : [t("groups.defaultFieldName")];
      await saveSettings.mutateAsync();
      return scheduleFn({
        data: {
          tournament_id: tournamentId,
          starts_on: startsOn,
          daily_start_time: startTime,
          daily_end_time: endTime,
          match_duration_min: duration,
          break_min: pause,
          fields: fl,
          lunch_start_time: lunchEnabled ? lunchStart : undefined,
          lunch_end_time: lunchEnabled ? lunchEnd : undefined,
          min_rest_min: minRest,
        },
      });
    },
    onSuccess: (res: any) => {
      const skipped = res?.skipped ?? 0;
      toast.success(
        skipped > 0
          ? t("groups.scheduledWithSkippedToast", { count: res.scheduled, skipped })
          : t("groups.scheduledToast", { count: res.scheduled }),
      );
      qc.invalidateQueries({ queryKey: ["tournament", tournamentId] });
    },
    onError: (e: any) => toast.error(e?.message ?? t("common.error")),
  });

  const supportsGroups = format !== "knockout";
  const supportsKnockout = format !== "group";
  const hasExistingDraw = groupsCount > 0 || matchesCount > 0;

  const showDraw = view === "all" || view === "draw";
  const showGroupsConfig = (view === "all" || view === "schedule") && supportsGroups;
  const showFinals = (view === "all" || view === "draw") && supportsKnockout;
  const showDuration = view === "all" || view === "format";
  const showSlot = view === "all" || view === "format";
  const showFields = view === "all";
  const showSaveCta = view === "all" || view === "format" || view === "schedule";
  const showScheduleCta = view === "all" || view === "schedule";
  const showStickyBar = showSaveCta || showScheduleCta;

  return (
    <>
      {/* pb-40 = leave room for sticky CTA + bottom nav */}
      <div className={cn("space-y-3", showStickyBar ? "pb-40" : "pb-6")}>
        {/* Block 1 — Tirage au sort */}
        {showDraw && (
          <>
            <Block
              tone="primary"
              icon={<Dices className="h-5 w-5 text-primary" />}
              iconBg="bg-primary/10"
              title={t("groups.drawTitle")}
              subtitle={t("groups.drawSubtitle")}
            >
              <p className="text-xs text-muted-foreground">
                {numTeams < 2 ? t("groups.drawHintEmpty") : t("groups.drawHint")}
              </p>
              <Button
                onClick={() => setDrawOpen(true)}
                disabled={numTeams < 2}
                className="w-full h-11"
                variant={hasExistingDraw ? "outline" : "default"}
              >
                <Dices className="h-4 w-4" />
                {hasExistingDraw ? t("groups.drawRelaunch") : t("groups.drawLaunch")}
              </Button>
            </Block>

            <DrawDialog
              open={drawOpen}
              onOpenChange={setDrawOpen}
              tournamentId={tournamentId}
              format={format}
              status={status}
              teams={teams}
              hasExistingDraw={hasExistingDraw}
            />
          </>
        )}

        {/* Block 2 — Groupes & matchs */}
        {showGroupsConfig && (
          <Block
            icon={<Shuffle className="h-5 w-5 text-blue-600 dark:text-blue-400" />}
            iconBg="bg-blue-100 dark:bg-blue-950/40"
            title={t("groups.groupsTitle")}
            subtitle={`${t("groups.groupsCount", { count: groupsCount })} · ${t("groups.matchesCount", { count: matchesCount })}`}
          >
            <div className="grid grid-cols-2 gap-3">
              <Stepper
                label={t("groups.numGroups")}
                value={numGroups}
                onChange={setNumGroups}
                step={1}
                min={1}
                max={16}
              />
              <Stepper
                label={t("groups.qualifiersPerGroup")}
                value={qualifiers}
                onChange={setQualifiers}
                step={1}
                min={1}
                max={8}
              />
            </div>
            <Button
              onClick={() => {
                if (groupsCount > 0) {
                  setRegenGroupsOpen(true);
                } else {
                  genGroups.mutate();
                }
              }}
              disabled={genGroups.isPending || numTeams < 2}
              variant={groupsCount > 0 ? "destructive" : "default"}
              className="w-full h-11"
            >
              {genGroups.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : groupsCount > 0 ? (
                t("groups.regenerateGroups")
              ) : (
                t("groups.generateGroups")
              )}
            </Button>
            {groupsCount > 0 && (
              <p className="text-[11px] text-amber-600 dark:text-amber-400">
                {t("groups.regenerateWarn")}
              </p>
            )}
          </Block>
        )}

        {/* Block 3 — Finales */}
        {showFinals && (
          <Block
            icon={<Trophy className="h-5 w-5 text-amber-600 dark:text-amber-400" />}
            iconBg="bg-amber-100 dark:bg-amber-950/40"
            title={t("groups.finalsTitle")}
            subtitle={t("groups.finalsSubtitle")}
          >
            <div className="flex items-start gap-2 text-xs text-muted-foreground">
              <HelpCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <span>{t("groups.finalsTooltip")}</span>
            </div>
            <label className="flex items-center justify-between gap-2 py-1">
              <span className="text-sm font-medium">{t("groups.thirdPlaceMatch")}</span>
              <Switch checked={thirdPlace} onCheckedChange={setThirdPlace} />
            </label>
            <Button
              onClick={() => setGenBracketOpen(true)}
              disabled={genKnockout.isPending}
              variant="outline"
              className="w-full h-11"
            >
              {genKnockout.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : format === "knockout" ? (
                t("groups.generateBracket")
              ) : (
                t("groups.generateBracketFromQualifiers")
              )}
            </Button>
            {format === "mixed" && (
              <p className="text-[11px] text-muted-foreground">{t("groups.mixedHint")}</p>
            )}
          </Block>
        )}

        {/* Block 4 — Durée des matchs */}
        {showDuration && (
        <Block
          icon={<Clock className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />}
          iconBg="bg-indigo-100 dark:bg-indigo-950/40"
          title={t("groups.durationTitle")}
          subtitle={t("groups.durationSubtitle")}
        >
          <div className="grid grid-cols-2 gap-3">
            <Stepper
              label={t("groups.matchDuration")}
              value={duration}
              onChange={setDuration}
              step={5}
              min={5}
              max={120}
              unit={t("groups.minutesUnit")}
            />
            <Stepper
              label={t("groups.matchBreak")}
              value={pause}
              onChange={setPause}
              step={5}
              min={0}
              max={60}
              unit={t("groups.minutesUnit")}
            />
          </div>
        </Block>
        )}

        {/* Block 5 — Créneau horaire */}
        {showSlot && (
        <Block
          icon={<CalendarClock className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />}
          iconBg="bg-emerald-100 dark:bg-emerald-950/40"
          title={t("groups.slotTitle")}
          subtitle={t("groups.slotSubtitle")}
        >
          <div className="flex items-end gap-2">
            <TimeField
              label={t("groups.dayStart")}
              value={startTime}
              onChange={setStartTime}
            />
            <span className="pb-3 text-muted-foreground text-lg font-light shrink-0">→</span>
            <TimeField
              label={t("groups.dayEnd")}
              value={endTime}
              onChange={setEndTime}
            />
          </div>

          {/* Min rest — inline compact row */}
          <div className="flex items-center justify-between gap-3 pt-3 border-t border-border/60">
            <div className="min-w-0">
              <p className="text-xs font-semibold leading-tight">{t("groups.minRestShort")}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {t("groups.minRestSubtitle")}
              </p>
            </div>
            <div className="w-[130px] shrink-0">
              <Stepper
                label=""
                value={minRest}
                onChange={setMinRest}
                step={5}
                min={0}
                max={120}
              />
            </div>
          </div>

          {/* Lunch break toggle */}
          <div className="flex items-center justify-between gap-3 pt-3 border-t border-border/60">
            <div className="min-w-0 flex items-center gap-2">
              <UtensilsCrossed className="h-4 w-4 text-muted-foreground shrink-0" />
              <div className="min-w-0">
                <p className="text-xs font-semibold leading-tight">{t("groups.lunchBreak")}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {t("groups.lunchBreakSubtitle")}
                </p>
              </div>
            </div>
            <Switch checked={lunchEnabled} onCheckedChange={setLunchEnabled} />
          </div>

          {lunchEnabled && (
            <div className="rounded-xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40 p-3 flex items-end gap-2 animate-in fade-in slide-in-from-top-1 duration-200">
              <TimeField
                label={t("groups.lunchStart")}
                value={lunchStart}
                onChange={setLunchStart}
                tone="amber"
              />
              <span className="pb-3 text-amber-600 text-lg font-light shrink-0">→</span>
              <TimeField
                label={t("groups.lunchEnd")}
                value={lunchEnd}
                onChange={setLunchEnd}
                tone="amber"
              />
            </div>
          )}
        </Block>
        )}

        {/* Block 6 — Terrains */}
        {showFields && (
        <Block
          icon={<MapPin className="h-5 w-5 text-rose-600 dark:text-rose-400" />}
          iconBg="bg-rose-100 dark:bg-rose-950/40"
          title={t("groups.fieldsTitle")}
          subtitle={t("groups.fieldsSubtitle")}
        >
          {fieldsList.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">{t("groups.noFields")}</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {fieldsList.map((f) => (
                <span
                  key={f}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-primary text-primary-foreground px-2.5 py-1 text-xs font-semibold"
                >
                  <MapPin className="h-3 w-3 opacity-80" />
                  {f}
                  <button
                    type="button"
                    onClick={() => removeField(f)}
                    className="ml-0.5 inline-flex h-4 w-4 items-center justify-center rounded bg-primary-foreground/20 hover:bg-primary-foreground/30 transition-colors"
                    aria-label={t("groups.removeField", { name: f })}
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                </span>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <Input
              value={newField}
              onChange={(e) => setNewField(e.target.value)}
              onKeyDown={onFieldKeyDown}
              placeholder={t("groups.newFieldPlaceholder")}
              className="h-10"
            />
            <Button type="button" variant="outline" size="icon" className="h-10 w-10 shrink-0" onClick={addField}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">{t("groups.fieldsHint")}</p>
        </Block>
        )}

        {showScheduleCta && matchesCount === 0 && (
          <p className="text-[11px] text-muted-foreground text-center px-4">
            {t("groups.scheduleHint")}
          </p>
        )}
      </div>

      {/* Sticky CTA bar — sits above bottom-nav */}
      {showStickyBar && (
      <div
        className="fixed left-0 right-0 z-30 bg-background/95 backdrop-blur-md border-t border-border px-4 py-3 flex gap-2"
        style={{ bottom: "calc(env(safe-area-inset-bottom) + 56px)" }}
      >
        {showSaveCta && (
        <Button
          variant="outline"
          onClick={() => saveSettings.mutate()}
          disabled={saveSettings.isPending}
          className="h-11 px-4 shrink-0"
        >
          {saveSettings.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <>
              <Save className="h-4 w-4" />
              <span className="hidden sm:inline">{t("groups.save")}</span>
            </>
          )}
        </Button>
        )}
        {showScheduleCta && (
        <Button
          onClick={() => schedule.mutate()}
          disabled={schedule.isPending || matchesCount === 0 || !startsOn}
          className="h-11 flex-1"
        >
          {schedule.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <>
              <CalendarClock className="h-4 w-4" />
              {t("groups.scheduleAuto")}
            </>
          )}
        </Button>
        )}
      </div>
      )}

      <DestructiveConfirmSheet
        open={regenGroupsOpen}
        onOpenChange={setRegenGroupsOpen}
        mode="type"
        confirmWord="EFFACER"
        title={t("groups.regenConfirmTitle")}
        description={t("groups.regenConfirmDesc")}
        consequences={
          <ul className="list-disc pl-5 space-y-1 text-destructive">
            <li>{t("groups.regenConsequenceGroups", { count: groupsCount })}</li>
            <li>{t("groups.regenConsequenceMatches", { count: matchesCount })}</li>
            <li>{t("groups.regenConsequenceScores")}</li>
          </ul>
        }
        cancelLabel={t("draw.cancel")}
        confirmLabel={t("groups.regenConfirmAction")}
        loading={genGroups.isPending}
        onConfirm={async () => {
          await genGroups.mutateAsync();
          setRegenGroupsOpen(false);
        }}
      />

      <DestructiveConfirmSheet
        open={genBracketOpen}
        onOpenChange={setGenBracketOpen}
        mode="simple"
        title={
          format === "knockout"
            ? t("groups.generateBracket")
            : t("groups.generateBracketFromQualifiers")
        }
        description={
          format === "knockout"
            ? t("groups.bracketConfirmDescKnockout", { count: numTeams })
            : t("groups.bracketConfirmDescMixed", {
                qualifiers: qualifiers,
                groups: groupsCount,
                total: qualifiers * groupsCount,
              })
        }
        consequences={
          <p className="text-foreground">
            {thirdPlace
              ? t("groups.bracketConfirmThirdPlaceYes")
              : t("groups.bracketConfirmThirdPlaceNo")}
          </p>
        }
        cancelLabel={t("draw.cancel")}
        confirmLabel={t("groups.bracketConfirmAction")}
        loading={genKnockout.isPending}
        onConfirm={() => {
          // mutate (not mutateAsync) — l'éventuel 409 est géré dans onError
          // (confirmation forte), sans rejet non géré ici.
          genKnockout.mutate(false);
          setGenBracketOpen(false);
        }}
      />
    </>
  );
}
