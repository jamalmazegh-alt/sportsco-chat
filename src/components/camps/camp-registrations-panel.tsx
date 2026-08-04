/**
 * Étape 1 — Tableau des inscriptions d'un stage.
 * Rôles autorisés : admin | dirigeant | coach (contrôle serveur).
 */

import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  Loader2,
  Search,
  Clock,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Download,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  listCampRegistrations,
  getCampRegistrationStats,
  extendCampReservation,
  type CampRegistrationRow,
  type RegistrationStatus,
  type PaymentStatus,
  type DossierStatus,
} from "@/lib/camp-registrations.functions";
import { CampRegistrationDetailSheet } from "@/components/camps/camp-registration-detail-sheet";
import { downloadRegistrationsCsv } from "@/lib/camp-registrations-csv";

const REGISTRATION_STATUSES: RegistrationStatus[] = [
  "pending",
  "under_review",
  "approved",
  "waitlist",
  "rejected",
  "cancelled",
];
const PAYMENT_STATUSES: PaymentStatus[] = [
  "not_required",
  "pending",
  "declared",
  "paid",
  "partial",
  "refunded",
];
const DOSSIER_STATUSES: DossierStatus[] = [
  "complete",
  "payment_missing",
  "documents_pending",
  "documents_missing",
];

function ageFromBirthDate(iso: string): number | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return age;
}

function DossierBadge({ status, t }: { status: DossierStatus; t: (k: string, o?: any) => string }) {
  const map: Record<DossierStatus, { className: string; label: string; emoji: string }> = {
    complete: {
      className: "bg-emerald-500/10 text-emerald-700 border-emerald-500/30",
      label: t("registrations.dossier.complete"),
      emoji: "🟢",
    },
    payment_missing: {
      className: "bg-amber-500/10 text-amber-800 border-amber-500/30",
      label: t("registrations.dossier.paymentMissing"),
      emoji: "🟠",
    },
    documents_pending: {
      className: "bg-blue-500/10 text-blue-700 border-blue-500/30",
      label: t("registrations.dossier.documentsPending"),
      emoji: "🔵",
    },
    documents_missing: {
      className: "bg-red-500/10 text-red-700 border-red-500/30",
      label: t("registrations.dossier.documentsMissing"),
      emoji: "🔴",
    },
  };
  const m = map[status];
  return (
    <Badge variant="outline" className={m.className}>
      <span className="mr-1">{m.emoji}</span>
      {m.label}
    </Badge>
  );
}

