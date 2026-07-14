/**
 * logActivity — helper fire-and-forget pour le journal produit unifié.
 *
 * Server-only. NE JAMAIS importer depuis un fichier client-reachable au niveau
 * module ; utiliser `await import(...)` dans un handler de server function si
 * besoin. Le try/catch avale toutes les erreurs — une trace ratée ne doit
 * jamais faire échouer l'action métier.
 *
 * L'appel n'est PAS awaité par contrat (fire-and-forget), mais renvoie une
 * Promise pour permettre `void logActivity(...)` ou `await` dans les tests.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { createLogger } from "@/lib/logger.server";
import { redactErrorMessage } from "./redact";
import type {
  ActivityCategory,
  ActivityActionType,
  ActivityStatus,
  ActorRole,
} from "./action-types";

const log = createLogger("product-activity");

export interface LogActivityInput {
  clubId?: string | null;
  actorUserId?: string | null;
  actorRole?: ActorRole | null;
  category: ActivityCategory;
  actionType: ActivityActionType;
  resourceType?: string | null;
  resourceId?: string | null;
  status?: ActivityStatus;
  errorCode?: string | null;
  /** Metadata libre — NE PAS y mettre de secrets/tokens. Sera stocké tel quel. */
  metadata?: Record<string, unknown>;
  /**
   * Message d'erreur brut à assainir avant stockage dans metadata.error.
   * Passer le message d'origine ; la fonction masque tokens/emails/phones.
   */
  rawError?: unknown;
}

export async function logActivity(
  supabase: SupabaseClient,
  input: LogActivityInput,
): Promise<void> {
  try {
    const metadata: Record<string, unknown> = { ...(input.metadata ?? {}) };
    if (input.rawError !== undefined) {
      metadata.error = redactErrorMessage(input.rawError);
    }
    const { error } = await supabase.from("product_activity_log").insert({
      club_id: input.clubId ?? null,
      actor_user_id: input.actorUserId ?? null,
      actor_role: input.actorRole ?? null,
      category: input.category,
      action_type: input.actionType,
      resource_type: input.resourceType ?? null,
      resource_id: input.resourceId ?? null,
      status: input.status ?? "success",
      error_code: input.errorCode ?? null,
      metadata,
    } as never);
    if (error) log.warn("insert_failed", { err: error.message, actionType: input.actionType });
  } catch (err) {
    log.warn("insert_threw", { err: err instanceof Error ? err.message : String(err) });
  }
}
