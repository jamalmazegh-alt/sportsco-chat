import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { format } from "date-fns";
import type { Locale } from "date-fns";
import { CalendarClock, Goal, Hourglass, MapPin, Plane, Users } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Bloc logistique de la page de détail : « quand & où », d'un seul tenant.
 *
 * Avant, la date vivait dans une boîte à dégradé, le rendez-vous dans une
 * pastille ambre, le coup d'envoi dans une pastille émeraude et la fin en
 * suffixe grisé — quatre traitements pour une seule question. Ici les heures
 * s'alignent en colonne, chiffres à droite, et seul le coup d'envoi est mis en
 * avant.
 *
 * La météo se range sous l'adresse plutôt qu'en carte autonome : elle répond à
 * la même question que le lieu et l'heure — comment je m'organise.
 */

export interface EventWhenWhereProps {
  startsAt: Date;
  endsAt?: Date | null;
  convocationAt?: Date | null;
  /** Libellé relatif affiché en tête de carte : « dans 3 jours ». */
  countdown?: string | null;
  locationName?: string | null;
  locationAddress?: string | null;
  meetingPoint?: string | null;
  dateLocale?: Locale;
  /** Liens Maps / Waze / calendrier, fournis par la page. */
  actions?: ReactNode;
  /** Bloc météo, rendu en pied de carte. */
  weather?: ReactNode;
}

export function EventWhenWhere({
  startsAt,
  endsAt,
  convocationAt,
  countdown,
  locationName,
  locationAddress,
  meetingPoint,
  dateLocale,
  actions,
  weather,
}: EventWhenWhereProps) {
  const { t } = useTranslation();
  // Une fin antérieure au début ne veut rien dire : on ne l'affiche pas.
  const showEnd = !!endsAt && endsAt.getTime() > startsAt.getTime();

  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-card">
      <header className="flex items-center justify-between gap-2 border-b border-border/60 px-3.5 py-2.5">
        <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
          <CalendarClock className="h-3 w-3" aria-hidden />
          {t("events.whenWhere")}
        </span>
        {countdown && (
          <span className="text-[10.5px] font-semibold tabular-nums text-muted-foreground">
            {countdown}
          </span>
        )}
      </header>

      <div className="flex items-stretch gap-3 px-3.5 py-3">
        <div className="w-14 shrink-0 rounded-xl border border-primary/24 bg-primary/10 py-2 text-center">
          <div className="text-[9.5px] font-bold uppercase tracking-[0.09em] text-primary">
            {format(startsAt, "MMM", { locale: dateLocale })}
          </div>
          <div className="font-display text-[25px] font-bold leading-none tabular-nums">
            {format(startsAt, "d")}
          </div>
          <div className="mt-0.5 text-[9.5px] font-semibold uppercase text-muted-foreground">
            {format(startsAt, "EEE", { locale: dateLocale })}
          </div>
        </div>

        <div className="flex min-w-0 flex-1 flex-col justify-center">
          {convocationAt && (
            <TimeRow
              icon={<Users className="h-3 w-3" aria-hidden />}
              label={t("events.convocationDateTime")}
              value={format(convocationAt, "HH:mm")}
            />
          )}
          <TimeRow
            emphasis
            icon={<Goal className="h-3 w-3" aria-hidden />}
            label={t("events.kickoff")}
            value={format(startsAt, "HH:mm")}
          />
          {showEnd && (
            <TimeRow
              soft
              icon={<Hourglass className="h-3 w-3" aria-hidden />}
              label={t("events.estimatedEnd")}
              value={format(endsAt!, "HH:mm")}
            />
          )}
        </div>
      </div>

      {(locationName || meetingPoint) && <div className="mx-3.5 h-px bg-border/60" />}

      {locationName && (
        <div className="flex items-start gap-2.5 px-3.5 py-2.5">
          <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="text-[13.5px] font-semibold leading-snug">{locationName}</p>
            {locationAddress && locationAddress !== locationName && (
              <p className="mt-0.5 text-xs text-muted-foreground">{locationAddress}</p>
            )}
            {actions && <div className="mt-1.5 flex flex-wrap gap-1.5">{actions}</div>}
          </div>
        </div>
      )}

      {meetingPoint && (
        <div className="flex items-start gap-2.5 border-t border-border/60 px-3.5 py-2.5">
          <Plane className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
              {t("events.meetingPoint")}
            </p>
            <p className="mt-0.5 text-[13px] font-medium leading-snug">{meetingPoint}</p>
          </div>
        </div>
      )}

      {weather}
    </section>
  );
}

function TimeRow({
  icon,
  label,
  value,
  emphasis = false,
  soft = false,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  emphasis?: boolean;
  soft?: boolean;
}) {
  return (
    <div className="flex items-baseline gap-2 border-b border-border/40 py-1 last:border-b-0">
      <span
        className={cn(
          "inline-flex flex-1 items-center gap-1.5 text-[11.5px]",
          emphasis ? "font-semibold text-foreground" : "text-muted-foreground",
        )}
      >
        <span className="text-muted-foreground">{icon}</span>
        {label}
      </span>
      <span
        className={cn(
          "font-display font-bold tabular-nums",
          soft ? "text-[12.5px] text-muted-foreground" : "text-[14px]",
          emphasis && "text-primary",
        )}
      >
        {value}
      </span>
    </div>
  );
}
