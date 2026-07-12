/**
 * Phase 3 — Étape 6 : purge quotidienne des documents de stage.
 *
 * Pour chaque stage dont `end_date + document_retention_months` est dépassé,
 * supprime les fichiers du bucket privé `camp-registration-documents` et les
 * lignes de `club_camp_registration_documents`. Les inscriptions elles-mêmes
 * sont conservées (historique / suivi financier).
 *
 * Auth : en-tête `x-cron-secret` obligatoire (variable serveur
 * `CAMP_PURGE_CRON_SECRET`). La route `/api/public/*` étant hors du gate
 * d'auth publié, ce secret dédié empêche toute exécution par un tiers
 * disposant simplement de la clé anon publique.
 *
 * Journalisé dans `club_camp_document_purge_log`.
 */
import { createFileRoute } from "@tanstack/react-router";

interface CampPurgeResult {
  camp_id: string;
  files_deleted: number;
  rows_deleted: number;
  error?: string;
}

function timingSafeEqualStr(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export const Route = createFileRoute("/api/public/hooks/camp-documents-purge")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const provided =
          request.headers.get("x-cron-secret") ??
          request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
          "";
        const expected = process.env.CAMP_PURGE_CRON_SECRET ?? "";
        const compared = expected.length > 0 && provided.length > 0;
        const equal = compared && timingSafeEqualStr(provided, expected);

        // Diagnostic serveur uniquement — ne divulgue jamais la valeur.
        console.log("[camp-purge] auth", {
          expectedLen: expected.length,
          providedLen: provided.length,
          compared,
          equal,
        });

        if (!equal) {
          return new Response("Forbidden", { status: 403 });
        }





        const { supabaseAdmin } = await import(
          "@/integrations/supabase/client.server"
        );

        // 1. Sélection des stages arrivés à échéance de rétention via RPC
        //    utilisant l'arithmétique exacte de dates Postgres
        //    (end_date + make_interval(months => document_retention_months)).
        const { data: dueCamps, error: campsErr } = await supabaseAdmin.rpc(
          "get_camps_due_for_document_purge" as any,
        );

        if (campsErr) {
          return Response.json(
            { ok: false, error: campsErr.message },
            { status: 500 },
          );
        }


        const results: CampPurgeResult[] = [];

        for (const camp of (dueCamps ?? []) as Array<{ id: string; end_date: string; document_retention_months: number }>) {
          try {
            // 2. Récupère les registrations du stage.
            const { data: regs, error: regErr } = await supabaseAdmin
              .from("club_camp_registrations")
              .select("id")
              .eq("camp_id", camp.id);
            if (regErr) throw new Error(regErr.message);
            const regIds = (regs ?? []).map((r: any) => r.id);
            if (regIds.length === 0) {
              results.push({ camp_id: camp.id, files_deleted: 0, rows_deleted: 0 });
              continue;
            }

            // 3. Récupère les fichiers à supprimer.
            const { data: docs, error: docsErr } = await supabaseAdmin
              .from("club_camp_registration_documents")
              .select("id, file_path")
              .in("registration_id", regIds);
            if (docsErr) throw new Error(docsErr.message);

            const paths = (docs ?? [])
              .map((d: any) => d.file_path as string)
              .filter(Boolean);

            let filesDeleted = 0;
            // 4. Supprime par lots de 1000 (limite du client Storage).
            for (let i = 0; i < paths.length; i += 1000) {
              const chunk = paths.slice(i, i + 1000);
              const { data: removed, error: rmErr } = await supabaseAdmin.storage
                .from("camp-registration-documents")
                .remove(chunk);
              if (rmErr) throw new Error(`storage: ${rmErr.message}`);
              filesDeleted += (removed ?? []).length;
            }

            // 5. Supprime les lignes.
            let rowsDeleted = 0;
            if ((docs ?? []).length > 0) {
              const { count, error: delErr } = await supabaseAdmin
                .from("club_camp_registration_documents")
                .delete({ count: "exact" })
                .in(
                  "id",
                  (docs ?? []).map((d: any) => d.id),
                );
              if (delErr) throw new Error(delErr.message);
              rowsDeleted = count ?? 0;
            }

            await supabaseAdmin
              .from("club_camp_document_purge_log" as any)
              .insert({
                camp_id: camp.id,
                files_deleted: filesDeleted,
                rows_deleted: rowsDeleted,
                details: { registrations: regIds.length },
              });

            results.push({
              camp_id: camp.id,
              files_deleted: filesDeleted,
              rows_deleted: rowsDeleted,
            });
          } catch (e: any) {
            const msg = e?.message ?? String(e);
            await supabaseAdmin
              .from("club_camp_document_purge_log" as any)
              .insert({
                camp_id: camp.id,
                files_deleted: 0,
                rows_deleted: 0,
                error: msg,
              });
            results.push({
              camp_id: camp.id,
              files_deleted: 0,
              rows_deleted: 0,
              error: msg,
            });
          }
        }

        return Response.json({
          ok: true,
          due: (dueCamps ?? []).length,
          results,
        });

      },
    },
  },
});
