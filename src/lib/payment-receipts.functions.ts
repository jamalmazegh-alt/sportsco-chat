import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { generateReceiptPdf, signedReceiptUrl } from "@/lib/payment-receipt.server";

async function isAuthorizedForReceipt(
  receiptId: string,
  userId: string,
): Promise<boolean> {
  const { data: r } = await supabaseAdmin
    .from("payment_receipts")
    .select("club_id, obligation_id")
    .eq("id", receiptId)
    .maybeSingle();
  if (!r) return false;

  // Financial admin / admin of the club
  const { data: isFin } = await supabaseAdmin.rpc("has_club_role_text", {
    _user_id: userId,
    _club_id: r.club_id,
    _role: "financial_admin",
  });
  if (isFin === true) return true;

  // Payer or guardian
  const { data: obl } = await supabaseAdmin
    .from("payment_obligations")
    .select("payer_user_id, player_id")
    .eq("id", r.obligation_id)
    .maybeSingle();
  if (!obl) return false;
  if (obl.payer_user_id === userId) return true;
  if (obl.player_id) {
    const { data: g } = await supabaseAdmin
      .from("player_guardians")
      .select("id")
      .eq("player_id", obl.player_id)
      .eq("user_id", userId)
      .maybeSingle();
    if (g) return true;
  }
  return false;
}

export const getReceiptDownloadUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ receiptId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const ok = await isAuthorizedForReceipt(data.receiptId, context.userId);
    if (!ok) throw new Error("Not authorized to download this receipt");

    // Lazily generate the PDF if it has not been produced yet
    let { data: r } = await supabaseAdmin
      .from("payment_receipts")
      .select("pdf_url")
      .eq("id", data.receiptId)
      .single();
    if (!r?.pdf_url) {
      const path = await generateReceiptPdf(data.receiptId);
      if (!path) throw new Error("Failed to generate receipt PDF");
      r = { pdf_url: path };
    }
    const url = r.pdf_url ? await signedReceiptUrl(r.pdf_url) : null;
    if (!url) throw new Error("Failed to sign receipt URL");
    return { url };
  });

export const listMyReceipts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({}).parse(input ?? {}))
  .handler(async ({ context }) => {
    const userId = context.userId;
    const { data: guard } = await supabaseAdmin
      .from("player_guardians")
      .select("player_id")
      .eq("user_id", userId);
    const playerIds = (guard ?? []).map((g) => g.player_id);

    // Fetch receipts via obligations the user owns or guards
    const { data: obls } = await supabaseAdmin
      .from("payment_obligations")
      .select("id")
      .or(
        `payer_user_id.eq.${userId}${playerIds.length ? `,player_id.in.(${playerIds.join(",")})` : ""}`,
      );
    const oblIds = (obls ?? []).map((o) => o.id);
    if (oblIds.length === 0) return { receipts: [] };

    const { data: receipts } = await supabaseAdmin
      .from("payment_receipts")
      .select(
        "id, receipt_number, item_title, player_name, amount_gross_cents, currency, method, issued_at",
      )
      .in("obligation_id", oblIds)
      .order("issued_at", { ascending: false });

    return { receipts: receipts ?? [] };
  });
