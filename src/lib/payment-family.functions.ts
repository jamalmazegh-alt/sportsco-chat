import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Family portal: unified view of every obligation that concerns the current
 * user — directly (payer) or via guardianship — across every status.
 * Returns obligations grouped by player + linked transactions + receipts so
 * the UI can render the whole financial history in a single screen.
 */
export const listFamilyPayments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({}).parse(input ?? {}))
  .handler(async ({ context }) => {
    const userId = context.userId;

    // 1. Resolve the players the user is linked to (as guardian/parent).
    const { data: guardLinks } = await supabaseAdmin
      .from("player_guardians")
      .select("player_id")
      .eq("user_id", userId);
    const playerIds = (guardLinks ?? []).map((g) => g.player_id);

    // 2. Fetch every obligation where the user pays or guards the player.
    const orClause = `payer_user_id.eq.${userId}${
      playerIds.length ? `,player_id.in.(${playerIds.join(",")})` : ""
    }`;

    const { data: obls } = await supabaseAdmin
      .from("payment_obligations")
      .select(
        `id, payment_item_id, club_id, player_id, payer_user_id,
         amount_due_cents, currency, status, created_at,
         exempted_reason, cancelled_reason,
         items:payment_item_id (id, title, type, due_date, provider, allow_partial, status),
         clubs:club_id (id, name, stripe_account_id, stripe_charges_enabled),
         players:player_id (id, first_name, last_name)`,
      )
      .or(orClause)
      .order("created_at", { ascending: false });

    const list = obls ?? [];
    const ids = list.map((o) => o.id);

    // 3. Fetch all transactions and receipts in two batched queries.
    const [txRes, rcRes] = await Promise.all([
      ids.length
        ? supabaseAdmin
            .from("payment_transactions")
            .select(
              "id, obligation_id, method, status, amount_gross_cents, amount_net_cents, refunded_amount_cents, currency, paid_at, created_at",
            )
            .in("obligation_id", ids)
            .order("created_at", { ascending: false })
        : Promise.resolve({ data: [] as Array<Record<string, unknown>> }),
      ids.length
        ? supabaseAdmin
            .from("payment_receipts")
            .select(
              "id, obligation_id, receipt_number, amount_gross_cents, currency, method, issued_at",
            )
            .in("obligation_id", ids)
            .order("issued_at", { ascending: false })
        : Promise.resolve({ data: [] as Array<Record<string, unknown>> }),
    ]);

    const txByObl = new Map<string, Array<Record<string, unknown>>>();
    (txRes.data ?? []).forEach((t) => {
      const key = (t as { obligation_id: string }).obligation_id;
      if (!txByObl.has(key)) txByObl.set(key, []);
      txByObl.get(key)!.push(t);
    });

    const rcByObl = new Map<string, Array<Record<string, unknown>>>();
    (rcRes.data ?? []).forEach((r) => {
      const key = (r as { obligation_id: string }).obligation_id;
      if (!rcByObl.has(key)) rcByObl.set(key, []);
      rcByObl.get(key)!.push(r);
    });

    // 4. Compute paid (succeeded - refunded) per obligation.
    const enriched = list.map((o) => {
      const txs = txByObl.get(o.id) ?? [];
      const paid = txs
        .filter((t) => (t as { status: string }).status === "succeeded")
        .reduce(
          (sum, t) =>
            sum +
            ((t as { amount_gross_cents: number }).amount_gross_cents ?? 0) -
            ((t as { refunded_amount_cents: number | null })
              .refunded_amount_cents ?? 0),
          0,
        );
      return {
        ...o,
        amount_paid_cents: paid,
        transactions: txs,
        receipts: rcByObl.get(o.id) ?? [],
      };
    });

    // 5. Group by player (use "self" bucket for obligations without player).
    type Group = {
      key: string;
      label: string;
      player_id: string | null;
      obligations: typeof enriched;
      totals: {
        due_cents: number;
        paid_cents: number;
        remaining_cents: number;
      };
    };
    const groups = new Map<string, Group>();
    for (const o of enriched) {
      const isSelfPayer = !o.player_id && o.payer_user_id === userId;
      const key = o.player_id ?? "self";
      const label = o.players
        ? `${o.players.first_name ?? ""} ${o.players.last_name ?? ""}`.trim() ||
          "Joueur"
        : isSelfPayer
          ? "Moi"
          : "Sans joueur";
      if (!groups.has(key)) {
        groups.set(key, {
          key,
          label,
          player_id: o.player_id,
          obligations: [],
          totals: { due_cents: 0, paid_cents: 0, remaining_cents: 0 },
        });
      }
      const g = groups.get(key)!;
      g.obligations.push(o);
      if (o.status !== "cancelled" && o.status !== "exempted") {
        g.totals.due_cents += o.amount_due_cents ?? 0;
        g.totals.paid_cents += o.amount_paid_cents;
        g.totals.remaining_cents +=
          (o.amount_due_cents ?? 0) - o.amount_paid_cents;
      }
    }

    return { groups: Array.from(groups.values()) };
  });
