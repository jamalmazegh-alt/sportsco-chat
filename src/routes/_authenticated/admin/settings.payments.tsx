import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import { useAuth, useMyRoles } from "@/lib/auth-context";
import {
  getStripeConnectStatus,
  createStripeConnectAccount,
  createStripeConnectOnboardingLink,
  refreshStripeConnectStatus,
} from "@/lib/stripe-connect.functions";
import {
  getPaymentSettings,
  updatePaymentSettings,
} from "@/lib/payment-settings.functions";
import {
  listSeasons,
  createSeason,
  setCurrentSeason,
  deleteSeason,
} from "@/lib/seasons.functions";
import {
  getReminderSettings,
  updateReminderSettings,
} from "@/lib/payment-reminders.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertCircle,
  CheckCircle2,
  CreditCard,
  ExternalLink,
  Loader2,
  RefreshCw,
  Heart,
  CalendarRange,
  Settings2,
  Plus,
  Trash2,
  Star,
  BellRing,
} from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import i18nInstance from "@/lib/i18n";
import { BackLink } from "@/components/back-link";

const searchSchema = z.object({
  success: z.literal("1").optional(),
  refresh: z.literal("1").optional(),
  tab: z.enum(["stripe", "helloasso", "seasons", "reminders", "general"]).optional(),
});

export const Route = createFileRoute("/_authenticated/admin/settings/payments")({
  component: PaymentsSettingsPage,
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: i18nInstance.t("meta.adminPayments.title") },
      { name: "description", content: i18nInstance.t("meta.adminPayments.description") },
    ],
  }),
});

