import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { createLogger } from "@/lib/logger.server";

const log = createLogger("payment-receipt");

const METHOD_LABEL: Record<string, string> = {
  stripe: "Carte (Stripe)",
  helloasso: "HelloAsso",
  cash: "Espèces",
  cheque: "Chèque",
  bank_transfer: "Virement bancaire",
  manual: "Manuel",
};

function fmtAmount(cents: number, currency: string): string {
  return (cents / 100).toFixed(2) + " " + (currency || "eur").toUpperCase();
}

function fmtDate(d: string | Date): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

/**
 * Generate a receipt PDF and upload it to the `payment-receipts` bucket.
 * Returns the storage path written to payment_receipts.pdf_url.
 */
export async function generateReceiptPdf(receiptId: string): Promise<string | null> {
  const { data: r } = await supabaseAdmin
    .from("payment_receipts")
    .select(
      "id, club_id, transaction_id, receipt_number, payer_name, player_name, item_title, amount_gross_cents, currency, method, issued_at, pdf_url",
    )
    .eq("id", receiptId)
    .maybeSingle();
  if (!r) return null;
  if (r.pdf_url) return r.pdf_url;

  const { data: club } = await supabaseAdmin
    .from("clubs")
    .select("name")
    .eq("id", r.club_id)
    .maybeSingle();

  const { data: tx } = await supabaseAdmin
    .from("payment_transactions")
    .select("paid_at, external_reference, stripe_payment_intent_id")
    .eq("id", r.transaction_id)
    .maybeSingle();

  const doc = await PDFDocument.create();
  const page = doc.addPage([595.28, 841.89]); // A4
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const { width, height } = page.getSize();
  const ink = rgb(0.06, 0.09, 0.16);
  const muted = rgb(0.39, 0.45, 0.55);

  let y = height - 60;

  // Header
  page.drawText(club?.name ?? "Club", { x: 50, y, font: bold, size: 18, color: ink });
  page.drawText("Reçu de paiement", {
    x: width - 50 - bold.widthOfTextAtSize("Reçu de paiement", 14),
    y,
    font: bold,
    size: 14,
    color: ink,
  });
  y -= 22;
  const num = `N° ${String(r.receipt_number).padStart(6, "0")}`;
  page.drawText(num, {
    x: width - 50 - font.widthOfTextAtSize(num, 10),
    y,
    font,
    size: 10,
    color: muted,
  });
  const dateText = `Émis le ${fmtDate(r.issued_at)}`;
  page.drawText(dateText, {
    x: 50, y, font, size: 10, color: muted,
  });
  y -= 14;

  y -= 18;
  page.drawLine({
    start: { x: 50, y }, end: { x: width - 50, y },
    thickness: 0.7, color: rgb(0.85, 0.87, 0.91),
  });
  y -= 28;

  // Payer block
  page.drawText("Payeur", { x: 50, y, font: bold, size: 11, color: ink });
  y -= 14;
  page.drawText(r.payer_name ?? "—", { x: 50, y, font, size: 11, color: ink });
  if (r.player_name) {
    y -= 14;
    page.drawText(`Pour : ${r.player_name}`, { x: 50, y, font, size: 11, color: muted });
  }
  y -= 30;

  // Item
  page.drawText("Objet", { x: 50, y, font: bold, size: 11, color: ink });
  y -= 14;
  page.drawText(r.item_title ?? "Paiement", { x: 50, y, font, size: 11, color: ink });
  y -= 30;

  // Amount card
  const cardY = y - 80;
  page.drawRectangle({
    x: 50, y: cardY, width: width - 100, height: 80,
    color: rgb(0.97, 0.98, 0.99),
    borderColor: rgb(0.86, 0.88, 0.92), borderWidth: 1,
  });
  page.drawText("Montant payé", { x: 70, y: cardY + 52, font, size: 10, color: muted });
  page.drawText(fmtAmount(r.amount_gross_cents, r.currency), {
    x: 70, y: cardY + 26, font: bold, size: 22, color: ink,
  });
  const method = METHOD_LABEL[r.method] ?? r.method;
  page.drawText(`Mode : ${method}`, {
    x: width - 70 - font.widthOfTextAtSize(`Mode : ${method}`, 10),
    y: cardY + 52, font, size: 10, color: muted,
  });
  if (tx?.paid_at) {
    const paid = `Réglé le ${fmtDate(tx.paid_at)}`;
    page.drawText(paid, {
      x: width - 70 - font.widthOfTextAtSize(paid, 10),
      y: cardY + 36, font, size: 10, color: muted,
    });
  }
  if (tx?.stripe_payment_intent_id || tx?.external_reference) {
    const ref = `Réf. : ${tx.stripe_payment_intent_id ?? tx.external_reference ?? ""}`;
    page.drawText(ref, {
      x: width - 70 - font.widthOfTextAtSize(ref, 8),
      y: cardY + 20, font, size: 8, color: muted,
    });
  }
  y = cardY - 30;

  // Footer
  page.drawText(
    "Ce reçu atteste du paiement effectué. Il ne tient pas lieu de facture.",
    { x: 50, y: 60, font, size: 9, color: muted },
  );
  page.drawText("Généré par Clubero — clubero.app", {
    x: 50, y: 46, font, size: 9, color: muted,
  });

  const bytes = await doc.save();

  const path = `${r.club_id}/${r.id}.pdf`;
  const { error: upErr } = await supabaseAdmin.storage
    .from("payment-receipts")
    .upload(path, bytes, {
      contentType: "application/pdf",
      upsert: true,
    });
  if (upErr) {
    log.error("Failed to upload receipt PDF", { receiptId, error: upErr.message });
    return null;
  }

  await supabaseAdmin
    .from("payment_receipts")
    .update({ pdf_url: path })
    .eq("id", r.id);

  return path;
}

/** Signed URL (5 minutes) for downloading a stored receipt PDF. */
export async function signedReceiptUrl(path: string): Promise<string | null> {
  const { data, error } = await supabaseAdmin.storage
    .from("payment-receipts")
    .createSignedUrl(path, 300);
  if (error) return null;
  return data?.signedUrl ?? null;
}
