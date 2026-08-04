import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Plus, Trash2, Pencil, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  upsertCampAgeGroup,
  deleteCampAgeGroup,
  reorderCampAgeGroups,
  type CampAgeGroup,
} from "@/lib/camps.functions";

type Draft = {
  label: string;
  birth_year_min: string;
  birth_year_max: string;
};

const emptyDraft: Draft = { label: "", birth_year_min: "", birth_year_max: "" };

function toNumberOrNull(v: string): number | null {
  if (!v.trim()) return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

/** Sort U-labels ascending numerically, then any custom labels alphabetically. */
function ageGroupSortKey(label: string): [number, string] {
  const m = label.match(/^U(\d+)$/i);
  if (m) return [parseInt(m[1], 10), ""];
  return [Number.POSITIVE_INFINITY, label.toUpperCase()];
}

export function CampAgeGroupsEditor({
  campId,
  ageGroups,
  disabled = false,
}: {
  campId: string;
  ageGroups: CampAgeGroup[];
  disabled?: boolean;
}) {
  const { t } = useTranslation("camps");
  const qc = useQueryClient();
  const upsertFn = useServerFn(upsertCampAgeGroup);
  const deleteFn = useServerFn(deleteCampAgeGroup);
  const reorderFn = useServerFn(reorderCampAgeGroups);

  const [showCustom, setShowCustom] = useState(false);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Draft>(emptyDraft);

  // Season = August (M=7) of current year → July next.
  const now = new Date();
  const seasonStart = now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1;

  // U6 → U19 presets with birth years derived from the season.
  const presets = useMemo(
    () =>
      Array.from({ length: 14 }, (_, i) => {
        const n = i + 6;
        return { label: `U${n}`, min: seasonStart - n + 1, max: seasonStart - n + 2 };
      }),
    [seasonStart],
  );

  const byLabel = useMemo(() => {
    const m = new Map<string, CampAgeGroup>();
    for (const g of ageGroups) m.set(g.label.toUpperCase(), g);
    return m;
  }, [ageGroups]);

  // Sort the persisted list ascending for display (U6, U7, … then custom).
  const sortedGroups = useMemo(() => {
    return [...ageGroups].sort((a, b) => {
      const ka = ageGroupSortKey(a.label);
      const kb = ageGroupSortKey(b.label);
      if (ka[0] !== kb[0]) return ka[0] - kb[0];
      return ka[1].localeCompare(kb[1]);
    });
  }, [ageGroups]);

  // Keep the DB sort_order in sync with the ascending display order once,
  // so any downstream consumer that trusts sort_order stays consistent.
  const persistedOrder = ageGroups.map((g) => g.id).join(",");
  const desiredOrder = sortedGroups.map((g) => g.id).join(",");
  const needsReorder = persistedOrder !== desiredOrder;

  function invalidate() {
    qc.invalidateQueries({ queryKey: ["club-camp", campId] });
  }

  const addMut = useMutation({
    mutationFn: (payload: Draft) =>
      upsertFn({
        data: {
          campId,
          group: {
            label: payload.label.trim(),
            birth_year_min: toNumberOrNull(payload.birth_year_min),
            birth_year_max: toNumberOrNull(payload.birth_year_max),
          },
        },
      }),
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });

  const updateMut = useMutation({
    mutationFn: (payload: { id: string; draft: Draft }) =>
      upsertFn({
        data: {
          campId,
          group: {
            id: payload.id,
            label: payload.draft.label.trim(),
            birth_year_min: toNumberOrNull(payload.draft.birth_year_min),
            birth_year_max: toNumberOrNull(payload.draft.birth_year_max),
          },
        },
      }),
    onSuccess: () => {
      setEditingId(null);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });

  const reorderMut = useMutation({
    mutationFn: (orderedIds: string[]) => reorderFn({ data: { campId, orderedIds } }),
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });

  function togglePreset(label: string, min: number, max: number) {
    if (disabled) return;
    const existing = byLabel.get(label.toUpperCase());
    if (existing) {
      deleteMut.mutate(existing.id);
    } else {
      addMut.mutate({
        label,
        birth_year_min: String(min),
        birth_year_max: String(max),
      });
    }
  }

  function beginEdit(g: CampAgeGroup) {
    setEditingId(g.id);
    setEditDraft({
      label: g.label,
      birth_year_min: g.birth_year_min?.toString() ?? "",
      birth_year_max: g.birth_year_max?.toString() ?? "",
    });
  }

  const customGroups = sortedGroups.filter((g) => !/^U\d+$/i.test(g.label));

  return (
    <div className="space-y-4">
      {/* Preset grid U6 → U19: toggleable checkboxes */}
      <div>
        <Label className="mb-2 block text-xs uppercase tracking-wide text-muted-foreground">
          {t("ageGroups.selectAll")}
        </Label>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 md:grid-cols-7">
          {presets.map((p) => {
            const active = byLabel.has(p.label.toUpperCase());
            return (
              <button
                key={p.label}
                type="button"
                onClick={() => togglePreset(p.label, p.min, p.max)}
                disabled={disabled}
                aria-pressed={active}
                className={cn(
                  "flex flex-col items-center justify-center rounded-lg border p-2 text-center transition",
                  active
                    ? "border-primary bg-primary/10 text-primary ring-1 ring-primary"
                    : "border-border bg-card hover:bg-muted/50",
                  disabled && "opacity-50 cursor-not-allowed",
                )}
              >
                <span className="text-sm font-semibold">{p.label}</span>
                <span className="text-[10px] text-muted-foreground">
                  {p.min}–{p.max}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Custom groups list (editable) */}
      {customGroups.length > 0 && (
        <div className="space-y-2">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">
            {t("ageGroups.customs")}
          </Label>
          <ul className="space-y-2">
            {customGroups.map((g) => (
              <li
                key={g.id}
                className="flex items-center gap-2 rounded-lg border border-border bg-card p-2"
              >
                {editingId === g.id ? (
                  <div className="grid flex-1 gap-2 sm:grid-cols-3">
                    <Input
                      value={editDraft.label}
                      onChange={(e) => setEditDraft({ ...editDraft, label: e.target.value })}
                      placeholder={t("ageGroups.labelPlaceholder")}
                    />
                    <Input
                      type="number"
                      value={editDraft.birth_year_min}
                      onChange={(e) =>
                        setEditDraft({ ...editDraft, birth_year_min: e.target.value })
                      }
                      placeholder={t("ageGroups.yearMin")}
                    />
                    <Input
                      type="number"
                      value={editDraft.birth_year_max}
                      onChange={(e) =>
                        setEditDraft({ ...editDraft, birth_year_max: e.target.value })
                      }
                      placeholder={t("ageGroups.yearMax")}
                    />
                  </div>
                ) : (
                  <div className="flex-1 text-sm">
                    <div className="font-medium">{g.label}</div>
                    {(g.birth_year_min || g.birth_year_max) && (
                      <div className="text-xs text-muted-foreground">
                        {g.birth_year_min ?? "…"} – {g.birth_year_max ?? "…"}
                      </div>
                    )}
                  </div>
                )}
                {editingId === g.id ? (
                  <>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      onClick={() => updateMut.mutate({ id: g.id, draft: editDraft })}
                      disabled={updateMut.isPending || !editDraft.label.trim()}
                    >
                      <Check className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      onClick={() => setEditingId(null)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      onClick={() => beginEdit(g)}
                      disabled={disabled}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      onClick={() => deleteMut.mutate(g.id)}
                      disabled={disabled || deleteMut.isPending}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Custom-add toggle */}
      {!showCustom ? (
        <button
          type="button"
          onClick={() => setShowCustom(true)}
          disabled={disabled}
          className="text-xs font-medium text-primary hover:underline disabled:opacity-50"
        >
          {t("ageGroups.addCustom")}
        </button>
      ) : (
        <div className="rounded-lg border border-dashed border-border p-3 space-y-2">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">
            {t("ageGroups.addTitle")}
          </Label>
          <div className="grid gap-2 sm:grid-cols-[1fr_100px_100px_auto]">
            <Input
              value={draft.label}
              onChange={(e) => setDraft({ ...draft, label: e.target.value })}
              placeholder={t("ageGroups.labelPlaceholder")}
              disabled={disabled}
            />
            <Input
              type="number"
              value={draft.birth_year_min}
              onChange={(e) => setDraft({ ...draft, birth_year_min: e.target.value })}
              placeholder={t("ageGroups.yearMin")}
              disabled={disabled}
            />
            <Input
              type="number"
              value={draft.birth_year_max}
              onChange={(e) => setDraft({ ...draft, birth_year_max: e.target.value })}
              placeholder={t("ageGroups.yearMax")}
              disabled={disabled}
            />
            <div className="flex gap-1">
              <Button
                type="button"
                onClick={() =>
                  addMut.mutate(draft, {
                    onSuccess: () => {
                      setDraft(emptyDraft);
                      setShowCustom(false);
                    },
                  })
                }
                disabled={disabled || addMut.isPending || !draft.label.trim()}
              >
                <Plus className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => {
                  setShowCustom(false);
                  setDraft(emptyDraft);
                }}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* One-shot reorder to enforce ascending persisted order */}
      {needsReorder && !disabled && !reorderMut.isPending && (
        <ReorderTrigger onRun={() => reorderMut.mutate(sortedGroups.map((g) => g.id))} />
      )}
    </div>
  );
}

/** Fire the reorder once on mount when the persisted order differs from asc. */
function ReorderTrigger({ onRun }: { onRun: () => void }) {
  useEffect(() => {
    onRun();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}
