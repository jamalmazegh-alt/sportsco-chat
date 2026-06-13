import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LocationAutocomplete } from "@/components/location-autocomplete";
import { ChevronLeft, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  assistantStepOrder,
  buildRecommendation,
  buildSchedulePreview,
  clearAssistantDraft,
  configToCreatePayload,
  defaultMatchDuration,
  defaultPlayersPerTeam,
  defaultTerrains,
  emptyConfig,
  isConfigComplete,
  lunchLabelForConfig,
  LUNCH_DURATION_PRESETS,
  MATCH_DURATION_PRESETS,
  PAUSE_PRESETS,
  playersPerTeamOptions,
  readAssistantDraft,
  TEAM_COUNT_PRESETS,
  TERRAIN_PRESETS,
  writeAssistantDraft,
  type AssistantStepId,
  type AssistantTournamentConfig,
} from "../lib/assistant-config";
import { createTournament, updateTournament } from "../tournaments.functions";
import { updateTournamentPaymentSettings } from "../tournament-payments.functions";
import { answerTournamentQuestion } from "@/lib/llm/tournament-assistant.functions";

interface Props {
  clubId: string;
  defaultSport?: string;
  onOpenExpert: (config: AssistantTournamentConfig) => void;
  onSimulate?: (config: AssistantTournamentConfig) => void;
}

