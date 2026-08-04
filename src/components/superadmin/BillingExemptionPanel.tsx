import { useEffect, useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ShieldCheck,
  Loader2,
  Calendar as CalendarIcon,
  X,
  Pencil,
  ShieldOff,
  History,
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { dateLocale } from "@/lib/date-locale";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  grantBillingExemption,
  revokeBillingExemption,
  getClubBillingAudit,
} from "@/lib/billing-exemption.functions";
import type { ExemptReason } from "@/lib/has-paid-access";

export type BillingExemptionSub = {
  status?: string | null;
  exempt_from_billing?: boolean | null;
  exempt_reason?: string | null;
  exempt_granted_at?: string | null;
  exempt_granted_by?: string | null;
  exempt_until?: string | null;
  stripe_subscription_id?: string | null;
};

type AuditEntry = {
  id: string;
  action: string;
  created_at: string;
  actor_name: string;
  metadata: Record<string, string | number | boolean | null> | null;
};

const ACTION_LABEL_KEYS: Record<string, string> = {
  billing_exemption_granted: "superadmin.billingExemption.actionGranted",
  billing_exemption_updated: "superadmin.billingExemption.actionUpdated",
  billing_exemption_revoked: "superadmin.billingExemption.actionRevoked",
};

const EXEMPT_REASONS: ExemptReason[] = ["beta_club", "partner", "internal", "other"];

const EXEMPT_REASON_KEYS: Record<ExemptReason, string> = {
  beta_club: "superadmin.billingExemption.reasons.betaClub",
  partner: "superadmin.billingExemption.reasons.partner",
  internal: "superadmin.billingExemption.reasons.internal",
  other: "superadmin.billingExemption.reasons.other",
};

