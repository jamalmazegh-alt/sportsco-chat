import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2, Calculator, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { recomputePlayerCategoriesForSeason } from "@/lib/superadmin-import/backfill-categories.functions";
import { DestructiveConfirmSheet } from "@/components/destructive-confirm-sheet";

type Result = Awaited<ReturnType<typeof recomputePlayerCategoriesForSeason>>;

export function RecomputeCategoriesPanel({ clubId }: { clubId: string }) {
  const { t } = useTranslation();
  const [seasonLabel, setSeasonLabel] = useState("");
  const [overwrite, setOverwrite] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  const run = async () => {
    setLoading(true);
    setResult(null);
    try {
      const res = await recomputePlayerCategoriesForSeason({
        data: {
          clubId,
          seasonLabel: seasonLabel.trim() || undefined,
          overwrite,
        },
      });
      setResult(res);
      toast.success(t("superadmin.components.categoriesRecomputed", { season: res.seasonLabel }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Échec du recalcul");
    } finally {
      setLoading(false);
      setConfirmOpen(false);
    }
  };

  const onClick = () => {
    if (overwrite) setConfirmOpen(true);
    else void run();
  };

  return (
    <section className="mb-6">
      <div className="rounded-xl border border-border bg-card p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-2 mb-3">
          <Calculator className="h-4 w-4" /> Recalcul des catégories FFF
        </h2>
        <p className="text-xs text-muted-foreground mb-4">
          Recalcule les catégories d'âge (U6 → Senior) des joueurs du club pour la saison choisie.
          Par défaut, seules les lignes sans catégorie sont remplies (non destructif).
        </p>

        <div className="grid sm:grid-cols-2 gap-3 mb-4">
          <div className="space-y-1.5">
            <Label htmlFor="season-label" className="text-xs">
              Saison (optionnel)
            </Label>
            <Input
              id="season-label"
              placeholder="Saison courante par défaut (ex. 2024-2025)"
              value={seasonLabel}
              onChange={(e) => setSeasonLabel(e.target.value)}
              disabled={loading}
            />
          </div>
        </div>

        <label className="flex items-start gap-2 mb-4 cursor-pointer">
          <Checkbox
            checked={overwrite}
            onCheckedChange={(v) => setOverwrite(v === true)}
            disabled={loading}
            className="mt-0.5"
          />
          <span className="text-xs leading-relaxed">
            <span className="font-medium text-foreground">Écraser</span> les catégories déjà
            saisies, <span className="text-destructive">y compris les surclassements manuels</span>.
          </span>
        </label>

        <Button onClick={onClick} disabled={loading} size="sm">
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Recalcul en cours…
            </>
          ) : (
            <>
              <Calculator className="h-4 w-4 mr-1.5" /> Recalculer
            </>
          )}
        </Button>

        {result && (
          <div className="mt-4 rounded-lg border border-border bg-muted/30 p-3">
            <div className="text-xs font-medium mb-2">Résultat — saison {result.seasonLabel}</div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
              <Stat label="Total" value={result.total} />
              <Stat label="Mises à jour" value={result.updated} tone="success" />
              <Stat label="Ignorées" value={result.skipped} />
              <Stat label="Sans date de naissance" value={result.missingDob} tone="warn" />
            </div>
          </div>
        )}
      </div>

      <DestructiveConfirmSheet
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        mode="type"
        confirmWord="ECRASER"
        title="Écraser les catégories existantes ?"
        description={
          <>
            Toutes les catégories déjà saisies pour la saison sélectionnée seront{" "}
            <strong>remplacées</strong> par le calcul FFF automatique.
          </>
        }
        consequences={
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
            <span>
              Les <strong>surclassements manuels</strong> (ex. un U14 jouant en U15) seront perdus.
            </span>
          </div>
        }
        confirmLabel="Écraser et recalculer"
        onConfirm={run}
        loading={loading}
      />
    </section>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "success" | "warn" }) {
  const color =
    tone === "success"
      ? "text-emerald-600"
      : tone === "warn"
        ? "text-amber-600"
        : "text-foreground";
  return (
    <div className="rounded-md bg-card border border-border p-2">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`text-lg font-semibold tabular-nums ${color}`}>{value}</div>
    </div>
  );
}