export function CampRegistrationsPanel({ campId }: { campId: string }) {
  const { t } = useTranslation("camps");
  const qc = useQueryClient();
  const listFn = useServerFn(listCampRegistrations);
  const statsFn = useServerFn(getCampRegistrationStats);
  const extendFn = useServerFn(extendCampReservation);

  const [regFilter, setRegFilter] = useState<RegistrationStatus | "all">("all");
  const [payFilter, setPayFilter] = useState<PaymentStatus | "all">("all");
  const [dossierFilter, setDossierFilter] = useState<DossierStatus | "all">("all");
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  const listQ = useQuery({
    queryKey: ["camp-registrations", campId],
    queryFn: () => listFn({ data: { campId } }),
  });
  const statsQ = useQuery({
    queryKey: ["camp-registration-stats", campId],
    queryFn: () => statsFn({ data: { campId } }),
    refetchInterval: 30_000,
  });

  const extendMut = useMutation({
    mutationFn: (registrationId: string) => extendFn({ data: { registrationId } }),
    onSuccess: () => {
      toast.success(t("registrations.extend.done"));
      qc.invalidateQueries({ queryKey: ["camp-registrations", campId] });
      qc.invalidateQueries({ queryKey: ["camp-registration-stats", campId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = listQ.data ?? [];
  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (regFilter !== "all" && r.registration_status !== regFilter) return false;
      if (payFilter !== "all" && r.payment_status !== payFilter) return false;
      if (dossierFilter !== "all" && r.dossier_status !== dossierFilter) return false;
      if (s) {
        const hay =
          `${r.participant_first_name} ${r.participant_last_name} ${r.guardian_email}`.toLowerCase();
        if (!hay.includes(s)) return false;
      }
      return true;
    });
  }, [rows, regFilter, payFilter, dossierFilter, search]);

  const stats = statsQ.data;

  return (
    <div className="space-y-5">
      {/* Compteurs */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard label={t("registrations.stats.capacity")} value={stats?.capacity ?? "—"} />
        <StatCard
          label={t("registrations.stats.approved")}
          value={stats?.approved ?? "—"}
          className="text-emerald-700"
        />
        <StatCard
          label={t("registrations.stats.reserved")}
          value={stats?.reserved ?? "—"}
          className="text-amber-700"
        />
        <StatCard
          label={t("registrations.stats.remaining")}
          value={stats?.remaining ?? "—"}
          className="text-primary"
        />
        <StatCard label={t("registrations.stats.pending")} value={stats?.pending ?? "—"} />
      </div>
      {stats && stats.expired_reservations > 0 && (
        <div className="flex items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-sm text-amber-800">
          <AlertTriangle className="h-4 w-4" />
          {t("registrations.stats.expiredHint", {
            count: stats.expired_reservations,
          })}
        </div>
      )}

      {/* Filtres */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder={t("registrations.searchPlaceholder")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <FilterSelect
          value={regFilter}
          onValueChange={(v) => setRegFilter(v as any)}
          allLabel={t("registrations.filters.allReg")}
          options={REGISTRATION_STATUSES.map((s) => ({
            value: s,
            label: t(`registrations.status.${s}`, { defaultValue: s }),
          }))}
        />
        <FilterSelect
          value={payFilter}
          onValueChange={(v) => setPayFilter(v as any)}
          allLabel={t("registrations.filters.allPay")}
          options={PAYMENT_STATUSES.map((s) => ({
            value: s,
            label: t(`registrations.payment.${s}`, { defaultValue: s }),
          }))}
        />
        <FilterSelect
          value={dossierFilter}
          onValueChange={(v) => setDossierFilter(v as any)}
          allLabel={t("registrations.filters.allDossier")}
          options={DOSSIER_STATUSES.map((s) => ({
            value: s,
            label: t(`registrations.dossier.${statusKey(s)}`, {
              defaultValue: s,
            }),
          }))}
        />
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            listQ.refetch();
            statsQ.refetch();
          }}
        >
          <RefreshCw className="h-4 w-4 mr-1" />
          {t("common.refresh")}
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={filtered.length === 0}
          onClick={() => {
            downloadRegistrationsCsv(filtered, { t, campSlug: campId });
            toast.success(
              t("registrations.csv.done", {
                count: filtered.length,
              }),
            );
          }}
          title={t("registrations.csv.hint")}
        >
          <Download className="h-4 w-4 mr-1" />
          {t("registrations.csv.cta")}
        </Button>
      </div>

      {/* Tableau */}
      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="min-w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
            <tr>
              <Th>{t("registrations.col.participant")}</Th>
              <Th>{t("registrations.col.guardian")}</Th>
              <Th>{t("registrations.col.requested")}</Th>
              <Th>{t("registrations.col.regStatus")}</Th>
              <Th>{t("registrations.col.payment")}</Th>
              <Th>{t("registrations.col.dossier")}</Th>
              <Th className="text-right">{t("registrations.col.actions")}</Th>
            </tr>
          </thead>
          <tbody>
            {listQ.isLoading && (
              <tr>
                <td colSpan={7} className="py-10 text-center">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
                </td>
              </tr>
            )}
            {!listQ.isLoading && filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="py-10 text-center text-muted-foreground">
                  {t("registrations.empty")}
                </td>
              </tr>
            )}
            {filtered.map((r) => (
              <RegistrationRow
                key={r.id}
                row={r}
                t={t}
                onExtend={() => extendMut.mutate(r.id)}
                extending={extendMut.isPending && extendMut.variables === r.id}
                onOpen={() => setOpenId(r.id)}
              />
            ))}
          </tbody>
        </table>
      </div>

      <CampRegistrationDetailSheet
        campId={campId}
        registrationId={openId}
        open={openId !== null}
        onOpenChange={(o) => !o && setOpenId(null)}
      />
    </div>
  );
}

function statusKey(s: DossierStatus) {
  if (s === "documents_missing") return "documentsMissing";
  if (s === "documents_pending") return "documentsPending";
  if (s === "payment_missing") return "paymentMissing";
  return "complete";
}

function StatCard({
  label,
  value,
  className,
}: {
  label: string;
  value: string | number;
  className?: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`mt-0.5 text-2xl font-semibold tabular-nums ${className ?? ""}`}>{value}</div>
    </div>
  );
}

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return <th className={`px-3 py-2 text-left font-medium ${className ?? ""}`}>{children}</th>;
}

