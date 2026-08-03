import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { CheckCircle2, Loader2, Trophy, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import i18n from "@/lib/i18n";
import {
  confirmEntitlementSession,
  listMyTournamentEntitlements,
} from "@/modules/tournaments/entitlements.functions";

export const Route = createFileRoute("/_authenticated/tournaments/pricing/success")({
  component: PricingSuccessPage,
  validateSearch: (s: Record<string, unknown>) => ({
    session_id: typeof s.session_id === "string" ? s.session_id : undefined,
  }),
  head: () => ({
    meta: [
      {
        title: i18n.t("pricing.successTitle", { ns: "tournaments" }),
      },
      { name: "robots", content: "noindex" },
    ],
  }),
});

function PricingSuccessPage() {
  const { t } = useTranslation("tournaments");
  const navigate = useNavigate();
  const { session_id } = Route.useSearch();
  const confirmFn = useServerFn(confirmEntitlementSession);
  const entFn = useServerFn(listMyTournamentEntitlements);
  const [paid, setPaid] = useState(false);
  const [attempts, setAttempts] = useState(0);

  const entQ = useQuery({
    queryKey: ["my-tournament-entitlements"],
    queryFn: () => entFn({ data: undefined as never }),
    refetchInterval: paid ? false : 3000,
  });

  useEffect(() => {
    if (!session_id || paid) return;
    let cancelled = false;
    async function tick() {
      try {
        const res = await confirmFn({ data: { session_id: session_id! } });
        if (!cancelled && res.paid) {
          setPaid(true);
          entQ.refetch();
        }
      } catch {
        /* keep polling */
      }
      if (cancelled) return;
      setAttempts((a) => a + 1);
      if (attempts < 8 && !paid) setTimeout(tick, 4000);
    }
    tick();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session_id]);

  const hasAnnual = !!entQ.data?.activeAnnual;
  const canCreate = !!entQ.data?.canCreate;

  return (
    <div className="mx-auto max-w-xl px-5 py-16 text-center">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
        {paid || canCreate ? (
          <CheckCircle2 className="h-9 w-9 text-emerald-600" />
        ) : (
          <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
        )}
      </div>
      <h1 className="mt-6 font-display text-2xl font-bold">
        {paid || canCreate ? t("pricing.successTitle") : t("pricing.successPendingTitle")}
      </h1>
      <p className="mt-3 text-sm text-muted-foreground">
        {hasAnnual
          ? t("pricing.successAnnualBody")
          : paid || canCreate
            ? t("pricing.successSingleBody")
            : t("pricing.successValidatingBody")}
      </p>
      <div className="mt-8 flex flex-col items-center gap-3">
        <Button
          className="h-11 w-full max-w-xs"
          disabled={!canCreate}
          onClick={() => navigate({ to: "/tournaments/new-from-pass" })}
        >
          <Trophy className="h-4 w-4" />
          {t("pricing.successCreateCta")}
          <ArrowRight className="h-4 w-4" />
        </Button>
        <Button asChild variant="ghost" size="sm">
          <Link to="/tournaments">{t("pricing.successViewTournaments")}</Link>
        </Button>
      </div>
    </div>
  );
}
