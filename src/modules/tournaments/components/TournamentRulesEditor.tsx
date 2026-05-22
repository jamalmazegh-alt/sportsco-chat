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
import { GripVertical, RotateCcw, Save, Plus, Loader2 } from "lucide-react";
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
import { updateTournamentRules } from "../tournaments.functions";

interface Props {
  tournamentId: string;
  settings: unknown;
}

export function TournamentRulesEditor({ tournamentId, settings }: Props) {
  const initial = useMemo(() => mergeRules(settings), [settings]);
  const [rules, setRules] = useState<TournamentRules>(initial);
  const updateFn = useServerFn(updateTournamentRules);
  const qc = useQueryClient();

  const save = useMutation({
    mutationFn: () =>
      updateFn({ data: { tournament_id: tournamentId, rules: rules as any } }),
    onSuccess: () => {
      toast.success("Règles enregistrées");
      qc.invalidateQueries({ queryKey: ["tournament", tournamentId] });
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

      {/* Langue & branding */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Langue & branding</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3">
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
