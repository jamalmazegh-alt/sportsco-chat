import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useAuth, useMyRoles } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { SettingsSubHeader } from "@/components/admin/settings-shared";
import { CallUpVisibilityField } from "@/components/call-up-visibility-field";
import { updateConvocationChannels } from "@/lib/club-settings.functions";
import i18nInstance from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/admin/settings/convocations")({
  component: ConvocationsSettings,
  head: () => ({
    meta: [
      { title: i18nInstance.t("meta.adminConvocations.title") },
      { name: "description", content: i18nInstance.t("meta.adminConvocations.description") },
    ],
  }),
});

type ChannelKey = "email";
// In-app convocations are temporarily hidden because the feature is not working reliably.
const CHANNELS: ChannelKey[] = ["email"];

function ConvocationsSettings() {
  const { t } = useTranslation();
  const { activeClubId } = useAuth();
  const roles = useMyRoles();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["club-convocations", activeClubId],
    enabled: !!activeClubId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clubs")
        .select("id, convocation_channels")
        .eq("id", activeClubId!)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const [channels, setChannels] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const saveChannels = useServerFn(updateConvocationChannels);

  useEffect(() => {
    if (data) {
      setChannels(
        Array.isArray(data.convocation_channels)
          ? (data.convocation_channels as string[]).filter((c) => c === "email")
          : ["email"],
      );
    }
  }, [data]);

  if (!roles.includes("admin")) return <Navigate to="/profile" replace />;
  if (isLoading || !data) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  function toggle(ch: ChannelKey) {
    setChannels((prev) => (prev.includes(ch) ? prev.filter((c) => c !== ch) : [...prev, ch]));
  }

  async function save() {
    setSaving(true);
    try {
      // Préserve `in_app` (non exposé dans l'UI) pour ne pas l'écraser.
      const existing = Array.isArray(data!.convocation_channels)
        ? (data!.convocation_channels as string[])
        : [];
      const next = [...channels, ...existing.filter((c) => c !== "email")];
      await saveChannels({ data: { clubId: data!.id, channels: next as ("email" | "in_app")[] } });
      toast.success(t("admin.saved"));
      refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="px-5 py-4 space-y-5">
      <SettingsSubHeader
        title={t("admin.hubConvocations")}
        description={t("admin.convocationChannelsHint")}
      />

      <section className="rounded-2xl border border-border bg-card p-5 space-y-3">
        <div className="space-y-2">
          {CHANNELS.map((ch) => (
            <div
              key={ch}
              className="flex items-center justify-between rounded-lg border border-border px-3 py-2.5"
            >
              <span className="text-sm capitalize">{t(`channels.${ch}`)}</span>
              <Switch checked={channels.includes(ch)} onCheckedChange={() => toggle(ch)} />
            </div>
          ))}
        </div>
      </section>

      {/*
       * Club-level default for call-up list visibility (racine de cascade).
       * Écriture via RPC gated (set_call_up_visibility) — jamais `.update()`
       * direct sur clubs.show_called_up_players_default depuis le client.
       */}
      {activeClubId && (
        <section className="rounded-2xl border border-border bg-card p-5">
          <CallUpVisibilityField scope="club" id={activeClubId} isStaff />
        </section>
      )}

      <Button className="w-full h-11" onClick={save} disabled={saving}>
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : t("admin.save")}
      </Button>
    </div>
  );
}
