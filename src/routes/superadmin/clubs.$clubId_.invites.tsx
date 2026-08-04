import { createFileRoute, Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useMemo, useState } from "react";
import { useQuery, queryOptions } from "@tanstack/react-query";
import {
  listClubInviteStatuses,
  type ClubInviteStatusRow,
  type EmailStatus,
} from "@/lib/superadmin/invite-status.functions";
import { StatusBadge } from "@/lib/superadmin/ui";
import { ArrowLeft, Loader2, Mail, MailX, MailCheck, MailWarning, Clock } from "lucide-react";

import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/superadmin/clubs/$clubId_/invites")({
  component: ClubInvitesPage,
});

const inviteStatusesQuery = (clubId: string) =>
  queryOptions({
    queryKey: ["superadmin", "club-invite-statuses", clubId],
    queryFn: () => listClubInviteStatuses({ data: { clubId } }),
    staleTime: 30_000,
  });

function ClubInvitesPage() {
  const { t } = useTranslation();
  const { clubId } = Route.useParams();
  const { data, isLoading, error } = useSuspenseQueryOrPending(clubId);

  const [emailStatusFilter, setEmailStatusFilter] = useState<"all" | EmailStatus>("all");
  const [inviteStatusFilter, setInviteStatusFilter] = useState<
    "all" | "accepted" | "active" | "pending" | "expired"
  >("all");
  const [search, setSearch] = useState("");

  const rows = data?.rows ?? [];

  const inviteStatusOf = (r: ClubInviteStatusRow) =>
    r.usedAt ? "accepted" : r.hasActiveAccount ? "active" : r.isExpired ? "expired" : "pending";

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (emailStatusFilter !== "all" && r.emailStatus !== emailStatusFilter) return false;
      if (inviteStatusFilter !== "all") {
        if (inviteStatusOf(r) !== inviteStatusFilter) return false;
      }
      if (search) {
        const q = search.toLowerCase();
        const hay =
          `${r.email ?? ""} ${r.firstName ?? ""} ${r.lastName ?? ""} ${r.invitedPlayerName ?? ""} ${r.role}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, emailStatusFilter, inviteStatusFilter, search]);

  const stats = useMemo(() => {
    const total = rows.length;
    const accepted = rows.filter((r) => r.usedAt || r.hasActiveAccount).length;
    const emailSent = rows.filter((r) => r.emailStatus === "sent").length;
    const emailFailed = rows.filter(
      (r) => r.emailStatus === "failed" || r.emailStatus === "dlq",
    ).length;
    const emailMissing = rows.filter((r) => r.emailStatus === "none").length;
    return { total, accepted, emailSent, emailFailed, emailMissing };
  }, [rows]);

  return (
    <div className="p-6 md:p-8 max-w-6xl">
      <Link
        to="/superadmin/clubs/$clubId"
        params={{ clubId }}
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-3"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> {t("superadmin.invites.backToClub")}
      </Link>
      <h1 className="text-2xl font-semibold mb-1">{t("superadmin.invites.title")}</h1>
      <p className="text-xs text-muted-foreground mb-6">{t("superadmin.invites.subtitle")}</p>

      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive mb-4">
          {(error as Error).message}
        </div>
      )}

      <section className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        <KPI label={t("superadmin.invites.title")} value={stats.total} />
        <KPI label={t("superadmin.invites.accepted")} value={stats.accepted} tone="success" />
        <KPI label={t("superadmin.invites.emailSent")} value={stats.emailSent} tone="info" />
        <KPI label={t("superadmin.invites.emailFailed")} value={stats.emailFailed} tone="danger" />
        <KPI label={t("superadmin.invites.noEmailTrace")} value={stats.emailMissing} tone="warn" />
      </section>

      <section className="flex flex-col md:flex-row gap-2 mb-4">
        <Input
          placeholder={t("superadmin.invites.searchPlaceholder")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
        <Select value={emailStatusFilter} onValueChange={(v) => setEmailStatusFilter(v as any)}>
          <SelectTrigger className="max-w-[200px]">
            <SelectValue placeholder={t("superadmin.invites.emailStatus")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("superadmin.invites.allEmailStatuses")}</SelectItem>
            <SelectItem value="sent">{t("superadmin.invites.sent")}</SelectItem>
            <SelectItem value="pending">{t("superadmin.invites.pending")}</SelectItem>
            <SelectItem value="failed">{t("superadmin.invites.failed")}</SelectItem>
            <SelectItem value="dlq">{t("superadmin.invites.dlq")}</SelectItem>
            <SelectItem value="suppressed">{t("superadmin.invites.blocked")}</SelectItem>
            <SelectItem value="bounced">{t("superadmin.invites.bounce")}</SelectItem>
            <SelectItem value="complained">{t("superadmin.invites.complaint")}</SelectItem>
            <SelectItem value="none">{t("superadmin.invites.noTrace")}</SelectItem>
          </SelectContent>
        </Select>
        <Select value={inviteStatusFilter} onValueChange={(v) => setInviteStatusFilter(v as any)}>
          <SelectTrigger className="max-w-[200px]">
            <SelectValue placeholder={t("superadmin.invites.inviteStatus")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("superadmin.invites.allInvites")}</SelectItem>
            <SelectItem value="pending">{t("superadmin.invites.pending")}</SelectItem>
            <SelectItem value="active">{t("superadmin.invites.activeAccount")}</SelectItem>
            <SelectItem value="accepted">{t("superadmin.invites.acceptedStatus")}</SelectItem>
            <SelectItem value="expired">{t("superadmin.invites.expired")}</SelectItem>
          </SelectContent>
        </Select>
      </section>

      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> {t("superadmin.invites.loading")}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-sm text-muted-foreground p-6 border border-border rounded-md bg-muted/20">
          {t("superadmin.invites.empty")}
        </div>
      ) : (
        <div className="border border-border rounded-md overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-[11px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left px-3 py-2">{t("superadmin.invites.recipient")}</th>
                <th className="text-left px-3 py-2">{t("superadmin.invites.role")}</th>
                <th className="text-left px-3 py-2">{t("superadmin.invites.invitation")}</th>
                <th className="text-left px-3 py-2">{t("superadmin.invites.email")}</th>
                <th className="text-left px-3 py-2">{t("superadmin.invites.created")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((r) => (
                <InviteRow key={r.inviteId} row={r} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function useSuspenseQueryOrPending(clubId: string): {
  data: { rows: ClubInviteStatusRow[] } | undefined;
  isLoading: boolean;
  error: Error | null;
} {
  const q = useQuery(inviteStatusesQuery(clubId));
  return {
    data: q.data,
    isLoading: q.isLoading,
    error: (q.error as Error | null) ?? null,
  };
}

function KPI({
  label,
  value,
  tone = "muted",
}: {
  label: string;
  value: number;
  tone?: "muted" | "success" | "info" | "danger" | "warn";
}) {
  const colors: Record<string, string> = {
    muted: "text-foreground",
    success: "text-emerald-600 dark:text-emerald-400",
    info: "text-blue-600 dark:text-blue-400",
    danger: "text-destructive",
    warn: "text-amber-600 dark:text-amber-400",
  };
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`text-2xl font-semibold mt-1 ${colors[tone]}`}>{value}</div>
    </div>
  );
}

function InviteRow({ row }: { row: ClubInviteStatusRow }) {
  const { t } = useTranslation();
  const name = [row.firstName, row.lastName].filter(Boolean).join(" ").trim() || row.email || "—";
  const inviteBadge = row.usedAt ? (
    <StatusBadge tone="success">{t("superadmin.invites.acceptedStatus")}</StatusBadge>
  ) : row.hasActiveAccount ? (
    <StatusBadge tone="success">{t("superadmin.invites.activeAccount")}</StatusBadge>
  ) : row.isExpired ? (
    <StatusBadge tone="danger">{t("superadmin.invites.expired")}</StatusBadge>
  ) : (
    <StatusBadge tone="warn">{t("superadmin.invites.pending")}</StatusBadge>
  );

  return (
    <tr className="hover:bg-muted/30">
      <td className="px-3 py-2">
        <div className="font-medium">{name}</div>
        {row.email && <div className="text-xs text-muted-foreground">{row.email}</div>}
        {row.invitedPlayerName && (
          <div className="text-[11px] text-muted-foreground italic">
            joueur : {row.invitedPlayerName}
          </div>
        )}
      </td>
      <td className="px-3 py-2">
        <StatusBadge tone="muted">{row.role}</StatusBadge>
      </td>
      <td className="px-3 py-2">{inviteBadge}</td>
      <td className="px-3 py-2">
        <EmailStatusBadge row={row} />
        {row.emailError && (
          <div
            className="text-[11px] text-destructive mt-1 max-w-xs truncate"
            title={row.emailError}
          >
            {row.emailError}
          </div>
        )}
      </td>
      <td className="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap">
        {new Date(row.createdAt).toLocaleDateString()}{" "}
        <span className="opacity-70">
          {new Date(row.createdAt).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
      </td>
    </tr>
  );
}

function EmailStatusBadge({ row }: { row: ClubInviteStatusRow }) {
  switch (row.emailStatus) {
    case "sent":
      return (
        <StatusBadge tone="success">
          <MailCheck className="h-3 w-3" /> Envoyé
        </StatusBadge>
      );
    case "pending":
      return (
        <StatusBadge tone="info">
          <Clock className="h-3 w-3" /> En file
        </StatusBadge>
      );
    case "failed":
      return (
        <StatusBadge tone="danger">
          <MailX className="h-3 w-3" /> Échec
        </StatusBadge>
      );
    case "dlq":
      return (
        <StatusBadge tone="danger">
          <MailX className="h-3 w-3" /> DLQ
        </StatusBadge>
      );
    case "suppressed":
      return (
        <StatusBadge tone="warn">
          <MailWarning className="h-3 w-3" /> Bloqué
        </StatusBadge>
      );
    case "bounced":
      return (
        <StatusBadge tone="warn">
          <MailWarning className="h-3 w-3" /> Rebond
        </StatusBadge>
      );
    case "complained":
      return (
        <StatusBadge tone="warn">
          <MailWarning className="h-3 w-3" /> Plainte
        </StatusBadge>
      );
    case "none":
    default:
      return (
        <StatusBadge tone="muted">
          <Mail className="h-3 w-3" /> Sans trace
        </StatusBadge>
      );
  }
}