export function BillingExemptionPanel({
  clubId,
  clubName,
  subscription,
  onUpdated,
}: {
  clubId: string;
  clubName: string;
  subscription: BillingExemptionSub | null | undefined;
  onUpdated: () => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const grantFn = useServerFn(grantBillingExemption);
  const revokeFn = useServerFn(revokeBillingExemption);
  const fetchAudit = useServerFn(getClubBillingAudit);

  const [grantOpen, setGrantOpen] = useState(false);
  const [revokeOpen, setRevokeOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [reason, setReason] = useState<ExemptReason | "">("");
  const [until, setUntil] = useState<Date | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [audit, setAudit] = useState<AuditEntry[]>([]);

  const isExempt = subscription?.exempt_from_billing === true;
  const reasonLabel = (value?: string | null) =>
    value && value in EXEMPT_REASON_KEYS
      ? t(EXEMPT_REASON_KEYS[value as ExemptReason])
      : (value ?? t("superadmin.common.none"));
  const formatDate = (date: Date | string, key = "date") =>
    format(
      typeof date === "string" ? new Date(date) : date,
      t(`superadmin.billingExemption.formats.${key}`),
      { locale: dateLocale() },
    );

  useEffect(() => {
    fetchAudit({ data: { clubId } })
      .then((rows) => setAudit(rows as AuditEntry[]))
      .catch(() => setAudit([]));
  }, [clubId, fetchAudit, subscription?.exempt_from_billing, subscription?.exempt_until]);

  function openGrant(edit = false) {
    if (edit && subscription) {
      setReason((subscription.exempt_reason as ExemptReason) || "");
      setUntil(subscription.exempt_until ? new Date(subscription.exempt_until) : undefined);
      setEditMode(true);
    } else {
      setReason("");
      setUntil(undefined);
      setEditMode(false);
    }
    setGrantOpen(true);
  }

  async function invalidateCaches() {
    await queryClient.invalidateQueries({ queryKey: ["club-subscription-full", clubId] });
    await queryClient.invalidateQueries({ queryKey: ["club-subscription-active", clubId] });
    await queryClient.invalidateQueries({ queryKey: ["club-subscription", clubId] });
    onUpdated();
  }

  async function onGrant() {
    if (!reason) return;
    setBusy(true);
    try {
      await grantFn({
        data: {
          clubId,
          reason,
          exemptUntil: until ? until.toISOString() : null,
        },
      });
      toast.success(
        editMode
          ? t("superadmin.components.exemptionUpdated")
          : t("superadmin.components.exemptionGranted"),
      );
      setGrantOpen(false);
      await invalidateCaches();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("superadmin.components.failed"));
    } finally {
      setBusy(false);
    }
  }

  async function onRevoke() {
    setBusy(true);
    try {
      await revokeFn({ data: { clubId } });
      toast.success(t("superadmin.components.exemptionRemoved"));
      setRevokeOpen(false);
      await invalidateCaches();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("superadmin.components.failed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <section
        className={cn(
          "rounded-2xl border-[1.5px] overflow-hidden bg-white",
          isExempt ? "border-[#86efac]" : "border-[#e2e8f0]",
        )}
      >
        <header
          className={cn(
            "px-5 py-4 flex items-center justify-between gap-3 flex-wrap",
            isExempt
              ? "bg-gradient-to-r from-[#0f4a26] to-[#1d7a45] text-white"
              : "bg-[#f8fafc] border-b border-[#e2e8f0]",
          )}
        >
          <div className="flex items-center gap-2.5">
            <div
              className={cn(
                "h-9 w-9 rounded-xl flex items-center justify-center",
                isExempt ? "bg-white/15" : "bg-[#e2e8f0]",
              )}
            >
              <ShieldCheck className={cn("h-5 w-5", isExempt ? "text-white" : "text-slate-600")} />
            </div>
            <div>
              <h2
                className={cn(
                  "font-extrabold text-base leading-tight",
                  isExempt ? "text-white" : "text-slate-900",
                )}
              >
                {t("superadmin.billingExemption.title")}
              </h2>
              <p
                className={cn("text-[11px] mt-0.5", isExempt ? "text-white/80" : "text-slate-500")}
              >
                {isExempt
                  ? t("superadmin.billingExemption.clubExempt")
                  : t("superadmin.billingExemption.noActiveExemption")}
              </p>
            </div>
          </div>
          {isExempt && (
            <span className="inline-flex items-center gap-1 rounded-full bg-white/15 border border-white/30 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-white">
              <ShieldCheck className="h-3 w-3" /> {t("superadmin.billingExemption.exemptBadge")}
            </span>
          )}
        </header>

        <div className="p-5">
          {!isExempt ? (
            <div className="space-y-4">
              <p className="text-sm text-slate-600 leading-relaxed">
                {t("superadmin.billingExemption.intro")}
              </p>
              <Button
                size="sm"
                onClick={() => openGrant(false)}
                className="bg-gradient-to-r from-[#0f4a26] to-[#1d7a45] hover:from-[#0a3a1d] hover:to-[#176237] text-white shadow-sm"
              >
                <ShieldCheck className="h-4 w-4 mr-1.5" />
                {t("superadmin.billingExemption.grant")}
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <dl className="grid sm:grid-cols-2 gap-3 text-sm">
                <Field label={t("superadmin.billingExemption.reason")}>
                  <span className="inline-flex items-center rounded-full bg-[#eff6ff] border border-[#bfdbfe] text-[#2563eb] px-2 py-0.5 text-xs font-medium">
                    {reasonLabel(subscription?.exempt_reason)}
                  </span>
                </Field>
                <Field label={t("superadmin.billingExemption.endDate")}>
                  {subscription?.exempt_until ? (
                    <span className="text-slate-900">{formatDate(subscription.exempt_until)}</span>
                  ) : (
                    <span className="text-slate-500 italic">
                      {t("superadmin.billingExemption.noLimit")}
                    </span>
                  )}
                </Field>
                <Field label={t("superadmin.billingExemption.grantedAt")}>
                  {subscription?.exempt_granted_at
                    ? formatDate(subscription.exempt_granted_at, "dateTime")
                    : "—"}
                </Field>
                <Field label={t("superadmin.billingExemption.grantedBy")}>
                  <span className="font-mono text-xs text-slate-700">
                    {subscription?.exempt_granted_by?.slice(0, 8) ?? "—"}
                  </span>
                </Field>
              </dl>
              <div className="flex flex-wrap gap-2 pt-2 border-t border-[#e2e8f0]">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => openGrant(true)}
                  className="border-[#86efac] text-[#16a34a] hover:bg-[#f0fdf4] hover:text-[#16a34a]"
                >
                  <Pencil className="h-3.5 w-3.5 mr-1.5" />
                  {t("superadmin.billingExemption.edit")}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setRevokeOpen(true)}
                  className="bg-[#fff5f5] border-[#fecaca] text-[#ef4444] hover:bg-[#fee2e2] hover:text-[#dc2626]"
                >
                  <ShieldOff className="h-3.5 w-3.5 mr-1.5" />
                  {t("superadmin.billingExemption.revoke")}
                </Button>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Audit log */}
      <section className="rounded-2xl border-[1.5px] border-[#e2e8f0] bg-white p-5">
        <div className="flex items-center gap-2 mb-3">
          <History className="h-4 w-4 text-slate-500" />
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            {t("superadmin.billingExemption.auditTitle")}
          </h3>
        </div>
        {audit.length === 0 ? (
          <p className="text-sm text-slate-500 italic">
            {t("superadmin.billingExemption.auditEmpty")}
          </p>
        ) : (
          <ul className="divide-y divide-[#e2e8f0] -mx-1">
            {audit.map((row) => {
              const meta = row.metadata ?? {};
              return (
                <li key={row.id} className="px-1 py-2 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-slate-900">
                      {ACTION_LABEL_KEYS[row.action]
                        ? t(ACTION_LABEL_KEYS[row.action])
                        : row.action}
                    </div>
                    <div className="text-[11px] text-slate-500">
                      {t("superadmin.billingExemption.byActor", { actor: row.actor_name })}
                      {typeof meta.reason === "string" && (
                        <>
                          {" · "}
                          {reasonLabel(meta.reason)}
                        </>
                      )}
                      {typeof meta.exempt_until === "string" && (
                        <>
                          {" · "}
                          {t("superadmin.billingExemption.untilDate", {
                            date: formatDate(meta.exempt_until),
                          })}
                        </>
                      )}
                    </div>
                  </div>
                  <time className="text-[11px] text-slate-400 whitespace-nowrap">
                    {formatDate(row.created_at, "shortDateTime")}
                  </time>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Grant / Edit dialog */}
      <Dialog open={grantOpen} onOpenChange={setGrantOpen}>
        <DialogContent className="rounded-[20px] sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-lg">
              {editMode
                ? t("superadmin.billingExemption.edit")
                : t("superadmin.billingExemption.grant")}
            </DialogTitle>
            <DialogDescription>
              {t("superadmin.billingExemption.dialogDescription")}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-700">
                {t("superadmin.billingExemption.reason")}
              </label>
              <Select value={reason} onValueChange={(v) => setReason(v as ExemptReason)}>
                <SelectTrigger className="rounded-xl border-[1.5px] border-[#e2e8f0]">
                  <SelectValue placeholder={t("superadmin.billingExemption.reasonPlaceholder")} />
                </SelectTrigger>
                <SelectContent>
                  {EXEMPT_REASONS.map((k) => (
                    <SelectItem key={k} value={k}>
                      {t(EXEMPT_REASON_KEYS[k])}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-700">
                {t("superadmin.billingExemption.endDateOptional")}
              </label>
              <div className="flex gap-2">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "flex-1 justify-start text-left font-normal rounded-xl border-[1.5px] border-[#e2e8f0]",
                        !until && "text-slate-500",
                      )}
                    >
                      <CalendarIcon className="h-4 w-4 mr-2" />
                      {until ? formatDate(until) : t("superadmin.billingExemption.noLimit")}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={until}
                      onSelect={setUntil}
                      disabled={(d) => d < new Date(Date.now() - 86_400_000)}
                      initialFocus
                      className={cn("p-3 pointer-events-auto")}
                    />
                  </PopoverContent>
                </Popover>
                {until && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setUntil(undefined)}
                    className="rounded-xl"
                    aria-label={t("superadmin.billingExemption.clearDate")}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
              <p className="text-[11px] text-slate-500 leading-snug">
                {t("superadmin.billingExemption.expiryHint")}
              </p>
            </div>

            {reason && (
              <div className="rounded-xl bg-[#f0fdf4] border border-[#86efac] p-3 text-xs text-[#0f4a26]">
                <span aria-hidden>✅</span>{" "}
                <Trans
                  i18nKey={
                    until
                      ? "superadmin.billingExemption.summaryUntil"
                      : "superadmin.billingExemption.summaryNoLimit"
                  }
                  values={{ clubName, date: until ? formatDate(until) : "" }}
                  components={{ strong: <strong /> }}
                />
              </div>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setGrantOpen(false)} disabled={busy}>
              {t("superadmin.billingExemption.cancel")}
            </Button>
            <Button
              onClick={() => void onGrant()}
              disabled={busy || !reason}
              className="bg-gradient-to-r from-[#0f4a26] to-[#1d7a45] hover:from-[#0a3a1d] hover:to-[#176237] text-white"
            >
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : editMode ? (
                t("superadmin.billingExemption.save")
              ) : (
                t("superadmin.billingExemption.confirm")
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Revoke confirm */}
      <AlertDialog open={revokeOpen} onOpenChange={setRevokeOpen}>
        <AlertDialogContent className="rounded-[20px]">
          <AlertDialogHeader>
            <AlertDialogTitle>{t("superadmin.billingExemption.revokeTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              <Trans
                i18nKey="superadmin.billingExemption.revokeDescription"
                values={{ clubName }}
                components={{ strong: <strong /> }}
              />
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>
              {t("superadmin.billingExemption.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={() => void onRevoke()}
              className="bg-[#ef4444] hover:bg-[#dc2626] text-white"
            >
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                t("superadmin.billingExemption.revoke")
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 mb-1">
        {label}
      </dt>
      <dd>{children}</dd>
    </div>
  );
}
