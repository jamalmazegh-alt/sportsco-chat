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

const GREEN_GRADIENT = "linear-gradient(135deg,#16a34a 0%,#15803d 100%)";

export function TournamentStepper({ steps }: Props) {
  const { t } = useTranslation("tournaments");
  const doneCount = steps.filter((s) => s.state === "done").length;
  const progress = Math.round((doneCount / steps.length) * 100);

  return (
    <div
      className="rounded-2xl border-[1.5px] border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
      style={{ boxShadow: "0 1px 2px rgba(15,23,42,.04)" }}
    >
      <div className="mb-3 flex items-center justify-between">
        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
          {t("controlCenter.progress", { defaultValue: "Progression" })}
        </span>
        <span className="text-[11px] font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
          {progress}%
        </span>
      </div>
      <div className="mb-4 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${progress}%`, background: GREEN_GRADIENT }}
        />
      </div>
      <ol
        aria-label="Progression"
        className="flex items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {steps.map((step, idx) => {
          const label = t(STEP_LABEL_KEY[step.id], { defaultValue: STEP_LABEL_DEFAULT[step.id] });
          const isLast = idx === steps.length - 1;
          const done = step.state === "done";
          const current = step.state === "current";
          return (
            <li key={step.id} className="flex shrink-0 items-center gap-1">
              <div className="flex items-center gap-2">
                <span
                  aria-current={current ? "step" : undefined}
                  className={cn(
                    "flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-bold transition-all",
                    done && "text-white shadow-sm",
                    current &&
                      "bg-white text-emerald-700 ring-2 ring-emerald-500 dark:bg-slate-900 dark:text-emerald-400",
                    !done &&
                      !current &&
                      "bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500",
                  )}
                  style={done ? { background: GREEN_GRADIENT } : undefined}
                >
                  {done ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : idx + 1}
                </span>
                <span
                  className={cn(
                    "whitespace-nowrap text-[11px] font-semibold",
                    current
                      ? "text-slate-900 dark:text-slate-100"
                      : done
                        ? "text-emerald-700 dark:text-emerald-400"
                        : "text-slate-400 dark:text-slate-500",
                  )}
                >
                  {label}
                </span>
              </div>
              {!isLast && (
                <span
                  aria-hidden
                  className={cn(
                    "h-[2px] w-5 rounded-full sm:w-7",
                    done ? "bg-emerald-500" : "bg-slate-200 dark:bg-slate-800",
                  )}
                />
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
