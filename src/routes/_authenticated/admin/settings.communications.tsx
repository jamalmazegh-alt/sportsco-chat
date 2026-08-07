import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useEffect, useState } from "react";
import { useAuth, useMyRoles } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { SettingsSubHeader, SettingsRow } from "@/components/admin/settings-shared";
import i18nInstance from "@/lib/i18n";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CLUB_TIMEZONES, resolveClubTz } from "@/lib/time/club-tz";
import { invalidateClubTzCache } from "@/lib/time/club-tz.functions";

export const Route = createFileRoute("/_authenticated/admin/settings/communications")({
  component: CommunicationsSettings,
  head: () => ({
    meta: [
      { title: i18nInstance.t("meta.adminCommunications.title") },
      { name: "description", content: i18nInstance.t("meta.adminCommunications.description") },
    ],
  }),
});

type Form = {
  id: string;
  wall_comments_enabled: boolean;
  event_chat_enabled: boolean;
  event_chat_players_enabled: boolean;
  event_chat_parents_enabled: boolean;
  default_language: string;
  timezone: string | null;
};

const LANGS = [
  { value: "fr", label: "Français", flag: "🇫🇷" },
  { value: "en", label: "English", flag: "🇬🇧" },
  { value: "de", label: "Deutsch", flag: "🇩🇪" },
  { value: "es", label: "Español", flag: "🇪🇸" },
  { value: "pt", label: "Português", flag: "🇵🇹" },
  { value: "it", label: "Italiano", flag: "🇮🇹" },
  { value: "nl", label: "Nederlands", flag: "🇳🇱" },
] as const;

function CommunicationsSettings() {
  const { t } = useTranslation();
  const { activeClubId } = useAuth();
  const roles = useMyRoles();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["club-communications", activeClubId],
    enabled: !!activeClubId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clubs")
        .select(
          "id, wall_comments_enabled, event_chat_enabled, event_chat_players_enabled, event_chat_parents_enabled, default_language, timezone",
        )
        .eq("id", activeClubId!)
        .single();
      if (error) throw error;
      return data as Form;
    },
  });

  const [form, setForm] = useState<Form | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (data) setForm(data);
  }, [data]);

  if (!roles.includes("admin")) return <Navigate to="/profile" replace />;
  if (isLoading || !form) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  async function save() {
    if (!form) return;
    setSaving(true);
    const { error } = await supabase
      .from("clubs")
      .update({
        wall_comments_enabled: form.wall_comments_enabled,
        event_chat_enabled: form.event_chat_enabled,
        event_chat_players_enabled: form.event_chat_players_enabled,
        event_chat_parents_enabled: form.event_chat_parents_enabled,
        default_language: form.default_language,
        timezone: resolveClubTz(form.timezone),
      })
      .eq("id", form.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    // Le fuseau est mis en cache côté serveur pour les e-mails/push : on le purge.
    await invalidateClubTzCache({ data: { clubId: form.id } }).catch(() => undefined);
    toast.success(t("admin.saved"));
    refetch();
  }

  return (
    <div className="px-5 py-4 space-y-5">
      <SettingsSubHeader
        title={t("admin.hubCommunications")}
        description={t("admin.hubCommunicationsHint")}
      />

      <section className="rounded-2xl border border-border bg-card p-5 space-y-4">
        <SettingsRow
          label={t("admin.wallComments")}
          hint={t("admin.wallCommentsHint")}
          checked={form.wall_comments_enabled}
          onChange={(v) => setForm({ ...form, wall_comments_enabled: v })}
        />
      </section>

      <section className="rounded-2xl border border-border bg-card p-5 space-y-4">
        <SettingsRow
          label={t("admin.eventChat")}
          hint={t("admin.eventChatHint")}
          checked={form.event_chat_enabled}
          onChange={(v) => setForm({ ...form, event_chat_enabled: v })}
        />
        {form.event_chat_enabled && (
          <div className="ml-2 pl-3 border-l-2 border-border space-y-3">
            <SettingsRow
              label={t("admin.eventChatPlayers")}
              checked={form.event_chat_players_enabled}
              onChange={(v) => setForm({ ...form, event_chat_players_enabled: v })}
            />
            <SettingsRow
              label={t("admin.eventChatParents")}
              checked={form.event_chat_parents_enabled}
              onChange={(v) => setForm({ ...form, event_chat_parents_enabled: v })}
            />
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-border bg-card p-5 space-y-3">
        <div>
          <p className="text-sm font-medium">{t("admin.emailLanguage")}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{t("admin.emailLanguageHint")}</p>
        </div>
        <div role="radiogroup" className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {LANGS.map((opt) => {
            const active = form.default_language === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setForm({ ...form, default_language: opt.value })}
                className={
                  "flex items-center justify-center gap-2 rounded-xl border p-3 text-sm font-medium transition-colors " +
                  (active
                    ? "border-primary bg-primary/5 text-primary"
                    : "border-border bg-background text-muted-foreground hover:text-foreground")
                }
              >
                <span className="text-base">{opt.flag}</span>
                {opt.label}
              </button>
            );
          })}
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-card p-5 space-y-3">
        <div>
          <p className="text-sm font-medium">{t("admin.clubTimezone")}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{t("admin.clubTimezoneHint")}</p>
        </div>
        <Select
          value={resolveClubTz(form.timezone)}
          onValueChange={(v) => setForm({ ...form, timezone: v })}
        >
          <SelectTrigger className="h-11">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CLUB_TIMEZONES.map((tz) => (
              <SelectItem key={tz} value={tz}>
                {tz.replace(/_/g, " ")}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </section>

      <Button className="w-full h-11" onClick={save} disabled={saving}>
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : t("admin.save")}
      </Button>
    </div>
  );
}
