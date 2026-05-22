import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
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
import { GripVertical, RotateCcw, Save, Plus, Loader2, FileDown, ExternalLink } from "lucide-react";
import { toast } from "sonner";

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

export function TournamentRulesEditor({ tournamentId, settings, sport }: Props) {
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
      toast.success("Règles enregistrées");
      qc.invalidateQueries({ queryKey: ["tournament", tournamentId] });
      qc.invalidateQueries({ queryKey: ["tournament-documents", tournamentId] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Erreur"),
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
      toast.success("Règlement PDF généré");
      qc.invalidateQueries({ queryKey: ["tournament-documents", tournamentId] });
      if (res?.document?.file_url) window.open(res.document.file_url, "_blank");
    },
    onError: (e: any) => toast.error(e?.message ?? "Erreur"),
  });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const activeTBs = rules.tiebreakers;
  const inactiveTBs = ALL_TIEBREAKERS.map((t) => t.key).filter(
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
    if (key === "points") return; // points always required
    setRules({ ...rules, tiebreakers: activeTBs.filter((k) => k !== key) });
  }

  function addTB(key: Tiebreaker) {
    if (activeTBs.includes(key)) return;
    setRules({ ...rules, tiebreakers: [...activeTBs, key] });
  }

  return (
    <div className="space-y-4">
      {/* Points */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Points</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-3 gap-3">
          <NumberField
            label="Victoire"
            value={rules.points.win}
            onChange={(v) => setRules({ ...rules, points: { ...rules.points, win: v } })}
          />
          <NumberField
            label="Nul"
            value={rules.points.draw}
            onChange={(v) =>
              setRules({ ...rules, points: { ...rules.points, draw: v } })
            }
          />
          <NumberField
            label="Défaite"
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
          <CardTitle className="text-base">Score</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label>Mode de comptage</Label>
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
                <SelectItem value="simple">Score simple (buts/points)</SelectItem>
                <SelectItem value="sets">Score par sets (volley)</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Défaut pour ce sport :{" "}
              {sport === "volleyball" ? "sets" : "simple"}.
            </p>
          </div>
          {scoring.mode === "sets" && (
            <div className="grid grid-cols-3 gap-3 pt-2">
              <div className="space-y-1.5">
                <Label>Best of</Label>
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
                    <SelectItem value="3">3 sets</SelectItem>
                    <SelectItem value="5">5 sets</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <NumberField
                label="Pts / set"
                value={scoring.sets.pointsToWin}
                onChange={(v) =>
                  setScoring({
                    ...scoring,
                    sets: { ...scoring.sets, pointsToWin: v },
                  })
                }
              />
              <NumberField
                label="Tie-break"
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
          <CardTitle className="text-base">
            Critères de départage (ordre)
          </CardTitle>
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
                    canRemove={k !== "points"}
                    onRemove={() => removeTB(k)}
                  />
                ))}
              </ul>
            </SortableContext>
          </DndContext>

          {inactiveTBs.length > 0 && (
            <div className="pt-2">
              <p className="text-xs text-muted-foreground mb-1.5">Ajouter un critère :</p>
              <div className="flex flex-wrap gap-1.5">
                {inactiveTBs.map((k) => {
                  const meta = ALL_TIEBREAKERS.find((t) => t.key === k)!;
                  return (
                    <Button
                      key={k}
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => addTB(k)}
                    >
                      <Plus className="h-3 w-3" />
                      {meta.labelFr}
                    </Button>
                  );
                })}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Qualification */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Qualification</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3">
          <NumberField
            label="Qualifiés par poule"
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
            label="Meilleurs Nèmes (ex: 3èmes)"
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
            Fair-play
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
              label="Carton jaune (pts)"
              value={rules.fairPlay.yellow}
              onChange={(v) =>
                setRules({ ...rules, fairPlay: { ...rules.fairPlay, yellow: v } })
              }
            />
            <NumberField
              label="2e jaune (pts)"
              value={rules.fairPlay.secondYellow ?? 0}
              onChange={(v) =>
                setRules({
                  ...rules,
                  fairPlay: { ...rules.fairPlay, secondYellow: v },
                })
              }
            />
            <NumberField
              label="Carton rouge (pts)"
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
          <CardTitle className="text-base">Prolongations & tirs au but</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between">
            <Label>Prolongations en cas d'égalité</Label>
            <Switch
              checked={rules.overtime.enabled}
              onCheckedChange={(v) =>
                setRules({ ...rules, overtime: { ...rules.overtime, enabled: v } })
              }
            />
          </div>
          {rules.overtime.enabled && (
            <NumberField
              label="Durée (min)"
              value={rules.overtime.minutes ?? 10}
              min={1}
              onChange={(v) =>
                setRules({ ...rules, overtime: { ...rules.overtime, minutes: v } })
              }
            />
          )}
          <div className="flex items-center justify-between pt-2 border-t border-border">
            <Label>Tirs au but si toujours égalité</Label>
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
          <CardTitle className="text-base">Validation des scores</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <Label>N'inclure que les matchs validés au classement</Label>
              <p className="text-xs text-muted-foreground mt-1">
                Sinon, tous les matchs avec score saisi comptent.
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

      {/* Inscriptions (PR9) */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Inscriptions publiques</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <Label>Activer les inscriptions en ligne</Label>
              <p className="text-xs text-muted-foreground mt-1">
                Un formulaire public permet aux équipes de s'inscrire depuis la page du tournoi.
              </p>
            </div>
            <Switch
              checked={rules.registration.enabled}
              onCheckedChange={(v) =>
                setRules({
                  ...rules,
                  registration: { ...rules.registration, enabled: v },
                })
              }
            />
          </div>

          {rules.registration.enabled && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Ouverture</Label>
                  <Input
                    type="datetime-local"
                    value={rules.registration.opensAt ?? ""}
                    onChange={(e) =>
                      setRules({
                        ...rules,
                        registration: {
                          ...rules.registration,
                          opensAt: e.target.value || null,
                        },
                      })
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Clôture</Label>
                  <Input
                    type="datetime-local"
                    value={rules.registration.closesAt ?? ""}
                    onChange={(e) =>
                      setRules({
                        ...rules,
                        registration: {
                          ...rules.registration,
                          closesAt: e.target.value || null,
                        },
                      })
                    }
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Nombre max. d'équipes (0 = illimité)</Label>
                  <Input
                    type="number"
                    min={0}
                    value={rules.registration.maxTeams ?? 0}
                    onChange={(e) =>
                      setRules({
                        ...rules,
                        registration: {
                          ...rules.registration,
                          maxTeams: parseInt(e.target.value, 10) || null,
                        },
                      })
                    }
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <label className="flex items-center justify-between text-sm">
                    <span>Validation par l'organisateur</span>
                    <Switch
                      checked={rules.registration.requiresApproval}
                      onCheckedChange={(v) =>
                        setRules({
                          ...rules,
                          registration: {
                            ...rules.registration,
                            requiresApproval: v,
                          },
                        })
                      }
                    />
                  </label>
                  <label className="flex items-center justify-between text-sm">
                    <span>Demander la liste des joueurs</span>
                    <Switch
                      checked={rules.registration.collectPlayers}
                      onCheckedChange={(v) =>
                        setRules({
                          ...rules,
                          registration: {
                            ...rules.registration,
                            collectPlayers: v,
                          },
                        })
                      }
                    />
                  </label>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Message affiché sur le formulaire (optionnel)</Label>
                <Input
                  value={rules.registration.publicMessage ?? ""}
                  onChange={(e) =>
                    setRules({
                      ...rules,
                      registration: {
                        ...rules.registration,
                        publicMessage: e.target.value,
                      },
                    })
                  }
                  maxLength={300}
                  placeholder="Frais d'inscription, contact, etc."
                />
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Langue & branding */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Langue & branding</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Langue du règlement</Label>
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
              <Label>Organisateur</Label>
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
              <Label>Couleur d'accent</Label>
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
              <Label>Titre bloc sponsors</Label>
              <Input
                value={rules.branding.sponsorsTitle ?? ""}
                placeholder="Avec le soutien de nos partenaires"
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
          <CardTitle className="text-base">Sponsors & partenaires</CardTitle>
        </CardHeader>
        <CardContent>
          <SponsorsEditor
            tournamentId={tournamentId}
            sponsors={rules.branding.sponsors ?? []}
            onChange={(sponsors) =>
              setRules({
                ...rules,
                branding: { ...rules.branding, sponsors },
              })
            }
          />
        </CardContent>
      </Card>

      {/* PDF generation */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Règlement PDF</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Génère un PDF officiel basé sur les règles enregistrées. Pense à
            sauvegarder tes modifications avant de générer.
          </p>
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
            Générer le PDF
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
                    {new Date(d.generated_at).toLocaleString("fr-FR")}
                  </span>
                  <a
                    href={d.file_url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary hover:underline inline-flex items-center gap-1 text-xs"
                  >
                    Ouvrir <ExternalLink className="h-3 w-3" />
                  </a>
                </li>
              ))}
            </ul>
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
          Enregistrer
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => setRules(DEFAULT_RULES)}
        >
          <RotateCcw className="h-4 w-4" />
          Réinitialiser
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
  canRemove,
  onRemove,
}: {
  id: Tiebreaker;
  index: number;
  canRemove: boolean;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id });
  const meta = ALL_TIEBREAKERS.find((t) => t.key === id)!;
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
      <span className="text-sm flex-1">{meta.labelFr}</span>
      {canRemove && (
        <Button type="button" size="sm" variant="ghost" onClick={onRemove}>
          ×
        </Button>
      )}
    </li>
  );
}
