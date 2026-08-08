import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { format } from "date-fns";
import type { Locale } from "date-fns";
import { Ban, Clock, HelpCircle, Home, MapPin, Plane, Send, Trophy } from "lucide-react";
import { getEventTypeIcon } from "@/lib/event-type-icon";
import {
  eventCardState,
  matchOutcome,
  type EventCardEvent,
} from "@/components/events/event-card-state";
import {
  ConvocationSummaryPill,
  type ConvocationCounts,
} from "@/components/convocation-summary-pill";
import { cn } from "@/lib/utils";

/**
 * Carte d'événement de la liste.
 *
 * Le corps se lit en quatre lignes, une question par ligne :
 *   1. quoi  — type + compétition (contexte, discret)
 *   2. qui   — le titre, plus gros élément textuel de la carte
 *   3. où    — domicile/extérieur + lieu
 *   4. état  — résultat / annulation à gauche, statut de convocation à droite
 *
 * L'état de l'événement (à venir / passé / annulé) est porté par la teinte du
 * rail de date uniquement : c'est le seul endroit où l'état colore une surface,
 * ce qui laisse les couleurs sémantiques (score, présence) lisibles par-dessus.
 */

export type { EventCardEvent };

export interface EventCardProps {
  event: EventCardEvent;
  dateLocale: Locale;
  isCoach: boolean;
  /** Convocations dispatched for this event (staff chip). */
  convocationSent?: boolean;
  /** The viewer's own convocation for this event (player / parent). */
  myConvocation?: { status: string; playerName: string } | null;
  /** Per-status counts, staff only. */
  counts?: ConvocationCounts | null;
}

/** Accent colour of the type glyph — same mapping as `EventTypeBadge`. */
const TYPE_TONE: Record<string, string> = {
  training: "text-emerald-600 dark:text-emerald-400",
  match: "text-rose-600 dark:text-rose-400",
  tournament: "text-amber-600 dark:text-amber-400",
  meeting: "text-sky-600 dark:text-sky-400",
  other: "text-muted-foreground",
};

