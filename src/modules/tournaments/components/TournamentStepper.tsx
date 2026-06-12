import { useTranslation } from "react-i18next";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { StepperStep } from "../lib/control-center";

interface Props {
  steps: StepperStep[];
}

const STEP_LABEL_KEY: Record<StepperStep["id"], string> = {
  registrations: "controlCenter.steps.registrations",
  draw: "controlCenter.steps.draw",
  pools: "controlCenter.steps.pools",
  flights: "controlCenter.steps.flights",
  finals: "controlCenter.steps.finals",
};
const STEP_LABEL_DEFAULT: Record<StepperStep["id"], string> = {
  registrations: "Inscriptions",
  draw: "Tirage",
  pools: "Poules",
  flights: "Flights",
  finals: "Finales",
};

export function TournamentStepper({ steps }: Props) {
  const { t } = useTranslation("tournaments");
  return (
    <ol
      aria-label="Progression"
      className="flex items-center gap-1 overflow-x-auto px-1 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {steps.map((step, idx) => {
        const label = t(STEP_LABEL_KEY[step.id], { defaultValue: STEP_LABEL_DEFAULT[step.id] });
        const isLast = idx === steps.length - 1;
        const done = step.state === "done";
        const current = step.state === "current";
        return (
          <li key={step.id} className="flex items-center gap-1 shrink-0">
            <div className="flex items-center gap-1.5">
              <span
                aria-current={current ? "step" : undefined}
                className={cn(
                  "flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold transition-colors",
                  done && "bg-primary text-primary-foreground",
                  current && "bg-primary/15 text-primary ring-2 ring-primary",
                  !done && !current && "bg-muted text-muted-foreground",
                )}
              >
                {done ? <Check className="h-3.5 w-3.5" /> : idx + 1}
              </span>
              <span
                className={cn(
                  "text-[11px] font-medium whitespace-nowrap",
                  current ? "text-foreground" : "text-muted-foreground",
                )}
              >
                {label}
              </span>
            </div>
            {!isLast && (
              <span
                aria-hidden
                className={cn(
                  "h-px w-5 sm:w-7 rounded-full",
                  done ? "bg-primary" : "bg-border",
                )}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}
