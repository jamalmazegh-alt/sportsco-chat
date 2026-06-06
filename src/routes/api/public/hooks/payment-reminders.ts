import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { enqueueTransactionalEmailServer } from "@/lib/email/send.server";

/**
 * Daily payment reminders cron.
 * Auth: bypassed via /api/public/* prefix; protected by x-cron-secret
 * header checked against DATA_RETENTION_SECRET.
 *
 * Logic:
 *   - For each club with payment_reminders_enabled:
 *     compute today's offset_days for every open payment_item with a due_date
 *     against each configured offset in payment_reminder_offsets_days.
 *   - Send one email per (obligation, offset, recipient), deduped via
 *     payment_reminder_log.
 */

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

async function recipientsForObligation(o: {
  id: string;
  player_id: string | null;
  payer_user_id: string | null;
}): Promise<{ email: string; name?: string | null }[]> {
  const out: { email: string; name?: string | null }[] = [];
  const seen = new Set<string>();

  if (o.payer_user_id) {
    const { data } = await supabaseAdmin.auth.admin.getUserById(o.payer_user_id);
    const e = data?.user?.email;
    if (e && !seen.has(e.toLowerCase())) {
      seen.add(e.toLowerCase());
      out.push({ email: e, name: null });
    }
  }
  if (o.player_id) {
    const { data: player } = await supabaseAdmin
      .from("players")
      .select("first_name, last_name, email")
      .eq("id", o.player_id)
      .maybeSingle();
    if (player?.email && !seen.has(player.email.toLowerCase())) {
      seen.add(player.email.toLowerCase());
      out.push({ email: player.email, name: `${player.first_name ?? ""} ${player.last_name ?? ""}`.trim() });
    }
    const { data: parents } = await supabaseAdmin
      .from("player_parents")
      .select("email, full_name")
      .eq("player_id", o.player_id);
    for (const p of parents ?? []) {
      if (p.email && !seen.has(p.email.toLowerCase())) {
        seen.add(p.email.toLowerCase());
        out.push({ email: p.email, name: p.full_name ?? null });
      }
    }
    // Guardians (linked users)
    const { data: guardians } = await supabaseAdmin
      .from("player_guardians")
      .select("user_id")
      .eq("player_id", o.player_id);
    for (const g of guardians ?? []) {
      if (!g.user_id) continue;
      const { data } = await supabaseAdmin.auth.admin.getUserById(g.user_id);
      const e = data?.user?.email;
      if (e && !seen.has(e.toLowerCase())) {
        seen.add(e.toLowerCase());
        out.push({ email: e, name: null });
      }
    }
  }
  return out;
}

async function paidCentsForObligation(obligationId: string): Promise<number> {
  const { data } = await supabaseAdmin
    .from("payment_transactions")
    .select("amount_gross_cents")
    .eq("obligation_id", obligationId)
    .eq("status", "succeeded");
  return (data ?? []).reduce((s, t: any) => s + (t.amount_gross_cents ?? 0), 0);
}

export const Route = createFileRoute("/api/public/hooks/payment-reminders")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // Shared cron secret — required to prevent public abuse (mass-email trigger).
        const secret = process.env.DATA_RETENTION_SECRET;
        if (!secret) return new Response("Not configured", { status: 503 });
        const provided =
          request.headers.get("x-cron-secret") ||
          request.headers.get("x-retention-secret");
        if (provided !== secret) return new Response("Forbidden", { status: 403 });

        const today = new Date();
        today.setUTCHours(0, 0, 0, 0);
        const todayMs = today.getTime();
        const baseUrl = process.env.SITE_URL || "https://www.clubero.app";

        // Clubs with reminders enabled
        const { data: clubs, error: clubsErr } = await supabaseAdmin
          .from("club_payment_settings")
          .select("club_id, payment_reminders_enabled, payment_reminder_offsets_days, clubs:club_id(name)")
          .eq("payment_reminders_enabled", true);
        if (clubsErr) {
          return new Response(JSON.stringify({ error: clubsErr.message }), { status: 500 });
        }

        let processed = 0;
        let sent = 0;

        for (const c of (clubs ?? []) as any[]) {
          const offsets: number[] = Array.isArray(c.payment_reminder_offsets_days)
            ? c.payment_reminder_offsets_days
            : [];
          if (offsets.length === 0) continue;
          const clubName = c.clubs?.name ?? "Clubero";

          // Open items with a due_date
          const { data: items } = await supabaseAdmin
            .from("payment_items")
            .select("id, title, due_date, amount_cents, currency, status")
            .eq("club_id", c.club_id)
            .eq("status", "open")
            .not("due_date", "is", null);

          for (const item of (items ?? []) as any[]) {
            const due = new Date(item.due_date + "T00:00:00Z").getTime();
            const diffDays = Math.round((todayMs - due) / 86_400_000);
            // offset semantics: -7 means 7 days BEFORE due. +3 means 3 days AFTER.
            // diffDays === -offset means today is the target.
            const offset = offsets.find((o) => -o === diffDays);
            if (offset === undefined) continue;

            const { data: obligations } = await supabaseAdmin
              .from("payment_obligations")
              .select("id, player_id, payer_user_id, amount_due_cents, status")
              .eq("payment_item_id", item.id)
              .in("status", ["pending", "partial"] as any);

            for (const o of (obligations ?? []) as any[]) {
              processed++;
              const paid = await paidCentsForObligation(o.id);
              const remaining = Math.max(0, o.amount_due_cents - paid);
              if (remaining <= 0) continue;

              const playerName = o.player_id
                ? (async () => {
                    const { data: p } = await supabaseAdmin
                      .from("players")
                      .select("first_name, last_name")
                      .eq("id", o.player_id)
                      .maybeSingle();
                    return p ? `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() : null;
                  })()
                : Promise.resolve(null);

              const [recipients, pname] = await Promise.all([
                recipientsForObligation(o),
                playerName,
              ]);

              for (const r of recipients) {
                // Dedup
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
                    idempotencyKey: `pay-reminder:${o.id}:${offset}:${r.email.toLowerCase()}`,
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
                      offsetDays: offset,
                      payUrl: `${baseUrl}/payments`,
                    },
                  });
                  await supabaseAdmin.from("payment_reminder_log").insert({
                    club_id: c.club_id,
                    obligation_id: o.id,
                    payment_item_id: item.id,
                    offset_days: offset,
                    recipient_email: r.email.toLowerCase(),
                  });
                  sent++;
                } catch (e) {
                  console.error("[payment-reminders] enqueue failed", e);
                }
              }
            }
          }
        }

        return new Response(JSON.stringify({ processed, sent }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
