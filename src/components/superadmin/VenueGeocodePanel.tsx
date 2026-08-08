import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, MapPin } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  backfillVenueCoordinates,
  getVenueGeocodeStatus,
  type VenueGeocodeRunResult,
} from "@/lib/superadmin/venue-geocode.functions";

/**
 * Rattrapage des coordonnées manquantes sur les lieux de club.
 *
 * Sans coordonnées, un lieu ne porte pas de météo. Le panneau annonce d'abord
 * combien de lieux manquent et dans quels clubs, parce que le chiffre suffit
 * souvent à décider s'il y a lieu d'agir. Le traitement se fait par lots pour
 * ne pas saturer les géocodeurs publics : tant qu'un lot résout des lieux, le
 * suivant part tout seul ; dès qu'un lot n'en résout aucun, on s'arrête et on
 * affiche les adresses fautives, qui relèvent d'une correction manuelle.
 */
export function VenueGeocodePanel() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const statusFn = useServerFn(getVenueGeocodeStatus);
  const runFn = useServerFn(backfillVenueCoordinates);
  const [lastRun, setLastRun] = useState<VenueGeocodeRunResult | null>(null);

  const { data: status, isLoading } = useQuery({
    queryKey: ["superadmin-venue-geocode-status"],
    queryFn: () => statusFn(),
  });

  const run = useMutation({
    mutationFn: async () => {
      let total: VenueGeocodeRunResult = {
        processed: 0,
        resolved: 0,
        failed: 0,
        remaining: 0,
        unresolved: [],
      };
      // Boucle bornée par le progrès : un lot qui ne résout rien ne sera pas
      // plus chanceux au suivant, et la condition d'arrêt ne dépend jamais du
      // seul compteur restant — pas de boucle infinie sur des adresses mortes.
      for (;;) {
        const batch = await runFn({ data: {} });
        total = {
          processed: total.processed + batch.processed,
          resolved: total.resolved + batch.resolved,
          failed: total.failed + batch.failed,
          remaining: batch.remaining,
          unresolved: [...total.unresolved, ...batch.unresolved],
        };
        if (batch.resolved === 0 || batch.remaining === 0) break;
      }
      return total;
    },
    onSuccess: (r) => {
      setLastRun(r);
      if (r.processed === 0) toast.info(t("superadmin.venueGeocode.nothingToDo"));
      else if (r.failed === 0)
        toast.success(t("superadmin.venueGeocode.done", { count: r.resolved }));
      else
        toast.warning(
          t("superadmin.venueGeocode.partial", { count: r.resolved, failed: r.failed }),
        );
      qc.invalidateQueries({ queryKey: ["superadmin-venue-geocode-status"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const missing = status?.missing ?? 0;

  return (
    <section className="rounded-lg border p-5 space-y-4">
      <div>
        <h2 className="font-medium flex items-center gap-2">
          <MapPin className="h-4 w-4" /> {t("superadmin.venueGeocode.title")}
        </h2>
        <p className="text-sm text-muted-foreground mt-1">{t("superadmin.venueGeocode.hint")}</p>
      </div>

      {isLoading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> {t("superadmin.venueGeocode.loading")}
        </div>
      )}

      {status && (
        <div className="text-sm">
          {missing === 0 ? (
            <span className="text-emerald-600 font-medium">
              {t("superadmin.venueGeocode.allResolved", { count: status.total })}
            </span>
          ) : (
            <span className="text-amber-600 font-medium">
              {t("superadmin.venueGeocode.missingCount", {
                count: missing,
                total: status.total,
              })}
            </span>
          )}
        </div>
      )}

      {status && status.clubs.length > 0 && (
        <ul className="text-xs space-y-1 rounded bg-muted/50 p-3">
          {status.clubs.map((c) => (
            <li key={c.clubId} className="flex items-center justify-between gap-3">
              <span className="truncate">{c.clubName}</span>
              <span className="tabular-nums text-muted-foreground shrink-0">{c.missing}</span>
            </li>
          ))}
        </ul>
      )}

      <Button onClick={() => run.mutate()} disabled={run.isPending || missing === 0}>
        {run.isPending ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin mr-2" /> {t("superadmin.venueGeocode.running")}
          </>
        ) : (
          <>
            <MapPin className="h-4 w-4 mr-2" /> {t("superadmin.venueGeocode.action")}
          </>
        )}
      </Button>

      {lastRun && lastRun.unresolved.length > 0 && (
        <div className="text-sm rounded border p-3 space-y-2">
          <div className="font-medium">{t("superadmin.venueGeocode.unresolvedTitle")}</div>
          <p className="text-xs text-muted-foreground">
            {t("superadmin.venueGeocode.unresolvedHint")}
          </p>
          <ul className="text-xs space-y-1">
            {lastRun.unresolved.map((v) => (
              <li key={v.venueId}>
                <span className="font-medium">{v.name}</span>
                {v.address ? (
                  <span className="text-muted-foreground"> · {v.address}</span>
                ) : (
                  <span className="text-muted-foreground">
                    {" "}
                    · {t("superadmin.venueGeocode.noAddress")}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
