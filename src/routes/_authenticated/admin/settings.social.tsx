import { createFileRoute, Navigate, useSearch } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { useAuth, useMyRoles } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Loader2, Camera, Users, AtSign, RefreshCw, Unplug, ExternalLink } from "lucide-react";
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

type Network = "instagram" | "facebook" | "twitter";

const META: Record<Network, { label: string; Icon: typeof Camera; tint: string }> = {
  instagram: { label: "Instagram", Icon: Camera, tint: "text-pink-500" },
  facebook: { label: "Facebook", Icon: Users, tint: "text-blue-600" },
  twitter: { label: "X / Twitter", Icon: AtSign, tint: "text-foreground" },
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
      toast.success(`${search.network} connecté · synchronisation en cours`);
      refetch();
    } else if (search.status === "error") {
      toast.error(`Échec connexion: ${search.reason ?? "inconnue"}`);
    }
  }, [search.status, search.network, search.reason, refetch]);

  if (!roles.includes("admin")) return <Navigate to="/profile" replace />;

  async function connect(network: Network) {
    if (!activeClubId) return;
    setBusy(network);
    try {
      const { url } = await startConnect({
        data: { clubId: activeClubId, network, origin: window.location.origin },
      });
      window.location.href = url;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
      setBusy(null);
    }
  }

  async function doDisconnect(network: Network) {
    if (!activeClubId) return;
    if (!confirm(`Déconnecter ${META[network].label} ? Les posts importés seront masqués.`)) return;
    setBusy(network);
    try {
      await disconnect({ data: { clubId: activeClubId, network } });
      toast.success(`${META[network].label} déconnecté`);
      refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusy(null);
    }
  }

  async function doSync(network: Network) {
    if (!activeClubId) return;
    setBusy(network);
    try {
      const r = await syncNow({ data: { clubId: activeClubId, network } });
      toast.success(`${r.imported} importés · ${r.skipped} déjà présents`);
      refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
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
  const networks: Network[] = ["instagram", "facebook", "twitter"];

  return (
    <div className="px-5 py-4 space-y-5">
      <SettingsSubHeader
        title="Réseaux sociaux"
        description="Affiche automatiquement les publications de vos comptes Instagram, Facebook et X sur le mur du club."
      />

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
                        {conn.account_name ?? "—"} · Connecté
                      </p>
                      {conn.last_synced_at && (
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          Dernière synchro{" "}
                          {formatDistanceToNow(new Date(conn.last_synced_at), {
                            addSuffix: true,
                            locale: dateLocale(),
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
                    <p className="text-xs text-muted-foreground mt-0.5">Non connecté</p>
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
                          Synchroniser
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
                      Déconnecter
                    </Button>
                  </>
                ) : (
                  <Button size="sm" onClick={() => connect(net)} disabled={isBusy} className="flex-1">
                    {isBusy ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                        Connecter
                      </>
                    )}
                  </Button>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <p className="text-xs text-muted-foreground">
        La synchronisation automatique tourne toutes les heures. Les nouvelles publications
        apparaissent directement sur le mur du club, mêlées chronologiquement aux annonces internes.
      </p>
    </div>
  );
}
