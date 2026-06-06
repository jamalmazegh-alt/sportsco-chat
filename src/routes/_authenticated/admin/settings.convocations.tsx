import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useEffect, useState } from "react";
import { useAuth, useMyRoles } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { SettingsSubHeader } from "@/components/admin/settings-shared";
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

type ChannelKey = "in_app" | "email";
const CHANNELS: ChannelKey[] = ["in_app", "email"];

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

  useEffect(() => {
    if (data) {
      setChannels(
        Array.isArray(data.convocation_channels) ? (data.convocation_channels as string[]) : ["email", "in_app"],
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
    const { error } = await supabase
      .from("clubs")
      .update({ convocation_channels: channels })
      .eq("id", data!.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(t("admin.saved"));
    refetch();
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

      <Button className="w-full h-11" onClick={save} disabled={saving}>
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : t("admin.save")}
      </Button>
    </div>
  );
}
