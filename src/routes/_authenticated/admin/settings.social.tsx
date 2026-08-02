import { createFileRoute, Navigate, useSearch } from "@tanstack/react-router";
import { getPublicOrigin } from "@/lib/native-platform";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState, type ComponentType } from "react";
import { useAuth, useMyRoles } from "@/lib/auth-context";
import { isV2 } from "@/config/features";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw, Unplug, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { SettingsSubHeader } from "@/components/admin/settings-shared";
import {
  listSocialConnections,
  startSocialConnect,
  disconnectSocial,
  syncSocialNow,
} from "@/lib/social/connections.functions";
import { formatDistanceToNow } from "date-fns";
import { dateLocale } from "@/lib/date-locale";
import i18nInstance from "@/lib/i18n";
import { useTranslation } from "react-i18next";
import { FacebookIcon, InstagramIcon, XIcon } from "@/components/social-icons";

type Network = "instagram" | "facebook" | "twitter";

const META: Record<
  Network,
  { label: string; Icon: ComponentType<{ className?: string }>; tint: string }
> = {
  instagram: { label: "Instagram", Icon: InstagramIcon, tint: "text-pink-500" },
  facebook: { label: "Facebook", Icon: FacebookIcon, tint: "text-blue-600" },
  twitter: { label: "X / Twitter", Icon: XIcon, tint: "text-foreground" },
};

export const Route = createFileRoute("/_authenticated/admin/settings/social")({
  component: SocialSettings,
  validateSearch: (s: Record<string, unknown>) => ({
    status: typeof s.status === "string" ? s.status : undefined,
    network: typeof s.network === "string" ? s.network : undefined,
    reason: typeof s.reason === "string" ? s.reason : undefined,
  }),
  head: () => ({
    meta: [{ title: i18nInstance.t("admin.hubSocial", { defaultValue: "Réseaux sociaux" }) }],
  }),
});

function SocialSettings() {
  const { t } = useTranslation();
  const { activeClubId } = useAuth();
  const roles = useMyRoles();
  const search = useSearch({ from: "/_authenticated/admin/settings/social" });
  const list = useServerFn(listSocialConnections);
  const startConnect = useServerFn(startSocialConnect);
  const disconnect = useServerFn(disconnectSocial);
  const syncNow = useServerFn(syncSocialNow);
  const [busy, setBusy] = useState<Network | null>(null);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["social-connections", activeClubId],
    enabled: !!activeClubId,
    queryFn: () => list({ data: { clubId: activeClubId! } }),
  });

  useEffect(() => {
    if (search.status === "connected") {
      toast.success(t("admin.socialConnectSuccess", { network: search.network }));
      refetch();
    } else if (search.status === "error") {
      toast.error(
        t("admin.socialConnectError", {
          reason: search.reason ?? t("admin.socialErrorUnknown"),
        }),
      );
    }
  }, [search.status, search.network, search.reason, refetch, t]);

  if (!roles.includes("admin")) return <Navigate to="/profile" replace />;

  async function connect(network: Network) {
    if (!activeClubId) return;
    setBusy(network);
    try {
      const { url } = await startConnect({
        data: { clubId: activeClubId, network, origin: getPublicOrigin() },
      });
      window.location.href = url;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("common.error", { defaultValue: "Error" }));
      setBusy(null);
    }
  }

  async function doDisconnect(network: Network) {
    if (!activeClubId) return;
    if (!confirm(t("admin.socialDisconnectConfirm", { network: META[network].label }))) return;
    setBusy(network);
    try {
      await disconnect({ data: { clubId: activeClubId, network } });
      toast.success(t("admin.socialDisconnectSuccess", { network: META[network].label }));
      refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("common.error", { defaultValue: "Error" }));
    } finally {
      setBusy(null);
    }
  }

  async function doSync(network: Network) {
    if (!activeClubId) return;
    setBusy(network);
    try {
      const r = await syncNow({ data: { clubId: activeClubId, network } });
      toast.success(t("admin.socialSyncResult", { imported: r.imported, skipped: r.skipped }));
      refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("common.error", { defaultValue: "Error" }));
    } finally {
      setBusy(null);
    }
  }

  if (isLoading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  const conns = data?.connections ?? [];
  const byNetwork = new Map(conns.map((c) => [c.network as Network, c]));
  const networks: Network[] = (["instagram", "facebook", "twitter"] as Network[]).filter(
    (n) => n !== "twitter" || isV2("social_twitter"),
  );

  return (
    <div className="px-5 py-4 space-y-5">
      <SettingsSubHeader title={t("admin.hubSocial")} description={t("admin.hubSocialHint")} />

      <ul className="space-y-3">
        {networks.map((net) => {
          const conn = byNetwork.get(net);
          const meta = META[net];
          const Icon = meta.Icon;
          const isBusy = busy === net;
          return (
            <li key={net} className="rounded-2xl border border-border bg-card p-4">
              <div className="flex items-start gap-3">
                <div className="h-10 w-10 rounded-xl bg-muted flex items-center justify-center shrink-0">
                  <Icon className={`h-5 w-5 ${meta.tint}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold">{meta.label}</p>
                  {conn ? (
                    <>
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">
                        {conn.account_name ?? "—"} · {t("admin.socialConnected")}
                      </p>
                      {conn.last_synced_at && (
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          {t("admin.socialLastSync", {
                            when: formatDistanceToNow(new Date(conn.last_synced_at), {
                              addSuffix: true,
                              locale: dateLocale(),
                            }),
                          })}
                        </p>
                      )}
                      {conn.last_sync_error && (
                        <p className="text-[11px] text-destructive mt-0.5 truncate">
                          ⚠ {conn.last_sync_error}
                        </p>
                      )}
                    </>
                  ) : (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {t("admin.socialNotConnected")}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex gap-2 mt-3">
                {conn ? (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => doSync(net)}
                      disabled={isBusy}
                      className="flex-1"
                    >
                      {isBusy ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <>
                          <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                          {t("admin.socialSync")}
                        </>
                      )}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => doDisconnect(net)}
                      disabled={isBusy}
                    >
                      <Unplug className="h-3.5 w-3.5 mr-1.5" />
                      {t("admin.socialDisconnect")}
                    </Button>
                  </>
                ) : (
                  <Button
                    size="sm"
                    onClick={() => connect(net)}
                    disabled={isBusy}
                    className="flex-1"
                  >
                    {isBusy ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                        {t("admin.socialConnect")}
                      </>
                    )}
                  </Button>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <p className="text-xs text-muted-foreground">{t("admin.socialAutoNote")}</p>
    </div>
  );
}
