/**
 * ============================================================================
 * Postes de paiement (campagnes de cotisations / licences / déplacements…)
 * ============================================================================
 *
 * Comportement attendu de la feature « Postes de paiement » :
 *
 * 1. CRÉATION
 *    - Réservé aux rôles `admin` ou `financial_admin` du club.
 *    - L'admin crée un poste (titre, type, montant, échéance, fournisseur)
 *      et choisit une cible : tout le club / des équipes / des joueurs précis.
 *    - À la création (statut `open`), le serveur :
 *        a. matérialise les `payment_obligations` (1 par joueur ciblé) avec
 *           le payeur (tuteur principal sinon n'importe quel tuteur) ;
 *        b. envoie un email « Nouveau paiement à régler » via la queue
 *           transactionnelle au payeur et aux parents/joueur — avec un lien
 *           vers /payments. L'envoi est idempotent par (poste × email).
 *
 * 2. CÔTÉ MEMBRE (/payments)
 *    - Le joueur (ou son parent payeur) voit la liste de ses obligations en
 *      attente / partielles / payées, et règle en ligne (Stripe) ou voit que
 *      le club encaisse hors ligne (espèces / chèque / virement / HelloAsso).
 *
 * 3. CÔTÉ ADMIN — page /admin/payments/items
 *    - Liste des postes de la saison, statut, montant.
 *    - Bouton « Suivi » → ouvre le dialog par joueur : qui a payé combien,
 *      encaissement manuel, remboursement, exonération, annulation.
 *    - Bouton « Relancer » → envoie immédiatement un email de rappel à
 *      tous les payeurs non soldés (déduplication par jour calendaire).
 *
 * 4. CÔTÉ ADMIN — page /admin/payments/dashboard
 *    - Vue agrégée : KPIs (encaissé / net / dû / taux), répartition par
 *      poste / méthode / mois, liste des transactions, exports CSV.
 *
 * 5. RÔLES & PERMISSIONS
 *    - `admin`         : crée/édite/supprime un poste, voit le suivi,
 *                        envoie des rappels, voit le dashboard.
 *    - `financial_admin`: idem + opérations financières (encaissement
 *                         manuel, exonération, annulation, remboursement).
 *    - Le rôle `admin` ne PEUT PAS exécuter les opérations purement
 *      financières (record manual / refund) sans le rôle financial_admin —
 *      voir `payment-checkout.functions.ts`.
 * ============================================================================
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { enqueueTransactionalEmailServer } from "@/lib/email/send.server";

const ITEM_TYPES = [
  "membership",
  "license",
  "equipment",
  "trip",
  "tournament",
  "fundraising",
  "other",
] as const;

const PROVIDERS = [
  "stripe",
  "helloasso",
  "cash",
  "cheque",
  "bank_transfer",
  "manual",
] as const;

const STATUSES = ["draft", "open", "closed", "cancelled"] as const;

async function assertFinAdmin(
  supabase: SupabaseClient,
  userId: string,
  clubId: string,
): Promise<void> {
  const { data } = await supabase
    .from("club_members")
    .select("roles, role")
    .eq("club_id", clubId)
    .eq("user_id", userId)
    .maybeSingle();
  const isAdmin =
    !!data && ((data.roles ?? []).includes("admin") || data.role === "admin");
  if (isAdmin) return;
  const { data: isFin } = await supabaseAdmin.rpc("has_club_role_text", {
    _user_id: userId,
    _club_id: clubId,
    _role: "financial_admin",
  });
  if (isFin === true) return;
  throw new Error("Seuls les admins du club ou les admins financiers peuvent gérer les postes de paiement");
}

const ItemInput = z.object({
  season_id: z.string().uuid(),
  team_id: z.string().uuid().nullable().optional(),
  type: z.enum(ITEM_TYPES),
  title: z.string().min(1).max(200),
  description: z.string().max(2000).nullable().optional(),
  amount_cents: z.number().int().min(0).max(100_000_000),
  currency: z.string().length(3).default("eur"),
  due_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  provider: z.enum(PROVIDERS).default("stripe"),
  allow_partial: z.boolean().default(false),
  status: z.enum(STATUSES).default("open"),
});

const TargetSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("club") }),
  z.object({ kind: z.literal("team"), team_ids: z.array(z.string().uuid()).min(1) }),
  z.object({ kind: z.literal("player"), player_ids: z.array(z.string().uuid()).min(1) }),
]);

/* -------------------------------- LIST -------------------------------- */

