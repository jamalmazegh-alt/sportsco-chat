import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Plus, Trash2, ChevronUp, ChevronDown, Pencil, Check, X, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
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

  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Draft>(emptyDraft);
  const [showCustom, setShowCustom] = useState(false);
  const [presetChoice, setPresetChoice] = useState<string>("");

  const existingLabels = useMemo(
    () => new Set(ageGroups.map((g) => g.label.toUpperCase())),
    [ageGroups],
  );

  // Season = August of current year → July of next year (typical FR/EU football season).
  // For a Uᴺ category: min birth year ≈ seasonStart - N + 1.
  const now = new Date();
  const seasonStart = now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1;

  const presets = useMemo(() => {
    return Array.from({ length: 14 }, (_, i) => {
      const n = i + 6; // U6 → U19
      const label = `U${n}`;
      const min = seasonStart - n + 1;
      return { label, min, max: min + 1 };
    }).filter((p) => !existingLabels.has(p.label));
  }, [existingLabels, seasonStart]);

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
    onSuccess: () => {
      setDraft(emptyDraft);
      invalidate();
    },
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

  function move(index: number, dir: -1 | 1) {
    const next = [...ageGroups];
    const target = index + dir;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    reorderMut.mutate(next.map((g) => g.id));
  }

  function beginEdit(g: CampAgeGroup) {
    setEditingId(g.id);
    setEditDraft({
      label: g.label,
      birth_year_min: g.birth_year_min?.toString() ?? "",
      birth_year_max: g.birth_year_max?.toString() ?? "",
    });
  }

  return (
    <div className="space-y-3">
      <ul className="space-y-2">
        {ageGroups.length === 0 && (
          <li className="text-sm text-muted-foreground">
            {t("ageGroups.empty", { defaultValue: "Aucune catégorie pour l'instant." })}
          </li>
        )}
        {ageGroups.map((g, idx) => (
          <li
            key={g.id}
            className="flex items-center gap-2 rounded-lg border border-border bg-card p-2"
          >
            <div className="flex flex-col">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                disabled={disabled || idx === 0}
                onClick={() => move(idx, -1)}
              >
                <ChevronUp className="h-3.5 w-3.5" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                disabled={disabled || idx === ageGroups.length - 1}
                onClick={() => move(idx, 1)}
              >
                <ChevronDown className="h-3.5 w-3.5" />
              </Button>
            </div>
            {editingId === g.id ? (
              <div className="grid flex-1 gap-2 sm:grid-cols-3">
                <Input
                  value={editDraft.label}
                  onChange={(e) => setEditDraft({ ...editDraft, label: e.target.value })}
                  placeholder={t("ageGroups.labelPlaceholder", { defaultValue: "Label (ex. U9)" })}
                />
                <Input
                  type="number"
                  value={editDraft.birth_year_min}
                  onChange={(e) =>
                    setEditDraft({ ...editDraft, birth_year_min: e.target.value })
                  }
                  placeholder={t("ageGroups.yearMin", { defaultValue: "Année min" })}
                />
                <Input
                  type="number"
                  value={editDraft.birth_year_max}
                  onChange={(e) =>
                    setEditDraft({ ...editDraft, birth_year_max: e.target.value })
                  }
                  placeholder={t("ageGroups.yearMax", { defaultValue: "Année max" })}
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

      <div className="rounded-lg border border-dashed border-border p-3 space-y-3">
        <div className="space-y-2">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground inline-flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5" />
            {t("ageGroups.quickAdd", { defaultValue: "Ajout rapide" })}
          </Label>
          <div className="flex gap-2">
            <Select
              value={presetChoice}
              onValueChange={setPresetChoice}
              disabled={disabled || presets.length === 0}
            >
              <SelectTrigger className="flex-1">
                <SelectValue
                  placeholder={
                    presets.length === 0
                      ? t("ageGroups.allAdded", { defaultValue: "Toutes ajoutées" })
                      : t("ageGroups.pickPreset", { defaultValue: "Choisir U6 – U19" })
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {presets.map((p) => (
                  <SelectItem key={p.label} value={p.label}>
                    {p.label}
                    <span className="ml-2 text-xs text-muted-foreground">
                      ({p.min}
                      {p.max !== p.min ? `–${p.max}` : ""})
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              type="button"
              onClick={() => {
                const p = presets.find((x) => x.label === presetChoice);
                if (!p) return;
                addMut.mutate({
                  label: p.label,
                  birth_year_min: String(p.min),
                  birth_year_max: String(p.max),
                });
                setPresetChoice("");
              }}
              disabled={disabled || addMut.isPending || !presetChoice}
            >
              <Plus className="h-4 w-4 mr-1" />
              {t("common.add", { defaultValue: "Ajouter" })}
            </Button>
          </div>
        </div>

        {!showCustom ? (
          <button
            type="button"
            onClick={() => setShowCustom(true)}
            disabled={disabled}
            className="text-xs font-medium text-primary hover:underline disabled:opacity-50"
          >
            {t("ageGroups.addCustom", { defaultValue: "+ Catégorie personnalisée" })}
          </button>
        ) : (
          <div className="space-y-2 border-t border-border pt-3">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">
              {t("ageGroups.addTitle", { defaultValue: "Ajouter une catégorie" })}
            </Label>
            <div className="grid gap-2 sm:grid-cols-[1fr_100px_100px_auto]">
              <Input
                value={draft.label}
                onChange={(e) => setDraft({ ...draft, label: e.target.value })}
                placeholder={t("ageGroups.labelPlaceholder", { defaultValue: "Label (ex. Loisirs)" })}
                disabled={disabled}
              />
              <Input
                type="number"
                value={draft.birth_year_min}
                onChange={(e) => setDraft({ ...draft, birth_year_min: e.target.value })}
                placeholder={t("ageGroups.yearMin", { defaultValue: "Année min" })}
                disabled={disabled}
              />
              <Input
                type="number"
                value={draft.birth_year_max}
                onChange={(e) => setDraft({ ...draft, birth_year_max: e.target.value })}
                placeholder={t("ageGroups.yearMax", { defaultValue: "Année max" })}
                disabled={disabled}
              />
              <div className="flex gap-1">
                <Button
                  type="button"
                  onClick={() =>
                    addMut.mutate(draft, {
                      onSuccess: () => setShowCustom(false),
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
      </div>
    </div>
  );
}
