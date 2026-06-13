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

  // Sprint 2 — group by `field` when most matches have one. Otherwise fall
  // back to the flat list (Sprint 1 behaviour, unchanged).
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

  // ── Flat list (legacy) ────────────────────────────────────────────────
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
    <section aria-label={heading} className="space-y-2">
      <header className="flex items-center gap-2 px-1">
        {mode === "live" ? (
          <span className="relative inline-flex">
            <span className="absolute inset-0 rounded-full bg-rose-500/60 animate-ping" />
            <Radio className="h-3.5 w-3.5 text-rose-500" />
          </span>
        ) : null}
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {heading}
        </h3>
      </header>
      <ul className="space-y-1.5">
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
  // Group by field, sorted within each by scheduled_at
  const byField = new Map<string, MatchLike[]>();
  for (const m of matches) {
    const f = (m.field ?? "").trim() || "—";
    const arr = byField.get(f) ?? [];
    arr.push(m);
    byField.set(f, arr);
  }
  const fields = Array.from(byField.keys()).sort((a, b) => a.localeCompare(b));

  return (
    <section aria-label={heading} className="space-y-2">
      <header className="flex items-center gap-2 px-1">
        <Radio className="h-3.5 w-3.5 text-rose-500" />
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {heading}
        </h3>
      </header>
      <div className="space-y-2">
        {fields.map((field) => {
          const sorted = sortByScheduled(byField.get(field) ?? []);
          const current = sorted.find((m) => m.status === "live") ?? null;
          const next = sorted.find((m) => m.status === "scheduled" && m.id !== current?.id) ?? null;
          return (
            <div key={field} className="rounded-xl border border-border bg-card p-2.5 space-y-1.5">
              <div className="flex items-center gap-1.5 px-1 text-xs font-semibold text-muted-foreground">
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
              {!current && !next && <p className="px-1 py-2 text-xs text-muted-foreground">—</p>}
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
        "w-full flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2 text-left",
        interactive && "hover:border-primary/40 hover:bg-card/80 transition-colors",
        muted && "opacity-70",
      )}
    >
      {!hideField && (
        <div className="flex flex-col items-center justify-center gap-0.5 w-14 shrink-0">
          <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-muted-foreground">
            <MapPin className="h-3 w-3" />
            {m.field ?? "—"}
          </span>
          {isLive && (
            <span className="text-[10px] font-bold uppercase tracking-wide text-rose-500">
              {liveLabel}
            </span>
          )}
        </div>
      )}
      {hideField && (
        <span
          className={cn(
            "text-[10px] font-bold uppercase tracking-wide w-12 shrink-0",
            isLive ? "text-rose-500" : "text-muted-foreground",
          )}
        >
          {liveLabel}
        </span>
      )}
      <div className="flex-1 min-w-0 flex items-center gap-2">
        <span className="flex-1 truncate text-sm font-medium text-right">{teamLabel(a)}</span>
        <span className="px-2 py-0.5 rounded-md bg-muted text-sm font-bold tabular-nums">
          {m.score_a ?? 0} - {m.score_b ?? 0}
        </span>
        <span className="flex-1 truncate text-sm font-medium">{teamLabel(b)}</span>
      </div>
      {interactive && <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />}
    </button>
  );
}
