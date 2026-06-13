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
  recommendationToWizardFormat,
  type Recommendation,
} from "../lib/planner";

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
  const [prefill, setPrefill] = useState<
    { format: "mixed" | "group" | "knockout"; numTeams: number; flightsTemplate: "champions" | null } | undefined
  >(undefined);

  function close() {
    onOpenChange(false);
    // reset after dialog animation
    setTimeout(() => {
      setMode("chooser");
      setPrefill(undefined);
    }, 200);
  }

  function openWizardFromReco(reco: Recommendation) {
    const mapped = recommendationToWizardFormat(reco);
    setPrefill({
      format: mapped.format,
      numTeams: mapped.numTeams,
      flightsTemplate: reco.flights,
    });
    onOpenChange(false);
    setMode("chooser");
    setWizardOpen(true);
  }

  return (
    <>
      <Dialog open={open} onOpenChange={(v) => (v ? onOpenChange(true) : close())}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
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
                  onClick={() => {
                    setPrefill(undefined);
                    onOpenChange(false);
                    setWizardOpen(true);
                  }}
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
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" />
                  {t("createChooser.aiTitle")}
                </DialogTitle>
              </DialogHeader>
              <TournamentAIAssistant
                onCreate={openWizardFromReco}
                onAdjust={openWizardFromReco}
                onSimulate={() => setMode("simulator")}
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
              <TournamentSimulator />
              <Button variant="ghost" size="sm" onClick={() => setMode("chooser")}>
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
        initialValues={prefill}
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
