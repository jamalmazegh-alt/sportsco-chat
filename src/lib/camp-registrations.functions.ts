/**
 * Server functions for camp registrations (Phase 3 — back-office).
 *
 * Reads: manager roles (admin | dirigeant | coach) via assertClubRole.
 * `is_sensitive` file access is enforced in Étape 2 (signed URLs).
 * Étape 1 exposes only counts + statuses for the tableau.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertClubRole, type ClubRole } from "@/lib/authz.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const MANAGER_ROLES: ClubRole[] = ["admin", "dirigeant", "coach"];

export type RegistrationStatus =
  | "pending"
  | "under_review"
  | "approved"
  | "waitlist"
  | "rejected"
  | "cancelled";

export type PaymentStatus =
  | "not_required"
  | "pending"
  | "declared"
  | "paid"
  | "partial"
  | "refunded";

export type DossierStatus = "complete" | "payment_missing" | "documents_missing";

export interface CampRegistrationRow {
  id: string;
  camp_id: string;
  access_token: string;
  participant_first_name: string;
  participant_last_name: string;
  birth_date: string;
  guardian_first_name: string;
  guardian_last_name: string;
  guardian_email: string;
  guardian_phone: string | null;
  registration_status: RegistrationStatus;
  payment_status: PaymentStatus;
  amount_paid: number;
  reserved_until: string | null;
  reservation_expired: boolean;
  created_at: string;
  updated_at: string;
  /** Computed dossier status (jamais stocké) */
  dossier_status: DossierStatus;
  /** Détail documents pour la ligne */
  required_total: number;
  documents_approved: number;
  documents_rejected: number;
  documents_missing: number;
}

export interface CampRegistrationStats {
  capacity: number;
  approved: number;
  reserved: number;
  pending: number;
  waitlist: number;
  expired_reservations: number;
  remaining: number;
}

async function loadCampClubId(campId: string): Promise<string> {
  const { data, error } = await supabaseAdmin
    .from("club_camps")
    .select("club_id, price")
    .eq("id", campId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("NOT_FOUND");
  return data.club_id as string;
}

function computeDossierStatus(
  paymentStatus: PaymentStatus,
  required: number,
  approved: number,
  rejected: number,
  campHasPrice: boolean,
): DossierStatus {
  const documentsOk = required === 0 || (approved >= required && rejected === 0);
  if (!documentsOk) return "documents_missing";
  const paymentOk =
    paymentStatus === "paid" || paymentStatus === "not_required" || !campHasPrice;
  if (paymentOk) return "complete";
  return "payment_missing";
}

// ---------------------------------------------------------------------------
// listCampRegistrations
// ---------------------------------------------------------------------------

const ListInput = z.object({ campId: z.string().uuid() });

export const listCampRegistrations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ListInput.parse(input))
  .handler(async ({ data, context }): Promise<CampRegistrationRow[]> => {
    const clubId = await loadCampClubId(data.campId);
    await assertClubRole({
      supabase: context.supabase,
      userId: context.userId,
      clubId,
      allowedRoles: MANAGER_ROLES,
    });

    const { data: camp, error: campErr } = await supabaseAdmin
      .from("club_camps")
      .select("price")
      .eq("id", data.campId)
      .maybeSingle();
    if (campErr) throw new Error(campErr.message);
    const campHasPrice = !!(camp && camp.price != null && Number(camp.price) > 0);

    // Nombre de documents required par stage
    const { count: requiredTotal, error: reqErr } = await supabaseAdmin
      .from("club_camp_required_documents")
      .select("id", { count: "exact", head: true })
      .eq("camp_id", data.campId)
      .eq("required", true);
    if (reqErr) throw new Error(reqErr.message);
    const required = requiredTotal ?? 0;

    const { data: rows, error } = await supabaseAdmin
      .from("club_camp_registrations")
      .select(
        `id, camp_id, access_token, participant_first_name, participant_last_name,
         birth_date, guardian_first_name, guardian_last_name, guardian_email,
         guardian_phone, registration_status, payment_status, amount_paid,
         reserved_until, created_at, updated_at,
         club_camp_registration_documents ( id, required_document_id, review_status )`,
      )
      .eq("camp_id", data.campId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);

    const now = Date.now();
    return (rows ?? []).map((r: any): CampRegistrationRow => {
      const docs = (r.club_camp_registration_documents ?? []) as Array<{
        required_document_id: string;
        review_status: "pending" | "approved" | "rejected";
      }>;
      // Une pièce required est "approuvée" si au moins une soumission approuvée existe.
      const approvedByReq = new Set<string>();
      const rejectedByReq = new Set<string>();
      const seen = new Set<string>();
      for (const d of docs) {
        seen.add(d.required_document_id);
        if (d.review_status === "approved") approvedByReq.add(d.required_document_id);
        else if (d.review_status === "rejected") rejectedByReq.add(d.required_document_id);
      }
      const approvedCount = approvedByReq.size;
      // Rejeté "actif" = rejeté et pas ré-uploadé (approved n'est pas venu remplacer)
      let rejectedCount = 0;
      rejectedByReq.forEach((id) => {
        if (!approvedByReq.has(id)) rejectedCount++;
      });
      const missing = Math.max(0, required - approvedCount - rejectedCount);
      const reservedUntilTs = r.reserved_until ? new Date(r.reserved_until).getTime() : null;
      const reservationExpired =
        r.registration_status === "under_review" &&
        reservedUntilTs !== null &&
        reservedUntilTs <= now;

      return {
        id: r.id,
        camp_id: r.camp_id,
        access_token: r.access_token,
        participant_first_name: r.participant_first_name,
        participant_last_name: r.participant_last_name,
        birth_date: r.birth_date,
        guardian_first_name: r.guardian_first_name,
        guardian_last_name: r.guardian_last_name,
        guardian_email: r.guardian_email,
        guardian_phone: r.guardian_phone,
        registration_status: r.registration_status,
        payment_status: r.payment_status,
        amount_paid: Number(r.amount_paid ?? 0),
        reserved_until: r.reserved_until,
        reservation_expired: reservationExpired,
        created_at: r.created_at,
        updated_at: r.updated_at,
        dossier_status: computeDossierStatus(
          r.payment_status,
          required,
          approvedCount,
          rejectedCount,
          campHasPrice,
        ),
        required_total: required,
        documents_approved: approvedCount,
        documents_rejected: rejectedCount,
        documents_missing: missing,
      };
    });
  });

