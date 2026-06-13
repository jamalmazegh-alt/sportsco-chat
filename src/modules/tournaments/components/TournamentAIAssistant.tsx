import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LocationAutocomplete } from "@/components/location-autocomplete";
import { Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { TOP_SPORTS } from "@/lib/sports";
import {
  assistantStepOrder,
  configToCreatePayload,
  defaultMatchDuration,
  defaultPlayersPerTeam,
  defaultTerrains,
  emptyConfig,
  isConfigComplete,
  MATCH_DURATION_PRESETS,
  playersPerTeamOptions,
  TEAM_COUNT_PRESETS,
  TERRAIN_PRESETS,
  type AssistantStepId,
  type AssistantTournamentConfig,
} from "../lib/assistant-config";
import { createTournament, updateTournament } from "../tournaments.functions";
import { updateTournamentPaymentSettings } from "../tournament-payments.functions";
import { AssistantLivePreview } from "./AssistantLivePreview";

interface Props {
  clubId: string;
  defaultSport?: string;
  onOpenExpert: (config: AssistantTournamentConfig) => void;
  onSimulate?: (config: AssistantTournamentConfig) => void;
}

const SPORT_BUTTONS = ["football", "futsal", "basketball", "volleyball", "handball", "rugby"] as const;

export function TournamentAIAssistant({
  clubId,
  defaultSport,
  onOpenExpert,
  onSimulate,
}: Props) {
  const { t } = useTranslation("tournaments");
  const navigate = useNavigate();
  const qc = useQueryClient();
  const createFn = useServerFn(createTournament);
  const updateFn = useServerFn(updateTournament);
  const paymentFn = useServerFn(updateTournamentPaymentSettings);

  const [config, setConfig] = useState<AssistantTournamentConfig>(() =>
    emptyConfig(
      defaultSport
        ? {
            sport: defaultSport,
            playersPerTeam: defaultPlayersPerTeam(defaultSport),
            matchDurationMin: defaultMatchDuration(
              defaultSport,
              defaultPlayersPerTeam(defaultSport),
            ),
          }
        : undefined,
    ),
  );
  const [stepIdx, setStepIdx] = useState(0);
  const [customTeams, setCustomTeams] = useState("");
  const [customDuration, setCustomDuration] = useState("");
  const [paidAmount, setPaidAmount] = useState("");
  const [adjustMode, setAdjustMode] = useState(false);

  const steps = useMemo(() => {
    const order = assistantStepOrder(config);
    return defaultSport ? order.filter((s) => s !== "sport") : order;
  }, [config, defaultSport]);

  const currentStep = steps[stepIdx] ?? "summary";
  const onSummary = currentStep === "summary";
  const answeredCount = stepIdx;

  function advance() {
    setStepIdx((i) => Math.min(i + 1, steps.length - 1));
    setAdjustMode(false);
  }

  function goToStep(id: AssistantStepId) {
    const idx = steps.indexOf(id);
    if (idx >= 0) {
      setStepIdx(idx);
      setAdjustMode(false);
    }
  }

  function patch(partial: Partial<AssistantTournamentConfig>) {
    setConfig((c) => ({ ...c, ...partial }));
  }

  function selectSport(sport: string) {
    const playersPerTeam = defaultPlayersPerTeam(sport);
    patch({
      sport,
      playersPerTeam,
      matchDurationMin: defaultMatchDuration(sport, playersPerTeam),
    });
    advance();
  }

  function selectPlayersPerTeam(n: number) {
    patch({
      playersPerTeam: n,
      matchDurationMin: defaultMatchDuration(config.sport, n),
    });
    advance();
  }

  function selectNumTeams(n: number) {
    patch({ numTeams: n, terrains: defaultTerrains(n) });
    advance();
  }

  function confirmCustomTeams() {
    const n = parseInt(customTeams, 10);
    if (!Number.isFinite(n) || n < 2 || n > 64) {
      toast.error(t("aiAssistant.errors.invalidTeams"));
      return;
    }
    selectNumTeams(n);
    setCustomTeams("");
  }

  function selectScheduleFormat(
    format: AssistantTournamentConfig["scheduleFormat"],
  ) {
    patch({
      scheduleFormat: format,
      eliminatedContinue: format === "pools_finals" ? config.eliminatedContinue : false,
    });
    advance();
  }

  function selectEliminatedContinue(value: boolean) {
    patch({ eliminatedContinue: value });
    advance();
  }

  function selectFlightsTemplate(template: AssistantTournamentConfig["flightsTemplate"]) {
    patch({ flightsTemplate: template });
    advance();
  }

  function selectDuration(min: number) {
    patch({ matchDurationMin: min });
    advance();
  }

  function confirmCustomDuration() {
    const n = parseInt(customDuration, 10);
    if (!Number.isFinite(n) || n < 5 || n > 120) {
      toast.error(t("aiAssistant.errors.invalidDuration"));
      return;
    }
    selectDuration(n);
    setCustomDuration("");
  }

  function selectTerrains(n: number) {
    patch({ terrains: n });
    advance();
  }

  function selectPaid(paid: boolean) {
    patch({ paid, registrationFeeCents: paid ? config.registrationFeeCents : 0 });
    advance();
  }

  function confirmPaidAmount() {
    const euros = parseFloat(paidAmount.replace(",", "."));
    if (!Number.isFinite(euros) || euros <= 0) {
      toast.error(t("aiAssistant.errors.invalidPrice"));
      return;
    }
    patch({
      registrationFeeCents: Math.round(euros * 100),
      registrationCurrency: config.registrationCurrency || "eur",
    });
    advance();
  }

  function confirmName() {
    if (config.name.trim().length < 2) {
      toast.error(t("aiAssistant.errors.invalidName"));
      return;
    }
    advance();
  }

  function confirmDate() {
    if (!config.startsOn) {
      toast.error(t("aiAssistant.errors.invalidDate"));
      return;
    }
    advance();
  }

  function confirmLocation() {
    if (!config.location.trim()) {
      toast.error(t("aiAssistant.errors.invalidLocation"));
      return;
    }
    advance();
  }

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!isConfigComplete(config)) {
        throw new Error(t("aiAssistant.errors.incomplete"));
      }
      const payload = configToCreatePayload(clubId, config);
      const res = await createFn({ data: payload.create });
      await updateFn({
        data: {
          tournament_id: res.tournament.id,
          patch: payload.update,
        },
      });
      if (payload.payment) {
        await paymentFn({
          data: {
            tournament_id: res.tournament.id,
            registration_fee: payload.payment.registration_fee,
            registration_currency: payload.payment.registration_currency as "eur",
            payment_mode: "offline",
          },
        });
      }
      return res;
    },
    onSuccess: (res) => {
      toast.success(t("wizard.createdToast"));
      qc.invalidateQueries({ queryKey: ["tournaments", clubId] });
      navigate({
        to: "/tournaments/$tournamentId",
        params: { tournamentId: res.tournament.id },
      });
    },
    onError: (e: Error) => toast.error(e.message ?? t("wizard.errorToast")),
  });

  return (
    <div className="flex flex-col gap-4">
      <AssistantLivePreview config={config} answeredCount={answeredCount} />

      <div className="space-y-3">
        {steps.slice(0, stepIdx).map((stepId) => (
          <HistoryRow
            key={stepId}
            stepId={stepId}
            config={config}
            onEdit={() => goToStep(stepId)}
          />
        ))}

        {!onSummary && (
          <QuestionBlock
            stepId={currentStep}
            config={config}
            customTeams={customTeams}
            setCustomTeams={setCustomTeams}
            customDuration={customDuration}
            setCustomDuration={setCustomDuration}
            paidAmount={paidAmount}
            setPaidAmount={setPaidAmount}
            onSport={selectSport}
            onPlayersPerTeam={selectPlayersPerTeam}
            onNumTeams={selectNumTeams}
            onConfirmCustomTeams={confirmCustomTeams}
            onScheduleFormat={selectScheduleFormat}
            onEliminatedContinue={selectEliminatedContinue}
            onFlightsTemplate={selectFlightsTemplate}
            onDuration={selectDuration}
            onConfirmCustomDuration={confirmCustomDuration}
            onTerrains={selectTerrains}
            onPaid={selectPaid}
            onConfirmPaidAmount={confirmPaidAmount}
            onNameChange={(name) => patch({ name })}
            onConfirmName={confirmName}
            onStartsOnChange={(startsOn) =>
              patch({
                startsOn,
                endsOn: config.endsOn && config.endsOn >= startsOn ? config.endsOn : startsOn,
              })
            }
            onEndsOnChange={(endsOn) => patch({ endsOn })}
            onConfirmDate={confirmDate}
            onLocationChange={(location) => patch({ location })}
            onConfirmLocation={confirmLocation}
          />
        )}

        {onSummary && (
          <SummaryBlock
            config={config}
            creating={createMutation.isPending}
            adjustMode={adjustMode}
            steps={steps.filter((s) => s !== "summary")}
            onCreate={() => createMutation.mutate()}
            onAdjust={() => setAdjustMode(true)}
            onCancelAdjust={() => setAdjustMode(false)}
            onPickStep={goToStep}
            onExpert={() => onOpenExpert(config)}
            onSimulate={onSimulate ? () => onSimulate(config) : undefined}
          />
        )}
      </div>
    </div>
  );
}

