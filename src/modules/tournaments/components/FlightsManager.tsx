import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Trophy, Loader2, Plus, X, Wand2, PlayCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

import {
  saveFlights,
  generateAllFlightBrackets,
  listFlights,
} from "../flights.functions";
import {
  proposeFlightDistributions,
  defaultQualificationRules,
  type QualRule,
} from "../lib/flights";
import {
  FLIGHT_TEMPLATES,
  type FlightTemplateId,
  type Lang,
} from "../lib/flight-templates";

interface Props {
  tournamentId: string;
  numTeams: number;
  numGroups: number;
  flights: Array<{
    id: string;
    sort_order: number;
    name: string;
    short_name: string | null;
    color: string | null;
    qualification_rules: QualRule[];
    enable_third_place: boolean;
    enable_fifth_place: boolean;
    enable_seventh_place: boolean;
  }>;
  hasGroups: boolean;
  groupMatchesCompleted: boolean;
}

interface DraftFlight {
  name: string;
  short_name: string;
  color: string;
  qualification_rules: QualRule[];
  enable_third_place: boolean;
  enable_fifth_place: boolean;
  enable_seventh_place: boolean;
}

export function FlightsManager({
  tournamentId,
  numTeams,
  numGroups,
  flights,
  hasGroups,
  groupMatchesCompleted,
}: Props) {
  const { t, i18n } = useTranslation("tournaments");
  const qc = useQueryClient();
  const saveFn = useServerFn(saveFlights);
  const genFn = useServerFn(generateAllFlightBrackets);
  const listFn = useServerFn(listFlights);
  const lang = (i18n.language?.slice(0, 2) ?? "en") as Lang;

  // Live refresh via dedicated query
  const flightsQ = useQuery({
    queryKey: ["flights", tournamentId],
    queryFn: () => listFn({ data: { tournament_id: tournamentId } }),
    initialData: { flights } as any,
  });
  const live = (flightsQ.data?.flights ?? flights) as Props["flights"];

  const [showWizard, setShowWizard] = useState(live.length === 0);
  const [template, setTemplate] = useState<FlightTemplateId>("champions");
  const [drafts, setDrafts] = useState<DraftFlight[]>([]);

  const teamsPerGroup = numGroups > 0 ? Math.ceil(numTeams / numGroups) : 0;
  const distributions = useMemo(
    () => proposeFlightDistributions(numTeams),
    [numTeams],
  );

  const applyDistribution = (sizes: number[]) => {
    const tpl = FLIGHT_TEMPLATES.find((x) => x.id === template) ?? FLIGHT_TEMPLATES[0];
    const rulesByFlight = defaultQualificationRules(
      sizes,
      numGroups || 1,
      teamsPerGroup || sizes[0],
    );
    const newDrafts: DraftFlight[] = sizes.map((_, i) => {
      const tplName = tpl.names[i] ?? {
        short: String.fromCharCode(65 + i),
        fr: `Flight ${String.fromCharCode(65 + i)}`,
        en: `Flight ${String.fromCharCode(65 + i)}`,
        de: `Flight ${String.fromCharCode(65 + i)}`,
        es: `Flight ${String.fromCharCode(65 + i)}`,
        it: `Flight ${String.fromCharCode(65 + i)}`,
        nl: `Flight ${String.fromCharCode(65 + i)}`,
        pt: `Flight ${String.fromCharCode(65 + i)}`,
        color: undefined,
      };
      return {
        name: tplName[lang] ?? tplName.en,
        short_name: tplName.short,
        color: tplName.color ?? "",
        qualification_rules: rulesByFlight[i] ?? [],
        enable_third_place: true,
        enable_fifth_place: false,
        enable_seventh_place: false,
      };
    });
    setDrafts(newDrafts);
  };

  const save = useMutation({
    mutationFn: () =>
      saveFn({
        data: {
          tournament_id: tournamentId,
          replace_all: true,
          flights: drafts.map((d, idx) => ({
            sort_order: idx,
            name: d.name,
            short_name: d.short_name || null,
            color: d.color || null,
            qualification_rules: d.qualification_rules,
            enable_third_place: d.enable_third_place,
            enable_fifth_place: d.enable_fifth_place,
            enable_seventh_place: d.enable_seventh_place,
          })),
        },
      }),
    onSuccess: () => {
      toast.success(t("flights.savedToast", { defaultValue: "Flights enregistrés" }));
      qc.invalidateQueries({ queryKey: ["flights", tournamentId] });
      qc.invalidateQueries({ queryKey: ["tournament", tournamentId] });
      setShowWizard(false);
      setDrafts([]);
    },
    onError: (e: any) => toast.error(e?.message ?? "Error"),
  });

  const generate = useMutation({
    mutationFn: () => genFn({ data: { tournament_id: tournamentId } }),
    onSuccess: (res: any) => {
      toast.success(
        t("flights.generatedToast", {
          defaultValue: "{{n}} matchs créés",
          n: res?.created ?? 0,
        }),
      );
      qc.invalidateQueries({ queryKey: ["tournament", tournamentId] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Error"),
  });

  if (!hasGroups) {
    return (
      <div className="rounded-lg border border-dashed bg-card p-6 text-center text-sm text-muted-foreground">
        <Trophy className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
        {t("flights.noGroups", {
          defaultValue: "Crée d'abord la phase de poules. Les Flights se génèrent après.",
        })}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold flex items-center gap-2">
            <Trophy className="h-4 w-4 text-primary" />
            {t("flights.title", { defaultValue: "Flights / phases finales" })}
          </h3>
          <p className="text-xs text-muted-foreground mt-1">
            {t("flights.intro", {
              defaultValue:
                "Plusieurs trophées par tournoi : Champions/Europa, Coupe/Plaque, Or/Argent/Bronze, ou custom.",
            })}
          </p>
        </div>
        {live.length > 0 && !showWizard && (
          <Button size="sm" variant="outline" onClick={() => setShowWizard(true)}>
            <Wand2 className="h-4 w-4" />
            {t("flights.reconfigure", { defaultValue: "Reconfigurer" })}
          </Button>
        )}
      </div>

      {/* Existing flights */}
      {live.length > 0 && !showWizard && (
        <div className="space-y-2">
          {live.map((f) => (
            <FlightCard key={f.id} flight={f} />
          ))}
          {groupMatchesCompleted ? (
            <Button
              className="w-full"
              onClick={() => generate.mutate()}
              disabled={generate.isPending}
            >
              {generate.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <PlayCircle className="h-4 w-4" />
              )}
              {t("flights.generate", { defaultValue: "Générer les brackets" })}
            </Button>
          ) : (
            <p className="text-xs text-muted-foreground text-center">
              {t("flights.waitGroups", {
                defaultValue:
                  "Termine tous les matchs de poules pour générer les brackets.",
              })}
            </p>
          )}
        </div>
      )}

      {/* Wizard */}
      {showWizard && (
        <div className="rounded-xl border bg-card p-4 space-y-4">
          <div>
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">
              {t("flights.wizard.template", { defaultValue: "Template de noms" })}
            </Label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-2">
              {FLIGHT_TEMPLATES.map((tpl) => (
                <button
                  key={tpl.id}
                  type="button"
                  onClick={() => setTemplate(tpl.id)}
                  className={cn(
                    "p-2 rounded-lg border text-sm font-medium transition-colors",
                    template === tpl.id
                      ? "border-primary bg-primary/5"
                      : "border-border hover:bg-muted",
                  )}
                >
                  <div>
                    {t(tpl.labelKey, {
                      defaultValue:
                        tpl.id === "champions"
                          ? "Champions / Europa"
                          : tpl.id === "cup_plate"
                            ? "Coupe / Plaque"
                            : "Or / Argent / Bronze",
                    })}
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-0.5 truncate">
                    {tpl.names.slice(0, 3).map((n) => n[lang] ?? n.en).join(" · ")}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {drafts.length === 0 && (
            <div>
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                {t("flights.wizard.distribution", {
                  defaultValue: "Répartition ({{n}} équipes)",
                  n: numTeams,
                })}
              </Label>
              {distributions.length === 0 ? (
                <p className="text-sm text-muted-foreground mt-2">
                  {t("flights.wizard.notEnough", {
                    defaultValue: "Au moins 4 équipes requises.",
                  })}
                </p>
              ) : (
                <div className="grid grid-cols-1 gap-2 mt-2">
                  {distributions.map((d) => (
                    <button
                      key={d.id}
                      type="button"
                      onClick={() => applyDistribution(d.sizes)}
                      className="text-left rounded-lg border border-border p-3 hover:bg-muted transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-medium">
                          {d.sizes.join(" + ")} = {numTeams}
                        </span>
                        {d.cleanBrackets && (
                          <span className="text-[10px] uppercase bg-primary/10 text-primary px-1.5 py-0.5 rounded">
                            {t("flights.wizard.clean", { defaultValue: "Brackets nets" })}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {t(d.labelKey, { defaultValue: "Option" })}
                      </p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {drafts.length > 0 && (
            <div className="space-y-3">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                {t("flights.wizard.customize", { defaultValue: "Personnaliser" })}
              </Label>
              {drafts.map((d, i) => (
                <DraftEditor
                  key={i}
                  draft={d}
                  index={i}
                  onChange={(next) =>
                    setDrafts((ds) => ds.map((x, j) => (j === i ? next : x)))
                  }
                  onRemove={() =>
                    setDrafts((ds) => ds.filter((_, j) => j !== i))
                  }
                />
              ))}
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setDrafts([])}>
                  {t("flights.wizard.back", { defaultValue: "Retour" })}
                </Button>
                <Button
                  className="flex-1"
                  onClick={() => save.mutate()}
                  disabled={save.isPending || drafts.length === 0}
                >
                  {save.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : null}
                  {t("flights.wizard.save", { defaultValue: "Enregistrer les Flights" })}
                </Button>
              </div>
            </div>
          )}

          {live.length > 0 && drafts.length === 0 && (
            <Button variant="ghost" size="sm" onClick={() => setShowWizard(false)}>
              {t("common.cancel", { defaultValue: "Annuler" })}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function FlightCard({ flight }: { flight: Props["flights"][number] }) {
  const { t } = useTranslation("tournaments");
  return (
    <div
      className="rounded-lg border bg-card p-3 flex items-center gap-3"
      style={flight.color ? { borderLeftColor: flight.color, borderLeftWidth: 4 } : undefined}
    >
      <div className="h-9 w-9 rounded-md bg-primary/10 flex items-center justify-center text-sm font-bold text-primary">
        {flight.short_name || String.fromCharCode(65 + flight.sort_order)}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium truncate">{flight.name}</p>
        <p className="text-xs text-muted-foreground">
          {(flight.qualification_rules ?? []).length}{" "}
          {t("flights.rulesCount", { defaultValue: "règles" })}
          {flight.enable_third_place && ` · ${t("flights.thirdPlace", { defaultValue: "3e place" })}`}
        </p>
      </div>
    </div>
  );
}

function DraftEditor({
  draft,
  index,
  onChange,
  onRemove,
}: {
  draft: DraftFlight;
  index: number;
  onChange: (d: DraftFlight) => void;
  onRemove: () => void;
}) {
  const { t } = useTranslation("tournaments");
  return (
    <div
      className="rounded-lg border bg-background p-3 space-y-2"
      style={draft.color ? { borderLeftColor: draft.color, borderLeftWidth: 4 } : undefined}
    >
      <div className="flex items-center gap-2">
        <Input
          value={draft.name}
          onChange={(e) => onChange({ ...draft, name: e.target.value })}
          className="font-medium flex-1"
        />
        <Input
          value={draft.short_name}
          onChange={(e) => onChange({ ...draft, short_name: e.target.value })}
          className="w-16 text-center font-bold"
          maxLength={3}
        />
        <button
          type="button"
          onClick={onRemove}
          className="text-muted-foreground hover:text-destructive p-1"
          aria-label="Remove"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="flex flex-wrap gap-3 text-xs">
        <label className="flex items-center gap-1.5">
          <Checkbox
            checked={draft.enable_third_place}
            onCheckedChange={(v) =>
              onChange({ ...draft, enable_third_place: !!v })
            }
          />
          {t("flights.thirdPlace", { defaultValue: "3e place" })}
        </label>
        <label className="flex items-center gap-1.5">
          <Checkbox
            checked={draft.enable_fifth_place}
            onCheckedChange={(v) =>
              onChange({ ...draft, enable_fifth_place: !!v })
            }
          />
          {t("flights.fifthPlace", { defaultValue: "5e place" })}
        </label>
        <label className="flex items-center gap-1.5">
          <Checkbox
            checked={draft.enable_seventh_place}
            onCheckedChange={(v) =>
              onChange({ ...draft, enable_seventh_place: !!v })
            }
          />
          {t("flights.seventhPlace", { defaultValue: "7e place" })}
        </label>
      </div>
      <p className="text-[11px] text-muted-foreground">
        {t("flights.draftRulesSummary", {
          defaultValue: "{{n}} règle(s) de qualification configurée(s)",
          n: draft.qualification_rules.length,
        })}
      </p>
    </div>
  );
}
