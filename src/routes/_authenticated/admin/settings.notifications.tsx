import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState, useRef } from "react";
import { Bell, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { useAuth, useMyRoles } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { Switch } from "@/components/ui/switch";
import { BackLink } from "@/components/back-link";
import i18nInstance from "@/lib/i18n";
import { EnablePushCard } from "@/components/pwa/EnablePushCard";

export const Route = createFileRoute("/_authenticated/admin/settings/notifications")({
  component: NotificationsSettingsPage,
  head: () => ({
    meta: [
      {
        title: i18nInstance.t("meta.adminNotifications.title", {
          defaultValue: "Notifications — Clubero",
        }),
      },
      {
        name: "description",
        content: i18nInstance.t("meta.adminNotifications.description", {
          defaultValue: "Choisissez les notifications push envoyées aux membres de votre club.",
        }),
      },
    ],
  }),
});

type Settings = {
  club_id: string;
  convocation_on_create: boolean;
  convocation_reminder: boolean;
  convocation_coach_each_response: boolean;
  convocation_coach_complete: boolean;
  event_reschedule: boolean;
  event_cancel: boolean;
  score_result: boolean;
  wall_new_post: boolean;
  tournament_match_reminder: boolean;
  tournament_draw: boolean;
};

const DEFAULTS: Omit<Settings, "club_id"> = {
  convocation_on_create: true,
  convocation_reminder: true,
  convocation_coach_each_response: false,
  convocation_coach_complete: true,
  event_reschedule: true,
  event_cancel: true,
  score_result: true,
  wall_new_post: true,
  tournament_match_reminder: true,
  tournament_draw: true,
};

type ToggleKey = keyof Omit<Settings, "club_id">;

function NotificationsSettingsPage() {
  const { activeClubId } = useAuth();
  const roles = useMyRoles();

  const { data, isLoading } = useQuery({
    queryKey: ["club-notification-settings", activeClubId],
    enabled: !!activeClubId,
    queryFn: async (): Promise<Settings> => {
      const { data, error } = await supabase
        .from("club_notification_settings")
        .select("*")
        .eq("club_id", activeClubId!)
        .maybeSingle();
      if (error) throw error;
      if (data) return data as Settings;
      return { club_id: activeClubId!, ...DEFAULTS };
    },
  });

  const [form, setForm] = useState<Settings | null>(null);
  const savingRef = useRef(false);

  useEffect(() => {
    if (data && !form) setForm(data);
  }, [data, form]);

  if (!roles.includes("admin") && !roles.includes("dirigeant")) {
    return <Navigate to="/profile" replace />;
  }
  if (isLoading || !form) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  async function update(key: ToggleKey, value: boolean) {
    if (!form || savingRef.current) return;
    const next = { ...form, [key]: value };
    setForm(next);
    savingRef.current = true;
    const { error } = await supabase.from("club_notification_settings").upsert(
      {
        club_id: next.club_id,
        convocation_on_create: next.convocation_on_create,
        convocation_reminder: next.convocation_reminder,
        convocation_coach_each_response: next.convocation_coach_each_response,
        convocation_coach_complete: next.convocation_coach_complete,
        event_reschedule: next.event_reschedule,
        event_cancel: next.event_cancel,
        score_result: next.score_result,
        wall_new_post: next.wall_new_post,
        tournament_match_reminder: next.tournament_match_reminder,
        tournament_draw: next.tournament_draw,
      },
      { onConflict: "club_id" },
    );
    savingRef.current = false;
    if (error) {
      // revert
      setForm(form);
      toast.error(error.message);
      return;
    }
    toast.success("Enregistré", { duration: 1500 });
  }

  return (
    <div className="px-5 py-4 space-y-5 max-w-2xl mx-auto">
      <BackLink to="/admin" label="Retour aux paramètres" />

      {/* Header dégradé vert + icône cloche */}
      <header className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#1d7a45] via-[#16a34a] to-[#22c55e] p-6 text-white shadow-lg">
        <div className="absolute -right-6 -top-6 opacity-15">
          <Bell className="h-32 w-32" strokeWidth={1.5} />
        </div>
        <div className="relative flex items-start gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/15 backdrop-blur-sm">
            <Bell className="h-5 w-5" strokeWidth={2.2} />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl font-semibold leading-tight">Notifications push</h1>
            <p className="text-sm text-white/85 mt-1">
              Choisissez les notifications envoyées sur l'application mobile. Les emails ne sont pas
              affectés.
            </p>
          </div>
        </div>
      </header>


      <Section title="Convocations">

        <Toggle
          label="Push envoyé à la création"
          hint="Notifie joueurs et parents dès qu'une convocation est créée."
          checked={form.convocation_on_create}
          onChange={(v) => update("convocation_on_create", v)}
        />
        <Toggle
          label="Relances automatiques"
          hint="Push de rappel parallèle à l'email avant l'événement."
          checked={form.convocation_reminder}
          onChange={(v) => update("convocation_reminder", v)}
        />
        <Toggle
          label="Coach notifié à chaque réponse"
          hint="Une notification au coach dès qu'un joueur répond."
          checked={form.convocation_coach_each_response}
          onChange={(v) => update("convocation_coach_each_response", v)}
        />
        <Toggle
          label="Coach notifié quand 100% ont répondu"
          hint="Récapitulatif présents / absents / incertains."
          checked={form.convocation_coach_complete}
          onChange={(v) => update("convocation_coach_complete", v)}
        />
      </Section>

      <Section title="Événements">
        <Toggle
          label="Notification de report"
          hint="Push quand un événement change de date."
          checked={form.event_reschedule}
          onChange={(v) => update("event_reschedule", v)}
        />
        <Toggle
          label="Notification d'annulation"
          hint="Push quand un événement est annulé."
          checked={form.event_cancel}
          onChange={(v) => update("event_cancel", v)}
        />
        <Toggle
          label="Résultat de match notifié à l'équipe"
          hint="Push aux joueurs et coaches quand un score est saisi."
          checked={form.score_result}
          onChange={(v) => update("score_result", v)}
        />
      </Section>

      <Section title="Mur du club">
        <Toggle
          label="Push pour nouveau message"
          hint="Tous les membres reçoivent une notification."
          checked={form.wall_new_post}
          onChange={(v) => update("wall_new_post", v)}
        />
      </Section>

      <Section title="Tournois">
        <Toggle
          label="Rappel 30 min avant un match"
          hint="Push aux joueurs et parents avant chaque match tournoi."
          checked={form.tournament_match_reminder}
          onChange={(v) => update("tournament_match_reminder", v)}
        />
        <Toggle
          label="Notification tirage au sort"
          hint="Push aux équipes inscrites dès la publication des poules."
          checked={form.tournament_draw}
          onChange={(v) => update("tournament_draw", v)}
        />
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-card overflow-hidden">
      <header className="px-5 pt-4 pb-2">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {title}
        </h2>
      </header>
      <div className="divide-y divide-border">{children}</div>
    </section>
  );
}

function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 px-5 py-3.5">
      <div className="min-w-0">
        <p className="text-sm font-medium">{label}</p>
        {hint && <p className="text-xs text-muted-foreground mt-0.5">{hint}</p>}
      </div>
      <Switch
        checked={checked}
        onCheckedChange={onChange}
        className="data-[state=checked]:bg-[#1d7a45]"
      />
    </div>
  );
}
