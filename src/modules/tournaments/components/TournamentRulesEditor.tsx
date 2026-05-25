import { useMemo, useState, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, RotateCcw, Save, Plus, Loader2, FileDown, ExternalLink, Upload, FileText, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import {
  ALL_TIEBREAKERS,
  DEFAULT_RULES,
  mergeRules,
  type TournamentRules,
} from "../lib/rules";
import type { Sponsor } from "../lib/rules";
import { SponsorsEditor } from "./SponsorsEditor";
import type { Tiebreaker } from "../lib/standings";
import {
  resolveScoring,
  type ScoringMode,
  type ScoringRules,
} from "../lib/formats";
import {
  updateTournamentRules,
  generateRulesPdf,
  listTournamentDocuments,
} from "../tournaments.functions";

interface Props {
  tournamentId: string;
  settings: unknown;
  sport?: string | null;
}

function tbLabel(key: Tiebreaker, lang: string): string {
  const meta = ALL_TIEBREAKERS.find((t) => t.key === key)!;
  return lang.startsWith("en") ? meta.labelEn : meta.labelFr;
}

export function TournamentRulesEditor({ tournamentId, settings, sport }: Props) {
  const { t, i18n } = useTranslation("tournaments");
  const lang = i18n.language || "fr";
  const initial = useMemo(() => mergeRules(settings), [settings]);
  const [rules, setRules] = useState<TournamentRules>(initial);
  const scoring: ScoringRules = useMemo(
    () => resolveScoring(sport, rules.scoring),
    [sport, rules.scoring],
  );
  const setScoring = (next: ScoringRules) =>
    setRules({ ...rules, scoring: next });
  const updateFn = useServerFn(updateTournamentRules);
  const qc = useQueryClient();

  const save = useMutation({
    mutationFn: () =>
      updateFn({ data: { tournament_id: tournamentId, rules: rules as any } }),
    onSuccess: () => {
      toast.success(t("rules.savedToast"));
      qc.invalidateQueries({ queryKey: ["tournament", tournamentId] });
      qc.invalidateQueries({ queryKey: ["tournament-documents", tournamentId] });
    },
    onError: (e: any) => toast.error(e?.message ?? t("rules.errorToast")),
  });

  const genPdfFn = useServerFn(generateRulesPdf);
  const listDocsFn = useServerFn(listTournamentDocuments);
  const docsQuery = useQuery({
    queryKey: ["tournament-documents", tournamentId],
    queryFn: () => listDocsFn({ data: { tournament_id: tournamentId } }),
  });
  const generate = useMutation({
    mutationFn: () => genPdfFn({ data: { tournament_id: tournamentId } }),
    onSuccess: (res: any) => {
      toast.success(t("rules.pdfGeneratedToast"));
      qc.invalidateQueries({ queryKey: ["tournament-documents", tournamentId] });
      if (res?.document?.file_url) window.open(res.document.file_url, "_blank");
    },
    onError: (e: any) => toast.error(e?.message ?? t("rules.errorToast")),
  });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const activeTBs = rules.tiebreakers;
  const inactiveTBs = ALL_TIEBREAKERS.map((tb) => tb.key).filter(
    (k) => !activeTBs.includes(k),
  );

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIdx = activeTBs.indexOf(active.id as Tiebreaker);
    const newIdx = activeTBs.indexOf(over.id as Tiebreaker);
    if (oldIdx < 0 || newIdx < 0) return;
    setRules({ ...rules, tiebreakers: arrayMove(activeTBs, oldIdx, newIdx) });
  }

  function removeTB(key: Tiebreaker) {
    if (key === "points") return;
    setRules({ ...rules, tiebreakers: activeTBs.filter((k) => k !== key) });
  }

  function addTB(key: Tiebreaker) {
    if (activeTBs.includes(key)) return;
    setRules({ ...rules, tiebreakers: [...activeTBs, key] });
  }

  const defaultScoreMode = sport === "volleyball" ? t("rules.scoreModeSets") : t("rules.scoreModeSimple");

  return (
    <div className="space-y-4">
      {/* Points */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("rules.pointsTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-3 gap-3">
          <NumberField
            label={t("rules.win")}
            value={rules.points.win}
            onChange={(v) => setRules({ ...rules, points: { ...rules.points, win: v } })}
          />
          <NumberField
            label={t("rules.draw")}
            value={rules.points.draw}
            onChange={(v) =>
              setRules({ ...rules, points: { ...rules.points, draw: v } })
            }
          />
          <NumberField
            label={t("rules.loss")}
            value={rules.points.loss}
            onChange={(v) =>
              setRules({ ...rules, points: { ...rules.points, loss: v } })
            }
          />
        </CardContent>
      </Card>

      {/* Scoring */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("rules.scoreTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label>{t("rules.scoreMode")}</Label>
            <Select
              value={scoring.mode}
              onValueChange={(v) =>
                setScoring({ ...scoring, mode: v as ScoringMode })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="simple">{t("rules.scoreModeSimple")}</SelectItem>
                <SelectItem value="sets">{t("rules.scoreModeSets")}</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {t("rules.scoreModeDefault", { mode: defaultScoreMode })}
            </p>
          </div>
          {scoring.mode === "sets" && (
            <div className="grid grid-cols-3 gap-3 pt-2">
              <div className="space-y-1.5">
                <Label>{t("rules.bestOf")}</Label>
                <Select
                  value={String(scoring.sets.bestOf)}
                  onValueChange={(v) =>
                    setScoring({
                      ...scoring,
                      sets: { ...scoring.sets, bestOf: parseInt(v, 10) as 3 | 5 },
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="3">{t("rules.setsCount", { n: 3 })}</SelectItem>
                    <SelectItem value="5">{t("rules.setsCount", { n: 5 })}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <NumberField
                label={t("rules.pointsPerSet")}
                value={scoring.sets.pointsToWin}
                onChange={(v) =>
                  setScoring({
                    ...scoring,
                    sets: { ...scoring.sets, pointsToWin: v },
                  })
                }
              />
              <NumberField
                label={t("rules.tieBreak")}
                value={scoring.sets.tieBreakPoints}
                onChange={(v) =>
                  setScoring({
                    ...scoring,
                    sets: { ...scoring.sets, tieBreakPoints: v },
                  })
                }
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tie-breakers */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("rules.tiebreakersTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={activeTBs} strategy={verticalListSortingStrategy}>
              <ul className="space-y-1.5">
                {activeTBs.map((k, i) => (
                  <SortableTB
                    key={k}
                    id={k}
                    index={i + 1}
                    label={tbLabel(k, lang)}
                    canRemove={k !== "points"}
                    onRemove={() => removeTB(k)}
                  />
                ))}
              </ul>
            </SortableContext>
          </DndContext>

          {inactiveTBs.length > 0 && (
            <div className="pt-2">
              <p className="text-xs text-muted-foreground mb-1.5">{t("rules.addCriterion")}</p>
              <div className="flex flex-wrap gap-1.5">
                {inactiveTBs.map((k) => (
                  <Button
                    key={k}
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => addTB(k)}
                  >
                    <Plus className="h-3 w-3" />
                    {tbLabel(k, lang)}
                  </Button>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Qualification */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("rules.qualificationTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3">
          <NumberField
            label={t("rules.qualifiersPerGroup")}
            value={rules.qualification.perGroup}
            min={1}
            onChange={(v) =>
              setRules({
                ...rules,
                qualification: { ...rules.qualification, perGroup: v },
              })
            }
          />
          <NumberField
            label={t("rules.bestThirds")}
            value={rules.qualification.bestThirds ?? 0}
            min={0}
            onChange={(v) =>
              setRules({
                ...rules,
                qualification: { ...rules.qualification, bestThirds: v },
              })
            }
          />
        </CardContent>
      </Card>

      {/* Fair play */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center justify-between">
            {t("rules.fairPlayTitle")}
            <Switch
              checked={rules.fairPlay.enabled}
              onCheckedChange={(v) =>
                setRules({ ...rules, fairPlay: { ...rules.fairPlay, enabled: v } })
              }
            />
          </CardTitle>
        </CardHeader>
        {rules.fairPlay.enabled && (
          <CardContent className="grid grid-cols-3 gap-3">
            <NumberField
              label={t("rules.yellowCard")}
              value={rules.fairPlay.yellow}
              onChange={(v) =>
                setRules({ ...rules, fairPlay: { ...rules.fairPlay, yellow: v } })
              }
            />
            <NumberField
              label={t("rules.secondYellowCard")}
              value={rules.fairPlay.secondYellow ?? 0}
              onChange={(v) =>
                setRules({
                  ...rules,
                  fairPlay: { ...rules.fairPlay, secondYellow: v },
                })
              }
            />
            <NumberField
              label={t("rules.redCard")}
              value={rules.fairPlay.red}
              onChange={(v) =>
                setRules({ ...rules, fairPlay: { ...rules.fairPlay, red: v } })
              }
            />
          </CardContent>
        )}
      </Card>

      {/* Overtime + Penalty */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("rules.otTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between">
            <Label>{t("rules.otOnTie")}</Label>
            <Switch
              checked={rules.overtime.enabled}
              onCheckedChange={(v) =>
                setRules({ ...rules, overtime: { ...rules.overtime, enabled: v } })
              }
            />
          </div>
          {rules.overtime.enabled && (
            <NumberField
              label={t("rules.otDuration")}
              value={rules.overtime.minutes ?? 10}
              min={1}
              onChange={(v) =>
                setRules({ ...rules, overtime: { ...rules.overtime, minutes: v } })
              }
            />
          )}
          <div className="flex items-center justify-between pt-2 border-t border-border">
            <Label>{t("rules.shootoutIfStillTied")}</Label>
            <Switch
              checked={rules.penaltyShootout.enabled}
              onCheckedChange={(v) =>
                setRules({ ...rules, penaltyShootout: { enabled: v } })
              }
            />
          </div>
        </CardContent>
      </Card>

      {/* Validation */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("rules.validationTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <Label>{t("rules.validationLabel")}</Label>
              <p className="text-xs text-muted-foreground mt-1">
                {t("rules.validationHint")}
              </p>
            </div>
            <Switch
              checked={rules.matchValidation.requireValidation}
              onCheckedChange={(v) =>
                setRules({
                  ...rules,
                  matchValidation: { requireValidation: v },
                })
              }
            />
          </div>
        </CardContent>
      </Card>

      {/* Language & branding */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("rules.brandingTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{t("rules.language")}</Label>
              <Select
                value={rules.language}
                onValueChange={(v) =>
                  setRules({ ...rules, language: v as "fr" | "en" })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="fr">Français</SelectItem>
                  <SelectItem value="en">English</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{t("rules.organizer")}</Label>
              <Input
                value={rules.branding.organizerName ?? ""}
                onChange={(e) =>
                  setRules({
                    ...rules,
                    branding: { ...rules.branding, organizerName: e.target.value },
                  })
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t("rules.accentColor")}</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="color"
                  className="h-10 w-14 p-1"
                  value={rules.branding.primaryColor ?? "#2563eb"}
                  onChange={(e) =>
                    setRules({
                      ...rules,
                      branding: { ...rules.branding, primaryColor: e.target.value },
                    })
                  }
                />
                <Input
                  value={rules.branding.primaryColor ?? ""}
                  placeholder="#2563eb"
                  onChange={(e) =>
                    setRules({
                      ...rules,
                      branding: { ...rules.branding, primaryColor: e.target.value },
                    })
                  }
                  maxLength={20}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>{t("rules.sponsorsTitle")}</Label>
              <Input
                value={rules.branding.sponsorsTitle ?? ""}
                placeholder={t("rules.sponsorsTitlePlaceholder")}
                onChange={(e) =>
                  setRules({
                    ...rules,
                    branding: { ...rules.branding, sponsorsTitle: e.target.value },
                  })
                }
                maxLength={120}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Sponsors */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("rules.sponsorsBlockTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <SponsorsEditor
            tournamentId={tournamentId}
            sponsors={rules.branding.sponsors ?? []}
            onChange={(sponsors: Sponsor[]) =>
              setRules({
                ...rules,
                branding: { ...rules.branding, sponsors },
              })
            }
          />
        </CardContent>
      </Card>

      {/* Regulations: generated vs uploaded */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("rules.pdfTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <ModeTile
              active={rules.regulations.mode === "generated"}
              title={t("rules.regulationsModeGenerated")}
              description={t("rules.regulationsModeGeneratedHint")}
              onClick={() =>
                setRules({
                  ...rules,
                  regulations: { ...rules.regulations, mode: "generated" },
                })
              }
            />
            <ModeTile
              active={rules.regulations.mode === "uploaded"}
              title={t("rules.regulationsModeUploaded")}
              description={t("rules.regulationsModeUploadedHint")}
              onClick={() =>
                setRules({
                  ...rules,
                  regulations: { ...rules.regulations, mode: "uploaded" },
                })
              }
            />
          </div>

          {rules.regulations.mode === "generated" ? (
            <div className="space-y-3 pt-2 border-t border-border">
              <p className="text-xs text-muted-foreground">{t("rules.pdfHint")}</p>
              <Button
                type="button"
                variant="secondary"
                onClick={() => generate.mutate()}
                disabled={generate.isPending}
              >
                {generate.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <FileDown className="h-4 w-4" />
                )}
                {t("rules.generatePdf")}
              </Button>
              {docsQuery.data?.documents && docsQuery.data.documents.length > 0 && (
                <ul className="space-y-1.5 pt-2">
                  {docsQuery.data.documents.slice(0, 5).map((d: any) => (
                    <li
                      key={d.id}
                      className="flex items-center justify-between gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm"
                    >
                      <span className="truncate">
                        <span className="font-medium uppercase text-xs text-muted-foreground mr-2">
                          {d.language}
                        </span>
                        {new Date(d.generated_at).toLocaleString(lang.startsWith("en") ? "en-US" : "fr-FR")}
                      </span>
                      <a
                        href={d.file_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-primary hover:underline inline-flex items-center gap-1 text-xs"
                      >
                        {t("rules.open")} <ExternalLink className="h-3 w-3" />
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : (
            <UploadedRegulations
              tournamentId={tournamentId}
              regulations={rules.regulations}
              onChange={(reg) =>
                setRules({ ...rules, regulations: { ...rules.regulations, ...reg } })
              }
            />
          )}
        </CardContent>
      </Card>



      <div className="flex gap-2 sticky bottom-0 bg-background/95 backdrop-blur py-3 border-t border-border">
        <Button onClick={() => save.mutate()} disabled={save.isPending}>
          {save.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          {t("rules.save")}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => setRules(DEFAULT_RULES)}
        >
          <RotateCcw className="h-4 w-4" />
          {t("rules.reset")}
        </Button>
      </div>
    </div>
  );
}

function NumberField({
  label,
  value,
  min,
  onChange,
}: {
  label: string;
  value: number;
  min?: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <Input
        type="number"
        min={min}
        value={value}
        onChange={(e) => {
          const n = Number(e.target.value);
          onChange(Number.isFinite(n) ? n : 0);
        }}
      />
    </div>
  );
}

function SortableTB({
  id,
  index,
  label,
  canRemove,
  onRemove,
}: {
  id: Tiebreaker;
  index: number;
  label: string;
  canRemove: boolean;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  return (
    <li
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 rounded-md border border-border bg-card px-2 py-2"
    >
      <button
        type="button"
        className="touch-none cursor-grab text-muted-foreground hover:text-foreground"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <span className="text-xs font-mono text-muted-foreground w-5">{index}.</span>
      <span className="text-sm flex-1">{label}</span>
      {canRemove && (
        <Button type="button" size="sm" variant="ghost" onClick={onRemove}>
          ×
        </Button>
      )}
    </li>
  );
}
