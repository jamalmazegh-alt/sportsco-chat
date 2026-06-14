import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Sparkles, Settings2 } from "lucide-react";
import { EventFormSheet, type EventFormValues } from "@/components/event-form-sheet";
import { EventWizard } from "./EventWizard";
import { readDraft, clearDraft, draftHasProgress } from "./event-wizard-draft";

type Team = { id: string; name: string; sport?: string | null; competitions?: string[] | null };

interface Props {
  clubId: string;
  teams: Team[];
  userId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved: () => void;
}

type Mode = "chooser" | "wizard" | "expert" | "expert-prefilled";

export function EventCreateChooser({ teams, userId, open, onOpenChange, onSaved }: Props) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<Mode>("chooser");
  const [expertInitial, setExpertInitial] = useState<Partial<EventFormValues> | undefined>();

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

