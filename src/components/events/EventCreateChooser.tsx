import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Sparkles, Repeat, Settings2, Zap } from "lucide-react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { EventFormSheet, type EventFormValues } from "@/components/event-form-sheet";
import { EventWizard } from "./EventWizard";
import { readDraft, clearDraft, draftHasProgress } from "./event-wizard-draft";

type Team = { id: string; name: string; competitions?: string[] | null };

interface Props {
  clubId: string;
  teams: Team[];
  userId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved: () => void;
}

type Mode = "chooser" | "wizard" | "expert" | "expert-prefilled";

export function EventCreateChooser({ clubId, teams, userId, open, onOpenChange, onSaved }: Props) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<Mode>("chooser");
  const [expertInitial, setExpertInitial] = useState<Partial<EventFormValues> | undefined>();

  // Fetch last training & last match for "Reprendre" quick paths
  const teamIds = teams.map((tm) => tm.id);
  const { data: recent } = useQuery({
    queryKey: ["events-recent", clubId, teamIds.join(",")],
    enabled: open && teamIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from("events")
        .select(
          "id, type, team_id, title, location, location_url, opponent, competition_type, competition_name, is_home, meeting_point, starts_at, ends_at",
        )
        .in("team_id", teamIds)
        .in("type", ["training", "match"])
        .is("deleted_at", null)
        .order("starts_at", { ascending: false })
        .limit(20);
      const last: Record<"training" | "match", any | null> = { training: null, match: null };
      for (const e of data ?? []) {
        if ((e.type === "training" || e.type === "match") && !last[e.type as "training" | "match"]) {
          last[e.type as "training" | "match"] = e;
        }
      }
      return last;
    },
  });

  function close(forceClear = false) {
    const draft = readDraft();
    if (mode === "wizard" && draftHasProgress(draft) && !forceClear) {
      const ok = window.confirm(
        t("eventWizard.abandonConfirm", {
          defaultValue: "Quitter l'assistant ? Tes réponses seront conservées.",
        }),
      );
      if (!ok) return;
    }
    if (forceClear) clearDraft();
    onOpenChange(false);
    setTimeout(() => {
      setMode("chooser");
      setExpertInitial(undefined);
    }, 200);
  }

  function openExpertEmpty() {
    setExpertInitial(undefined);
    setMode("expert");
  }

  function openExpertRepeat(template: "training" | "match") {
    const last = recent?.[template];
    if (!last) return;
    // Pre-fill but bump date to tomorrow as a starting point
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const oldStart = new Date(last.starts_at);
    tomorrow.setHours(oldStart.getHours(), oldStart.getMinutes(), 0, 0);
    let newEnd: string | null = null;
    if (last.ends_at) {
      const dur = new Date(last.ends_at).getTime() - new Date(last.starts_at).getTime();
      newEnd = new Date(tomorrow.getTime() + dur).toISOString();
    }
    setExpertInitial({
      team_id: last.team_id,
      type: last.type as EventFormValues["type"],
      title: last.title,
      description: null,
      location: last.location,
      location_url: last.location_url,
      opponent: last.opponent,
      competition_type: (last.competition_type as EventFormValues["competition_type"]) ?? null,
      competition_name: last.competition_name,
      is_home: last.is_home,
      meeting_point: last.meeting_point,
      starts_at: tomorrow.toISOString(),
      ends_at: newEnd,
      convocation_time: null,
    });
    setMode("expert-prefilled");
  }

  function startWizard() {
    setMode("wizard");
  }

  const isExpert = mode === "expert" || mode === "expert-prefilled";

  useEffect(() => {
    if (!open) {
      setMode("chooser");
      setExpertInitial(undefined);
    }
  }, [open]);

  return (
    <>
      <Dialog open={open && mode !== "expert" && mode !== "expert-prefilled"} onOpenChange={(v) => (v ? onOpenChange(true) : close())}>
        <DialogContent className={mode === "wizard" ? "max-w-md p-0 overflow-hidden gap-0" : "max-w-md"}>
          {mode === "chooser" && (
            <>
              <DialogHeader>
                <DialogTitle>{t("eventCreateChooser.title", { defaultValue: "Nouvel événement" })}</DialogTitle>
                <DialogDescription>
                  {t("eventCreateChooser.subtitle", { defaultValue: "Comment veux-tu créer cet événement ?" })}
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-2 pt-2">
                <DoorButton
                  icon={<Sparkles className="h-5 w-5" />}
                  title={t("eventCreateChooser.assistant", { defaultValue: "Créer avec l'assistant" })}
                  hint={t("eventCreateChooser.assistantHint", { defaultValue: "Guidé, question par question" })}
                  primary
                  onClick={startWizard}
                />
                {recent?.training && (
                  <DoorButton
                    icon={<Repeat className="h-5 w-5" />}
                    title={t("eventCreateChooser.repeatTraining", { defaultValue: "Reprendre le dernier entraînement" })}
                    hint={recapEvent(recent.training)}
                    onClick={() => openExpertRepeat("training")}
                  />
                )}
                {recent?.match && (
                  <DoorButton
                    icon={<Repeat className="h-5 w-5" />}
                    title={t("eventCreateChooser.repeatMatch", { defaultValue: "Reprendre le dernier match" })}
                    hint={recapEvent(recent.match)}
                    onClick={() => openExpertRepeat("match")}
                  />
                )}
                <DoorButton
                  icon={<Settings2 className="h-5 w-5" />}
                  title={t("eventCreateChooser.classic", { defaultValue: "Création classique" })}
                  hint={t("eventCreateChooser.classicHint", { defaultValue: "Le formulaire complet" })}
                  onClick={openExpertEmpty}
                />
              </div>
            </>
          )}

          {mode === "wizard" && (
            <>
              <DialogHeader className="sr-only">
                <DialogTitle>{t("eventWizard.title", { defaultValue: "Nouvel événement" })}</DialogTitle>
                <DialogDescription>
                  {t("eventCreateChooser.assistantHint", { defaultValue: "Guidé, question par question" })}
                </DialogDescription>
              </DialogHeader>
              <EventWizard
                teams={teams}
                onClose={() => close()}
                onCreated={() => {
                  clearDraft();
                  onSaved();
                  onOpenChange(false);
                  setMode("chooser");
                }}
                onOpenExpert={(init) => {
                  setExpertInitial(init as Partial<EventFormValues>);
                  setMode("expert-prefilled");
                }}
              />
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Expert form sheet (separate dialog so the wizard sheet can close cleanly) */}
      <EventFormSheet
        open={isExpert && open}
        onOpenChange={(v) => {
          if (!v) {
            close(true);
          }
        }}
        mode="create"
        teams={teams}
        userId={userId}
        initial={expertInitial}
        onSaved={() => {
          clearDraft();
          onSaved();
          onOpenChange(false);
          setMode("chooser");
          setExpertInitial(undefined);
        }}
      />
    </>
  );
}

function DoorButton({
  icon,
  title,
  hint,
  primary,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  hint?: string;
  primary?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "flex items-start gap-3 rounded-2xl border-2 p-4 text-left transition-all hover:border-primary " +
        (primary ? "border-primary/40 bg-primary/5" : "border-border bg-card")
      }
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="font-semibold text-sm">{title}</div>
        {hint && <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">{hint}</p>}
      </div>
    </button>
  );
}

function recapEvent(e: {
  title: string;
  starts_at: string;
  location: string | null;
  opponent: string | null;
}): string {
  const date = format(new Date(e.starts_at), "EEE d MMM HH:mm");
  const parts: string[] = [date];
  if (e.location) parts.push(e.location);
  if (e.opponent) parts.push(`vs ${e.opponent}`);
  return parts.join(" · ");
}

// reference to silence unused import in some bundlers
void Zap;
