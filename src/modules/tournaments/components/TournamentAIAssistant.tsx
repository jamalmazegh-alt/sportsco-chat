import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sparkles, Trophy, Users, Clock, MapPin, Award, ChevronRight, Loader2, Send } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  recommendFormat,
  type AssistantAnswers,
  type Recommendation,
} from "../lib/planner";
import {
  explainRecommendation,
  answerTournamentQuestion,
} from "@/lib/llm/tournament-assistant.functions";

interface Props {
  /** Called when the user clicks "Create" on the reco card. */
  onCreate: (reco: Recommendation, answers: AssistantAnswers) => void;
  /** Called when the user clicks "Adjust" → opens the wizard pre-filled. */
  onAdjust: (reco: Recommendation, answers: AssistantAnswers) => void;
  /** Called when the user wants to open the simulator from the reco card. */
  onSimulate?: (reco: Recommendation) => void;
}

type StepKey = "teams" | "allDay" | "trophies" | "paid";

const STEP_ORDER: StepKey[] = ["teams", "allDay", "trophies", "paid"];

function stepToAnswerKey(step: StepKey): keyof AssistantAnswers {
  if (step === "trophies") return "multipleTrophies";
  return step;
}

const TEAM_OPTIONS = [8, 12, 16, 24, 32];

export function TournamentAIAssistant({ onCreate, onAdjust, onSimulate }: Props) {
  const { t } = useTranslation("tournaments");
  const [stepIdx, setStepIdx] = useState(0);
  const [answers, setAnswers] = useState<Partial<AssistantAnswers>>({});

  const currentStep = STEP_ORDER[stepIdx];
  const done = stepIdx >= STEP_ORDER.length;
  const reco = done ? recommendFormat(answers as AssistantAnswers) : null;
  const fullAnswers = done ? (answers as AssistantAnswers) : null;

  function answer<K extends keyof AssistantAnswers>(key: K, value: AssistantAnswers[K]) {
    setAnswers((a) => ({ ...a, [key]: value }));
    setStepIdx((i) => i + 1);
  }

  function reset() {
    setAnswers({});
    setStepIdx(0);
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Conversation history */}
      <div className="space-y-3">
        {STEP_ORDER.slice(0, stepIdx).map((key) => {
          const ansKey = stepToAnswerKey(key);
          return (
            <div key={key} className="space-y-2">
              <Bubble role="ai">{t(`aiAssistant.q.${key}`)}</Bubble>
              <Bubble role="me">{formatAnswer(t, key, answers[ansKey])}</Bubble>
            </div>
          );
        })}

        {!done && (
          <div className="space-y-2">
            <Bubble role="ai">
              {stepIdx === 0 ? t("aiAssistant.intro") + " " : ""}
              {t(`aiAssistant.q.${currentStep}`)}
            </Bubble>
            <div className="flex flex-wrap gap-2">
              {renderOptions(currentStep, answer, t)}
            </div>
          </div>
        )}

        {done && reco && fullAnswers && (
          <>
            <Bubble role="ai">{t("aiAssistant.recoIntro")}</Bubble>
            <RecoCard reco={reco} t={t} />
            <AIExplanation reco={reco} answers={fullAnswers} />
            <div className="flex flex-col gap-2 pt-2">
              <Button
                size="lg"
                onClick={() => onCreate(reco, fullAnswers)}
                className="w-full"
              >
                <Sparkles className="h-4 w-4" />
                {t("aiAssistant.cta.create")}
              </Button>
              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" onClick={() => onAdjust(reco, fullAnswers)}>
                  {t("aiAssistant.cta.adjust")}
                </Button>
                {onSimulate ? (
                  <Button variant="outline" onClick={() => onSimulate(reco)}>
                    {t("aiAssistant.cta.simulate")}
                  </Button>
                ) : (
                  <Button variant="ghost" onClick={reset}>
                    {t("aiAssistant.cta.restart")}
                  </Button>
                )}
              </div>
            </div>
            <AIFollowUp reco={reco} />
          </>
        )}
      </div>
    </div>
  );
}

function Bubble({ role, children }: { role: "ai" | "me"; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        "max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed",
        role === "ai"
          ? "rounded-bl-sm border border-border bg-card text-foreground"
          : "ml-auto rounded-br-sm bg-primary text-primary-foreground font-medium",
      )}
    >
      {children}
    </div>
  );
}

type T = ReturnType<typeof useTranslation>["t"];

