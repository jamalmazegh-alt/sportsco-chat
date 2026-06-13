import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Sparkles, Zap, Calculator } from "lucide-react";
import { TournamentWizard } from "./TournamentWizard";
import { TournamentAIAssistant } from "./TournamentAIAssistant";
import { TournamentSimulator } from "./TournamentSimulator";
import {
  clearAssistantDraft,
  configToWizardFormat,
  configUsesFlights,
  draftHasProgress,
  readAssistantDraft,
  type AssistantTournamentConfig,
} from "../lib/assistant-config";

interface Props {
  clubId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

type Mode = "chooser" | "ai" | "simulator";

export function TournamentCreateChooser({ clubId, open, onOpenChange }: Props) {
  const { t } = useTranslation("tournaments");
  const [mode, setMode] = useState<Mode>("chooser");
  const [wizardOpen, setWizardOpen] = useState(false);
  const [assistantPrefill, setAssistantPrefill] = useState<AssistantTournamentConfig | undefined>(
    undefined,
  );
  const [simSeed, setSimSeed] = useState<{ teams: number; flights: boolean } | undefined>(
    undefined,
  );

  function close() {
    onOpenChange(false);
    setTimeout(() => {
      setMode("chooser");
      setAssistantPrefill(undefined);
      setSimSeed(undefined);
    }, 200);
  }

  /**
   * B-01 / B-02 — guard against losing wizard answers. When the user tries to
   * close the dialog while the AI assistant has progress, ask before wiping
   * the draft. The "Réglages détaillés" path (openExpertFromConfig) and the
   * simulator transition (onSimulate) preserve the draft automatically.
   */
  function requestClose() {
    const draft = readAssistantDraft();
    if (mode === "ai" && draftHasProgress(draft)) {
      const ok = window.confirm(
        t("createChooser.abandonConfirm", {
          defaultValue:
            "Quitter l'assistant ? Tes réponses seront effacées. Tu peux aussi fermer pour les retrouver à la prochaine ouverture.",
        }),
      );
      if (!ok) return;
      clearAssistantDraft();
    }
    close();
  }

  function openExpertFromConfig(cfg: AssistantTournamentConfig) {
    // Draft is preserved — the expert wizard reads it via assistantPrefill.
    setAssistantPrefill(cfg);
    onOpenChange(false);
    setMode("chooser");
    setWizardOpen(true);
  }

  function openQuickWizard() {
    setAssistantPrefill(undefined);
    onOpenChange(false);
    setMode("chooser");
    setWizardOpen(true);
  }

  return (
    <>
      <Dialog open={open} onOpenChange={(v) => (v ? onOpenChange(true) : requestClose())}>
        <DialogContent
          className={
            mode === "ai"
              ? "max-w-md max-h-[96vh] p-0 overflow-visible bg-transparent border-0 shadow-none"
              : "max-w-xl max-h-[92vh] overflow-y-auto"
          }
        >
          {mode === "chooser" && (
            <>
              <DialogHeader>
                <DialogTitle>{t("createChooser.title")}</DialogTitle>
                <DialogDescription>{t("createChooser.subtitle")}</DialogDescription>
              </DialogHeader>
              <div className="grid gap-3 pt-2">
                <DoorButton
                  icon={<Sparkles className="h-5 w-5" />}
                  title={t("createChooser.aiTitle")}
                  hint={t("createChooser.aiHint")}
                  badge={t("createChooser.aiBadge")}
                  onClick={() => setMode("ai")}
                />
                <DoorButton
                  icon={<Zap className="h-5 w-5" />}
                  title={t("createChooser.quickTitle")}
                  hint={t("createChooser.quickHint")}
                  onClick={openQuickWizard}
                />
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-1 text-xs"
                  onClick={() => setMode("simulator")}
                >
                  <Calculator className="h-3.5 w-3.5" />
                  {t("createChooser.simulatorLink")}
                </Button>
              </div>
            </>
          )}

          {mode === "ai" && (
            <>
              <DialogHeader className="sr-only">
                <DialogTitle>{t("createChooser.aiTitle")}</DialogTitle>
                <DialogDescription>{t("createChooser.aiHint")}</DialogDescription>
              </DialogHeader>
              <TournamentAIAssistant
                clubId={clubId}
                onOpenExpert={openExpertFromConfig}
                onSimulate={(cfg) => {
                  setSimSeed({
                    teams: configToWizardFormat(cfg).numTeams,
                    flights: configUsesFlights(cfg),
                  });
                  setMode("simulator");
                }}
              />
            </>
          )}

          {mode === "simulator" && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Calculator className="h-4 w-4 text-primary" />
                  {t("simulator.title")}
                </DialogTitle>
                <DialogDescription>{t("simulator.subtitle")}</DialogDescription>
              </DialogHeader>
              <TournamentSimulator
                initialTeams={simSeed?.teams}
                initialFlights={simSeed?.flights}
              />
              <Button variant="ghost" size="sm" onClick={() => setMode(mode === "simulator" && simSeed ? "ai" : "chooser")}>
                ← {t("createChooser.back")}
              </Button>
            </>
          )}
        </DialogContent>
      </Dialog>

      <TournamentWizard
        clubId={clubId}
        open={wizardOpen}
        onOpenChange={setWizardOpen}
        assistantPrefill={assistantPrefill}
      />
    </>
  );
}

function DoorButton({
  icon,
  title,
  hint,
  badge,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  hint: string;
  badge?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex items-start gap-3 rounded-2xl border-2 border-border bg-card p-4 text-left transition-all hover:border-primary hover:shadow-md"
    >
      <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-semibold">{title}</span>
          {badge && (
            <span className="rounded-md bg-primary/15 px-1.5 py-0.5 text-[10px] font-bold uppercase text-primary">
              {badge}
            </span>
          )}
        </div>
        <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
      </div>
    </button>
  );
}
