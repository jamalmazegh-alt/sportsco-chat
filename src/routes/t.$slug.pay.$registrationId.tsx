import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Trophy, Loader2, CheckCircle2, XCircle, Clock } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import i18n from "@/lib/i18n";

export const Route = createFileRoute("/t/$slug/pay/$registrationId")({
  component: PayPage,
  head: ({ params }) => ({
    meta: [
      {
        title: i18n.t("register.payMetaTitle", {
          ns: "tournaments",
          slug: params.slug,
          defaultValue: `Paiement — ${params.slug} · Clubero`,
        }),
      },
      { name: "robots", content: "noindex" },
    ],
  }),
});

function formatMoney(amountCents: number, currency: string) {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: (currency || "eur").toUpperCase(),
    }).format(amountCents / 100);
  } catch {
    return `${(amountCents / 100).toFixed(2)} ${currency.toUpperCase()}`;
  }
}

function PayPage() {
  const { registrationId } = Route.useParams();
  const { t } = useTranslation("tournaments");
  const [paying, setPaying] = useState(false);

  const q = useQuery({
    queryKey: ["public-tournament-payment", registrationId],
    queryFn: async () => {
      const res = await fetch(
        `/api/public/tournament-payment-link?id=${encodeURIComponent(registrationId)}`,
      );
      if (!res.ok) throw new Error(String(res.status));
      return res.json() as Promise<{
        registration: {
          id: string;
          team_name: string;
          payment_status: string;
          link_expires_at: string | null;
          link_present: boolean;
          link_expired: boolean;
        };
        tournament: {
          name: string;
          slug: string;
          registration_fee: number;
          registration_currency: string;
          payment_mode: string;
        };
      }>;
    },
  });

  async function onPay() {
    setPaying(true);
    try {
      const res = await fetch("/api/public/tournament-payment-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: registrationId }),
      });
      const data = await res.json();
      if (!res.ok || !data.url) {
        toast.error(data?.error ?? "Erreur");
        setPaying(false);
        return;
      }
      window.location.href = data.url;
    } catch (e: any) {
      toast.error(e?.message ?? "Erreur");
      setPaying(false);
    }
  }

  if (q.isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (q.isError || !q.data) {
    return (
      <CenterCard
        icon={<XCircle className="h-10 w-10 text-destructive" />}
        title={t("register.payNotFound", { defaultValue: "Lien introuvable" })}
        body={t("payments.linkExpiredMessage")}
      />
    );
  }

  const { registration, tournament } = q.data;

  if (registration.payment_status === "paid_online" || registration.payment_status === "paid_offline") {
    return (
      <CenterCard
        icon={<CheckCircle2 className="h-10 w-10 text-emerald-600" />}
        title={t("payments.alreadyPaid")}
        body=""
      />
    );
  }
  if (registration.payment_status === "refunded") {
    return (
      <CenterCard
        icon={<XCircle className="h-10 w-10 text-muted-foreground" />}
        title={t("payments.refundedMessage", {
          defaultValue: "Cette inscription a été remboursée.",
        })}
        body=""
      />
    );
  }
  if (!registration.link_present || registration.link_expired) {
    return (
      <CenterCard
        icon={<Clock className="h-10 w-10 text-amber-500" />}
        title={t("payments.linkExpired")}
        body={t("payments.linkExpiredMessage")}
      />
    );
  }

  const amount = formatMoney(tournament.registration_fee, tournament.registration_currency);

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="max-w-md w-full text-center space-y-5 rounded-2xl border border-border bg-card p-8 shadow-sm">
        <div className="mx-auto h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center">
          <Trophy className="h-7 w-7 text-primary" />
        </div>
        <div className="space-y-1">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">
            {tournament.name}
          </p>
          <h1 className="text-xl font-semibold">{registration.team_name}</h1>
        </div>
        <p className="text-4xl font-bold tracking-tight">{amount}</p>
        <Button onClick={onPay} disabled={paying} size="lg" className="w-full">
          {paying ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            t("payments.payNow", { amount })
          )}
        </Button>
        <p className="text-[11px] text-muted-foreground">
          {t("register.securePayment", {
            defaultValue: "Paiement sécurisé via Stripe.",
          })}
        </p>
      </div>
    </div>
  );
}

function CenterCard({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="max-w-md text-center space-y-3">
        <div className="mx-auto h-16 w-16 rounded-full bg-muted flex items-center justify-center">
          {icon}
        </div>
        <h1 className="text-xl font-semibold">{title}</h1>
        {body && <p className="text-sm text-muted-foreground">{body}</p>}
      </div>
    </div>
  );
}
