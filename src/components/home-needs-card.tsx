import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import { useState } from "react";
import { ChevronRight, HandHelping } from "lucide-react";
import {
  listMyOpenNeeds,
  applyToEventNeed,
  withdrawSignup,
  declareUnavailable,
} from "@/lib/needs/needs.functions";
import { NeedCandidateCard } from "@/components/needs/need-candidate-card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

const FILLED_VISIBILITY_MS = 48 * 60 * 60 * 1000;

/**
 * Compute the cut-off after which a filled need should disappear from the
 * "Récemment complétés" subsection. Spec:
 *   visibleUntil = min(completedAt + 48h, eventStartAt)
 * We approximate `completedAt` with the row's `updated_at` (the seat count
 * hitting zero comes through a signup mutation which touches the need row).
 */
export function isRecentlyFilledVisible(
  need: {
    remaining_seats: number;
    updated_at?: string | null;
    events?: { starts_at?: string | null } | null;
  },
  now: Date = new Date(),
): boolean {
  if (need.remaining_seats !== 0) return false;
  const completedAt = need.updated_at ? new Date(need.updated_at).getTime() : NaN;
  if (!Number.isFinite(completedAt)) return false;
  const eventStart = need.events?.starts_at
    ? new Date(need.events.starts_at).getTime()
    : Number.POSITIVE_INFINITY;
  const visibleUntil = Math.min(completedAt + FILLED_VISIBILITY_MS, eventStart);
  return now.getTime() < visibleUntil;
}

export function HomeNeedsCard() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const listFn = useServerFn(listMyOpenNeeds);
  const applyFn = useServerFn(applyToEventNeed);
  const withdrawFn = useServerFn(withdrawSignup);
  const unavailFn = useServerFn(declareUnavailable);

  const { data } = useQuery({
    queryKey: ["home-my-open-needs"],
    queryFn: () => listFn({ data: {} }),
    staleTime: 30_000,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["home-my-open-needs"] });
    qc.invalidateQueries({ queryKey: ["my-open-needs"] });
  };

  const [pendingId, setPendingId] = useState<string | null>(null);

  const applyMut = useMutation({
    mutationFn: (need_id: string) => applyFn({ data: { need_id } }),
    onSuccess: () => {
      toast.success(t("needs:signup.applied"));
      invalidate();
    },
    onError: (e: Error) =>
      toast.error(t(`needs:errors.${e.message}`, { defaultValue: e.message })),
  });
  const withdrawMut = useMutation({
    mutationFn: (signup_id: string) => withdrawFn({ data: { signup_id } }),
    onSuccess: () => {
      toast.success(t("needs:signup.withdrawn"));
      invalidate();
    },
    onError: (e: Error) =>
      toast.error(t(`needs:errors.${e.message}`, { defaultValue: e.message })),
  });
  const unavailMut = useMutation({
    mutationFn: (need_id: string) => unavailFn({ data: { need_id } }),
    onSuccess: () => {
      toast.success(t("needs:unavailable.confirmed"));
      invalidate();
    },
    onError: (e: Error) =>
      toast.error(t(`needs:errors.${e.message}`, { defaultValue: e.message })),
  });

  const allNeeds = (data?.needs ?? []) as any[];

  // Hide needs the user marked unavailable (persisted server-side).
  const relevant = allNeeds.filter((n) => n.my_signup?.status !== "unavailable");

  const hasActiveSignup = (n: any) =>
    n.my_signup &&
    n.my_signup.status !== "withdrawn" &&
    n.my_signup.status !== "declined";

  // Section principale : UNIQUEMENT les engagements en cours (applied/confirmed).
  // Les besoins ouverts non répondus vont désormais dans l'UrgencyCenter — pas
  // de doublon. Un besoin non répondu = action en attente → urgence.
  // Un besoin engagé = statut à suivre → cette carte.
  const primary = relevant.filter((n) => hasActiveSignup(n));

  // Sous-section "Récemment complétés" : plus de place, l'utilisateur n'est pas
  // engagé, complété il y a moins de 48h et avant le début de l'événement.
  const recentlyFilled = relevant.filter(
    (n) => !hasActiveSignup(n) && isRecentlyFilledVisible(n),
  );

  const primaryVisible = primary.slice(0, 3);
  const filledVisible = recentlyFilled.slice(0, 2);

  // Le bloc disparaît entièrement s'il n'a rien à afficher (pas d'état vide décoratif).
  if (primaryVisible.length === 0 && filledVisible.length === 0) return null;

  return (
    <section>
      <div className="flex items-center justify-between mb-2.5 px-0.5">
        <h2 className="text-[11px] font-bold text-foreground uppercase tracking-[0.14em] inline-flex items-center gap-1.5">
          <HandHelping className="h-3.5 w-3.5 text-primary" strokeWidth={2.4} />
          {t("needs:myFeed.title", { defaultValue: "Mes coups de main" })}
          {primaryVisible.length > 0 && (
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">
              {primary.length}
            </Badge>
          )}
        </h2>
        <Link
          to="/needs"
          className="text-[11px] text-foreground font-bold inline-flex items-center gap-0.5 hover:text-[#2d9d5f] transition-colors"
        >
          {t("common.seeAll", { defaultValue: "Tout voir" })}
          <ChevronRight className="h-3 w-3" />
        </Link>
      </div>


      {primaryVisible.length > 0 && (
        <div className="space-y-2">
          {primaryVisible.map((n) => (
            <NeedCandidateCard
              key={n.id}
              need={n}
              onApply={() => {
                setPendingId(n.id);
                applyMut.mutate(n.id);
              }}
              onWithdraw={() => {
                if (!n.my_signup) return;
                setPendingId(n.id);
                withdrawMut.mutate(n.my_signup.id);
              }}
              onUnavailable={() => {
                setPendingId(n.id);
                unavailMut.mutate(n.id);
              }}
              applyPending={pendingId === n.id && applyMut.isPending}
              withdrawPending={pendingId === n.id && withdrawMut.isPending}
              unavailablePending={pendingId === n.id && unavailMut.isPending}
            />
          ))}
        </div>
      )}

      {filledVisible.length > 0 && (
        <div className="mt-3">
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.14em] px-0.5 mb-1.5">
            {t("needs:recentlyFilled.title", {
              defaultValue: "Récemment complétés",
            })}
          </p>
          <div className="space-y-2">
            {filledVisible.map((n) => (
              <NeedCandidateCard key={n.id} need={n} />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
