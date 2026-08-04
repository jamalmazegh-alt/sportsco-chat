import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { getPlayerAudit } from "@/lib/superadmin/observability.functions";
import { StatusBadge } from "@/lib/superadmin/ui";
import { Loader2, History } from "lucide-react";

export const Route = createFileRoute("/superadmin/players/$playerId/audit")({
  component: PlayerAuditPage,
});

const SOURCE_TONE: Record<string, "muted" | "info" | "warn" | "success" | "danger" | "primary"> = {
  audit_logs: "primary",
  convocation: "info",
  feedback: "success",
  suspension: "danger",
  availability: "warn",
  achievement: "success",
  timeline: "muted",
};

function fmt(iso: string) {
  return new Date(iso).toLocaleString();
}

function PlayerAuditPage() {
  const { t } = useTranslation();
  const { playerId } = Route.useParams();
  const { data, isLoading } = useQuery({
    queryKey: ["superadmin", "player-audit", playerId],
    queryFn: () => getPlayerAudit({ data: { playerId, limit: 500 } }),
  });
  const rows = data?.rows ?? [];

  return (
    <div className="p-6 md:p-8 max-w-4xl">
      <header className="mb-5">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
          <History className="h-3.5 w-3.5" /> {t("superadmin.playerAudit.eyebrow")}
        </div>
        <h1 className="text-xl font-semibold mt-1">{t("superadmin.playerAudit.title")}</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {t("superadmin.playerAudit.subtitle")}
        </p>
        <Link to="/superadmin/clubs" className="text-xs text-muted-foreground hover:underline">
          {t("superadmin.playerAudit.backToClubs")}
        </Link>
      </header>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-lg border border-border p-8 text-center text-sm text-muted-foreground">
          {t("superadmin.playerAudit.empty")}
        </div>
      ) : (
        <div className="rounded-lg border border-border divide-y divide-border">
          {rows.map((r, i) => (
            <div key={i} className="px-4 py-3 flex items-start gap-3">
              <div className="pt-0.5">
                <StatusBadge tone={SOURCE_TONE[r.source] ?? "muted"}>{r.source}</StatusBadge>
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium">{r.action}</div>
                <div className="text-xs text-muted-foreground">
                  {fmt(r.occurred_at)}
                  {r.actor_name && (
                    <>
                      {" "}
                      · {t("superadmin.playerAudit.by")}{" "}
                      <span className="font-medium text-foreground">{r.actor_name}</span>
                    </>
                  )}
                </div>
                {r.details && Object.keys(r.details as object).length > 0 && (
                  <pre className="mt-1.5 text-[11px] bg-muted/40 rounded px-2 py-1.5 overflow-x-auto whitespace-pre-wrap break-words">
                    {JSON.stringify(r.details, null, 2)}
                  </pre>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
