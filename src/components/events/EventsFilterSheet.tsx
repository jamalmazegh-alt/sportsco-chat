import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { format } from "date-fns";
import { fr, enUS } from "date-fns/locale";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar as CalendarUI } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Filter,
  Dumbbell,
  Trophy,
  Users,
  Calendar as CalendarIcon,
  Home,
  Plane,
  Eye,
  Ban,
  X,
  Building2,
  Send,
  MailX,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type EventTypeKey = "training" | "match" | "tournament" | "meeting" | "other";
export type HomeAwayKey = "all" | "home" | "away";
export type ConvocationsSentKey = "all" | "sent" | "not_sent";

export type EventsFilters = {
  types: Set<EventTypeKey>; // empty = all
  homeAway: HomeAwayKey;
  teamIds: Set<string>; // empty = all
  includeInternal: boolean;
  showPast: boolean;
  showCancelled: boolean;
  convocationsSent: ConvocationsSentKey;
  dateFrom?: Date;
  dateTo?: Date;
};

export const DEFAULT_EVENTS_FILTERS: EventsFilters = {
  types: new Set(),
  homeAway: "all",
  teamIds: new Set(),
  includeInternal: true,
  showPast: false,
  showCancelled: false,
  convocationsSent: "all",
  dateFrom: undefined,
  dateTo: undefined,
};

export function countActiveFilters(f: EventsFilters): number {
  let n = 0;
  if (f.types.size > 0) n++;
  if (f.homeAway !== "all") n++;
  if (f.teamIds.size > 0) n++;
  if (!f.includeInternal) n++;
  if (f.showPast) n++;
  if (f.showCancelled) n++;
  if (f.convocationsSent !== "all") n++;
  if (f.dateFrom || f.dateTo) n++;
  return n;
}

type Team = { id: string; name: string };

type Props = {
  filters: EventsFilters;
  onChange: (next: EventsFilters) => void;
  teams: Team[];
  isCoach: boolean;
  hasInternalTeam?: boolean;
  pastCount?: number;
};

