import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, ChevronDown, Loader2, Share2, Timer, UploadCloud } from "lucide-react";
import { Link } from "@tanstack/react-router";
import {
  listSocialFailures,
  listFailedImports,
  type SocialFailureRow,
  type FailedImportRow,
} from "@/lib/superadmin/product-activity.functions";
import {
  getStalledOnboarding,
  type StalledOnboardingGroup,
  type StalledSignal,
} from "@/lib/superadmin.functions";
import { redactErrorMessage } from "@/lib/observability/redact";
import { formatDistanceToNowStrict } from "date-fns";
import { dateLocale } from "@/lib/date-locale";

const SIGNAL_LABEL_KEYS: Record<StalledSignal, string> = {
  club_no_team: "superadmin.watchlist.signals.clubNoTeam",
  team_no_player: "superadmin.watchlist.signals.teamNoPlayer",
  players_no_event: "superadmin.watchlist.signals.playersNoEvent",
  event_no_convocation: "superadmin.watchlist.signals.eventNoConvocation",
  invite_not_accepted: "superadmin.watchlist.signals.inviteNotAccepted",
};
const MAX_ITEMS_SHOWN = 8;

export function WatchlistPanel() {
  const { t, i18n } = useTranslation();
  const [social, setSocial] = useState<SocialFailureRow[] | null>(null);
  const [imports, setImports] = useState<FailedImportRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    listSocialFailures()
      .then((r) => setSocial(r.rows))
      .catch((e) => setErr(e instanceof Error ? e.message : "load error"));
    listFailedImports()
      .then((r) => setImports(r.rows))
      .catch((e) => setErr(e instanceof Error ? e.message : "load error"));
  }, []);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      <WatchCard
        icon={<Share2 className="h-4 w-4" />}
        title={t("superadmin.watchlist.socialFailuresTitle")}
        emptyLabel={t("superadmin.watchlist.socialFailuresEmpty")}
        loading={social === null}
        count={social?.length ?? 0}
      >
        {social?.map((s) => (
          <div key={s.connection_id} className="p-2 border-t border-border text-xs">
            <div className="font-medium">
              {s.club_name ?? "—"} · {s.network}
              {s.account_name ? ` · ${s.account_name}` : ""}
            </div>
            <div className="text-muted-foreground truncate mt-0.5">
              {redactErrorMessage(s.last_sync_error)}
            </div>
            {s.last_synced_at && (
              <div className="text-[10px] text-muted-foreground mt-0.5">
                {t("superadmin.watchlist.lastAttempt", {
                  date: new Date(s.last_synced_at).toLocaleString(i18n.language),
                })}
              </div>
            )}
          </div>
        ))}
      </WatchCard>

      <WatchCard
        icon={<UploadCloud className="h-4 w-4" />}
        title={t("superadmin.watchlist.importFailuresTitle")}
        emptyLabel={t("superadmin.watchlist.importFailuresEmpty")}
        loading={imports === null}
        count={imports?.length ?? 0}
      >
        {imports?.map((i) => (
          <div key={i.id} className="p-2 border-t border-border text-xs">
            <div className="font-medium">
              {i.club_name ?? "—"} · {i.import_type}
              {i.file_name ? ` · ${i.file_name}` : ""}
            </div>
            <div className="text-muted-foreground mt-0.5">
              {t("superadmin.watchlist.importRows", {
                status: i.status,
                imported: i.rows_imported,
                total: i.rows_total,
                date: new Date(i.created_at).toLocaleString(i18n.language),
              })}
            </div>
            {i.error_log != null && (
              <div className="text-muted-foreground truncate mt-0.5">
                {redactErrorMessage(i.error_log)}
              </div>
            )}
          </div>
        ))}
      </WatchCard>

      {err && (
        <div className="md:col-span-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          {err}
        </div>
      )}

      <div className="md:col-span-2">
        <StalledOnboardingCard />
      </div>
    </div>
  );
}