export const listPaymentItems = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        clubId: z.string().uuid(),
        seasonId: z.string().uuid().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("payment_items")
      .select(
        "id, season_id, team_id, type, title, description, amount_cents, currency, due_date, provider, allow_partial, status, created_at",
      )
      .eq("club_id", data.clubId)
      .order("created_at", { ascending: false });
    if (data.seasonId) q = q.eq("season_id", data.seasonId);
    const { data: items, error } = await q;
    if (error) throw new Error(error.message);
    return { items: items ?? [] };
  });

/* ------------------------------ GET ONE ------------------------------ */

export const getPaymentItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({ clubId: z.string().uuid(), itemId: z.string().uuid() })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: item, error } = await context.supabase
      .from("payment_items")
      .select("*")
      .eq("id", data.itemId)
      .eq("club_id", data.clubId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!item) throw new Error("Poste de paiement introuvable");

    const { data: assignments } = await context.supabase
      .from("payment_assignments")
      .select("id, target_kind, target_player_id, target_team_id")
      .eq("payment_item_id", data.itemId);

    const { data: obligations } = await context.supabase
      .from("payment_obligations")
      .select(
        "id, player_id, payer_user_id, amount_due_cents, status, created_at",
      )
      .eq("payment_item_id", data.itemId);

    return {
      item,
      assignments: assignments ?? [],
      obligations: obligations ?? [],
    };
  });

/* ------------------------------ CREATE ------------------------------ */

export const createPaymentItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        clubId: z.string().uuid(),
        item: ItemInput,
        target: TargetSchema,
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertFinAdmin(context.supabase, context.userId, data.clubId);

    // Validate season belongs to club
    const { data: season } = await supabaseAdmin
      .from("seasons")
      .select("id")
      .eq("id", data.item.season_id)
      .eq("club_id", data.clubId)
      .maybeSingle();
    if (!season) throw new Error("Saison invalide pour ce club");

    // Insert item
    const { data: created, error } = await supabaseAdmin
      .from("payment_items")
      .insert({
        club_id: data.clubId,
        created_by: context.userId,
        season_id: data.item.season_id,
        team_id: data.item.team_id ?? null,
        type: data.item.type,
        title: data.item.title,
        description: data.item.description ?? null,
        amount_cents: data.item.amount_cents,
        currency: data.item.currency.toLowerCase(),
        due_date: data.item.due_date ?? null,
        provider: data.item.provider,
        allow_partial: data.item.allow_partial,
        status: data.item.status,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    await applyTarget(data.clubId, created.id, data.target, data.item);

    // Notification initiale aux payeurs / parents / joueurs ciblés. On ne
    // notifie que les postes ouverts (les brouillons restent silencieux).
    // L'envoi est non bloquant — un échec d'email ne doit pas faire échouer
    // la création du poste côté admin.
    if (data.item.status === "open") {
      try {
        await notifyMembersOfNewPaymentItem(data.clubId, created.id);
      } catch (e) {
        console.error("[payment-items] initial notification failed", {
          itemId: created.id,
          error: String(e),
        });
      }
    }

    return { id: created.id };
  });

/* ------------------------------ UPDATE ------------------------------ */

