import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

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
  throw new Error("Only club admins or financial admins can view dashboards");
}

const FilterSchema = z.object({
  clubId: z.string().uuid(),
  seasonId: z.string().uuid().optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

/* --------------------------- DASHBOARD SUMMARY --------------------------- */

export const getPaymentDashboard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => FilterSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertFinAdmin(context.supabase, context.userId, data.clubId);

    // Items scope
    let itemsQ = supabaseAdmin
      .from("payment_items")
      .select("id, season_id, type, title, amount_cents, currency, status, due_date")
      .eq("club_id", data.clubId);
    if (data.seasonId) itemsQ = itemsQ.eq("season_id", data.seasonId);
    const { data: items, error: itemsErr } = await itemsQ;
    if (itemsErr) throw new Error(itemsErr.message);
    const itemIds = (items ?? []).map((i) => i.id);

    // Obligations
    const { data: obligations } = itemIds.length
      ? await supabaseAdmin
          .from("payment_obligations")
          .select("id, payment_item_id, amount_due_cents, status, currency")
          .in("payment_item_id", itemIds)
      : { data: [] as Array<{ id: string; payment_item_id: string; amount_due_cents: number; status: string; currency: string }> };

    const obligationIds = (obligations ?? []).map((o) => o.id);

    // Transactions
    let txQ = supabaseAdmin
      .from("payment_transactions")
      .select(
        "id, obligation_id, method, status, amount_gross_cents, amount_net_cents, provider_fee_cents, currency, paid_at, created_at",
      )
      .eq("club_id", data.clubId);
    if (obligationIds.length) {
      txQ = txQ.in("obligation_id", obligationIds);
    } else {
      // No items → no transactions in scope
      txQ = txQ.eq("id", "00000000-0000-0000-0000-000000000000");
    }
    if (data.from) txQ = txQ.gte("created_at", `${data.from}T00:00:00Z`);
    if (data.to) txQ = txQ.lte("created_at", `${data.to}T23:59:59Z`);
    const { data: txs } = await txQ;

    const succeeded = (txs ?? []).filter((t) => t.status === "succeeded");

    // KPIs
    const totalDue = (obligations ?? []).reduce(
      (s, o) => s + (o.amount_due_cents ?? 0),
      0,
    );
    const totalCollected = succeeded.reduce(
      (s, t) => s + (t.amount_gross_cents ?? 0),
      0,
    );
    const totalNet = succeeded.reduce(
      (s, t) => s + (t.amount_net_cents ?? 0),
      0,
    );
    const totalFees = succeeded.reduce(
      (s, t) => s + (t.provider_fee_cents ?? 0),
      0,
    );

    const countByStatus: Record<string, number> = {};
    (obligations ?? []).forEach((o) => {
      countByStatus[o.status] = (countByStatus[o.status] ?? 0) + 1;
    });

    // By method (succeeded only)
    const byMethod: Record<string, { count: number; gross: number; net: number }> = {};
    succeeded.forEach((t) => {
      const k = t.method;
      if (!byMethod[k]) byMethod[k] = { count: 0, gross: 0, net: 0 };
      byMethod[k].count += 1;
      byMethod[k].gross += t.amount_gross_cents ?? 0;
      byMethod[k].net += t.amount_net_cents ?? 0;
    });

    // Monthly series (last 12 buckets based on paid_at)
    const months: Record<string, number> = {};
    succeeded.forEach((t) => {
      const d = t.paid_at ?? t.created_at;
      if (!d) return;
      const ym = d.slice(0, 7); // YYYY-MM
      months[ym] = (months[ym] ?? 0) + (t.amount_gross_cents ?? 0);
    });
    const monthly = Object.entries(months)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, gross]) => ({ month, gross }));

    // Per-item rollup
    const collectedByObligation: Record<string, number> = {};
    succeeded.forEach((t) => {
      collectedByObligation[t.obligation_id] =
        (collectedByObligation[t.obligation_id] ?? 0) +
        (t.amount_gross_cents ?? 0);
    });
    const itemRollup = (items ?? []).map((it) => {
      const obs = (obligations ?? []).filter(
        (o) => o.payment_item_id === it.id,
      );
      const due = obs.reduce((s, o) => s + (o.amount_due_cents ?? 0), 0);
      const collected = obs.reduce(
        (s, o) => s + (collectedByObligation[o.id] ?? 0),
        0,
      );
      const paid = obs.filter((o) => o.status === "paid").length;
      const partial = obs.filter((o) => o.status === "partial").length;
      const pending = obs.filter((o) => o.status === "pending").length;
      return {
        id: it.id,
        title: it.title,
        type: it.type,
        currency: it.currency,
        due_cents: due,
        collected_cents: collected,
        paid_count: paid,
        partial_count: partial,
        pending_count: pending,
        total_count: obs.length,
      };
    });

    return {
      kpis: {
        totalDueCents: totalDue,
        totalCollectedCents: totalCollected,
        totalNetCents: totalNet,
        totalFeesCents: totalFees,
        obligationsCount: (obligations ?? []).length,
        transactionsCount: succeeded.length,
        rate:
          totalDue > 0
            ? Math.min(1, totalCollected / totalDue)
            : 0,
      },
      countByStatus,
      byMethod,
      monthly,
      itemRollup,
      currency:
        (obligations ?? [])[0]?.currency ??
        (items ?? [])[0]?.currency ??
        "eur",
    };
  });

