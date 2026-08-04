import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { getPublicOrigin } from "@/lib/native-platform";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Trophy, Check, Sparkles, Loader2, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import i18n from "@/lib/i18n";
import {
  createTournamentPlanCheckout,
  listMyTournamentEntitlements,
} from "@/modules/tournaments/entitlements.functions";

export const Route = createFileRoute("/_authenticated/tournaments/pricing")({
  component: TournamentPricingPage,
  validateSearch: (s: Record<string, unknown>): { canceled?: "1" } => {
    const out: { canceled?: "1" } = {};
    if (s.canceled === "1") out.canceled = "1";
    return out;
  },
  head: () => ({
    meta: [
      {
        title: i18n.t("pricing.metaTitle", { ns: "tournaments" }),
      },
      {
        name: "description",
        content: i18n.t("pricing.metaDesc", { ns: "tournaments" }),
      },
    ],
  }),
});

function TournamentPricingPage() {
  const { t, i18n: i18nInst } = useTranslation("tournaments");
  const navigate = useNavigate();
  const search = Route.useSearch();
  const checkoutFn = useServerFn(createTournamentPlanCheckout);
  const entFn = useServerFn(listMyTournamentEntitlements);
  const [pendingPlan, setPendingPlan] = useState<"single" | "annual" | null>(null);

  const entQ = useQuery({
    queryKey: ["my-tournament-entitlements"],
    queryFn: () => entFn({ data: undefined as never }),
  });

  const checkout = useMutation({
    mutationFn: async (plan: "single" | "annual") => {
      setPendingPlan(plan);
      return checkoutFn({
        data: {
          plan,
          origin: getPublicOrigin(),
        },
      });
    },
    onSuccess: (res) => {
      if (res.url) window.location.href = res.url;
      else {
        toast.error(t("pricing.checkoutError"));
        setPendingPlan(null);
      }
    },
    onError: (e: Error) => {
      toast.error(e.message);
      setPendingPlan(null);
    },
  });

  const hasAnnual = !!entQ.data?.activeAnnual;
  const annualUntil = entQ.data?.activeAnnual?.valid_until
    ? new Date(entQ.data.activeAnnual.valid_until!).toLocaleDateString(i18nInst.language)
    : "—";

  return (
    <div className="min-h-screen bg-background pb-16">
      {/* Hero — Anime Premium green gradient */}
      <header
        className="relative overflow-hidden text-white"
        style={{
          background: "linear-gradient(135deg, #0f4a26 0%, #1d7a45 60%, #2d9d5f 100%)",
        }}
      >
        <svg
          aria-hidden
          viewBox="0 0 200 200"
          className="absolute -right-8 -top-8 h-56 w-56 opacity-10"
        >
          <path fill="currentColor" d="M100 20l20 50h52l-42 32 16 60-46-34-46 34 16-60-42-32h52z" />
        </svg>
        <div className="relative mx-auto max-w-3xl px-5 pt-10 pb-12">
          <Button
            variant="ghost"
            size="sm"
            className="mb-4 text-white/90 hover:bg-white/10 hover:text-white"
            onClick={() => navigate({ to: "/tournaments" })}
          >
            <ArrowLeft className="h-4 w-4" />
            {t("pricing.backToTournaments")}
          </Button>
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/15 backdrop-blur">
              <Trophy className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs uppercase tracking-wider text-white/80">
                {t("pricing.eyebrow")}
              </p>
              <h1 className="font-display text-2xl font-bold sm:text-3xl">{t("pricing.title")}</h1>
            </div>
          </div>
          <p className="mt-4 max-w-xl text-sm text-white/90 sm:text-base">
            {t("pricing.subtitle")}
          </p>
        </div>
      </header>

      {search.canceled && (
        <div className="mx-auto mt-6 max-w-3xl px-5">
          <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            {t("pricing.canceled")}
          </div>
        </div>
      )}

      {hasAnnual && (
        <div className="mx-auto mt-6 max-w-3xl px-5">
          <div className="rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 flex items-center gap-2">
            <Check className="h-4 w-4" />
            {t("pricing.annualActive", { date: annualUntil })}
          </div>
        </div>
      )}

      {/* 2 plan cards */}
      <section className="mx-auto mt-10 grid max-w-4xl gap-5 px-5 sm:grid-cols-2">
        {/* Plan 1 — Single */}
        <PlanCard
          name={t("pricing.singleName")}
          price="39 €"
          per={t("pricing.singlePer")}
          tagline={t("pricing.singleTagline")}
          features={[
            t("pricing.singleF1"),
            t("pricing.singleF2"),
            t("pricing.singleF3"),
            t("pricing.singleF4"),
            t("pricing.singleF5"),
          ]}
          cta={t("pricing.singleCta")}
          loading={checkout.isPending && pendingPlan === "single"}
          onClick={() => checkout.mutate("single")}
          disabled={hasAnnual}
        />

        {/* Plan 2 — Annual */}
        <PlanCard
          name={t("pricing.annualName")}
          price="149 €"
          per={t("pricing.annualPer")}
          tagline={t("pricing.annualTagline")}
          features={[
            t("pricing.annualF1"),
            t("pricing.annualF2"),
            t("pricing.annualF3"),
            t("pricing.annualF4"),
            t("pricing.annualF5"),
          ]}
          highlight
          badge={t("pricing.annualBadge")}
          cta={hasAnnual ? t("pricing.annualActiveCta") : t("pricing.annualCta")}
          loading={checkout.isPending && pendingPlan === "annual"}
          onClick={() => checkout.mutate("annual")}
          disabled={hasAnnual}
          footnote={t("pricing.annualFootnote")}
        />
      </section>

      <p className="mx-auto mt-8 max-w-3xl px-5 text-center text-xs text-muted-foreground">
        {t("pricing.securePayment")}
      </p>

      <div className="mx-auto mt-6 max-w-3xl px-5 text-center">
        <Link
          to="/tournaments"
          className="text-sm text-muted-foreground hover:text-primary underline-offset-4 hover:underline"
        >
          {t("pricing.back")}
        </Link>
      </div>
    </div>
  );
}