function renderOptions(
  step: StepKey,
  answer: <K extends keyof AssistantAnswers>(k: K, v: AssistantAnswers[K]) => void,
  t: T,
) {
  if (step === "teams") {
    return TEAM_OPTIONS.map((n) => (
      <Chip key={n} onClick={() => answer("teams", n)}>
        {n}
      </Chip>
    ));
  }
  if (step === "allDay") {
    return (
      <>
        <Chip onClick={() => answer("allDay", true)}>{t("aiAssistant.opts.allDayYes")}</Chip>
        <Chip onClick={() => answer("allDay", false)}>{t("aiAssistant.opts.allDayNo")}</Chip>
      </>
    );
  }
  if (step === "trophies") {
    return (
      <>
        <Chip onClick={() => answer("multipleTrophies", true)}>
          {t("aiAssistant.opts.trophiesYes")}
        </Chip>
        <Chip onClick={() => answer("multipleTrophies", false)}>
          {t("aiAssistant.opts.trophiesNo")}
        </Chip>
      </>
    );
  }
  // paid
  return (
    <>
      <Chip onClick={() => answer("paid", false)}>{t("aiAssistant.opts.free")}</Chip>
      <Chip onClick={() => answer("paid", true)}>{t("aiAssistant.opts.paid")}</Chip>
    </>
  );
}

function Chip({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-xl border-2 border-primary bg-primary/10 px-3.5 py-2 text-sm font-bold text-primary transition-colors hover:bg-primary/20"
    >
      {children}
    </button>
  );
}

function formatAnswer(t: T, key: StepKey, value: unknown): string {
  if (key === "teams") return String(value);
  if (key === "allDay")
    return value ? t("aiAssistant.opts.allDayYes") : t("aiAssistant.opts.allDayNo");
  if (key === "trophies")
    return value ? t("aiAssistant.opts.trophiesYes") : t("aiAssistant.opts.trophiesNo");
  return value ? t("aiAssistant.opts.paid") : t("aiAssistant.opts.free");
}

function RecoCard({ reco, t }: { reco: Recommendation; t: T }) {
  const formatLabel =
    reco.format === "pools_finals"
      ? t("aiAssistant.formats.poolsFinals")
      : reco.format === "round_robin"
        ? t("aiAssistant.formats.roundRobin")
        : t("aiAssistant.formats.singleElim");

  return (
    <div className="rounded-2xl border-2 border-primary bg-card p-4 shadow-lg shadow-primary/10">
      <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-primary">
        <Sparkles className="h-3.5 w-3.5" />
        {t("aiAssistant.recoBadge")}
      </div>
      <h3 className="mt-2 text-lg font-bold leading-tight">
        {t("aiAssistant.recoTitle", {
          pools: reco.pools,
          perPool: reco.perPool,
        })}
        {reco.flights === "champions" && ` + ${t("aiAssistant.recoFlightsSuffix")}`}
      </h3>

      <div className="mt-3 space-y-2.5">
        <RecoLine icon={<Users />} label={t("aiAssistant.recoLine.teams")}>
          {reco.pools * reco.perPool}
        </RecoLine>
        <RecoLine icon={<Trophy />} label={t("aiAssistant.recoLine.finals")}>
          {reco.flights === "champions"
            ? t("aiAssistant.recoLine.flightsValue")
            : formatLabel}
        </RecoLine>
        <RecoLine icon={<Award />} label={t("aiAssistant.recoLine.matches")}>
          {reco.totalMatches}
        </RecoLine>
        <RecoLine icon={<Clock />} label={t("aiAssistant.recoLine.estimatedEnd")}>
          09:00 → {reco.estimatedEndHHMM}
        </RecoLine>
        <RecoLine icon={<MapPin />} label={t("aiAssistant.recoLine.terrains")}>
          {reco.terrainsSuggested}
        </RecoLine>
      </div>

      {reco.flights === "champions" && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          <Flag tone="champions">🏆 Champions</Flag>
          <Flag tone="europa">🥈 Europa</Flag>
          <Flag tone="conference">🥉 Conference</Flag>
        </div>
      )}
    </div>
  );
}

function RecoLine({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2.5 border-t border-border pt-2.5 first:border-t-0 first:pt-0 text-sm">
      <span className="text-muted-foreground [&>svg]:h-4 [&>svg]:w-4">{icon}</span>
      <span className="font-medium">{label}</span>
      <span className="ml-auto font-bold tabular-nums">{children}</span>
    </div>
  );
}

function Flag({
  tone,
  children,
}: {
  tone: "champions" | "europa" | "conference";
  children: React.ReactNode;
}) {
  const cls =
    tone === "champions"
      ? "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200"
      : tone === "europa"
        ? "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-200"
        : "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200";
  return (
    <span className={cn("rounded-md px-2 py-1 text-[11px] font-bold", cls)}>{children}</span>
  );
}