/** Sports réellement supportés par le module tournoi (B-11). */
const SUPPORTED_SPORTS = [
  "football",
  "futsal",
  "basketball",
  "volleyball",
  "handball",
  "rugby",
] as const;

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

  // B-01 — hydrate from sessionStorage so reopening the wizard never loses
  // the user's answers. Falls back to a fresh config seeded with `defaultSport`.
  const [config, setConfig] = useState<AssistantTournamentConfig>(() => {
    const draft = readAssistantDraft();
    if (draft?.config) return draft.config;
    return emptyConfig(
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
    );
  });
  const [stepIdx, setStepIdx] = useState(() => readAssistantDraft()?.stepIdx ?? 0);
  const [customTeams, setCustomTeams] = useState("");
  const [customDuration, setCustomDuration] = useState("");
  const [paidAmount, setPaidAmount] = useState("");
  const [showSim, setShowSim] = useState(false);
  const [showExpertSheet, setShowExpertSheet] = useState(false);

  // B-01 — persist the draft on every change so croix/back/refresh never erase
  // user answers. Cleared explicitly on successful create or abandon-confirm.
  useEffect(() => {
    writeAssistantDraft({ config, stepIdx, savedAt: Date.now() });
  }, [config, stepIdx]);

  const steps = useMemo(() => {
    const order = assistantStepOrder(config);
    return defaultSport ? order.filter((s) => s !== "sport") : order;
  }, [config, defaultSport]);

  const currentStep: AssistantStepId = steps[stepIdx] ?? "summary";
  const onSummary = currentStep === "summary";
  // Progress: show steps before summary; current question highlights.
  const totalSteps = steps.length - 1; // exclude summary
  const progressIdx = Math.min(stepIdx, totalSteps);

  function patch(partial: Partial<AssistantTournamentConfig>) {
    setConfig((c) => ({ ...c, ...partial }));
  }

  function advance() {
    setStepIdx((i) => Math.min(i + 1, steps.length - 1));
  }

  function back() {
    setStepIdx((i) => Math.max(0, i - 1));
  }

  function goToStep(id: AssistantStepId) {
    const idx = steps.indexOf(id);
    if (idx >= 0) setStepIdx(idx);
  }

  // Auto-scroll question into view on step change (B-06)
  const screenRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    screenRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }, [stepIdx]);

  // ---- handlers (auto-advance) ----
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
    patch({ playersPerTeam: n, matchDurationMin: defaultMatchDuration(config.sport, n) });
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
  function selectScheduleFormat(format: AssistantTournamentConfig["scheduleFormat"]) {
    patch({
      scheduleFormat: format,
      eliminatedContinue: format === "pools_finals" ? config.eliminatedContinue : false,
    });
    advance();
  }
  function selectEliminatedContinue(v: boolean) {
    patch({ eliminatedContinue: v });
    advance();
  }
  function selectFlightsTemplate(tpl: AssistantTournamentConfig["flightsTemplate"]) {
    patch({ flightsTemplate: tpl });
    advance();
  }
  function selectDuration(n: number) {
    patch({ matchDurationMin: n });
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
  function selectPause(n: number) {
    patch({ pauseMin: n });
    advance();
  }
  function selectTerrains(n: number) {
    patch({
      terrains: n,
      terrainNames: Array.from({ length: n }, (_, i) => config.terrainNames[i] ?? ""),
    });
    advance();
  }
  function selectTerrainNaming(v: "now" | "later") {
    patch({
      terrainNaming: v,
      terrainNames:
        v === "now"
          ? Array.from(
              { length: config.terrains },
              (_, i) => config.terrainNames[i] ?? `Terrain ${i + 1}`,
            )
          : [],
    });
    advance();
  }
  function confirmTerrainNames() {
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
        data: { tournament_id: res.tournament.id, patch: payload.update },
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
      // B-01 — draft consumed: clear the persisted answers so a fresh wizard
      // session starts blank next time.
      clearAssistantDraft();
      toast.success(t("wizard.createdToast"));
      qc.invalidateQueries({ queryKey: ["tournaments", clubId] });
      navigate({
        to: "/tournaments/$tournamentId",
        params: { tournamentId: res.tournament.id },
      });
    },
    onError: (e: Error) => toast.error(e.message ?? t("wizard.errorToast")),
  });

  // Header hint per question
  const hint = onSummary
    ? t("aiAssistant.headerHint.summary")
    : t(`aiAssistant.headerHint.${currentStep}`, { defaultValue: "" });

  return (
    <div className="relative flex h-[78vh] max-h-[640px] flex-col overflow-hidden rounded-2xl border border-border bg-card">
      {/* Persistent AI header */}
      <div className="bg-gradient-to-br from-[hsl(260_55%_56%)] to-[hsl(258_50%_42%)] px-4 pt-3 pb-3 text-white">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/20 text-sm">
            <Sparkles className="h-4 w-4" />
          </span>
          <b className="text-sm">{t("aiAssistant.headerTitle")}</b>
          <span className="ml-auto text-[11px] text-white/80">
            {onSummary
              ? t("aiAssistant.headerCount.summary")
              : t("aiAssistant.headerCount.q", {
                  current: progressIdx + 1,
                  total: totalSteps,
                })}
          </span>
        </div>
        {hint && (
          <p className="mt-1.5 min-h-[28px] text-[12.5px] leading-snug text-white/85">
            {hint}
          </p>
        )}
        <div className="mt-2 flex gap-1">
          {Array.from({ length: totalSteps }).map((_, i) => (
            <span
              key={i}
              className={cn(
                "h-1 flex-1 rounded-full",
                i < progressIdx || onSummary ? "bg-white" : "bg-white/25",
              )}
            />
          ))}
        </div>
      </div>

      {/* Scrollable screen */}
      <div ref={screenRef} className="flex-1 overflow-y-auto bg-[#fbf7f2] px-4 pt-3 pb-2">
        {/* Live recap chips (B-08: only when at least one answer) */}
        <RecapChips config={config} answeredCount={stepIdx} steps={steps} stepIdx={stepIdx} t={t} />

        {onSummary ? (
          <SummaryView
            config={config}
            showSim={showSim}
            onToggleSim={() => setShowSim((v) => !v)}
            onEdit={goToStep}
            onPatch={patch}
            t={t}
          />
        ) : (
          <QuestionView
            stepId={currentStep}
            config={config}
            stepIdx={stepIdx}
            customTeams={customTeams}
            setCustomTeams={setCustomTeams}
            customDuration={customDuration}
            setCustomDuration={setCustomDuration}
            paidAmount={paidAmount}
            setPaidAmount={setPaidAmount}
            patch={patch}
            onBack={back}
            onSport={selectSport}
            onPlayersPerTeam={selectPlayersPerTeam}
            onNumTeams={selectNumTeams}
            onConfirmCustomTeams={confirmCustomTeams}
            onScheduleFormat={selectScheduleFormat}
            onEliminatedContinue={selectEliminatedContinue}
            onFlightsTemplate={selectFlightsTemplate}
            onDuration={selectDuration}
            onConfirmCustomDuration={confirmCustomDuration}
            onPause={selectPause}
            onTerrains={selectTerrains}
            onTerrainNaming={selectTerrainNaming}
            onConfirmTerrainNames={confirmTerrainNames}
            onPaid={selectPaid}
            onConfirmPaidAmount={confirmPaidAmount}
            onConfirmName={confirmName}
            onConfirmDate={confirmDate}
            onConfirmLocation={confirmLocation}
            t={t}
          />
        )}
      </div>

      {/* Sticky CTA footer */}
      <div className="border-t border-border bg-[#fbf7f2] px-4 py-3">
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            className="flex-1"
            onClick={() => setShowExpertSheet(true)}
          >
            {t("aiAssistant.cta.expertSettings")}
          </Button>
          {onSummary && (
            <Button
              type="button"
              className="flex-1 bg-[hsl(149_50%_36%)] text-white hover:bg-[hsl(149_55%_30%)]"
              disabled={createMutation.isPending || !isConfigComplete(config)}
              onClick={() => createMutation.mutate()}
            >
              {createMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              {t("aiAssistant.cta.create")}
            </Button>
          )}
        </div>
        <p className="mt-1.5 text-center text-[11px] text-muted-foreground">
          {onSummary
            ? t("aiAssistant.footerSub.summary")
            : t("aiAssistant.footerSub.question")}
        </p>
        <AssistantAskBox config={config} t={t} />
      </div>

      {/* Expert settings overlay sheet (mockup: preserves answers, never loses progress) */}
      {showExpertSheet && (
        <div
          className="absolute inset-0 z-50 flex items-end bg-[hsl(225_35%_15%)]/45 animate-in fade-in"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowExpertSheet(false);
          }}
        >
          <div className="max-h-[78%] w-full overflow-y-auto rounded-t-3xl bg-white px-4 pb-6 pt-4 animate-in slide-in-from-bottom">
            <h3 className="text-base font-bold text-foreground">
              {t("aiAssistant.expertSheet.title")}
            </h3>
            <p className="mb-3 text-xs text-muted-foreground">
              {t("aiAssistant.expertSheet.subtitle")}
            </p>
            <div className="mb-2.5 rounded-lg bg-[hsl(149_45%_92%)] px-3 py-2 text-[11.5px] font-semibold text-[hsl(149_55%_25%)]">
              {t("aiAssistant.expertSheet.keep")}
            </div>
            {(
              [
                { icon: "⚖️", title: "points", hint: "pointsHint" },
                { icon: "🏆", title: "flights", hint: "flightsHint" },
                { icon: "🧑‍⚖️", title: "fields", hint: "fieldsHint" },
                { icon: "📝", title: "registration", hint: "registrationHint" },
              ] as const
            ).map((row, i) => (
              <button
                key={row.title}
                type="button"
                onClick={() => {
                  setShowExpertSheet(false);
                  onOpenExpert(config);
                }}
                className={cn(
                  "flex w-full items-center gap-3 px-1 py-3 text-left text-sm hover:bg-muted/40",
                  i > 0 && "border-t border-border",
                )}
              >
                <span className="w-7 text-center text-base">{row.icon}</span>
                <span className="flex-1">
                  <b className="block text-foreground">
                    {t(`aiAssistant.expertSheet.${row.title}`)}
                  </b>
                  <span className="block text-[11px] text-muted-foreground">
                    {t(`aiAssistant.expertSheet.${row.hint}`)}
                  </span>
                </span>
                <span className="text-muted-foreground">›</span>
              </button>
            ))}
            <Button
              type="button"
              className="mt-3 w-full"
              onClick={() => {
                setShowExpertSheet(false);
                onOpenExpert(config);
              }}
            >
              {t("aiAssistant.expertSheet.openExpert")}
            </Button>
            <button
              type="button"
              onClick={() => setShowExpertSheet(false)}
              className="mt-2 w-full rounded-xl bg-muted px-3 py-3 text-sm font-bold text-foreground"
            >
              {t("aiAssistant.expertSheet.close")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ------- Recap chips (live) ------- */

function RecapChips({
  config,
  answeredCount,
  steps,
  stepIdx,
  t,
}: {
  config: AssistantTournamentConfig;
  answeredCount: number;
  steps: AssistantStepId[];
  stepIdx: number;
  t: (k: string, o?: Record<string, unknown>) => string;
}) {
  if (answeredCount === 0) return null;
  const past = (id: AssistantStepId) => {
    const idx = steps.indexOf(id);
    return idx >= 0 && stepIdx > idx;
  };
  const chips: string[] = [];
  if (past("sport") && config.sport)
    chips.push(t(`teams.sports.${config.sport}`, { defaultValue: config.sport }));
  if (past("playersPerTeam") && config.playersPerTeam)
    chips.push(t("aiAssistant.recap.playersPerTeam", { n: config.playersPerTeam }));
  if (past("numTeams"))
    chips.push(t("aiAssistant.recap.teams", { n: config.numTeams }));
  if (past("scheduleFormat") && config.scheduleFormat === "pools_finals" && config.numTeams) {
    const label = poolsLabel(config.numTeams, t);
    if (label) chips.push(label);
  }
  if (past("flightsTemplate") && configFlightsLabel(config))
    chips.push(t(`aiAssistant.recap.flights_${config.flightsTemplate}`));
  if (past("matchDuration"))
    chips.push(t("aiAssistant.recap.match", { min: config.matchDurationMin }));
  if (past("pause"))
    chips.push(t("aiAssistant.recap.pause", { min: config.pauseMin }));
  if (past("terrains"))
    chips.push(t("aiAssistant.recap.terrains", { n: config.terrains }));
  if (past("paid")) {
    if (config.paid && config.registrationFeeCents > 0)
      chips.push(`${(config.registrationFeeCents / 100).toFixed(0)} €`);
    else chips.push(t("aiAssistant.opts.free"));
  }

  const filtered = chips.filter(Boolean);
  if (filtered.length === 0) return null;

  return (
    <div className="mb-3 rounded-2xl border border-border bg-white p-3">
      <div className="mb-2 flex items-center justify-between text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground">
        <span>{t("aiAssistant.recap.title")}</span>
        <span className="text-[hsl(149_50%_36%)]">
          {t("aiAssistant.recap.building")}
        </span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {filtered.map((c, i) => (
          <span
            key={i}
            className="rounded-md bg-[hsl(149_45%_92%)] px-2 py-1 text-[11.5px] font-bold text-[hsl(149_55%_25%)]"
          >
            {c}
          </span>
        ))}
      </div>
    </div>
  );
}

function poolsLabel(
  n: number,
  t: (k: string, o?: Record<string, unknown>) => string,
): string {
  const map: Record<number, string> = {
    8: t("aiAssistant.recap.pools284"),
    12: t("aiAssistant.recap.pools4x3"),
    16: t("aiAssistant.recap.pools4x4"),
    24: t("aiAssistant.recap.pools6x4"),
    32: t("aiAssistant.recap.pools8x4"),
  };
  return map[n] ?? "";
}

function configFlightsLabel(c: AssistantTournamentConfig): boolean {
  return c.scheduleFormat === "pools_finals" && c.eliminatedContinue;
}

/* ------- Question view ------- */

interface QuestionViewProps {
  stepId: AssistantStepId;
  config: AssistantTournamentConfig;
  stepIdx: number;
  customTeams: string;
  setCustomTeams: (v: string) => void;
  customDuration: string;
  setCustomDuration: (v: string) => void;
  paidAmount: string;
  setPaidAmount: (v: string) => void;
  patch: (p: Partial<AssistantTournamentConfig>) => void;
  onBack: () => void;
  onSport: (s: string) => void;
  onPlayersPerTeam: (n: number) => void;
  onNumTeams: (n: number) => void;
  onConfirmCustomTeams: () => void;
  onScheduleFormat: (f: AssistantTournamentConfig["scheduleFormat"]) => void;
  onEliminatedContinue: (v: boolean) => void;
  onFlightsTemplate: (tpl: AssistantTournamentConfig["flightsTemplate"]) => void;
  onDuration: (n: number) => void;
  onConfirmCustomDuration: () => void;
  onPause: (n: number) => void;
  onTerrains: (n: number) => void;
  onTerrainNaming: (v: "now" | "later") => void;
  onConfirmTerrainNames: () => void;
  onPaid: (v: boolean) => void;
  onConfirmPaidAmount: () => void;
  onConfirmName: () => void;
  onConfirmDate: () => void;
  onConfirmLocation: () => void;
  t: (k: string, o?: Record<string, unknown>) => string;
}

function QuestionView(p: QuestionViewProps) {
  const {
    stepId,
    config,
    stepIdx,
    customTeams,
    setCustomTeams,
    customDuration,
    setCustomDuration,
    paidAmount,
    setPaidAmount,
    patch,
    onBack,
    t,
  } = p;

  return (
    <div className="animate-in fade-in duration-200">
      {stepIdx > 0 && (
        <div className="mb-2.5">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1 rounded-lg border border-border bg-white px-3 py-1.5 text-[12.5px] font-semibold text-foreground hover:bg-muted"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            {t("common.back")}
          </button>
        </div>
      )}
      <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
        {t("aiAssistant.questionLabel", { n: stepIdx + 1 })}
      </div>
      <h2 className="mt-1 text-[20px] font-bold leading-tight tracking-tight text-foreground">
        {t(`aiAssistant.q.${stepId}`)}
      </h2>

      <div className="mt-3.5">
        {stepId === "sport" && (
          <OptList>
            {SUPPORTED_SPORTS.map((s) => (
              <Opt key={s} onClick={() => p.onSport(s)}>
                {t(`teams.sports.${s}`, { defaultValue: s })}
              </Opt>
            ))}
          </OptList>
        )}

        {stepId === "playersPerTeam" && (
          <OptList>
            {playersPerTeamOptions(config.sport).map((n) => (
              <Opt key={n} onClick={() => p.onPlayersPerTeam(n)}>
                {t("aiAssistant.opts.playersPerTeam", { count: n })}
              </Opt>
            ))}
          </OptList>
        )}

        {stepId === "numTeams" && (
          <div className="space-y-3">
            <OptGrid>
              {TEAM_COUNT_PRESETS.map((n) => (
                <OptG key={n} onClick={() => p.onNumTeams(n)}>
                  {n}
                </OptG>
              ))}
            </OptGrid>
            <div className="flex gap-2">
              <Input
                type="number"
                min={2}
                max={64}
                placeholder={t("aiAssistant.opts.customTeamsPlaceholder")}
                value={customTeams}
                onChange={(e) => setCustomTeams(e.target.value)}
              />
              <Button type="button" variant="secondary" onClick={p.onConfirmCustomTeams}>
                {t("aiAssistant.cta.confirm")}
              </Button>
            </div>
          </div>
        )}

        {stepId === "scheduleFormat" && (
          <OptList>
            <Opt
              onClick={() => p.onScheduleFormat("pools_finals")}
              hint={t("aiAssistant.opts.poolsFinalsHint")}
            >
              {t("aiAssistant.formats.poolsFinals")}
            </Opt>
            <Opt
              onClick={() => p.onScheduleFormat("round_robin")}
              hint={t("aiAssistant.opts.roundRobinHint")}
            >
              {t("aiAssistant.formats.roundRobin")}
            </Opt>
            <Opt
              onClick={() => p.onScheduleFormat("single_elim")}
              hint={t("aiAssistant.opts.singleElimHint")}
            >
              {t("aiAssistant.formats.singleElim")}
            </Opt>
          </OptList>
        )}

        {stepId === "eliminatedContinue" && (
          <OptList>
            <Opt
              onClick={() => p.onEliminatedContinue(true)}
              hint={t("aiAssistant.opts.eliminatedYesHint")}
            >
              {t("aiAssistant.opts.eliminatedYes")}
            </Opt>
            <Opt
              onClick={() => p.onEliminatedContinue(false)}
              hint={t("aiAssistant.opts.eliminatedNoHint")}
            >
              {t("aiAssistant.opts.eliminatedNo")}
            </Opt>
          </OptList>
        )}

        {stepId === "flightsTemplate" && (
          <OptList>
            <Opt
              onClick={() => p.onFlightsTemplate("champions")}
              hint={t("aiAssistant.opts.flightsChampionsHint")}
            >
              {t("aiAssistant.opts.flightsChampions")}
            </Opt>
            <Opt
              onClick={() => p.onFlightsTemplate("simple")}
              hint={t("aiAssistant.opts.flightsSimpleHint")}
            >
              {t("aiAssistant.opts.flightsSimple")}
            </Opt>
          </OptList>
        )}

        {stepId === "matchDuration" && (
          <div className="space-y-3">
            <OptGrid>
              {MATCH_DURATION_PRESETS.map((n) => (
                <OptG key={n} onClick={() => p.onDuration(n)}>
                  {n}
                </OptG>
              ))}
            </OptGrid>
            <div className="flex gap-2">
              <Input
                type="number"
                min={5}
                max={120}
                placeholder={t("aiAssistant.opts.customDurationPlaceholder")}
                value={customDuration}
                onChange={(e) => setCustomDuration(e.target.value)}
              />
              <Button type="button" variant="secondary" onClick={p.onConfirmCustomDuration}>
                {t("aiAssistant.cta.confirm")}
              </Button>
            </div>
          </div>
        )}

        {stepId === "pause" && (
          <OptGrid cols={4}>
            {PAUSE_PRESETS.map((n) => (
              <OptG key={n} onClick={() => p.onPause(n)}>
                {n}
              </OptG>
            ))}
          </OptGrid>
        )}

        {stepId === "terrains" && (
          <OptGrid>
            {TERRAIN_PRESETS.map((n) => (
              <OptG key={n} onClick={() => p.onTerrains(n)}>
                {n}
              </OptG>
            ))}
          </OptGrid>
        )}

        {stepId === "terrainNaming" && (
          <OptList>
            <Opt
              onClick={() => p.onTerrainNaming("now")}
              hint={t("aiAssistant.opts.terrainNamingNowHint")}
            >
              {t("aiAssistant.opts.terrainNamingNow")}
            </Opt>
            <Opt
              onClick={() => p.onTerrainNaming("later")}
              hint={t("aiAssistant.opts.terrainNamingLaterHint")}
            >
              {t("aiAssistant.opts.terrainNamingLater")}
            </Opt>
          </OptList>
        )}

        {stepId === "terrainNames" && (
          <div className="space-y-2">
            {Array.from({ length: config.terrains }).map((_, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="w-6 text-sm font-bold text-muted-foreground">
                  {i + 1}.
                </span>
                <Input
                  value={config.terrainNames[i] ?? ""}
                  placeholder={`Terrain ${i + 1}`}
                  onChange={(e) => {
                    const next = [...config.terrainNames];
                    next[i] = e.target.value;
                    patch({ terrainNames: next });
                  }}
                />
              </div>
            ))}
            <Button
              type="button"
              className="w-full"
              onClick={p.onConfirmTerrainNames}
            >
              {t("aiAssistant.cta.next")}
            </Button>
          </div>
        )}

        {stepId === "paid" && (
          <OptGrid cols={2}>
            <OptG onClick={() => p.onPaid(false)}>{t("aiAssistant.opts.free")}</OptG>
            <OptG onClick={() => p.onPaid(true)}>{t("aiAssistant.opts.paid")}</OptG>
          </OptGrid>
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
              <span className="flex items-center text-sm font-medium text-muted-foreground">
                €
              </span>
            </div>
            <Button type="button" className="w-full" onClick={p.onConfirmPaidAmount}>
              {t("aiAssistant.cta.confirm")}
            </Button>
          </div>
        )}

        {stepId === "name" && (
          <div className="space-y-3">
            <Input
              value={config.name}
              onChange={(e) => patch({ name: e.target.value })}
              placeholder={t("wizard.namePlaceholder")}
            />
            <Button type="button" className="w-full" onClick={p.onConfirmName}>
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
                  onChange={(e) => {
                    const startsOn = e.target.value;
                    patch({
                      startsOn,
                      endsOn:
                        config.endsOn && config.endsOn >= startsOn
                          ? config.endsOn
                          : startsOn,
                    });
                  }}
                />
              </div>
              <div className="space-y-1.5">
                <Label>{t("wizard.end")}</Label>
                <Input
                  type="date"
                  min={config.startsOn || undefined}
                  value={config.endsOn}
                  onChange={(e) => patch({ endsOn: e.target.value })}
                />
              </div>
            </div>
            <Button type="button" className="w-full" onClick={p.onConfirmDate}>
              {t("aiAssistant.cta.next")}
            </Button>
          </div>
        )}

        {stepId === "location" && (
          <div className="space-y-3">
            <LocationAutocomplete
              value={config.location}
              onChange={(v) => patch({ location: v })}
              placeholder={t("wizard.placePlaceholder")}
            />
            <Button type="button" className="w-full" onClick={p.onConfirmLocation}>
              {t("aiAssistant.cta.next")}
            </Button>
          </div>
        )}
      </div>

      <p className="mt-3 text-center text-[11.5px] text-muted-foreground">
        {t("aiAssistant.tapHint")}
      </p>
    </div>
  );
}

/* ------- Option presentations ------- */

function OptList({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-col gap-2">{children}</div>;
}

function Opt({
  children,
  hint,
  onClick,
}: {
  children: React.ReactNode;
  hint?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-2xl border-[1.5px] border-border bg-white px-3.5 py-3 text-left text-[15px] font-semibold text-foreground transition hover:border-[hsl(149_50%_36%)] hover:bg-[hsl(149_45%_92%)]"
    >
      <span className="block">{children}</span>
      {hint && (
        <small className="mt-0.5 block text-[12px] font-normal text-muted-foreground">
          {hint}
        </small>
      )}
    </button>
  );
}

function OptGrid({
  children,
  cols = 3,
}: {
  children: React.ReactNode;
  cols?: 2 | 3 | 4;
}) {
  const cls = cols === 2 ? "grid-cols-2" : cols === 4 ? "grid-cols-4" : "grid-cols-3";
  return <div className={cn("grid gap-2", cls)}>{children}</div>;
}

function OptG({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-xl border-[1.5px] border-border bg-white py-3.5 text-center text-[20px] font-extrabold text-foreground transition hover:border-[hsl(149_50%_36%)] hover:bg-[hsl(149_45%_92%)] hover:text-[hsl(149_55%_25%)]"
    >
      {children}
    </button>
  );
}

/* ------- Summary ------- */

function SummaryView({
  config,
  showSim,
  onToggleSim,
  onEdit,
  onPatch,
  t,
}: {
  config: AssistantTournamentConfig;
  showSim: boolean;
  onToggleSim: () => void;
  onEdit: (id: AssistantStepId) => void;
  onPatch: (patch: Partial<AssistantTournamentConfig>) => void;
  t: (k: string, o?: Record<string, unknown>) => string;
}) {
  const schedule = buildSchedulePreview(config);
  const lunchLabel = lunchLabelForConfig(config);
  return (
    <div className="animate-in fade-in duration-200">
      <div className="mb-2.5">
        <button
          type="button"
          onClick={() => onEdit("sport")}
          className="inline-flex items-center gap-1 rounded-lg border border-border bg-white px-3 py-1.5 text-[12.5px] font-semibold text-foreground hover:bg-muted"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          {t("aiAssistant.summary.editAnswer")}
        </button>
      </div>
      <h2 className="text-[21px] font-bold tracking-tight text-foreground">
        {t("aiAssistant.summary.title")}
      </h2>
      <p className="mb-3 text-[13px] text-muted-foreground">
        {t("aiAssistant.summary.subtitle")}
      </p>

      <div className="rounded-2xl border border-border bg-white px-3.5 py-1 mb-3">
        <SRow
          k={t("aiAssistant.summary.sport")}
          v={`${t(`teams.sports.${config.sport}`, { defaultValue: config.sport })} · ${t("aiAssistant.opts.playersPerTeam", { count: config.playersPerTeam })}`}
          onEdit={() => onEdit("sport")}
        />
        <SRow
          k={t("aiAssistant.summary.teams")}
          v={`${config.numTeams} · ${poolsLabel(config.numTeams, t) || "—"}`}
          onEdit={() => onEdit("numTeams")}
        />
        <SRow
          k={t("aiAssistant.summary.finals")}
          v={
            configFlightsLabel(config)
              ? config.flightsTemplate === "champions"
                ? t("aiAssistant.opts.flightsChampions")
                : t("aiAssistant.opts.flightsSimple")
              : t("aiAssistant.summary.singleBracket")
          }
          onEdit={() => onEdit("scheduleFormat")}
        />
        <SRow
          k={t("aiAssistant.summary.matches")}
          v={t("aiAssistant.summary.matchesValue", {
            min: config.matchDurationMin,
            pause: config.pauseMin,
            terrains: config.terrains,
          })}
          onEdit={() => onEdit("matchDuration")}
        />
        <SRow
          k={t("aiAssistant.summary.registration")}
          v={
            config.paid
              ? `${t("aiAssistant.opts.paid")} · ${(config.registrationFeeCents / 100).toFixed(0)} €`
              : t("aiAssistant.opts.free")
          }
          onEdit={() => onEdit("paid")}
        />
        {config.name.trim() && (
          <SRow
            k={t("aiAssistant.summary.name")}
            v={config.name.trim()}
            onEdit={() => onEdit("name")}
          />
        )}
        {config.startsOn && (
          <SRow
            k={t("aiAssistant.summary.date")}
            v={
              config.endsOn && config.endsOn !== config.startsOn
                ? `${config.startsOn} → ${config.endsOn}`
                : config.startsOn
            }
            onEdit={() => onEdit("date")}
          />
        )}
        {config.location && (
          <SRow
            k={t("aiAssistant.summary.location")}
            v={config.location}
            onEdit={() => onEdit("location")}
          />
        )}
      </div>

      <button
        type="button"
        onClick={onToggleSim}
        className="mb-2.5 w-full rounded-2xl border-[1.5px] border-foreground bg-white px-3 py-3 text-[14px] font-extrabold text-foreground hover:bg-muted"
      >
        ⏱ {t("aiAssistant.summary.simulateCta")}
      </button>

      {showSim && (
        <div className="mb-3 animate-in fade-in rounded-2xl bg-[hsl(225_35%_18%)] p-4 text-white">
          <div className="text-[11px] font-extrabold uppercase tracking-wider text-white/70">
            {t("aiAssistant.summary.simTitle")}
          </div>
          <div className="my-1 text-2xl font-extrabold">
            09:00 → {schedule.endHHMM}
          </div>
          <SimLine label={t("aiAssistant.summary.simTotal")} value={String(schedule.total)} />
          <SimLine
            label={t("aiAssistant.summary.simSlot")}
            value={`${config.matchDurationMin} + ${config.pauseMin} = ${config.matchDurationMin + config.pauseMin} min`}
          />
          <SimLine
            label={t("aiAssistant.summary.simLunch")}
            value={
              lunchLabel ?? t("aiAssistant.summary.simLunchNone")
            }
          />
          {config.lunchDurationMin > 0 && (
            <div className="border-t border-white/15 py-2 space-y-2">
              <p className="text-[11px] font-bold uppercase tracking-wide text-white/70">
                {t("aiAssistant.summary.simLunchDuration")}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {LUNCH_DURATION_PRESETS.map((min) => (
                  <button
                    key={min}
                    type="button"
                    onClick={() => onPatch({ lunchDurationMin: min })}
                    className={cn(
                      "rounded-lg px-2.5 py-1 text-[11px] font-bold",
                      config.lunchDurationMin === min
                        ? "bg-white text-[hsl(225_35%_18%)]"
                        : "bg-white/15 text-white hover:bg-white/25",
                    )}
                  >
                    {min === 0
                      ? t("aiAssistant.summary.simLunchNone")
                      : t("aiAssistant.summary.simLunchMin", { min })}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <label className="text-[11px] text-white/70 shrink-0">
                  {t("aiAssistant.summary.simLunchStart")}
                </label>
                <input
                  type="time"
                  value={config.lunchStart}
                  onChange={(e) => onPatch({ lunchStart: e.target.value })}
                  className="rounded-md border border-white/20 bg-white/10 px-2 py-1 text-[12px] text-white"
                />
              </div>
            </div>
          )}
          {config.lunchDurationMin === 0 && (
            <div className="border-t border-white/15 py-2">
              <div className="flex flex-wrap gap-1.5">
                {LUNCH_DURATION_PRESETS.filter((m) => m > 0).map((min) => (
                  <button
                    key={min}
                    type="button"
                    onClick={() => onPatch({ lunchDurationMin: min })}
                    className="rounded-lg bg-white/15 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-white/25"
                  >
                    {t("aiAssistant.summary.simLunchMin", { min })}
                  </button>
                ))}
              </div>
            </div>
          )}
          <SimLine
            label={t("aiAssistant.summary.simTerrains")}
            value={String(config.terrains)}
          />
        </div>
      )}
    </div>
  );
}

function SRow({
  k,
  v,
  onEdit,
}: {
  k: string;
  v: string;
  onEdit: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2 border-t border-border py-2.5 text-[13.5px] first:border-t-0">
      <span className="text-muted-foreground">{k}</span>
      <div className="flex items-center gap-2">
        <span className="font-bold text-foreground">{v}</span>
        <button
          type="button"
          onClick={onEdit}
          className="text-[12px] font-bold text-[hsl(149_50%_36%)] hover:underline"
        >
          ✎
        </button>
      </div>
    </div>
  );
}

function SimLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between border-t border-white/15 py-1 text-[12.5px] text-white/80 first-of-type:border-t-0 first-of-type:pt-2">
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}

/** B-09 — Q&A IA accessible pendant tout le flux (fallback silencieux si LLM off). */
function AssistantAskBox({
  config,
  t,
}: {
  config: AssistantTournamentConfig;
  t: (k: string, o?: Record<string, unknown>) => string;
}) {
  const { i18n } = useTranslation("tournaments");
  const ask = useServerFn(answerTournamentQuestion);
  const [q, setQ] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const reco = useMemo(() => buildRecommendation(config), [config]);
  const locale = i18n.language?.startsWith("en") ? "en" : "fr";

  async function send() {
    const question = q.trim();
    if (!question || busy) return;
    setBusy(true);
    setAnswer(null);
    try {
      const res = await ask({
        data: { question, reco, history: [], locale },
      });
      setAnswer(res.ok ? res.data.answer : t("aiAssistant.askQuestion.fallback"));
      setQ("");
    } catch {
      setAnswer(t("aiAssistant.askQuestion.fallback"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-2 space-y-1.5 border-t border-border/60 pt-2">
      <p className="text-[10px] font-semibold text-muted-foreground">
        {t("aiAssistant.askQuestion.label")}
      </p>
      <div className="flex gap-2">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder={t("aiAssistant.askQuestion.placeholder")}
          disabled={busy}
          className="h-8 text-xs"
        />
        <Button type="button" size="sm" onClick={send} disabled={busy || !q.trim()} className="h-8 px-2">
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : t("aiAssistant.askQuestion.send")}
        </Button>
      </div>
      {answer && (
        <p className="text-[11px] leading-snug text-muted-foreground italic">{answer}</p>
      )}
    </div>
  );
}
