import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Server functions superadmin pour l'observabilité produit.
 * - Toutes protégées par `requireSupabaseAuth` + les RPC SQL vérifient
 *   `has_super_admin(auth.uid())` (SECURITY DEFINER).
 */

type JsonValue = string | number | boolean | null | JsonValue[] | { [k: string]: JsonValue };


const ProductActivityInputSchema = z.object({
  clubId: z.string().uuid().nullable().optional(),
  category: z.string().max(32).nullable().optional(),
  status: z.enum(["success", "warning", "failure"]).nullable().optional(),
  actor: z.string().uuid().nullable().optional(),
  from: z.string().nullable().optional(),
  to: z.string().nullable().optional(),
  cursorTs: z.string().nullable().optional(),
  cursorId: z.string().uuid().nullable().optional(),
  limit: z.number().int().min(1).max(200).default(50),
});

export type ProductActivityRow = {
  id: string;
  created_at: string;
  club_id: string | null;
  club_name: string | null;
  actor_user_id: string | null;
  actor_full_name: string | null;
  actor_role: string | null;
  category: string;
  action_type: string;
  resource_type: string | null;
  resource_id: string | null;
  status: string;
  error_code: string | null;
  metadata: JsonValue;
};


export const listProductActivity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ProductActivityInputSchema.parse(input ?? {}))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase.rpc("superadmin_product_activity", {
      _club_id: data.clubId ?? null,
      _category: data.category ?? null,
      _status: data.status ?? null,
      _actor: data.actor ?? null,
      _from: data.from ?? null,
      _to: data.to ?? null,
      _cursor_ts: data.cursorTs ?? null,
      _cursor_id: data.cursorId ?? null,
      _limit: data.limit,
    } as never);
    if (error) throw new Error(error.message);
    return { rows: (rows ?? []) as ProductActivityRow[] };
  });

export type SocialFailureRow = {
  connection_id: string;
  club_id: string | null;
  club_name: string | null;
  network: string;
  account_name: string | null;
  last_sync_error: string | null;
  last_synced_at: string | null;
  is_active: boolean;
};

export const listSocialFailures = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("superadmin_watchlist_social_failures");
    if (error) throw new Error(error.message);
    return { rows: (data ?? []) as SocialFailureRow[] };
  });

export type FailedImportRow = {
  id: string;
  club_id: string | null;
  club_name: string | null;
  imported_by: string | null;
  importer_full_name: string | null;
  import_type: string;
  file_name: string | null;
  status: string;
  rows_total: number;
  rows_imported: number;
  error_log: JsonValue;
  created_at: string;
};

export const listFailedImports = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("superadmin_watchlist_failed_imports");
    if (error) throw new Error(error.message);
    return { rows: (data ?? []) as FailedImportRow[] };
  });
