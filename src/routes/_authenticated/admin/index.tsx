import { createFileRoute, Navigate, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import i18nInstance from "@/lib/i18n";
import { useAuth, useMyRoles } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import {
  Loader2,
  CreditCard,
  Send,
  MessagesSquare,
  BellRing,
  Palette,
  Wallet,
  ChevronRight,
  Share2,
  Receipt,
  TrendingUp,
} from "lucide-react";
import { ConvertPersonalClubBanner } from "@/components/convert-personal-club-banner";

export const Route = createFileRoute("/_authenticated/admin/")({
  component: AdminSettingsPage,
  head: () => ({
    meta: [
      { title: i18nInstance.t("meta.admin.title") },
      { name: "description", content: i18nInstance.t("meta.admin.description") },
    ],
  }),
});

function AdminSettingsPage() {
  const { t } = useTranslation();
  const { activeClubId } = useAuth();
  const roles = useMyRoles();

  const { data, isLoading } = useQuery({
    queryKey: ["club-name", activeClubId],
    enabled: !!activeClubId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clubs")
        .select("id, name, is_personal")
        .eq("id", activeClubId!)
        .single();
      if (error) throw error;
      return data;
    },
  });

  if (!roles.includes("admin")) return <Navigate to="/profile" replace />;

  if (isLoading || !data) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  const items: Array<{
    to: string;
    icon: typeof CreditCard;
    title: string;
    hint: string;
    tone: string;
  }> = [
    {
      to: "/admin/billing",
      icon: CreditCard,
      title: t("admin.hubSubscription"),
      hint: t("admin.hubSubscriptionHint"),
      tone: "bg-primary/10 text-primary",
    },
    {
      to: "/admin/settings/payments",
      icon: Wallet,
      title: t("admin.hubPayments", { defaultValue: "Paiements" }),
      hint: t("admin.hubPaymentsHint", {
        defaultValue: "Encaissez les inscriptions tournoi via Stripe",
      }),
      tone: "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400",
    },
    {
      to: "/admin/payments/items",
      icon: Receipt,
      title: "Postes de paiement",
      hint: "Cotisations, licences, équipements, déplacements",
      tone: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
    },
    {
      to: "/admin/payments/dashboard",
      icon: TrendingUp,
      title: "Tableau de bord financier",
      hint: "KPIs, taux d'encaissement, exports CSV",
      tone: "bg-teal-500/10 text-teal-600 dark:text-teal-400",
    },
    {
      to: "/admin/settings/convocations",
      icon: Send,
      title: t("admin.hubConvocations"),
      hint: t("admin.hubConvocationsHint"),
      tone: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
    },
    {
      to: "/admin/settings/communications",
      icon: MessagesSquare,
      title: t("admin.hubCommunications"),
      hint: t("admin.hubCommunicationsHint"),
      tone: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    },
    {
      to: "/admin/settings/social",
      icon: Share2,
      title: "Réseaux sociaux",
      hint: "Affichez vos posts Instagram, Facebook et X sur le mur du club",
      tone: "bg-pink-500/10 text-pink-600 dark:text-pink-400",
    },
    {
      to: "/admin/settings/reminders",
      icon: BellRing,
      title: t("admin.hubReminders"),
      hint: t("admin.hubRemindersHint"),
      tone: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    },
    {
      to: "/admin/settings/branding",
      icon: Palette,
      title: t("admin.hubBranding", { defaultValue: "Identité visuelle" }),
      hint: t("admin.hubBrandingHint", {
        defaultValue: "Couleur principale de l'app pour ton club",
      }),
      tone: "bg-fuchsia-500/10 text-fuchsia-600 dark:text-fuchsia-400",
    },
  ];

  return (
    <div className="px-5 py-4 space-y-4">
      <p className="text-sm text-muted-foreground">
        {t("admin.subtitle", { club: data.name })}
      </p>

      {data.is_personal && (
        <ConvertPersonalClubBanner clubId={data.id} currentName={data.name} />
      )}


      <ul className="rounded-2xl border border-border bg-card divide-y divide-border overflow-hidden">
        {items.map((it) => (
          <li key={it.to}>
            <Link
              to={it.to}
              className="flex items-center gap-3 px-4 py-3.5 hover:bg-muted/40 transition-colors"
            >
              <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${it.tone}`}>
                <it.icon className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{it.title}</p>
                <p className="text-xs text-muted-foreground mt-0.5 truncate">{it.hint}</p>
              </div>
              <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0" />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