export function EventsFilterSheet({
  filters,
  onChange,
  teams,
  isCoach,
  hasInternalTeam,
  pastCount,
}: Props) {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<EventsFilters>(filters);
  const locale = i18n.language?.startsWith("fr") ? fr : enUS;
  const activeCount = countActiveFilters(filters);

  const typeOptions: Array<{ key: EventTypeKey; label: string; icon: typeof Dumbbell }> = useMemo(
    () => [
      {
        key: "training",
        label: t("events.typeTraining"),
        icon: Dumbbell,
      },
      { key: "match", label: t("events.typeMatch"), icon: Trophy },
      {
        key: "tournament",
        label: t("events.typeTournament"),
        icon: Trophy,
      },
      { key: "meeting", label: t("events.typeMeeting"), icon: Users },
      { key: "other", label: t("events.typeOther"), icon: CalendarIcon },
    ],
    [t],
  );

  function toggleType(k: EventTypeKey) {
    const next = new Set(draft.types);
    if (next.has(k)) next.delete(k);
    else next.add(k);
    setDraft({ ...draft, types: next });
  }
  function toggleTeam(id: string) {
    const next = new Set(draft.teamIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setDraft({ ...draft, teamIds: next });
  }

  function apply() {
    onChange(draft);
    setOpen(false);
  }
  function reset() {
    setDraft(DEFAULT_EVENTS_FILTERS);
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (v) setDraft(filters);
      }}
    >
      <SheetTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn(
            "h-9 gap-1.5 relative",
            activeCount > 0 && "border-primary/40 bg-primary/10 text-primary hover:bg-primary/15",
          )}
        >
          <Filter className="h-4 w-4" />
          {t("events.filters")}
          {activeCount > 0 && (
            <Badge
              variant="secondary"
              className="ml-1 h-5 min-w-5 px-1.5 rounded-full bg-primary text-primary-foreground text-[10px]"
            >
              {activeCount}
            </Badge>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{t("events.filters")}</SheetTitle>
          <SheetDescription>{t("events.filtersDescription")}</SheetDescription>
        </SheetHeader>

        <div className="space-y-6 py-4 pb-8">
          {/* Convocations sent */}
          {isCoach && (
            <Section title={t("events.filterConvocations")}>
              <div className="flex flex-wrap gap-2">
                <ChipButton
                  active={draft.convocationsSent === "all"}
                  onClick={() => setDraft({ ...draft, convocationsSent: "all" })}
                >
                  {t("events.convocAll")}
                </ChipButton>
                <ChipButton
                  active={draft.convocationsSent === "sent"}
                  onClick={() => setDraft({ ...draft, convocationsSent: "sent" })}
                >
                  <Send className="h-3.5 w-3.5" />
                  {t("events.convocSent")}
                </ChipButton>
                <ChipButton
                  active={draft.convocationsSent === "not_sent"}
                  onClick={() => setDraft({ ...draft, convocationsSent: "not_sent" })}
                >
                  <MailX className="h-3.5 w-3.5" />
                  {t("events.convocNotSent")}
                </ChipButton>
              </div>
            </Section>
          )}

          {/* Types */}
          <Section title={t("events.filterType")}>
            <div className="flex flex-wrap gap-2">
              {typeOptions.map(({ key, label, icon: Icon }) => {
                const on = draft.types.has(key);
                return (
                  <ChipButton key={key} active={on} onClick={() => toggleType(key)}>
                    <Icon className="h-3.5 w-3.5" />
                    {label}
                  </ChipButton>
                );
              })}
            </div>
          </Section>

          {/* Home / Away */}
          {(draft.types.size === 0 ||
            draft.types.has("match") ||
            draft.types.has("tournament")) && (
            <Section title={t("events.filterVenue")}>
              <div className="flex flex-wrap gap-2">
                <ChipButton
                  active={draft.homeAway === "all"}
                  onClick={() => setDraft({ ...draft, homeAway: "all" })}
                >
                  {t("events.venueAll")}
                </ChipButton>
                <ChipButton
                  active={draft.homeAway === "home"}
                  onClick={() => setDraft({ ...draft, homeAway: "home" })}
                >
                  <Home className="h-3.5 w-3.5" />
                  {t("events.venueHome")}
                </ChipButton>
                <ChipButton
                  active={draft.homeAway === "away"}
                  onClick={() => setDraft({ ...draft, homeAway: "away" })}
                >
                  <Plane className="h-3.5 w-3.5" />
                  {t("events.venueAway")}
                </ChipButton>
              </div>
            </Section>
          )}

          {/* Teams */}
          {isCoach && teams.length > 1 && (
            <Section
              title={t("events.filterTeams")}
              action={
                draft.teamIds.size > 0 ? (
                  <button
                    type="button"
                    className="text-xs text-muted-foreground hover:text-foreground"
                    onClick={() => setDraft({ ...draft, teamIds: new Set() })}
                  >
                    {t("common.clear")}
                  </button>
                ) : null
              }
            >
              <div className="flex flex-wrap gap-2">
                {teams.map((team) => (
                  <ChipButton
                    key={team.id}
                    active={draft.teamIds.has(team.id)}
                    onClick={() => toggleTeam(team.id)}
                  >
                    {team.name}
                  </ChipButton>
                ))}
              </div>
            </Section>
          )}

          {/* Date range */}
          <Section title={t("events.filterPeriod")}>
            <div className="grid grid-cols-2 gap-2">
              <DateField
                label={t("events.dateFrom")}
                value={draft.dateFrom}
                onChange={(d) => setDraft({ ...draft, dateFrom: d })}
                locale={locale}
              />
              <DateField
                label={t("events.dateTo")}
                value={draft.dateTo}
                onChange={(d) => setDraft({ ...draft, dateTo: d })}
                locale={locale}
              />
            </div>
            {(draft.dateFrom || draft.dateTo) && (
              <button
                type="button"
                onClick={() => setDraft({ ...draft, dateFrom: undefined, dateTo: undefined })}
                className="mt-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                <X className="h-3 w-3" />
                {t("events.clearDates")}
              </button>
            )}
          </Section>

          {/* Display options */}
          <Section title={t("events.filterDisplay")}>
            <div className="flex flex-wrap gap-2">
              <ChipButton
                active={draft.showPast}
                onClick={() => setDraft({ ...draft, showPast: !draft.showPast })}
              >
                <Eye className="h-3.5 w-3.5" />
                {t("events.includePast")}
                {pastCount ? <span className="opacity-70">· {pastCount}</span> : null}
              </ChipButton>
              <ChipButton
                active={draft.showCancelled}
                onClick={() => setDraft({ ...draft, showCancelled: !draft.showCancelled })}
              >
                <Ban className="h-3.5 w-3.5" />
                {t("events.includeCancelled")}
              </ChipButton>
              {isCoach && hasInternalTeam && (
                <ChipButton
                  active={!draft.includeInternal}
                  onClick={() => setDraft({ ...draft, includeInternal: !draft.includeInternal })}
                >
                  <Building2 className="h-3.5 w-3.5" />
                  {t("events.hideInternalMeetings")}
                </ChipButton>
              )}
            </div>
          </Section>
        </div>

        <SheetFooter className="gap-2 sm:gap-2">
          <Button type="button" variant="ghost" onClick={reset} className="flex-1 sm:flex-none">
            {t("common.reset")}
          </Button>
          <Button type="button" onClick={apply} className="flex-1 sm:flex-none">
            {t("events.applyFilters")}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </h4>
        {action}
      </div>
      {children}
    </div>
  );
}

function ChipButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
        active
          ? "border-primary/40 bg-primary/10 text-primary hover:bg-primary/15"
          : "border-border bg-card text-muted-foreground hover:text-foreground hover:bg-muted/50",
      )}
    >
      {children}
    </button>
  );
}

function DateField({
  label,
  value,
  onChange,
  locale,
}: {
  label: string;
  value?: Date;
  onChange: (d: Date | undefined) => void;
  locale: typeof fr;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <div className="mb-1 text-xs text-muted-foreground">{label}</div>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={cn(
              "w-full justify-start h-9 font-normal",
              !value && "text-muted-foreground",
            )}
          >
            <CalendarIcon className="mr-2 h-3.5 w-3.5" />
            {value ? format(value, "PPP", { locale }) : "—"}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0 pointer-events-auto" align="start">
          <CalendarUI
            mode="single"
            selected={value}
            onSelect={(d) => {
              onChange(d ?? undefined);
              setOpen(false);
            }}
            initialFocus
            className="p-3 pointer-events-auto"
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}