function HistoryRow({
  stepId,
  config,
  onEdit,
}: {
  stepId: AssistantStepId;
  config: AssistantTournamentConfig;
  onEdit: () => void;
}) {
  const { t } = useTranslation("tournaments");
  return (
    <div className="space-y-1.5">
      <Bubble role="ai">{t(`aiAssistant.q.${stepId}`)}</Bubble>
      <button type="button" onClick={onEdit} className="block w-full text-left">
        <Bubble role="me">{formatAnswer(t, stepId, config)}</Bubble>
      </button>
    </div>
  );
}

function QuestionBlock({
  stepId,
  config,
  customTeams,
  setCustomTeams,
  customDuration,
  setCustomDuration,
  paidAmount,
  setPaidAmount,
  onSport,
  onPlayersPerTeam,
  onNumTeams,
  onConfirmCustomTeams,
  onScheduleFormat,
  onEliminatedContinue,
  onFlightsTemplate,
  onDuration,
  onConfirmCustomDuration,
  onTerrains,
  onPaid,
  onConfirmPaidAmount,
  onNameChange,
  onConfirmName,
  onStartsOnChange,
  onEndsOnChange,
  onConfirmDate,
  onLocationChange,
  onConfirmLocation,
}: {
  stepId: AssistantStepId;
  config: AssistantTournamentConfig;
  customTeams: string;
  setCustomTeams: (v: string) => void;
  customDuration: string;
  setCustomDuration: (v: string) => void;
  paidAmount: string;
  setPaidAmount: (v: string) => void;
  onSport: (s: string) => void;
  onPlayersPerTeam: (n: number) => void;
  onNumTeams: (n: number) => void;
  onConfirmCustomTeams: () => void;
  onScheduleFormat: (f: AssistantTournamentConfig["scheduleFormat"]) => void;
  onEliminatedContinue: (v: boolean) => void;
  onFlightsTemplate: (t: AssistantTournamentConfig["flightsTemplate"]) => void;
  onDuration: (n: number) => void;
  onConfirmCustomDuration: () => void;
  onTerrains: (n: number) => void;
  onPaid: (v: boolean) => void;
  onConfirmPaidAmount: () => void;
  onNameChange: (v: string) => void;
  onConfirmName: () => void;
  onStartsOnChange: (v: string) => void;
  onEndsOnChange: (v: string) => void;
  onConfirmDate: () => void;
  onLocationChange: (v: string) => void;
  onConfirmLocation: () => void;
}) {
  const { t } = useTranslation("tournaments");
  const isFirst = stepId === "sport" || (stepId === "playersPerTeam" && config.sport);

  return (
    <div className="space-y-3">
      <Bubble role="ai">
        {isFirst ? `${t("aiAssistant.intro")} ` : ""}
        {t(`aiAssistant.q.${stepId}`)}
      </Bubble>

      {stepId === "sport" && (
        <div className="grid grid-cols-2 gap-2">
          {SPORT_BUTTONS.map((s) => (
            <OptionButton key={s} onClick={() => onSport(s)}>
              {t(`teams.sports.${s}`, { defaultValue: s })}
            </OptionButton>
          ))}
          {TOP_SPORTS.filter((s) => !SPORT_BUTTONS.includes(s as (typeof SPORT_BUTTONS)[number])).slice(0, 2).map((s) => (
            <OptionButton key={s} onClick={() => onSport(s)}>
              {t(`teams.sports.${s}`, { defaultValue: s })}
            </OptionButton>
          ))}
        </div>
      )}

      {stepId === "playersPerTeam" && (
        <div className="flex flex-wrap gap-2">
          {playersPerTeamOptions(config.sport).map((n) => (
            <OptionButton
              key={n}
              onClick={() => onPlayersPerTeam(n)}
              highlight={n === defaultPlayersPerTeam(config.sport)}
            >
              {t("aiAssistant.opts.playersPerTeam", { count: n })}
            </OptionButton>
          ))}
        </div>
      )}

      {stepId === "numTeams" && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {TEAM_COUNT_PRESETS.map((n) => (
              <OptionButton key={n} onClick={() => onNumTeams(n)} highlight={n === 16}>
                {n}
              </OptionButton>
            ))}
          </div>
          <div className="flex gap-2">
            <Input
              type="number"
              min={2}
              max={64}
              placeholder={t("aiAssistant.opts.customTeamsPlaceholder")}
              value={customTeams}
              onChange={(e) => setCustomTeams(e.target.value)}
            />
            <Button type="button" variant="secondary" onClick={onConfirmCustomTeams}>
              {t("aiAssistant.cta.confirm")}
            </Button>
          </div>
        </div>
      )}

      {stepId === "scheduleFormat" && (
        <div className="grid gap-2">
          <OptionButton onClick={() => onScheduleFormat("pools_finals")} large>
            {t("aiAssistant.formats.poolsFinals")}
          </OptionButton>
          <OptionButton onClick={() => onScheduleFormat("round_robin")} large>
            {t("aiAssistant.formats.roundRobin")}
          </OptionButton>
          <OptionButton onClick={() => onScheduleFormat("single_elim")} large>
            {t("aiAssistant.formats.singleElim")}
          </OptionButton>
        </div>
      )}

      {stepId === "eliminatedContinue" && (
        <div className="grid gap-2">
          <OptionButton onClick={() => onEliminatedContinue(true)} large>
            {t("aiAssistant.opts.eliminatedYes")}
          </OptionButton>
          <OptionButton onClick={() => onEliminatedContinue(false)} large>
            {t("aiAssistant.opts.eliminatedNo")}
          </OptionButton>
        </div>
      )}

      {stepId === "flightsTemplate" && (
        <div className="grid gap-2">
          <OptionButton onClick={() => onFlightsTemplate("champions")} large>
            {t("aiAssistant.opts.flightsChampions")}
          </OptionButton>
          <OptionButton onClick={() => onFlightsTemplate("simple")} large>
            {t("aiAssistant.opts.flightsSimple")}
          </OptionButton>
        </div>
      )}

      {stepId === "matchDuration" && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {MATCH_DURATION_PRESETS.map((n) => (
              <OptionButton
                key={n}
                onClick={() => onDuration(n)}
                highlight={n === defaultMatchDuration(config.sport, config.playersPerTeam)}
              >
                {t("aiAssistant.opts.durationMin", { min: n })}
              </OptionButton>
            ))}
          </div>
          <div className="flex gap-2">
            <Input
              type="number"
              min={5}
              max={120}
              placeholder={t("aiAssistant.opts.customDurationPlaceholder")}
              value={customDuration}
              onChange={(e) => setCustomDuration(e.target.value)}
            />
            <Button type="button" variant="secondary" onClick={onConfirmCustomDuration}>
              {t("aiAssistant.cta.confirm")}
            </Button>
          </div>
        </div>
      )}

      {stepId === "terrains" && (
        <div className="flex flex-wrap gap-2">
          {TERRAIN_PRESETS.map((n) => (
            <OptionButton
              key={n}
              onClick={() => onTerrains(n)}
              highlight={n === defaultTerrains(config.numTeams)}
            >
              {n}
            </OptionButton>
          ))}
        </div>
      )}

      {stepId === "paid" && (
        <div className="grid grid-cols-2 gap-2">
          <OptionButton onClick={() => onPaid(false)} large>
            {t("aiAssistant.opts.free")}
          </OptionButton>
          <OptionButton onClick={() => onPaid(true)} large>
            {t("aiAssistant.opts.paid")}
          </OptionButton>
        </div>
      )}

      {stepId === "paidAmount" && (
        <div className="space-y-3">
          <div className="flex gap-2">
            <Input
              type="number"
              min={1}
              step={0.01}
              placeholder={t("aiAssistant.opts.pricePlaceholder")}
              value={paidAmount}
              onChange={(e) => setPaidAmount(e.target.value)}
            />
            <span className="flex items-center text-sm font-medium text-muted-foreground">€</span>
          </div>
          <Button type="button" className="w-full" onClick={onConfirmPaidAmount}>
            {t("aiAssistant.cta.confirm")}
          </Button>
        </div>
      )}

      {stepId === "name" && (
        <div className="space-y-3">
          <Input
            value={config.name}
            onChange={(e) => onNameChange(e.target.value)}
            placeholder={t("wizard.namePlaceholder")}
          />
          <Button type="button" className="w-full" onClick={onConfirmName}>
            {t("aiAssistant.cta.next")}
          </Button>
        </div>
      )}

      {stepId === "date" && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{t("wizard.start")}</Label>
              <Input
                type="date"
                value={config.startsOn}
                onChange={(e) => onStartsOnChange(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t("wizard.end")}</Label>
              <Input
                type="date"
                min={config.startsOn || undefined}
                value={config.endsOn}
                onChange={(e) => onEndsOnChange(e.target.value)}
              />
            </div>
          </div>
          <Button type="button" className="w-full" onClick={onConfirmDate}>
            {t("aiAssistant.cta.next")}
          </Button>
        </div>
      )}

      {stepId === "location" && (
        <div className="space-y-3">
          <LocationAutocomplete
            value={config.location}
            onChange={onLocationChange}
            placeholder={t("wizard.placePlaceholder")}
          />
          <Button type="button" className="w-full" onClick={onConfirmLocation}>
            {t("aiAssistant.cta.next")}
          </Button>
        </div>
      )}
    </div>
  );
}

