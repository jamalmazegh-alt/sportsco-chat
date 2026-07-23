/**
 * NeedCandidateCard — carte membre canonique pour un besoin ouvert.
 *
 * Consommée par :
 *   - src/components/home-needs-card.tsx (bloc accueil)
 *   - src/routes/_authenticated/needs.index.tsx (fil /needs)
 *
 * États normalisés (S5) :
 *   - non signé              → CTA « Je me propose » + « Pas dispo »
 *   - signup.status=applied  → badge « En attente » + CTA « Retirer »
 *   - signup.status=confirmed→ badge « Confirmé » + CTA « Retirer »
 *   - signup.status=unavailable → badge « Marqué indispo » + CTA « Je me propose finalement »
 */
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Check, X } from "lucide-react";
import { getNeedVisual, resolveNeedLabel } from "@/components/needs/need-visuals";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { fmt } from "@/lib/date-locale";
import { cn } from "@/lib/utils";

export type NeedCandidateCardNeed = {
  id: string;
  event_id: string;
  role_key?: string | null;
  label?: string | null;
  description?: string | null;
  remaining_seats: number;
  events?: {
    title?: string | null;
    starts_at?: string | null;
  } | null;
  updated_at?: string | null;
  my_signup?: { id: string; status: string } | null;
};

export function NeedCandidateCard({
  need,
  onApply,
  onWithdraw,
  onUnavailable,
  applyPending,
  withdrawPending,
  unavailablePending,
  showDescription = false,
  className,
}: {
  need: NeedCandidateCardNeed;
  onApply?: () => void;
  onWithdraw?: () => void;
  onUnavailable?: () => void;
  applyPending?: boolean;
  withdrawPending?: boolean;
  unavailablePending?: boolean;
  showDescription?: boolean;
  className?: string;
}) {
  const { t } = useTranslation();
  const visual = getNeedVisual(need.role_key ?? undefined);
  const Icon = visual.Icon;
  const label = resolveNeedLabel(need, t);

  const status = need.my_signup?.status;
  const applied = status === "applied";
  const confirmed = status === "confirmed";
  const unavailable = status === "unavailable";
  const declined = status === "declined";
  const withdrawn = status === "withdrawn";
  // withdrawn = user retracted; treat as "no signup" so he can re-apply.
  const noActiveSignup = !need.my_signup || withdrawn;
  const canApply = noActiveSignup && need.remaining_seats > 0;
  const isFullNoSignup = noActiveSignup && need.remaining_seats === 0;

  return (
    <div
      className={cn(
        "rounded-[12px] border-[1.5px] border-border bg-card p-3",
        "flex items-center gap-3",
        className,
      )}
    >
      <div
        className={cn(
          "h-9 w-9 rounded-[10px] flex items-center justify-center shrink-0",
          visual.chip,
        )}
      >
        <Icon className="h-4 w-4" strokeWidth={2.4} />
      </div>
      <Link to="/events/$eventId" params={{ eventId: need.event_id }} className="min-w-0 flex-1">
        <p className="text-[13px] font-bold leading-tight truncate">{label}</p>
        <p className="text-[11px] text-muted-foreground truncate">
          {need.events?.title}
          {need.events?.starts_at && (
            <span className="ml-1">· {fmt(need.events.starts_at, "d MMM · HH:mm")}</span>
          )}
        </p>
        {showDescription && need.description && (
          <p className="mt-1 text-[11px] text-muted-foreground italic line-clamp-2">
            « {need.description} »
          </p>
        )}
      </Link>

      <div className="flex items-center gap-1.5 shrink-0">
        {confirmed && (
          <>
            <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300 text-[10px] font-bold border-0">
              <Check className="h-3 w-3 mr-0.5" strokeWidth={2.6} />
              {t("needs:signup.confirmed")}
            </Badge>
            {onWithdraw && (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-[11px]"
                disabled={withdrawPending}
                onClick={(e) => {
                  e.preventDefault();
                  onWithdraw();
                }}
              >
                <X className="h-3.5 w-3.5" strokeWidth={2.6} />
              </Button>
            )}
          </>
        )}
        {applied && (
          <>
            <Badge
              variant="outline"
              className="text-[10px] font-bold border-amber-300 text-amber-800 dark:text-amber-300"
            >
              {t("needs:signup.applied")}
            </Badge>
            {onWithdraw && (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-[11px]"
                disabled={withdrawPending}
                onClick={(e) => {
                  e.preventDefault();
                  onWithdraw();
                }}
              >
                <X className="h-3.5 w-3.5" strokeWidth={2.6} />
              </Button>
            )}
          </>
        )}
        {unavailable && (
          <>
            <Badge variant="outline" className="text-[10px] font-medium text-muted-foreground">
              {t("needs:unavailable.confirmed")}
            </Badge>
            {onApply && (
              <Button
                size="sm"
                className="h-7 px-2.5 text-[11px] font-bold"
                disabled={applyPending || need.remaining_seats === 0}
                onClick={(e) => {
                  e.preventDefault();
                  onApply();
                }}
              >
                {t("needs:unavailable.backToApply")}
              </Button>
            )}
          </>
        )}
        {declined && (
          <Badge
            variant="outline"
            className="text-[10px] font-bold border-red-300 text-red-700 dark:text-red-300 dark:border-red-800/60"
          >
            {t("needs:signup.declined")}
          </Badge>
        )}
        {canApply && (
          <>
            {onUnavailable && (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-[11px] text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30"
                disabled={unavailablePending}
                onClick={(e) => {
                  e.preventDefault();
                  onUnavailable();
                }}
              >
                {t("needs:memberCard.unavailableCta")}
              </Button>
            )}
            {onApply && (
              <Button
                size="sm"
                className="h-7 px-2.5 text-[11px] font-bold"
                disabled={applyPending}
                onClick={(e) => {
                  e.preventDefault();
                  onApply();
                }}
              >
                {t("needs:memberCard.applyCta")}
              </Button>
            )}
          </>
        )}
        {isFullNoSignup && (
          <Badge
            variant="outline"
            className="text-[10px] font-bold border-muted-foreground/40 text-muted-foreground"
          >
            {t("needs:seats.full")}
          </Badge>
        )}
      </div>
    </div>
  );
}
