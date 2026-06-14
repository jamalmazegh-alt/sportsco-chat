import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Sparkles, Settings2 } from "lucide-react";
import { EventFormSheet, type EventFormValues } from "@/components/event-form-sheet";
import { EventWizard } from "./EventWizard";
import { readDraft, clearDraft, draftHasProgress } from "./event-wizard-draft";
import type { EventWizardState } from "./event-wizard-config";

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
  /** Snapshot of the wizard state when handing off to the expert form (so we can come back). */
  const [wizardSnapshot, setWizardSnapshot] = useState<EventWizardState | null>(null);
  const [confirmCloseOpen, setConfirmCloseOpen] = useState<null | "wizard" | "expert">(null);

  function reallyClose(forceClear = false) {
    if (forceClear) clearDraft();
    setConfirmCloseOpen(null);
    onOpenChange(false);
    setTimeout(() => {
      setMode("chooser");
      setExpertInitial(undefined);
      setWizardSnapshot(null);
    }, 200);
  }

  function requestCloseWizard() {
    const draft = readDraft();
    if (draftHasProgress(draft)) {
      setConfirmCloseOpen("wizard");
      return;
    }
    reallyClose();
  }

  function requestCloseExpert() {
    setConfirmCloseOpen("expert");
  }

  function openExpertEmpty() {
    setExpertInitial(undefined);
    setWizardSnapshot(null);
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
      setWizardSnapshot(null);
    }
  }, [open]);

  return (
    <>
      <Dialog
        open={open && mode !== "expert" && mode !== "expert-prefilled"}
        onOpenChange={(v) => {
          if (v) return onOpenChange(true);
          if (mode === "wizard") return requestCloseWizard();
          reallyClose();
        }}
      >
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
                initialState={wizardSnapshot ?? undefined}
                onClose={requestCloseWizard}
                onCreated={() => {
                  clearDraft();
                  onSaved();
                  onOpenChange(false);
                  setMode("chooser");
                  setWizardSnapshot(null);
                }}
                onOpenExpert={(init, snapshot) => {
                  setExpertInitial(init as Partial<EventFormValues>);
                  if (snapshot) setWizardSnapshot(snapshot);
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
          if (v) return;
          requestCloseExpert();
        }}
        mode="create"
        teams={teams}
        userId={userId}
        initial={expertInitial}
        onBack={
          mode === "expert-prefilled"
            ? () => {
                // Return to wizard with previous answers intact
                setMode("wizard");
              }
            : undefined
        }
        backLabel={t("eventWizard.backToAssistant", { defaultValue: "Retour à l'assistant" })}
        onSaved={() => {
          clearDraft();
          onSaved();
          onOpenChange(false);
          setMode("chooser");
          setExpertInitial(undefined);
          setWizardSnapshot(null);
        }}
      />

      {/* Confirm close dialog (replaces window.confirm for reliability) */}
      <AlertDialog
        open={confirmCloseOpen !== null}
        onOpenChange={(v) => {
          if (!v) setConfirmCloseOpen(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("eventWizard.confirmCloseTitle", { defaultValue: "Quitter sans enregistrer ?" })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmCloseOpen === "expert"
                ? t("eventWizard.expertAbandonConfirm", {
                    defaultValue: "Tes modifications seront perdues.",
                  })
                : t("eventWizard.abandonConfirm", {
                    defaultValue: "Tes réponses seront conservées comme brouillon.",
                  })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel", { defaultValue: "Annuler" })}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => reallyClose(confirmCloseOpen === "expert")}
            >
              {t("common.confirm", { defaultValue: "Confirmer" })}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