export const updatePaymentItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        clubId: z.string().uuid(),
        itemId: z.string().uuid(),
        patch: ItemInput.partial(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertFinAdmin(context.supabase, context.userId, data.clubId);
    const patch = { ...data.patch };
    if (typeof patch.currency === "string") {
      patch.currency = patch.currency.toLowerCase();
    }
    const { error } = await supabaseAdmin
      .from("payment_items")
      .update(patch)
      .eq("id", data.itemId)
      .eq("club_id", data.clubId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ------------------------------ DELETE ------------------------------ */

export const deletePaymentItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({ clubId: z.string().uuid(), itemId: z.string().uuid() })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertFinAdmin(context.supabase, context.userId, data.clubId);
    // Block delete if any transaction succeeded
    const { count } = await supabaseAdmin
      .from("payment_transactions")
      .select("id", { count: "exact", head: true })
      .eq("status", "succeeded")
      .in(
        "obligation_id",
        (
          await supabaseAdmin
            .from("payment_obligations")
            .select("id")
            .eq("payment_item_id", data.itemId)
        ).data?.map((o) => o.id) ?? [],
      );
    if ((count ?? 0) > 0) {
      throw new Error(
        "Suppression impossible : des paiements ont déjà été encaissés. Annulez le poste plutôt que de le supprimer.",
      );
    }
    const { error } = await supabaseAdmin
      .from("payment_items")
      .delete()
      .eq("id", data.itemId)
      .eq("club_id", data.clubId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* --------------------------- RE-ASSIGN -------------------------- */

export const reassignPaymentItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        clubId: z.string().uuid(),
        itemId: z.string().uuid(),
        target: TargetSchema,
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertFinAdmin(context.supabase, context.userId, data.clubId);
    const { data: item } = await supabaseAdmin
      .from("payment_items")
      .select(
        "id, amount_cents, currency, club_id",
      )
      .eq("id", data.itemId)
      .eq("club_id", data.clubId)
      .maybeSingle();
    if (!item) throw new Error("Poste de paiement introuvable");

    // Remove assignments + pending obligations (keep paid/partial untouched)
    await supabaseAdmin
      .from("payment_assignments")
      .delete()
      .eq("payment_item_id", data.itemId);
    await supabaseAdmin
      .from("payment_obligations")
      .delete()
      .eq("payment_item_id", data.itemId)
      .eq("status", "pending");

    await applyTarget(data.clubId, data.itemId, data.target, {
      amount_cents: item.amount_cents,
      currency: item.currency,
    });
    return { ok: true };
  });

/* --------------------------- helpers --------------------------- */

async function applyTarget(
  clubId: string,
  itemId: string,
  target: z.infer<typeof TargetSchema>,
  itemMeta: { amount_cents: number; currency: string },
): Promise<void> {
  // Insert assignment rows
  if (target.kind === "club") {
    await supabaseAdmin.from("payment_assignments").insert({
      payment_item_id: itemId,
      club_id: clubId,
      target_kind: "club",
    });
  } else if (target.kind === "team") {
    await supabaseAdmin.from("payment_assignments").insert(
      target.team_ids.map((tid) => ({
        payment_item_id: itemId,
        club_id: clubId,
        target_kind: "team" as const,
        target_team_id: tid,
      })),
    );
  } else {
    await supabaseAdmin.from("payment_assignments").insert(
      target.player_ids.map((pid) => ({
        payment_item_id: itemId,
        club_id: clubId,
        target_kind: "player" as const,
        target_player_id: pid,
      })),
    );
  }

  // Materialize obligations
  const playerIds = new Set<string>();

  if (target.kind === "player") {
    target.player_ids.forEach((id) => playerIds.add(id));
  } else if (target.kind === "team") {
    const { data: tm } = await supabaseAdmin
      .from("team_members")
      .select("player_id")
      .in("team_id", target.team_ids);
    tm?.forEach((m) => m.player_id && playerIds.add(m.player_id));
  } else {
    const { data: tp } = await supabaseAdmin
      .from("players")
      .select("id")
      .eq("club_id", clubId)
      .is("deleted_at", null);
    tp?.forEach((p) => playerIds.add(p.id));
  }

  if (playerIds.size === 0) return;

  // Resolve payer = primary guardian if any, else null
  const ids = Array.from(playerIds);
  const { data: guardians } = await supabaseAdmin
    .from("player_guardians")
    .select("player_id, user_id, is_primary_payer")
    .in("player_id", ids);

  const payerByPlayer = new Map<string, string | null>();
  ids.forEach((pid) => payerByPlayer.set(pid, null));
  guardians?.forEach((g) => {
    if (g.is_primary_payer) payerByPlayer.set(g.player_id, g.user_id);
  });
  // fallback: any guardian if no primary set
  guardians?.forEach((g) => {
    if (payerByPlayer.get(g.player_id) === null) {
      payerByPlayer.set(g.player_id, g.user_id);
    }
  });

  const rows = ids.map((pid) => ({
    payment_item_id: itemId,
    club_id: clubId,
    player_id: pid,
    payer_user_id: payerByPlayer.get(pid) ?? null,
    amount_due_cents: itemMeta.amount_cents,
    currency: itemMeta.currency,
    status: "pending" as const,
  }));

  // upsert ignoring conflicts to be re-assignment safe
  await supabaseAdmin
    .from("payment_obligations")
    .upsert(rows, {
      onConflict: "payment_item_id,player_id,payer_user_id",
      ignoreDuplicates: true,
    });
}