function PlanCard({
  name,
  price,
  per,
  tagline,
  features,
  cta,
  loading,
  onClick,
  disabled,
  highlight,
  badge,
  footnote,
}: {
  name: string;
  price: string;
  per: string;
  tagline: string;
  features: string[];
  cta: string;
  loading: boolean;
  onClick: () => void;
  disabled?: boolean;
  highlight?: boolean;
  badge?: string;
  footnote?: string;
}) {
  return (
    <div
      className={`relative flex flex-col rounded-[18px] border-2 bg-card p-6 transition-all ${
        highlight
          ? "border-emerald-500/40 shadow-2xl shadow-emerald-500/10 ring-1 ring-emerald-500/20"
          : "border-border shadow-sm"
      }`}
    >
      {badge && (
        <span
          className="absolute -top-3 right-4 rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-white shadow-lg"
          style={{
            background: "linear-gradient(135deg, #f59e0b 0%, #f97316 100%)",
          }}
        >
          {badge}
        </span>
      )}
      <div className="flex items-center gap-2">
        {highlight ? (
          <Sparkles className="h-5 w-5 text-emerald-600" />
        ) : (
          <Trophy className="h-5 w-5 text-muted-foreground" />
        )}
        <h2 className="font-display text-lg font-bold">{name}</h2>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">{tagline}</p>

      <div className="mt-4">
        <div className="flex items-baseline gap-1.5">
          <span className="font-display text-4xl font-bold">{price}</span>
        </div>
        <p className="text-xs text-muted-foreground">{per}</p>
      </div>

      <ul className="mt-5 space-y-2 text-sm flex-1">
        {features.map((f, i) => (
          <li key={i} className="flex items-start gap-2">
            <Check
              className={`mt-0.5 h-4 w-4 shrink-0 ${
                highlight ? "text-emerald-600" : "text-primary"
              }`}
            />
            <span>{f}</span>
          </li>
        ))}
      </ul>

      <Button
        className="mt-6 h-11 relative overflow-hidden"
        disabled={loading || disabled}
        onClick={onClick}
        style={
          highlight
            ? {
                background: "linear-gradient(135deg, #1d7a45 0%, #2d9d5f 100%)",
                color: "white",
              }
            : undefined
        }
        variant={highlight ? "default" : "outline"}
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trophy className="h-4 w-4" />}
        {cta}
      </Button>

      {footnote && (
        <p className="mt-3 text-center text-xs font-medium text-emerald-700">{footnote}</p>
      )}
    </div>
  );
}