function SummaryBlock({
  config,
  creating,
  adjustMode,
  steps,
  onCreate,
  onAdjust,
  onCancelAdjust,
  onPickStep,
  onExpert,
  onSimulate,
}: {
  config: AssistantTournamentConfig;
  creating: boolean;
  adjustMode: boolean;
  steps: AssistantStepId[];
  onCreate: () => void;
  onAdjust: () => void;
  onCancelAdjust: () => void;
  onPickStep: (id: AssistantStepId) => void;
  onExpert: () => void;
  onSimulate?: () => void;
}) {
  const { t } = useTranslation("tournaments");

  return (
    <div className="space-y-3">
      <Bubble role="ai">{t("aiAssistant.summaryIntro")}</Bubble>

      <div className="rounded-2xl border-2 border-primary bg-card p-4 shadow-lg shadow-primary/10">
        <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-primary">
          <Sparkles className="h-3.5 w-3.5" />
          {t("aiAssistant.recoBadge")}
        </div>
        <h3 className="mt-2 text-lg font-bold">{config.name.trim()}</h3>
        <p className="text-sm text-muted-foreground mt-1">
          {config.startsOn}
          {config.location ? ` · ${config.location}` : ""}
        </p>
        <AssistantLivePreview config={config} answeredCount={99} className="mt-3 bg-transparent border-0 p-0" />
      </div>

      {adjustMode ? (
        <div className="grid gap-2">
          <p className="text-xs font-semibold text-muted-foreground">
            {t("aiAssistant.cta.pickStep")}
          </p>
          {steps.map((s) => (
            <Button key={s} variant="outline" size="sm" onClick={() => onPickStep(s)}>
              {t(`aiAssistant.q.${s}`)}
            </Button>
          ))}
          <Button variant="ghost" size="sm" onClick={onCancelAdjust}>
            {t("createChooser.back")}
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-2 pt-1">
          <Button size="lg" onClick={onCreate} disabled={creating || !isConfigComplete(config)} className="w-full">
            {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {t("aiAssistant.cta.create")}
          </Button>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" onClick={onAdjust}>
              {t("aiAssistant.cta.adjustPoint")}
            </Button>
            {onSimulate ? (
              <Button variant="outline" onClick={onSimulate}>
                {t("aiAssistant.cta.simulate")}
              </Button>
            ) : (
              <Button variant="outline" onClick={onExpert}>
                {t("aiAssistant.cta.expert")}
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Bubble({ role, children }: { role: "ai" | "me"; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        "max-w-[92%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed",
        role === "ai"
          ? "rounded-bl-sm border border-border bg-card text-foreground"
          : "ml-auto rounded-br-sm bg-primary text-primary-foreground font-medium",
      )}
    >
      {children}
    </div>
  );
}

function OptionButton({
  children,
  onClick,
  large,
  highlight,
}: {
  children: React.ReactNode;
  onClick: () => void;
  large?: boolean;
  highlight?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-xl border-2 px-3.5 text-sm font-bold transition-colors text-left",
        large ? "py-3.5 w-full" : "py-2.5",
        highlight
          ? "border-primary bg-primary/15 text-primary hover:bg-primary/25"
          : "border-primary/60 bg-primary/10 text-primary hover:bg-primary/20",
      )}
    >
      {children}
    </button>
  );
}

type T = ReturnType<typeof useTranslation>["t"];

function formatAnswer(t: T, stepId: AssistantStepId, config: AssistantTournamentConfig): string {
  switch (stepId) {
    case "sport":
      return t(`teams.sports.${config.sport}`, { defaultValue: config.sport });
    case "playersPerTeam":
      return t("aiAssistant.opts.playersPerTeam", { count: config.playersPerTeam });
    case "numTeams":
      return String(config.numTeams);
    case "scheduleFormat":
      if (config.scheduleFormat === "pools_finals") return t("aiAssistant.formats.poolsFinals");
      if (config.scheduleFormat === "round_robin") return t("aiAssistant.formats.roundRobin");
      return t("aiAssistant.formats.singleElim");
    case "eliminatedContinue":
      return config.eliminatedContinue
        ? t("aiAssistant.opts.eliminatedYesShort")
        : t("aiAssistant.opts.eliminatedNoShort");
    case "flightsTemplate":
      return config.flightsTemplate === "champions"
        ? t("aiAssistant.opts.flightsChampions")
        : t("aiAssistant.opts.flightsSimple");
    case "matchDuration":
      return t("aiAssistant.opts.durationMin", { min: config.matchDurationMin });
    case "terrains":
      return String(config.terrains);
    case "paid":
      return config.paid ? t("aiAssistant.opts.paid") : t("aiAssistant.opts.free");
    case "paidAmount":
      return t("aiAssistant.opts.priceValue", {
        amount: (config.registrationFeeCents / 100).toFixed(2),
      });
    case "name":
      return config.name.trim();
    case "date":
      return config.endsOn && config.endsOn !== config.startsOn
        ? `${config.startsOn} → ${config.endsOn}`
        : config.startsOn;
    case "location":
      return config.location.trim();
    default:
      return "";
  }
}