// ---------------------------------------------------------------------------
// getCampRegistrationStats
// ---------------------------------------------------------------------------

const StatsInput = z.object({ campId: z.string().uuid() });

export const getCampRegistrationStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => StatsInput.parse(input))
  .handler(async ({ data, context }): Promise<CampRegistrationStats> => {
    const clubId = await loadCampClubId(data.campId);
    await assertClubRole({
      supabase: context.supabase,
      userId: context.userId,
      clubId,
      allowedRoles: MANAGER_ROLES,
    });
    const { data: stats, error } = await supabaseAdmin.rpc(
      "get_camp_registration_stats" as any,
      { _camp_id: data.campId },
    );
    if (error) throw new Error(error.message);
    return (stats ?? {
      capacity: 0,
      approved: 0,
      reserved: 0,
      pending: 0,
      waitlist: 0,
      expired_reservations: 0,
      remaining: 0,
    }) as CampRegistrationStats;
  });

// ---------------------------------------------------------------------------
// extendCampReservation — remet reserved_until à now + 72h
// ---------------------------------------------------------------------------

const ExtendInput = z.object({ registrationId: z.string().uuid() });

export const extendCampReservation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ExtendInput.parse(input))
  .handler(async ({ data, context }): Promise<{ reserved_until: string }> => {
    const { data: reg, error: regErr } = await supabaseAdmin
      .from("club_camp_registrations")
      .select("id, camp_id, registration_status")
      .eq("id", data.registrationId)
      .maybeSingle();
    if (regErr) throw new Error(regErr.message);
    if (!reg) throw new Error("NOT_FOUND");
    if (reg.registration_status !== "under_review") throw new Error("NOT_UNDER_REVIEW");

    const clubId = await loadCampClubId(reg.camp_id);
    await assertClubRole({
      supabase: context.supabase,
      userId: context.userId,
      clubId,
      allowedRoles: MANAGER_ROLES,
    });

    const next = new Date(Date.now() + 72 * 3600 * 1000).toISOString();
    const { error } = await supabaseAdmin
      .from("club_camp_registrations")
      .update({ reserved_until: next, updated_at: new Date().toISOString() })
      .eq("id", data.registrationId);
    if (error) throw new Error(error.message);
    return { reserved_until: next };
  });