export function EventCard({
  event,
  dateLocale,
  isCoach,
  convocationSent,
  myConvocation,
  counts,
}: EventCardProps) {
  const { t } = useTranslation();

  const start = new Date(event.starts_at);
  const { cancelled: isCancelled, today, past, live } = eventCardState(event, new Date());

  const Icon = getEventTypeIcon(event.type);
  const outcome = matchOutcome(event);
  const called = !!myConvocation;

  const competition =
    event.type === "match" && event.competition_type
      ? [t(`events.competitionTypes.${event.competition_type}`), event.competition_name]
          .filter(Boolean)
          .join(" — ")
      : null;

  const title = (() => {
    if (event.type === "match" && event.opponent && event.team_name) {
      return (
        <>
          {event.team_name} <span className="font-medium text-muted-foreground">vs</span>{" "}
          {event.opponent}
        </>
      );
    }
    if (event.type === "match" && event.opponent && event.title?.toLowerCase().startsWith("vs ")) {
      return event.title;
    }
    return (
      <>
        {event.title}
        {event.opponent && (
          <span className="font-normal text-muted-foreground"> · {event.opponent}</span>
        )}
      </>
    );
  })();

  const showHomeAway =
    event.type === "match" && event.is_home !== null && event.is_home !== undefined;
  const hasWhere = showHomeAway || !!event.location;

  const showCounts = isCoach && !isCancelled && !!counts;
  // Les compteurs impliquent déjà l'envoi : la pastille ne s'affiche qu'à défaut,
  // pour ne jamais laisser un coach sans indication quand les compteurs manquent.
  const showSent = !isCancelled && !!convocationSent && !showCounts;
  const showResponse = !!myConvocation && !isCancelled;
  const hasFooter =
    isCancelled || !!outcome || past || live || showResponse || showSent || showCounts;

  return (
    <li>
      <Link
        to="/events/$eventId"
        params={{ eventId: event.id }}
        className={cn(
          "relative grid grid-cols-[56px_minmax(0,1fr)] overflow-hidden rounded-2xl border bg-card",
          "transition-[border-color,transform] active:scale-[0.99]",
          isCancelled
            ? "border-destructive/35 opacity-70"
            : called
              ? "border-primary/35 hover:border-primary/60"
              : "border-border hover:border-primary/40",
        )}
      >
        {/* Rail de date — porte l'état de l'événement */}
        <div
          className={cn(
            "flex flex-col items-center justify-center gap-px border-r border-border/50 py-3",
            isCancelled
              ? "bg-destructive/8"
              : past
                ? "bg-muted-foreground/8"
                : live
                  ? "bg-primary/16"
                  : "bg-primary/8",
          )}
        >
          <span
            className={cn(
              "text-[9.5px] font-bold uppercase tracking-[0.1em]",
              isCancelled ? "text-destructive" : past ? "text-muted-foreground" : "text-primary",
            )}
          >
            {today ? t("events.todayShort") : format(start, "EEE", { locale: dateLocale })}
          </span>
          <span
            className={cn(
              "font-display text-2xl font-bold leading-none tabular-nums",
              past && "text-muted-foreground",
            )}
          >
            {format(start, "d")}
          </span>
          <span className="mt-0.5 text-[10.5px] font-medium tabular-nums text-muted-foreground">
            {format(start, "HH:mm")}
          </span>
        </div>

        {/* Corps */}
        <div
          className={cn("flex min-w-0 flex-col gap-[3px] py-2.5 pl-3", called ? "pr-4" : "pr-3")}
        >
          {/* 1 — quoi */}
          <div className="flex min-w-0 items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.09em] text-muted-foreground">
            <Icon className={cn("h-3 w-3 shrink-0", TYPE_TONE[event.type] ?? TYPE_TONE.other)} />
            <span className="whitespace-nowrap">{t(`events.types.${event.type}`)}</span>
            {competition && (
              <>
                <span className="opacity-40">·</span>
                <span className="truncate text-[10.5px] font-semibold normal-case tracking-normal">
                  {competition}
                </span>
              </>
            )}
          </div>

          {/* 2 — qui */}
          <p
            className={cn(
              "truncate text-[15px] font-semibold leading-tight",
              isCancelled && "text-muted-foreground line-through",
            )}
          >
            {title}
          </p>

          {/* 3 — où */}
          {hasWhere && (
            <div className="mt-px flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
              {showHomeAway && (
                <span
                  className={cn(
                    "inline-flex shrink-0 items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10.5px] font-bold",
                    event.is_home
                      ? "border-emerald-500/30 bg-emerald-500/12 text-emerald-700 dark:text-emerald-300"
                      : "border-violet-500/30 bg-violet-500/12 text-violet-700 dark:text-violet-300",
                  )}
                >
                  {event.is_home ? <Home className="h-3 w-3" /> : <Plane className="h-3 w-3" />}
                  {event.is_home ? t("events.home") : t("events.away")}
                </span>
              )}
              {event.location && (
                <span className="inline-flex min-w-0 items-center gap-1">
                  <MapPin className="h-3 w-3 shrink-0 opacity-70" />
                  <span className="truncate">{event.location}</span>
                </span>
              )}
            </div>
          )}

          {/* 4 — état */}
          {hasFooter && (
            <div className="mt-1 flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-1.5">
                {isCancelled ? (
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-destructive/30 bg-destructive/12 px-2 py-0.5 text-[10.5px] font-bold text-destructive">
                    <Ban className="h-3 w-3" />
                    {t("events.status.cancelled")}
                  </span>
                ) : outcome ? (
                  <span
                    className={cn(
                      "inline-flex shrink-0 items-center gap-1.5 rounded-md border px-2 py-0.5 font-display text-[11.5px] font-bold tabular-nums",
                      outcome === "win" && "border-present/30 bg-present/14 text-present",
                      outcome === "loss" && "border-defeat/30 bg-defeat/14 text-defeat",
                      outcome === "draw" && "border-border bg-muted text-muted-foreground",
                    )}
                  >
                    {outcome === "win" && <Trophy className="h-3 w-3" />}
                    {t(`match.${outcome}`)} {event.result!.home_score} — {event.result!.away_score}
                  </span>
                ) : null}
              </div>

              <div className="flex shrink-0 items-center gap-1.5">
                {live && (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/15 px-2 py-0.5 text-[10.5px] font-bold text-primary">
                    <span className="h-1.5 w-1.5 rounded-full bg-current motion-safe:animate-pulse" />
                    {t("events.live")}
                  </span>
                )}
                {past && !outcome && !live && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2 py-0.5 text-[10.5px] font-bold text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    {t("events.pastBadge")}
                  </span>
                )}
                {showResponse && <ResponsePill status={myConvocation!.status} />}
                {showSent && (
                  <span
                    className="inline-flex items-center gap-1 rounded-full border border-primary/22 bg-primary/10 px-2 py-0.5 text-[10.5px] font-bold text-primary"
                    title={t("events.convocsSentTitle")}
                  >
                    <Send className="h-3 w-3" />
                    {t("events.convocationsSentShort")}
                  </span>
                )}
                {showCounts && <ConvocationSummaryPill counts={counts!} />}
              </div>
            </div>
          )}
        </div>

        {/* Rail de convocation — remplace la bande de 80 px */}
        {called && !isCancelled && (
          <span
            aria-hidden
            className="absolute inset-y-0 right-0 w-[5px] bg-primary"
            title={t("attendance.calledUp")}
          />
        )}
      </Link>
    </li>
  );
}

function ResponsePill({ status }: { status: string }) {
  const { t } = useTranslation();
  if (status === "present") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-present/28 bg-present/15 px-2 py-0.5 text-[10.5px] font-bold text-present">
        {t("attendance.present")}
      </span>
    );
  }
  if (status === "absent") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-defeat/28 bg-defeat/13 px-2 py-0.5 text-[10.5px] font-bold text-defeat">
        {t("attendance.absent")}
      </span>
    );
  }
  // "uncertain" et "pending" partagent l'ambre, mais pas le libellé : l'ancien
  // badge n'affichait rien pour "uncertain", ce qui laissait le joueur croire
  // qu'il n'avait pas répondu.
  const uncertain = status === "uncertain";
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/16 px-2 py-0.5 text-[10.5px] font-bold text-amber-700 dark:text-amber-300">
      {uncertain ? <HelpCircle className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
      {uncertain ? t("attendance.uncertain") : t("attendance.toConfirm")}
    </span>
  );
}
