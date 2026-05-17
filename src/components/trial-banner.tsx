import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, Sparkles, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";

const DISMISS_KEY = (clubId: string) => `clubero-trial-banner-dismissed:${clubId}`;

export function TrialBanner() {
  const { memberships, activeClubId } = useAuth();
  const isAdmin = !!memberships.find(
    (m) => m.club_id === activeClubId && m.role === "admin",
  );

  const [dismissed, setDismissed] = useState(false);
  useEffect(() => {
    if (!activeClubId || typeof window === "undefined") return;
    const v = sessionStorage.getItem(DISMISS_KEY(activeClubId));
    setDismissed(v === "1");
  }, [activeClubId]);

  const { data: sub } = useQuery({
    enabled: isAdmin && !!activeClubId,
    queryKey: ["club-subscription", activeClubId],
    queryFn: async () => {
      const { data } = await supabase
        .from("subscriptions")
        .select("status, trial_end, current_period_end, cancel_at_period_end")
        .eq("club_id", activeClubId!)
        .maybeSingle();
      return data;
    },
  });

  if (!isAdmin || !sub || dismissed) return null;

  const now = Date.now();
  const trialEnd = sub.trial_end ? new Date(sub.trial_end).getTime() : null;
  const periodEnd = sub.current_period_end
    ? new Date(sub.current_period_end).getTime()
    : null;

  let kind: "trial" | "trial-ending" | "expired" | "canceling" | null = null;
  let daysLeft = 0;

  if (sub.status === "trialing" && trialEnd) {
    daysLeft = Math.ceil((trialEnd - now) / 86_400_000);
    if (daysLeft <= 0) kind = "expired";
    else kind = daysLeft <= 7 ? "trial-ending" : "trial";
  } else if (sub.status === "active" && sub.cancel_at_period_end && periodEnd) {
    daysLeft = Math.ceil((periodEnd - now) / 86_400_000);
    kind = "canceling";
  } else if (
    (sub.status === "canceled" || sub.status === "incomplete_expired") ||
    (sub.status === "past_due" && periodEnd && periodEnd < now)
  ) {
    kind = "expired";
  }

  if (!kind) return null;

  const dismissable = kind === "trial" || kind === "canceling";

  function dismiss() {
    if (!activeClubId) return;
    sessionStorage.setItem(DISMISS_KEY(activeClubId), "1");
    setDismissed(true);
  }

  const tone =
    kind === "expired"
      ? "bg-destructive text-destructive-foreground"
      : kind === "trial-ending" || kind === "canceling"
        ? "bg-amber-500/15 text-amber-900 dark:text-amber-200 border-b border-amber-500/30"
        : "bg-primary/10 text-foreground border-b border-primary/20";

  const Icon = kind === "expired" ? AlertTriangle : Sparkles;

  const message =
    kind === "expired"
      ? "Votre essai est terminé. Activez votre abonnement pour continuer à créer des événements."
      : kind === "trial-ending"
        ? `Essai gratuit : ${daysLeft} jour${daysLeft > 1 ? "s" : ""} restant${daysLeft > 1 ? "s" : ""}.`
        : kind === "canceling"
          ? `Abonnement résilié — actif encore ${daysLeft} jour${daysLeft > 1 ? "s" : ""}.`
          : `Essai gratuit actif — ${daysLeft} jours restants.`;

  return (
    <div className={cn("px-3 py-2 text-xs flex items-center gap-2", tone)}>
      <Icon className="h-3.5 w-3.5 shrink-0" />
      <span className="flex-1 truncate">{message}</span>
      <Link
        to="/admin/billing"
        className="font-semibold underline underline-offset-2 shrink-0"
      >
        {kind === "expired" || kind === "trial-ending" ? "Activer" : "Gérer"}
      </Link>
      {dismissable && (
        <button
          type="button"
          onClick={dismiss}
          aria-label="Fermer"
          className="shrink-0 opacity-70 hover:opacity-100"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
