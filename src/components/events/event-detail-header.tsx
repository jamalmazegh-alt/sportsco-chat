import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Ban, Home, Plane } from "lucide-react";
import { getEventTypeIcon } from "@/lib/event-type-icon";
import { cn } from "@/lib/utils";

/**
 * En-tête de la page de détail.
 *
 * Le bandeau passe de 88 px à une simple barre de pastilles : il portait un
 * dégradé, trois accents SVG et un glyphe décoratif à 25 % d'opacité pour trois
 * pastilles qui tiennent sur une ligne — soit le premier écran de défilement
 * d'un téléphone dépensé en décor.
 *
 * Ce que la page y gagne : le titre passe de 15 px à 21 px. Sur l'écran qui
 * existe pour nommer l'événement, le nom se voit enfin.
 */

export interface EventDetailHeaderProps {
  type: string;
  title: ReactNode;
  subtitle?: ReactNode;
  competition?: string | null;
  isHome?: boolean | null;
  cancelled?: boolean;
  cancellationReason?: string | null;
  cancelledAtLabel?: string | null;
  /** Bouton d'édition, réservé au staff. */
  action?: ReactNode;
}

export function EventDetailHeader({
  type,
  title,
  subtitle,
  competition,
  isHome,
  cancelled = false,
  cancellationReason,
  cancelledAtLabel,
  action,
}: EventDetailHeaderProps) {
  const { t } = useTranslation();
  const Icon = getEventTypeIcon(type);
  const showHomeAway = isHome !== null && isHome !== undefined;

  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="flex items-center justify-between gap-2 bg-gradient-to-r from-secondary via-secondary/70 to-primary px-3 py-2">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <HeaderPill>
            <Icon className="h-2.5 w-2.5" aria-hidden />
            {t(`events.types.${type}`)}
          </HeaderPill>
          {showHomeAway && (
            <HeaderPill>
              {isHome ? (
                <Home className="h-2.5 w-2.5" aria-hidden />
              ) : (
                <Plane className="h-2.5 w-2.5" aria-hidden />
              )}
              {isHome ? t("events.home") : t("events.away")}
            </HeaderPill>
          )}
          {competition && <HeaderPill muted>{competition}</HeaderPill>}
        </div>
        {action}
      </div>

      <div className="px-3.5 pb-3.5 pt-3">
        <h1
          className={cn(
            "font-display text-[21px] font-bold leading-[1.15] tracking-[-0.02em]",
            cancelled && "text-muted-foreground line-through",
          )}
        >
          {title}
        </h1>
        {subtitle && (
          <p className="mt-1.5 flex flex-wrap items-center gap-x-1.5 text-[12.5px] text-muted-foreground">
            {subtitle}
          </p>
        )}
      </div>

      {cancelled && (
        <div className="mx-3.5 mb-3.5 rounded-xl border border-destructive/28 bg-destructive/10 px-3 py-2.5">
          <p className="flex items-center gap-1.5 text-[12.5px] font-bold text-destructive">
            <Ban className="h-3.5 w-3.5" aria-hidden />
            {t("events.eventCancelled")}
          </p>
          {cancellationReason && (
            <p className="mt-1 text-[11.5px] leading-snug text-muted-foreground">
              <span className="font-semibold">{t("events.cancellationReason")} : </span>
              {cancellationReason}
            </p>
          )}
          {cancelledAtLabel && (
            <p className="mt-1 text-[11px] text-muted-foreground">{cancelledAtLabel}</p>
          )}
        </div>
      )}
    </section>
  );
}

function HeaderPill({ children, muted = false }: { children: ReactNode; muted?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-[3px] text-[9.5px] font-bold uppercase tracking-[0.07em] text-white",
        muted
          ? "border-white/16 bg-white/8 text-white/92 normal-case tracking-normal text-[10px] font-semibold"
          : "border-white/26 bg-white/18",
      )}
    >
      {children}
    </span>
  );
}