/* --------------------------- TRANSACTIONS LIST --------------------------- */

export const listClubTransactions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    FilterSchema.extend({
      status: z.enum(["succeeded", "pending", "failed", "refunded"]).optional(),
      method: z
        .enum(["stripe", "helloasso", "cash", "cheque", "bank_transfer", "manual"])
        .optional(),
      limit: z.number().int().min(1).max(500).default(200),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertFinAdmin(context.supabase, context.userId, data.clubId);

    let q = supabaseAdmin
      .from("payment_transactions")
      .select(
        "id, obligation_id, method, status, amount_gross_cents, amount_net_cents, provider_fee_cents, currency, stripe_payment_intent_id, external_reference, comment, paid_at, created_at",
      )
      .eq("club_id", data.clubId)
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (data.status) q = q.eq("status", data.status);
    if (data.method) q = q.eq("method", data.method);
    if (data.from) q = q.gte("created_at", `${data.from}T00:00:00Z`);
    if (data.to) q = q.lte("created_at", `${data.to}T23:59:59Z`);
    const { data: txs, error } = await q;
    if (error) throw new Error(error.message);

    const obligationIds = Array.from(
      new Set((txs ?? []).map((t) => t.obligation_id)),
    );
    const { data: obs } = obligationIds.length
      ? await supabaseAdmin
          .from("payment_obligations")
          .select("id, payment_item_id, player_id, payer_user_id")
          .in("id", obligationIds)
      : { data: [] as Array<{ id: string; payment_item_id: string; player_id: string | null; payer_user_id: string | null }> };

    const itemIds = Array.from(
      new Set((obs ?? []).map((o) => o.payment_item_id)),
    );
    const { data: itemsList } = itemIds.length
      ? await supabaseAdmin
          .from("payment_items")
          .select("id, title, type, season_id")
          .in("id", itemIds)
      : { data: [] as Array<{ id: string; title: string; type: string; season_id: string }> };

    const playerIds = Array.from(
      new Set((obs ?? []).map((o) => o.player_id).filter(Boolean) as string[]),
    );
    const { data: players } = playerIds.length
      ? await supabaseAdmin
          .from("players")
          .select("id, first_name, last_name")
          .in("id", playerIds)
      : { data: [] as Array<{ id: string; first_name: string; last_name: string }> };

    const payerIds = Array.from(
      new Set(
        (obs ?? []).map((o) => o.payer_user_id).filter(Boolean) as string[],
      ),
    );
    const { data: profiles } = payerIds.length
      ? await supabaseAdmin
          .from("profiles")
          .select("id, first_name, last_name")
          .in("id", payerIds)
      : { data: [] as Array<{ id: string; first_name: string | null; last_name: string | null}> };

    const itemById = new Map((itemsList ?? []).map((i) => [i.id, i]));
    const playerById = new Map((players ?? []).map((p) => [p.id, p]));
    const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));
    const obById = new Map((obs ?? []).map((o) => [o.id, o]));

    const rows = (txs ?? []).map((t) => {
      const o = obById.get(t.obligation_id);
      const it = o ? itemById.get(o.payment_item_id) : null;
      const pl = o?.player_id ? playerById.get(o.player_id) : null;
      const pr = o?.payer_user_id ? profileById.get(o.payer_user_id) : null;
      return {
        id: t.id,
        created_at: t.created_at,
        paid_at: t.paid_at,
        method: t.method,
        status: t.status,
        amount_gross_cents: t.amount_gross_cents,
        amount_net_cents: t.amount_net_cents,
        provider_fee_cents: t.provider_fee_cents,
        currency: t.currency,
        stripe_payment_intent_id: t.stripe_payment_intent_id,
        external_reference: t.external_reference,
        comment: t.comment,
        item_title: it?.title ?? "—",
        item_type: it?.type ?? null,
        player_name: pl ? `${pl.first_name} ${pl.last_name}` : null,
        payer_name: pr
          ? [pr.first_name, pr.last_name].filter(Boolean).join(" ")
          : null,
        payer_email: pr?.email ?? null,
      };
    });

    return { transactions: rows };
  });

