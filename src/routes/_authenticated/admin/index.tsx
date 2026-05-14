import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useEffect, useState } from "react";
import { useAuth, useActiveRole } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Loader2, Settings2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/")({
  component: AdminSettingsPage,
  head: () => ({ meta: [{ title: "Admin settings — Clubero" }] }),
});

type ChannelKey = "in_app" | "email" | "sms" | "whatsapp" | "push";
const CHANNELS: ChannelKey[] = ["in_app", "email", "sms", "whatsapp", "push"];

type ClubSettings = {
  id: string;
  name: string;
  convocation_channels: string[];
  wall_comments_enabled: boolean;
  event_chat_enabled: boolean;
  event_chat_players_enabled: boolean;
  event_chat_parents_enabled: boolean;
};

function AdminSettingsPage() {
  const { t } = useTranslation();
  const { activeClubId } = useAuth();
  const role = useActiveRole();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["club-settings", activeClubId],
    enabled: !!activeClubId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clubs")
        .select("id, name, convocation_channels, wall_comments_enabled, event_chat_enabled, event_chat_players_enabled, event_chat_parents_enabled")
        .eq("id", activeClubId!)
        .single();
      if (error) throw error;
      return data as unknown as ClubSettings;
    },
  });

  const [form, setForm] = useState<ClubSettings | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (data) {
      setForm({
        ...data,
        convocation_channels: Array.isArray(data.convocation_channels)
          ? data.convocation_channels
          : ["email", "in_app"],
      });
    }
  }, [data]);

  if (role !== "admin") return <Navigate to="/profile" replace />;

  const toggleChannel = (ch: ChannelKey) => {
    if (!form) return;
    const has = form.convocation_channels.includes(ch);
    setForm({
      ...form,
      convocation_channels: has
        ? form.convocation_channels.filter((c) => c !== ch)
        : [...form.convocation_channels, ch],
    });
  };

  async function save() {
    if (!form) return;
    setSaving(true);
    const { error } = await supabase
      .from("clubs")
      .update({
        convocation_channels: form.convocation_channels,
        wall_comments_enabled: form.wall_comments_enabled,
        event_chat_enabled: form.event_chat_enabled,
        event_chat_players_enabled: form.event_chat_players_enabled,
        event_chat_parents_enabled: form.event_chat_parents_enabled,
      })
      .eq("id", form.id);
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(t("admin.saved"));
    refetch();
  }

  if (isLoading || !form) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="px-5 py-4 space-y-5">
      <header className="flex items-center gap-2">
        <Settings2 className="h-5 w-5 text-primary" />
        <h1 className="text-xl font-semibold">{t("admin.title")}</h1>
      </header>
      <p className="text-sm text-muted-foreground">{t("admin.subtitle", { club: form.name })}</p>

      <section className="rounded-2xl border border-border bg-card p-5 space-y-3">
        <div>
          <Label className="text-base">{t("admin.convocationChannels")}</Label>
          <p className="text-xs text-muted-foreground mt-0.5">{t("admin.convocationChannelsHint")}</p>
        </div>
        <div className="space-y-2">
          {CHANNELS.map((ch) => (
            <div key={ch} className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
              <span className="text-sm capitalize">{t(`channels.${ch}`)}</span>
              <Switch
                checked={form.convocation_channels.includes(ch)}
                onCheckedChange={() => toggleChannel(ch)}
              />
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-card p-5 space-y-4">
        <Label className="text-base">{t("admin.communications")}</Label>

        <Row
          label={t("admin.wallComments")}
          hint={t("admin.wallCommentsHint")}
          checked={form.wall_comments_enabled}
          onChange={(v) => setForm({ ...form, wall_comments_enabled: v })}
        />
        <Row
          label={t("admin.eventChat")}
          hint={t("admin.eventChatHint")}
          checked={form.event_chat_enabled}
          onChange={(v) => setForm({ ...form, event_chat_enabled: v })}
        />
        {form.event_chat_enabled && (
          <div className="ml-2 pl-3 border-l-2 border-border space-y-3">
            <Row
              label={t("admin.eventChatPlayers")}
              checked={form.event_chat_players_enabled}
              onChange={(v) => setForm({ ...form, event_chat_players_enabled: v })}
            />
            <Row
              label={t("admin.eventChatParents")}
              checked={form.event_chat_parents_enabled}
              onChange={(v) => setForm({ ...form, event_chat_parents_enabled: v })}
            />
          </div>
        )}
      </section>

      <Button className="w-full h-11" onClick={save} disabled={saving}>
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : t("admin.save")}
      </Button>
    </div>
  );
}

function Row({
  label, hint, checked, onChange,
}: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <p className="text-sm font-medium">{label}</p>
        {hint && <p className="text-xs text-muted-foreground mt-0.5">{hint}</p>}
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
