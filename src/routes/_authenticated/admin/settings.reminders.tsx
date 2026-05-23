import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useEffect, useState } from "react";
import { useAuth, useMyRoles } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { SettingsSubHeader, SettingsRow } from "@/components/admin/settings-shared";

export const Route = createFileRoute("/_authenticated/admin/settings/reminders")({
  component: RemindersSettings,
  head: () => ({ meta: [{ title: "Reminders — Clubero" }] }),
});

type Form = {
  id: string;
  auto_reminders_enabled: boolean;
  auto_reminder_hours_before: number[];
};

function RemindersSettings() {
  const { t } = useTranslation();
  const { activeClubId } = useAuth();
  const roles = useMyRoles();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["club-reminders", activeClubId],
    enabled: !!activeClubId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clubs")
        .select("id, auto_reminders_enabled, auto_reminder_hours_before")
        .eq("id", activeClubId!)
        .single();
      if (error) throw error;
      return data as Form;
    },
  });

  const [form, setForm] = useState<Form | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (data) {
      setForm({
        ...data,
        auto_reminder_hours_before: Array.isArray(data.auto_reminder_hours_before)
          ? data.auto_reminder_hours_before
          : [48, 3],
      });
    }
  }, [data]);

  if (!roles.includes("admin")) return <Navigate to="/profile" replace />;
  if (isLoading || !form) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  const presets = [
    { value: [48, 3], label: t("admin.remindersPresetStandard") },
    { value: [72, 24, 3], label: t("admin.remindersPreset3d") },
    { value: [24], label: t("admin.remindersPreset24h") },
    { value: [3], label: t("admin.remindersPreset3h") },
  ];

  async function save() {
    if (!form) return;
    setSaving(true);
    const { error } = await supabase
      .from("clubs")
      .update({
        auto_reminders_enabled: form.auto_reminders_enabled,
        auto_reminder_hours_before: form.auto_reminder_hours_before,
      })
      .eq("id", form.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(t("admin.saved"));
    refetch();
  }

  return (
    <div className="px-5 py-4 space-y-5">
      <SettingsSubHeader
        title={t("admin.remindersTitle")}
        description={t("admin.remindersDescription")}
      />

      <section className="rounded-2xl border border-border bg-card p-5 space-y-4">
        <SettingsRow
          label={t("admin.remindersEnable")}
          checked={form.auto_reminders_enabled}
          onChange={(v) => setForm({ ...form, auto_reminders_enabled: v })}
        />

        {form.auto_reminders_enabled && (
          <div className="space-y-2 pt-2">
            <Label className="text-sm">{t("admin.remindersWhen")}</Label>
            <div className="space-y-2">
              {presets.map((preset) => {
                const selected =
                  preset.value.length === form.auto_reminder_hours_before.length &&
                  preset.value.every((v) => form.auto_reminder_hours_before.includes(v));
                return (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() =>
                      setForm({ ...form, auto_reminder_hours_before: preset.value })
                    }
                    className={`w-full text-left rounded-lg border px-3 py-2.5 text-sm transition-colors ${
                      selected
                        ? "border-primary bg-primary/5 font-medium"
                        : "border-border hover:border-primary/50"
                    }`}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </section>

      <Button className="w-full h-11" onClick={save} disabled={saving}>
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : t("admin.save")}
      </Button>
    </div>
  );
}