function PaymentsSettingsPage() {
  const { t } = useTranslation();
  const { activeClubId } = useAuth();
  const roles = useMyRoles();
  const search = Route.useSearch();

  if (!roles.includes("admin")) return <Navigate to="/profile" replace />;
  if (!activeClubId) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="px-5 py-4 space-y-5 max-w-3xl">
      <BackLink to="/admin" label={t("common.back")} />

      <header className="space-y-1">
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <CreditCard className="h-6 w-6 text-primary" />
          {t("admin.payments.title")}
        </h1>
        <p className="text-sm text-muted-foreground">
          {t("admin.payments.subtitle")}
        </p>
      </header>

      <Tabs defaultValue={search.tab ?? "stripe"} className="w-full">
        <TabsList className="grid grid-cols-5 w-full">
          <TabsTrigger value="stripe" className="gap-1.5">
            <CreditCard className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Stripe</span>
          </TabsTrigger>
          <TabsTrigger value="helloasso" className="gap-1.5">
            <Heart className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">HelloAsso</span>
          </TabsTrigger>
          <TabsTrigger value="seasons" className="gap-1.5">
            <CalendarRange className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Saisons</span>
          </TabsTrigger>
          <TabsTrigger value="reminders" className="gap-1.5">
            <BellRing className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Rappels</span>
          </TabsTrigger>
          <TabsTrigger value="general" className="gap-1.5">
            <Settings2 className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Général</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="stripe" className="mt-5">
          <StripeTab clubId={activeClubId} successFlag={search.success === "1"} />
        </TabsContent>
        <TabsContent value="helloasso" className="mt-5">
          <HelloAssoTab clubId={activeClubId} />
        </TabsContent>
        <TabsContent value="seasons" className="mt-5">
          <SeasonsTab clubId={activeClubId} />
        </TabsContent>
        <TabsContent value="reminders" className="mt-5">
          <RemindersTab clubId={activeClubId} />
        </TabsContent>
        <TabsContent value="general" className="mt-5">
          <GeneralTab clubId={activeClubId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ------------------------- Stripe tab (existing) ------------------------- */

function StripeTab({ clubId, successFlag }: { clubId: string; successFlag: boolean }) {
  const { t } = useTranslation();
  const getStatusFn = useServerFn(getStripeConnectStatus);
  const createAccountFn = useServerFn(createStripeConnectAccount);
  const onboardingLinkFn = useServerFn(createStripeConnectOnboardingLink);
  const refreshFn = useServerFn(refreshStripeConnectStatus);
  const [busy, setBusy] = useState<null | "create" | "link" | "refresh">(null);

  const q = useQuery({
    queryKey: ["stripe-connect-status", clubId],
    queryFn: () => getStatusFn({ data: { clubId } }),
  });

  useEffect(() => {
    if (successFlag && q.data?.stripeAccountId) {
      void (async () => {
        try {
          await refreshFn({ data: { clubId } });
          await q.refetch();
        } catch (e) {
          console.error(e);
        }
      })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [successFlag, q.data?.stripeAccountId]);

  if (q.isLoading) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
      </div>
    );
  }

  const s = q.data;
  const rate = s?.hasActiveSubscription ? 3 : 5;

  async function handleActivate() {
    setBusy("create");
    try {
      await createAccountFn({ data: { clubId } });
      const link = await onboardingLinkFn({ data: { clubId } });
      window.location.href = link.url;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
      setBusy(null);
    }
  }
  async function handleContinue() {
    setBusy("link");
    try {
      const link = await onboardingLinkFn({ data: { clubId } });
      window.location.href = link.url;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
      setBusy(null);
    }
  }
  async function handleRefresh() {
    setBusy("refresh");
    try {
      await refreshFn({ data: { clubId } });
      await q.refetch();
      toast.success(t("common.saved"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
        {!s?.stripeAccountId && (
          <>
            <div className="flex items-start gap-3">
              <div className="rounded-xl bg-primary/10 p-2.5">
                <CreditCard className="h-5 w-5 text-primary" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{t("admin.payments.notActivatedTitle")}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{t("admin.payments.notActivatedHint")}</p>
              </div>
            </div>
            <Button onClick={handleActivate} disabled={busy !== null} className="w-full">
              {busy === "create" ? <Loader2 className="h-4 w-4 animate-spin" /> : (<>{t("admin.payments.activate")}<ExternalLink className="h-4 w-4" /></>)}
            </Button>
          </>
        )}
        {s?.stripeAccountId && s.status === "pending" && (
          <>
            <div className="flex items-start gap-3">
              <div className="rounded-xl bg-amber-500/10 p-2.5"><AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-400" /></div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{t("admin.payments.pending")}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{t("admin.payments.pendingHint")}</p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button onClick={handleContinue} disabled={busy !== null} className="flex-1">
                {busy === "link" ? <Loader2 className="h-4 w-4 animate-spin" /> : (<>{t("admin.payments.completeProfile")}<ExternalLink className="h-4 w-4" /></>)}
              </Button>
              <Button variant="outline" onClick={handleRefresh} disabled={busy !== null} size="icon">
                {busy === "refresh" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              </Button>
            </div>
          </>
        )}
        {s?.stripeAccountId && s.status === "active" && (
          <>
            <div className="flex items-start gap-3">
              <div className="rounded-xl bg-emerald-500/10 p-2.5"><CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" /></div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{t("admin.payments.active")}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{t("admin.payments.activeHint", { charges: s.chargesEnabled ? "✓" : "✗", payouts: s.payoutsEnabled ? "✓" : "✗" })}</p>
              </div>
            </div>
            <Button variant="outline" onClick={handleRefresh} disabled={busy !== null} className="w-full">
              {busy === "refresh" ? <Loader2 className="h-4 w-4 animate-spin" /> : <><RefreshCw className="h-4 w-4" />{t("admin.payments.refreshStatus")}</>}
            </Button>
          </>
        )}
        {s?.stripeAccountId && (s.status === "restricted" || s.status === "disabled") && (
          <>
            <div className="flex items-start gap-3">
              <div className="rounded-xl bg-destructive/10 p-2.5"><AlertCircle className="h-5 w-5 text-destructive" /></div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{t("admin.payments.restricted")}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{t("admin.payments.restrictedHint")}</p>
              </div>
            </div>
            <Button onClick={handleContinue} disabled={busy !== null} className="w-full">
              {busy === "link" ? <Loader2 className="h-4 w-4 animate-spin" /> : (<>{t("admin.payments.completeProfile")}<ExternalLink className="h-4 w-4" /></>)}
            </Button>
          </>
        )}
      </div>

      <div className="rounded-2xl border border-border bg-muted/30 p-5 space-y-2">
        <p className="text-sm font-semibold">{t("admin.payments.platformFee", { rate })}</p>
        <p className="text-xs text-muted-foreground">{s?.hasActiveSubscription ? t("admin.payments.feeReduced") : t("admin.payments.feeStandard")}</p>
      </div>
    </div>
  );
}

/* ----------------------------- HelloAsso tab ----------------------------- */

function HelloAssoTab({ clubId }: { clubId: string }) {
  const getFn = useServerFn(getPaymentSettings);
  const updateFn = useServerFn(updatePaymentSettings);
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: ["payment-settings", clubId],
    queryFn: () => getFn({ data: { clubId } }),
  });

  const [enabled, setEnabled] = useState(false);
  const [urls, setUrls] = useState({
    membership: "",
    fundraising: "",
    shop: "",
    tournament: "",
  });

  useEffect(() => {
    if (q.data?.settings) {
      const s = q.data.settings;
      setEnabled(!!s.helloasso_enabled);
      setUrls({
        membership: s.helloasso_membership_url ?? "",
        fundraising: s.helloasso_fundraising_url ?? "",
        shop: s.helloasso_shop_url ?? "",
        tournament: s.helloasso_tournament_url ?? "",
      });
    }
  }, [q.data]);

  const save = useMutation({
    mutationFn: () =>
      updateFn({
        data: {
          clubId,
          patch: {
            helloasso_enabled: enabled,
            helloasso_membership_url: urls.membership.trim() || null,
            helloasso_fundraising_url: urls.fundraising.trim() || null,
            helloasso_shop_url: urls.shop.trim() || null,
            helloasso_tournament_url: urls.tournament.trim() || null,
          },
        },
      }),
    onSuccess: () => {
      toast.success("Paramètres HelloAsso enregistrés");
      qc.invalidateQueries({ queryKey: ["payment-settings", clubId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (q.isLoading) {
    return <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-border bg-card p-5 space-y-5">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-pink-500/10 p-2.5">
            <Heart className="h-5 w-5 text-pink-600 dark:text-pink-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold">HelloAsso</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Encaissez sans commission via la plateforme HelloAsso (pourboire libre laissé au donateur).
            </p>
          </div>
          <Switch checked={enabled} onCheckedChange={setEnabled} />
        </div>

        <div className="grid gap-4">
          <UrlField label="Adhésions / licences" placeholder="https://www.helloasso.com/associations/..." value={urls.membership} onChange={(v) => setUrls((s) => ({ ...s, membership: v }))} disabled={!enabled} />
          <UrlField label="Collectes / cagnottes" placeholder="https://www.helloasso.com/associations/.../collectes/..." value={urls.fundraising} onChange={(v) => setUrls((s) => ({ ...s, fundraising: v }))} disabled={!enabled} />
          <UrlField label="Boutique" placeholder="https://www.helloasso.com/associations/.../boutiques/..." value={urls.shop} onChange={(v) => setUrls((s) => ({ ...s, shop: v }))} disabled={!enabled} />
          <UrlField label="Tournois / événements" placeholder="https://www.helloasso.com/associations/.../evenements/..." value={urls.tournament} onChange={(v) => setUrls((s) => ({ ...s, tournament: v }))} disabled={!enabled} />
        </div>

        <Button onClick={() => save.mutate()} disabled={save.isPending} className="w-full sm:w-auto">
          {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Enregistrer"}
        </Button>
      </div>
    </div>
  );
}

function UrlField({ label, placeholder, value, onChange, disabled }: {
  label: string; placeholder: string; value: string; onChange: (v: string) => void; disabled?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <Input type="url" inputMode="url" placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled} />
    </div>
  );
}

/* ------------------------------ Seasons tab ------------------------------ */

function SeasonsTab({ clubId }: { clubId: string }) {
  const listFn = useServerFn(listSeasons);
  const createFn = useServerFn(createSeason);
  const setCurrentFn = useServerFn(setCurrentSeason);
  const deleteFn = useServerFn(deleteSeason);
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: ["seasons", clubId],
    queryFn: () => listFn({ data: { clubId } }),
  });

  const today = new Date();
  const y = today.getMonth() >= 6 ? today.getFullYear() : today.getFullYear() - 1;
  const [label, setLabel] = useState(`${y}/${y + 1}`);
  const [start, setStart] = useState(`${y}-07-01`);
  const [end, setEnd] = useState(`${y + 1}-06-30`);
  const [isCurrent, setIsCurrent] = useState(true);

  const create = useMutation({
    mutationFn: () =>
      createFn({
        data: {
          clubId,
          season: { label, start_date: start, end_date: end, is_current: isCurrent },
        },
      }),
    onSuccess: () => {
      toast.success("Saison créée");
      qc.invalidateQueries({ queryKey: ["seasons", clubId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setCurrent = useMutation({
    mutationFn: (seasonId: string) => setCurrentFn({ data: { clubId, seasonId } }),
    onSuccess: () => {
      toast.success("Saison courante mise à jour");
      qc.invalidateQueries({ queryKey: ["seasons", clubId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: (seasonId: string) => deleteFn({ data: { clubId, seasonId } }),
    onSuccess: () => {
      toast.success("Saison supprimée");
      qc.invalidateQueries({ queryKey: ["seasons", clubId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
        <p className="text-sm font-semibold">Nouvelle saison</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Libellé</Label>
            <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="2025/2026" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Début</Label>
            <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Fin</Label>
            <Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Switch checked={isCurrent} onCheckedChange={setIsCurrent} id="is-current" />
          <Label htmlFor="is-current" className="text-xs">Définir comme saison courante</Label>
        </div>
        <Button onClick={() => create.mutate()} disabled={create.isPending}>
          {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Plus className="h-4 w-4" />Créer</>}
        </Button>
      </div>

      <div className="rounded-2xl border border-border bg-card p-5 space-y-3">
        <p className="text-sm font-semibold">Saisons existantes</p>
        {q.isLoading && <div className="flex justify-center py-6"><Loader2 className="h-4 w-4 animate-spin text-primary" /></div>}
        {q.data?.seasons.length === 0 && (
          <p className="text-xs text-muted-foreground">Aucune saison pour le moment.</p>
        )}
        <ul className="divide-y divide-border">
          {q.data?.seasons.map((s) => (
            <li key={s.id} className="flex items-center gap-3 py-2.5">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium flex items-center gap-1.5">
                  {s.label}
                  {s.is_current && <span className="inline-flex items-center gap-0.5 text-[10px] uppercase tracking-wide bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 px-1.5 py-0.5 rounded"><Star className="h-2.5 w-2.5" /> en cours</span>}
                </p>
                <p className="text-xs text-muted-foreground">{s.start_date} → {s.end_date}</p>
              </div>
              {!s.is_current && (
                <Button size="sm" variant="outline" onClick={() => setCurrent.mutate(s.id)} disabled={setCurrent.isPending}>
                  <Star className="h-3.5 w-3.5" /> Définir
                </Button>
              )}
              <Button size="icon" variant="ghost" onClick={() => remove.mutate(s.id)} disabled={remove.isPending} className="text-destructive hover:text-destructive">
                <Trash2 className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/* ------------------------------ General tab ------------------------------ */

function GeneralTab({ clubId }: { clubId: string }) {
  const getFn = useServerFn(getPaymentSettings);
  const updateFn = useServerFn(updatePaymentSettings);
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: ["payment-settings", clubId],
    queryFn: () => getFn({ data: { clubId } }),
  });

  const [currency, setCurrency] = useState("eur");
  const [minPartial, setMinPartial] = useState("5.00");

  useEffect(() => {
    if (q.data?.settings) {
      setCurrency(q.data.settings.currency || "eur");
      setMinPartial(((q.data.settings.min_partial_amount_cents ?? 500) / 100).toFixed(2));
    }
  }, [q.data]);

  const save = useMutation({
    mutationFn: () =>
      updateFn({
        data: {
          clubId,
          patch: {
            currency: currency.toLowerCase(),
            min_partial_amount_cents: Math.round(parseFloat(minPartial || "0") * 100),
          },
        },
      }),
    onSuccess: () => {
      toast.success("Paramètres enregistrés");
      qc.invalidateQueries({ queryKey: ["payment-settings", clubId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (q.isLoading) {
    return <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Devise (ISO 4217)</Label>
            <Input value={currency} onChange={(e) => setCurrency(e.target.value)} maxLength={3} placeholder="eur" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Montant minimum de paiement partiel</Label>
            <Input type="number" min={0} step="0.01" value={minPartial} onChange={(e) => setMinPartial(e.target.value)} />
            <p className="text-[11px] text-muted-foreground">En dessous de ce montant, les parents devront payer la totalité.</p>
          </div>
        </div>
        <Button onClick={() => save.mutate()} disabled={save.isPending}>
          {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Enregistrer"}
        </Button>
      </div>
    </div>
  );
}