/* ------------------------------ CSV EXPORT ------------------------------ */

function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (/[",\n;]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export const exportTransactionsCsv = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => FilterSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertFinAdmin(context.supabase, context.userId, data.clubId);

    let q = supabaseAdmin
      .from("payment_transactions")
      .select(
        "id, obligation_id, method, status, amount_gross_cents, amount_net_cents, provider_fee_cents, currency, stripe_payment_intent_id, external_reference, comment, paid_at, created_at",
      )
      .eq("club_id", data.clubId)
      .order("created_at", { ascending: false });
    if (data.from) q = q.gte("created_at", `${data.from}T00:00:00Z`);
    if (data.to) q = q.lte("created_at", `${data.to}T23:59:59Z`);
    const { data: txs, error } = await q;
    if (error) throw new Error(error.message);

    const obligationIds = Array.from(
      new Set((txs ?? []).map((t) => t.obligation_id)),
    );
    const { data: obs } = obligationIds.length
      ? await supabaseAdmin
          .from("payment_obligations")
          .select("id, payment_item_id, player_id, payer_user_id")
          .in("id", obligationIds)
      : { data: [] as Array<{ id: string; payment_item_id: string; player_id: string | null; payer_user_id: string | null }> };
    const itemIds = Array.from(
      new Set((obs ?? []).map((o) => o.payment_item_id)),
    );
    const { data: itemsList } = itemIds.length
      ? await supabaseAdmin
          .from("payment_items")
          .select("id, title, type, season_id")
          .in("id", itemIds)
      : { data: [] as Array<{ id: string; title: string; type: string; season_id: string | null }> };
    const playerIds = Array.from(
      new Set((obs ?? []).map((o) => o.player_id).filter(Boolean) as string[]),
    );
    const { data: players } = playerIds.length
      ? await supabaseAdmin
          .from("players")
          .select("id, first_name, last_name")
          .in("id", playerIds)
      : { data: [] as Array<{ id: string; first_name: string; last_name: string }> };
    const payerIds = Array.from(
      new Set(
        (obs ?? []).map((o) => o.payer_user_id).filter(Boolean) as string[],
      ),
    );
    const { data: profiles } = payerIds.length
      ? await supabaseAdmin
          .from("profiles")
          .select("id, first_name, last_name")
          .in("id", payerIds)
      : { data: [] as Array<{ id: string; first_name: string | null; last_name: string | null}> };

    const itemById = new Map((itemsList ?? []).map((i) => [i.id, i]));
    const playerById = new Map((players ?? []).map((p) => [p.id, p]));
    const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));
    const obById = new Map((obs ?? []).map((o) => [o.id, o]));

    const headers = [
      "transaction_id",
      "created_at",
      "paid_at",
      "method",
      "status",
      "amount_gross",
      "provider_fee",
      "amount_net",
      "currency",
      "item_title",
      "item_type",
      "player",
      "payer",
      "payer_email",
      "stripe_payment_intent",
      "external_reference",
      "comment",
    ];

    const lines: string[] = [headers.join(",")];
    (txs ?? []).forEach((t) => {
      const o = obById.get(t.obligation_id);
      const it = o ? itemById.get(o.payment_item_id) : null;
      const pl = o?.player_id ? playerById.get(o.player_id) : null;
      const pr = o?.payer_user_id ? profileById.get(o.payer_user_id) : null;
      const payer = pr
        ? [pr.first_name, pr.last_name].filter(Boolean).join(" ") ||

          ""
        : "";
      lines.push(
        [
          t.id,
          t.created_at,
          t.paid_at,
          t.method,
          t.status,
          (t.amount_gross_cents / 100).toFixed(2),
          (t.provider_fee_cents / 100).toFixed(2),
          (t.amount_net_cents / 100).toFixed(2),
          t.currency.toUpperCase(),
          it?.title ?? "",
          it?.type ?? "",
          pl ? `${pl.first_name} ${pl.last_name}` : "",
          payer,
          pr?.email ?? "",
          t.stripe_payment_intent_id ?? "",
          t.external_reference ?? "",
          t.comment ?? "",
        ]
          .map(csvEscape)
          .join(","),
      );
    });

    const csv = "\uFEFF" + lines.join("\n"); // BOM for Excel
    const filename = `transactions_${data.from ?? "all"}_${data.to ?? "all"}.csv`;
    return { csv, filename };
  });

