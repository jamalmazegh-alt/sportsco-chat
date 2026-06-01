import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { enqueueTransactionalEmailServer } from "@/lib/email/send.server";

const MANUAL_OFFSET_BASE = 1000; // manual reminders use offset = 1000 + day-of-year to allow re-sends across days

function frDate(iso: string | null | undefined): string | undefined {
  if (!iso) return undefined;
  return new Date(iso).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}
function fmtMoney(cents: number, currency: string): string {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(cents / 100);
}

async function assertFinancialAdmin(userId: string, clubId: string) {
  const { data } = await supabaseAdmin.rpc("has_club_role_text", {
    _user_id: userId,
    _club_id: clubId,
    _role: "financial_admin",
  });
  if (data !== true) throw new Error("Forbidden");
}

async function paidCents(obligationId: string): Promise<number> {
  const { data } = await supabaseAdmin
    .from("payment_transactions")
    .select("amount_gross_cents")
    .eq("obligation_id", obligationId)
    .eq("status", "succeeded");
  return (data ?? []).reduce((s, t: any) => s + (t.amount_gross_cents ?? 0), 0);
}

async function recipientsForObligation(o: {
  player_id: string | null;
  payer_user_id: string | null;
}): Promise<{ email: string }[]> {
  const out: { email: string }[] = [];
  const seen = new Set<string>();
  const add = (e?: string | null) => {
    if (!e) return;
    const k = e.toLowerCase();
    if (seen.has(k)) return;
    seen.add(k);
    out.push({ email: e });
  };
  if (o.payer_user_id) {
    const { data } = await supabaseAdmin.auth.admin.getUserById(o.payer_user_id);
    add(data?.user?.email);
  }
  if (o.player_id) {
    const { data: p } = await supabaseAdmin
      .from("players")
      .select("email")
      .eq("id", o.player_id)
      .maybeSingle();
    add(p?.email);
    const { data: parents } = await supabaseAdmin
      .from("player_parents")
      .select("email")
      .eq("player_id", o.player_id);
    for (const pp of parents ?? []) add(pp.email);
    const { data: guardians } = await supabaseAdmin
      .from("player_guardians")
      .select("user_id")
      .eq("player_id", o.player_id);
    for (const g of guardians ?? []) {
      if (!g.user_id) continue;
      const { data } = await supabaseAdmin.auth.admin.getUserById(g.user_id);
      add(data?.user?.email);
    }
  }
  return out;
}

/** Send reminder now to all unpaid obligations of a payment item. */
export const sendItemRemindersNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ paymentItemId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: item, error } = await supabaseAdmin
      .from("payment_items")
      .select("id, club_id, title, due_date, amount_cents, currency, clubs:club_id(name)")
      .eq("id", data.paymentItemId)
      .maybeSingle();
    if (error || !item) throw new Error(error?.message ?? "Item not found");
    await assertFinancialAdmin(context.userId, item.club_id);

    const { data: obligations } = await supabaseAdmin
      .from("payment_obligations")
      .select("id, player_id, payer_user_id, amount_due_cents, status")
      .eq("payment_item_id", item.id)
      .in("status", ["pending", "partial"] as any);

    const dayOfYear = Math.floor(
      (Date.now() - new Date(new Date().getUTCFullYear(), 0, 0).getTime()) / 86_400_000,
    );
    const offset = MANUAL_OFFSET_BASE + dayOfYear;
    const baseUrl = process.env.SITE_URL || "https://www.clubero.app";
    const clubName = (item as any).clubs?.name ?? "Clubero";

    let sent = 0;
    for (const o of (obligations ?? []) as any[]) {
      const paid = await paidCents(o.id);
      const remaining = Math.max(0, o.amount_due_cents - paid);
      if (remaining <= 0) continue;

      const recipients = await recipientsForObligation(o);
      const pname = o.player_id
        ? await (async () => {
            const { data: p } = await supabaseAdmin
              .from("players")
              .select("first_name, last_name")
              .eq("id", o.player_id)
              .maybeSingle();
            return p ? `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() : null;
          })()
        : null;

      for (const r of recipients) {
        const { data: existing } = await supabaseAdmin
          .from("payment_reminder_log")
          .select("id")
          .eq("obligation_id", o.id)
          .eq("offset_days", offset)
          .eq("recipient_email", r.email.toLowerCase())
          .maybeSingle();
        if (existing) continue;

        try {
          await enqueueTransactionalEmailServer({
            templateName: "payment-reminder",
            recipientEmail: r.email,
            idempotencyKey: `pay-reminder-manual:${o.id}:${offset}:${r.email.toLowerCase()}`,
            templateData: {
              clubName,
              playerName: pname,
              itemTitle: item.title,
              amountLabel: fmtMoney(o.amount_due_cents, item.currency),
              remainingLabel:
                remaining !== o.amount_due_cents
                  ? fmtMoney(remaining, item.currency)
                  : null,
              dueDateLabel: frDate(item.due_date),
              offsetDays: item.due_date
                ? Math.round(
                    (Date.now() - new Date(item.due_date + "T00:00:00Z").getTime()) /
                      86_400_000,
                  )
                : 0,
              payUrl: `${baseUrl}/payments`,
            },
          });
          await supabaseAdmin.from("payment_reminder_log").insert({
            club_id: item.club_id,
            obligation_id: o.id,
            payment_item_id: item.id,
            offset_days: offset,
            recipient_email: r.email.toLowerCase(),
            triggered_by: context.userId,
          });
          sent++;
        } catch (e) {
          console.error("[manual-reminder] enqueue failed", e);
        }
      }
    }
    return { sent };
  });

/** Update reminder settings (financial admin). */
export const updateReminderSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        clubId: z.string().uuid(),
        enabled: z.boolean(),
        offsets: z
          .array(z.number().int().min(-60).max(60))
          .min(0)
          .max(8),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertFinancialAdmin(context.userId, data.clubId);
    const uniq = Array.from(new Set(data.offsets)).sort((a, b) => a - b);
    const { error } = await supabaseAdmin
      .from("club_payment_settings")
      .upsert(
        {
          club_id: data.clubId,
          payment_reminders_enabled: data.enabled,
          payment_reminder_offsets_days: uniq,
        },
        { onConflict: "club_id" },
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getReminderSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ clubId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data }) => {
    const { data: s } = await supabaseAdmin
      .from("club_payment_settings")
      .select("payment_reminders_enabled, payment_reminder_offsets_days")
      .eq("club_id", data.clubId)
      .maybeSingle();
    return {
      enabled: s?.payment_reminders_enabled ?? true,
      offsets: (s?.payment_reminder_offsets_days as number[] | null) ?? [-7, -1, 3, 7],
    };
  });