function FilterSelect({
  value,
  onValueChange,
  options,
  allLabel,
}: {
  value: string;
  onValueChange: (v: string) => void;
  options: { value: string; label: string }[];
  allLabel: string;
}) {
  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger className="w-[190px]">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">{allLabel}</SelectItem>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function RegistrationRow({
  row,
  t,
  onExtend,
  extending,
  onOpen,
}: {
  row: CampRegistrationRow;
  t: (k: string, o?: any) => string;
  onExtend: () => void;
  extending: boolean;
  onOpen: () => void;
}) {
  const age = ageFromBirthDate(row.birth_date);
  return (
    <tr
      className="border-t border-border/60 align-top cursor-pointer hover:bg-muted/40"
      onClick={onOpen}
    >
      <td className="px-3 py-3">
        <div className="font-medium">
          {row.participant_first_name} {row.participant_last_name}
        </div>
        <div className="text-xs text-muted-foreground">
          {age != null
            ? t("registrations.age", { defaultValue: "{{age}} ans", age })
            : row.birth_date}
        </div>
      </td>
      <td className="px-3 py-3">
        <div>
          {row.guardian_first_name} {row.guardian_last_name}
        </div>
        <div className="text-xs text-muted-foreground">{row.guardian_email}</div>
        {row.guardian_phone && (
          <div className="text-xs text-muted-foreground">{row.guardian_phone}</div>
        )}
      </td>
      <td className="px-3 py-3 whitespace-nowrap text-xs text-muted-foreground">
        {new Date(row.created_at).toLocaleDateString(undefined, {
          day: "2-digit",
          month: "short",
          year: "numeric",
        })}
      </td>
      <td className="px-3 py-3">
        <RegistrationStatusBadge status={row.registration_status} t={t} />
        {row.registration_status === "under_review" && row.reserved_until && (
          <div
            className={`mt-1 flex items-center gap-1 text-xs ${row.reservation_expired ? "text-amber-700" : "text-muted-foreground"}`}
          >
            <Clock className="h-3 w-3" />
            {row.reservation_expired
              ? t("registrations.reservationExpired")
              : t("registrations.reservationUntil", {
                  defaultValue: "Jusqu'au {{date}}",
                  date: new Date(row.reserved_until).toLocaleString(undefined, {
                    day: "2-digit",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  }),
                })}
          </div>
        )}
      </td>
      <td className="px-3 py-3">
        <PaymentBadge status={row.payment_status} t={t} />
        {row.amount_paid > 0 && (
          <div className="mt-0.5 text-xs text-muted-foreground tabular-nums">
            {row.amount_paid.toFixed(2)} €
          </div>
        )}
      </td>
      <td className="px-3 py-3">
        <DossierBadge status={row.dossier_status} t={t} />
        <div className="mt-1 text-xs text-muted-foreground">
          {row.required_total > 0
            ? t("registrations.docsSummary", {
                ok: row.documents_approved,
                total: row.required_total,
              })
            : t("registrations.noRequiredDocs")}
          {row.documents_rejected > 0 && (
            <span className="ml-1 text-red-700">
              · {row.documents_rejected} {t("registrations.rejected")}
            </span>
          )}
        </div>
      </td>
      <td className="px-3 py-3 text-right">
        {row.reservation_expired && (
          <Button
            size="sm"
            variant="outline"
            onClick={(e) => {
              e.stopPropagation();
              onExtend();
            }}
            disabled={extending}
          >
            {extending ? (
              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
            ) : (
              <Clock className="h-3 w-3 mr-1" />
            )}
            {t("registrations.extendCta")}
          </Button>
        )}
      </td>
    </tr>
  );
}

function RegistrationStatusBadge({
  status,
  t,
}: {
  status: RegistrationStatus;
  t: (k: string, o?: any) => string;
}) {
  const map: Record<RegistrationStatus, string> = {
    pending: "bg-slate-500/10 text-slate-700 border-slate-500/30",
    under_review: "bg-blue-500/10 text-blue-700 border-blue-500/30",
    approved: "bg-emerald-500/10 text-emerald-700 border-emerald-500/30",
    waitlist: "bg-purple-500/10 text-purple-700 border-purple-500/30",
    rejected: "bg-red-500/10 text-red-700 border-red-500/30",
    cancelled: "bg-muted text-muted-foreground border-border",
  };
  const icon =
    status === "approved" ? (
      <CheckCircle2 className="h-3 w-3 mr-1" />
    ) : status === "rejected" ? (
      <XCircle className="h-3 w-3 mr-1" />
    ) : null;
  return (
    <Badge variant="outline" className={map[status]}>
      {icon}
      {t(`registrations.status.${status}`, { defaultValue: status })}
    </Badge>
  );
}

function PaymentBadge({ status, t }: { status: PaymentStatus; t: (k: string, o?: any) => string }) {
  const map: Record<PaymentStatus, string> = {
    not_required: "bg-slate-500/10 text-slate-700 border-slate-500/30",
    pending: "bg-amber-500/10 text-amber-800 border-amber-500/30",
    declared: "bg-blue-500/10 text-blue-700 border-blue-500/30",
    paid: "bg-emerald-500/10 text-emerald-700 border-emerald-500/30",
    partial: "bg-amber-500/10 text-amber-800 border-amber-500/30",
    refunded: "bg-purple-500/10 text-purple-700 border-purple-500/30",
  };
  return (
    <Badge variant="outline" className={map[status]}>
      {t(`registrations.payment.${status}`, { defaultValue: status })}
    </Badge>
  );
}