/* ----------------------------- ITEM ROLLUP CSV ----------------------------- */

export const exportItemsRollupCsv = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => FilterSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertFinAdmin(context.supabase, context.userId, data.clubId);

    let itemsQ = supabaseAdmin
      .from("payment_items")
      .select("id, title, type, amount_cents, currency, due_date, status, season_id")
      .eq("club_id", data.clubId);
    if (data.seasonId) itemsQ = itemsQ.eq("season_id", data.seasonId);
    const { data: items } = await itemsQ;
    const itemIds = (items ?? []).map((i) => i.id);

    const { data: obligations } = itemIds.length
      ? await supabaseAdmin
          .from("payment_obligations")
          .select("id, payment_item_id, amount_due_cents, status")
          .in("payment_item_id", itemIds)
      : { data: [] as Array<{ id: string; payment_item_id: string; amount_due_cents: number; status: string }> };

    const obligationIds = (obligations ?? []).map((o) => o.id);
    const { data: txs } = obligationIds.length
      ? await supabaseAdmin
          .from("payment_transactions")
          .select("obligation_id, amount_gross_cents, status")
          .in("obligation_id", obligationIds)
          .eq("status", "succeeded")
      : { data: [] as Array<{ obligation_id: string; amount_gross_cents: number; status: string }> };

    const collectedByOb: Record<string, number> = {};
    (txs ?? []).forEach((t) => {
      collectedByOb[t.obligation_id] =
        (collectedByOb[t.obligation_id] ?? 0) + t.amount_gross_cents;
    });

    const headers = [
      "item_id",
      "title",
      "type",
      "unit_amount",
      "currency",
      "due_date",
      "status",
      "targets",
      "paid",
      "partial",
      "pending",
      "due_total",
      "collected_total",
      "rate_percent",
    ];
    const lines = [headers.join(",")];
    (items ?? []).forEach((it) => {
      const obs = (obligations ?? []).filter(
        (o) => o.payment_item_id === it.id,
      );
      const due = obs.reduce((s, o) => s + o.amount_due_cents, 0);
      const collected = obs.reduce(
        (s, o) => s + (collectedByOb[o.id] ?? 0),
        0,
      );
      lines.push(
        [
          it.id,
          it.title,
          it.type,
          (it.amount_cents / 100).toFixed(2),
          it.currency.toUpperCase(),
          it.due_date ?? "",
          it.status,
          obs.length,
          obs.filter((o) => o.status === "paid").length,
          obs.filter((o) => o.status === "partial").length,
          obs.filter((o) => o.status === "pending").length,
          (due / 100).toFixed(2),
          (collected / 100).toFixed(2),
          due > 0 ? ((collected / due) * 100).toFixed(1) : "0.0",
        ]
          .map(csvEscape)
          .join(","),
      );
    });

    const csv = "\uFEFF" + lines.join("\n");
    return { csv, filename: `items_rollup_${data.seasonId ?? "all"}.csv` };
  });