function StalledOnboardingCard() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [groups, setGroups] = useState<StalledOnboardingGroup[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && groups === null && !loading) {
      setLoading(true);
      getStalledOnboarding()
        .then((r) => setGroups(r.groups))
        .catch((e) => setErr(e instanceof Error ? e.message : "load error"))
        .finally(() => setLoading(false));
    }
  };

  const total = groups?.reduce((n, g) => n + g.items.length, 0) ?? 0;

  return (
    <div className="rounded-xl border border-border bg-card">
      <button
        type="button"
        onClick={toggle}
        className="w-full flex items-center gap-2 p-3 border-b border-border text-left hover:bg-muted/40"
      >
        <Timer className="h-4 w-4" />
        <div className="text-sm font-medium flex-1">
          {t("superadmin.watchlist.stalledOnboardingTitle")}
        </div>
        {groups && total > 0 && (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-400 text-[11px] px-2 py-0.5">
            <AlertTriangle className="h-3 w-3" /> {total}
          </span>
        )}
        <ChevronDown
          className={`h-4 w-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <div className="p-3">
          <p className="text-[11px] text-muted-foreground mb-2">
            {t("superadmin.watchlist.stalledOnboardingHint")}
          </p>
          {loading && (
            <div className="text-xs text-muted-foreground inline-flex items-center gap-2">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> {t("superadmin.common.loading")}
            </div>
          )}
          {err && <div className="text-xs text-destructive">{err}</div>}
          {!loading && groups && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {groups.map((g) => (
                <StalledGroup key={g.signal} group={g} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function StalledGroup({ group }: { group: StalledOnboardingGroup }) {
  const { t } = useTranslation();
  const label = t(SIGNAL_LABEL_KEYS[group.signal]);
  const shown = group.items.slice(0, MAX_ITEMS_SHOWN);
  const extra = group.items.length - shown.length + (group.truncated ? 1 : 0);
  return (
    <div className="rounded-lg border border-border">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
        <div className="text-xs font-medium flex-1">{label}</div>
        <span className="text-[11px] text-muted-foreground tabular-nums">
          {group.items.length}
          {group.truncated ? "+" : ""}
        </span>
      </div>
      {group.items.length === 0 ? (
        <div className="p-3 text-[11px] text-muted-foreground">
          {t("superadmin.watchlist.nothingToReport")}
        </div>
      ) : (
        <ul className="max-h-56 overflow-y-auto">
          {shown.map((it, idx) => {
            const since = it.since ? new Date(it.since) : null;
            const primary =
              it.detail?.club_name ||
              it.detail?.team_name ||
              it.detail?.title ||
              it.resource_id?.slice(0, 8) ||
              it.club_id?.slice(0, 8) ||
              "—";
            const content = (
              <div className="px-3 py-1.5 text-xs border-t border-border first:border-t-0">
                <div className="font-medium truncate">{primary}</div>
                {since && (
                  <div className="text-[10px] text-muted-foreground">
                    {t("superadmin.watchlist.since", {
                      time: formatDistanceToNowStrict(since, { locale: dateLocale() }),
                    })}
                  </div>
                )}
              </div>
            );
            return (
              <li key={`${it.resource_id ?? it.club_id ?? idx}-${idx}`}>
                {it.club_id ? (
                  <Link
                    to="/superadmin/clubs/$clubId"
                    params={{ clubId: it.club_id }}
                    className="block hover:bg-muted/40"
                  >
                    {content}
                  </Link>
                ) : (
                  content
                )}
              </li>
            );
          })}
          {extra > 0 && (
            <li className="px-3 py-1.5 text-[11px] text-muted-foreground border-t border-border">
              {t("superadmin.watchlist.extraItems", { count: extra })}
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

function WatchCard({
  icon,
  title,
  loading,
  count,
  emptyLabel,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  loading: boolean;
  count: number;
  emptyLabel: string;
  children?: React.ReactNode;
}) {
  const { t } = useTranslation();

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="flex items-center gap-2 p-3 border-b border-border">
        {icon}
        <div className="text-sm font-medium flex-1">{title}</div>
        {count > 0 && (
          <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 text-destructive text-[11px] px-2 py-0.5">
            <AlertTriangle className="h-3 w-3" /> {count}
          </span>
        )}
      </div>
      {loading ? (
        <div className="p-4 text-xs text-muted-foreground inline-flex items-center gap-2">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> {t("superadmin.common.loading")}
        </div>
      ) : count === 0 ? (
        <div className="p-4 text-xs text-muted-foreground">{emptyLabel}</div>
      ) : (
        <div className="max-h-72 overflow-y-auto">{children}</div>
      )}
    </div>
  );
}
