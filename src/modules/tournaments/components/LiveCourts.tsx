import { useTranslation } from "react-i18next";
import { Radio, ChevronRight, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";

interface Team {
  id: string;
  name: string;
  short_name: string | null;
}
interface MatchLike {
  id: string;
  status: string;
  field?: string | null;
  team_a_id: string | null;
  team_b_id: string | null;
  score_a: number | null;
  score_b: number | null;
  scheduled_at: string | null;
}

interface Props {
  matches: MatchLike[];
  teams: Team[];
  /** Click a row to focus that match (e.g. open score entry). */
  onSelect?: (matchId: string) => void;
  /** Show next upcoming matches when no live match is found (flat-list mode). */
  fallbackToUpcoming?: boolean;
  /** How many rows to show in flat-list mode. */
  limit?: number;
}

const GREEN_GRADIENT = "linear-gradient(135deg,#16a34a 0%,#15803d 100%)";

function teamLabel(t: Team | undefined): string {
  if (!t) return "—";
  return t.short_name ?? t.name;
}

function sortByScheduled<T extends MatchLike>(arr: T[]): T[] {
  return [...arr].sort((a, b) => {
    const ta = a.scheduled_at ? Date.parse(a.scheduled_at) : Number.MAX_SAFE_INTEGER;
    const tb = b.scheduled_at ? Date.parse(b.scheduled_at) : Number.MAX_SAFE_INTEGER;
    return ta - tb;
  });
}

export function LiveCourts({
  matches,
  teams,
  onSelect,
  fallbackToUpcoming = true,
  limit = 5,
}: Props) {
  const { t } = useTranslation("tournaments");
  const teamMap = new Map(teams.map((tm) => [tm.id, tm]));

  const activeMatches = matches.filter((m) => m.status === "live" || m.status === "scheduled");
  const withField = activeMatches.filter((m) => m.field && m.field.trim() !== "");
  const useFieldGrouping = withField.length > 0 && withField.length >= activeMatches.length / 2;

  if (useFieldGrouping) {
    return (
      <FieldGroupedView
        matches={withField}
        teamMap={teamMap}
        onSelect={onSelect}
        heading={t("controlCenter.byCourts", { defaultValue: "Par terrain" })}
        liveLabel={t("controlCenter.liveBadge", { defaultValue: "LIVE" })}
        nextLabel={t("cockpit.next", { defaultValue: "Prochain" })}
      />
    );
  }

  const live = matches.filter((m) => m.status === "live");
  let rows = live;
  let mode: "live" | "upcoming" = "live";
  if (rows.length === 0 && fallbackToUpcoming) {
    rows = sortByScheduled(matches.filter((m) => m.status === "scheduled"));
    mode = "upcoming";
  }
  rows = rows.slice(0, limit);
  if (rows.length === 0) return null;

  const heading =
    mode === "live"
      ? t("controlCenter.liveCourts", { defaultValue: "En direct" })
      : t("controlCenter.nextMatches", { defaultValue: "Prochains matchs" });

  return (
    <section aria-label={heading} className="space-y-2.5">
      <header className="flex items-center gap-2 px-1">
        {mode === "live" ? (
          <span className="relative inline-flex h-4 w-4 items-center justify-center">
            <span className="absolute inset-0 animate-ping rounded-full bg-rose-500/50" />
            <span className="relative h-2 w-2 rounded-full bg-rose-500" />
          </span>
        ) : (
          <Radio className="h-3.5 w-3.5 text-emerald-600" />
        )}
        <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground dark:text-slate-300">
          {heading}
        </h3>
      </header>
      <ul className="space-y-2">
        {rows.map((m) => (
          <MatchRow
            key={m.id}
            m={m}
            teamMap={teamMap}
            onSelect={onSelect}
            liveLabel={t("controlCenter.liveBadge", { defaultValue: "LIVE" })}
            isLive={m.status === "live"}
          />
        ))}
      </ul>
    </section>
  );
}

function FieldGroupedView({
  matches,
  teamMap,
  onSelect,
  heading,
  liveLabel,
  nextLabel,
}: {
  matches: MatchLike[];
  teamMap: Map<string, Team>;
  onSelect?: (id: string) => void;
  heading: string;
  liveLabel: string;
  nextLabel: string;
}) {
  const byField = new Map<string, MatchLike[]>();
  for (const m of matches) {
    const f = (m.field ?? "").trim() || "—";
    const arr = byField.get(f) ?? [];
    arr.push(m);
    byField.set(f, arr);
  }
  const fields = Array.from(byField.keys()).sort((a, b) => a.localeCompare(b));

  return (
    <section aria-label={heading} className="space-y-2.5">
      <header className="flex items-center gap-2 px-1">
        <span className="relative inline-flex h-4 w-4 items-center justify-center">
          <span className="absolute inset-0 animate-ping rounded-full bg-rose-500/50" />
          <span className="relative h-2 w-2 rounded-full bg-rose-500" />
        </span>
        <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground dark:text-slate-300">
          {heading}
        </h3>
      </header>
      <div className="space-y-2.5">
        {fields.map((field) => {
          const sorted = sortByScheduled(byField.get(field) ?? []);
          const current = sorted.find((m) => m.status === "live") ?? null;
          const next = sorted.find((m) => m.status === "scheduled" && m.id !== current?.id) ?? null;
          return (
            <div
              key={field}
              className="space-y-2 rounded-2xl border-[1.5px] border-border bg-card p-3 dark:border-slate-800 dark:bg-slate-900"
              style={{ boxShadow: "0 1px 2px rgba(15,23,42,.04)" }}
            >
              <div className="flex items-center gap-1.5 px-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                <MapPin className="h-3 w-3" />
                <span>{field}</span>
              </div>
              {current && (
                <MatchRow
                  m={current}
                  teamMap={teamMap}
                  onSelect={onSelect}
                  liveLabel={liveLabel}
                  isLive
                  hideField
                />
              )}
              {next && (
                <MatchRow
                  m={next}
                  teamMap={teamMap}
                  onSelect={onSelect}
                  liveLabel={nextLabel}
                  isLive={false}
                  hideField
                  muted
                />
              )}
              {!current && !next && <p className="px-1 py-2 text-xs text-muted-foreground/70">—</p>}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function MatchRow({
  m,
  teamMap,
  onSelect,
  liveLabel,
  isLive,
  hideField,
  muted,
}: {
  m: MatchLike;
  teamMap: Map<string, Team>;
  onSelect?: (id: string) => void;
  liveLabel: string;
  isLive: boolean;
  hideField?: boolean;
  muted?: boolean;
}) {
  const a = teamMap.get(m.team_a_id ?? "");
  const b = teamMap.get(m.team_b_id ?? "");
  const interactive = !!onSelect;
  return (
    <button
      type="button"
      onClick={interactive ? () => onSelect!(m.id) : undefined}
      disabled={!interactive}
      className={cn(
        "group relative flex w-full items-center gap-3 overflow-hidden rounded-xl border-[1.5px] px-3 py-2.5 text-left transition-all",
        isLive
          ? "border-rose-300/60 bg-gradient-to-br from-rose-50 to-white dark:border-rose-900/60 dark:from-rose-950/30 dark:to-slate-900"
          : "border-border bg-card dark:border-slate-800 dark:bg-slate-900",
        interactive && "hover:-translate-y-0.5 hover:shadow-md",
        muted && "opacity-70",
      )}
    >
      {isLive && <span aria-hidden className="absolute left-0 top-0 h-full w-1 bg-rose-500" />}
      {!hideField && (
        <div className="flex w-14 shrink-0 flex-col items-center justify-center gap-0.5">
          <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-muted-foreground">
            <MapPin className="h-3 w-3" />
            {m.field ?? "—"}
          </span>
          {isLive && (
            <span className="rounded-full bg-rose-500 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white">
              {liveLabel}
            </span>
          )}
        </div>
      )}
      {hideField && (
        <span
          className={cn(
            "w-12 shrink-0 text-[10px] font-bold uppercase tracking-wider",
            isLive
              ? "rounded-full bg-rose-500 px-1.5 py-0.5 text-center text-white"
              : "text-muted-foreground/70",
          )}
        >
          {liveLabel}
        </span>
      )}
      <div className="flex flex-1 min-w-0 items-center gap-2">
        <span className="flex-1 truncate text-right text-sm font-semibold text-foreground dark:text-slate-100">
          {teamLabel(a)}
        </span>
        <span
          className={cn(
            "rounded-lg px-2.5 py-1 text-sm font-bold tabular-nums",
            isLive
              ? "text-white shadow-sm"
              : "bg-muted text-foreground dark:bg-slate-800 dark:text-slate-100",
          )}
          style={isLive ? { background: GREEN_GRADIENT } : undefined}
        >
          {m.score_a ?? 0} - {m.score_b ?? 0}
        </span>
        <span className="flex-1 truncate text-sm font-semibold text-foreground dark:text-slate-100">
          {teamLabel(b)}
        </span>
      </div>
      {interactive && (
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/70 transition-transform group-hover:translate-x-0.5" />
      )}
    </button>
  );
}
