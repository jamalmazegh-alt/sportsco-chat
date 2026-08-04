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
import { getRequest } from "@tanstack/react-start/server";
import { enqueueTransactionalEmailServer } from "@/lib/email/send.server";
import { resolveEmailLocale } from "@/lib/email/locale";

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

export type DossierStatus =
  | "complete"
  | "payment_missing"
  | "documents_pending"
  | "documents_missing";

export interface CampRegistrationRow {
  id: string;
  camp_id: string;
  access_token: string;
  participant_first_name: string;
  participant_last_name: string;
  birth_date: string;
  gender: string | null;
  club_name: string | null;
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
  pending: number,
  campHasPrice: boolean,
): DossierStatus {
  const missing = Math.max(0, required - approved - rejected - pending);
  if (missing > 0 || rejected > 0) return "documents_missing";
  if (pending > 0) return "documents_pending";
  const paymentOk = paymentStatus === "paid" || paymentStatus === "not_required" || !campHasPrice;
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
         birth_date, gender, club_name, guardian_first_name, guardian_last_name, guardian_email,
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
      const pendingByReq = new Set<string>();
      const seen = new Set<string>();
      for (const d of docs) {
        seen.add(d.required_document_id);
        if (d.review_status === "approved") approvedByReq.add(d.required_document_id);
        else if (d.review_status === "rejected") rejectedByReq.add(d.required_document_id);
        else if (d.review_status === "pending") pendingByReq.add(d.required_document_id);
      }
      const approvedCount = approvedByReq.size;
      // Rejeté "actif" = rejeté et pas ré-uploadé (approved n'est pas venu remplacer)
      let rejectedCount = 0;
      rejectedByReq.forEach((id) => {
        if (!approvedByReq.has(id)) rejectedCount++;
      });
      // Pending "actif" = en attente et pas déjà approuvé/rejeté effectivement
      let pendingCount = 0;
      pendingByReq.forEach((id) => {
        if (!approvedByReq.has(id) && !rejectedByReq.has(id)) pendingCount++;
      });
      const missing = Math.max(0, required - approvedCount - rejectedCount - pendingCount);
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
        gender: r.gender ?? null,
        club_name: r.club_name ?? null,
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
          pendingCount,
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
    const { data: stats, error } = await supabaseAdmin.rpc("get_camp_registration_stats" as any, {
      _camp_id: data.campId,
    });
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

// ---------------------------------------------------------------------------
// Étape 2 — Fiche d'inscription
// ---------------------------------------------------------------------------

export type DocReviewStatus = "pending" | "approved" | "rejected";

export interface RegistrationDocumentDetail {
  id: string;
  required_document_id: string;
  title: string;
  is_sensitive: boolean;
  document_type: string | null;
  review_status: DocReviewStatus;
  rejection_reason: string | null;
  uploaded_at: string;
  file_path: string;
  file_name: string;
  /** true if current viewer is allowed to fetch a signed URL for this file */
  viewer_can_view: boolean;
}

export interface RegistrationDetail {
  id: string;
  camp_id: string;
  access_token: string;
  participant_first_name: string;
  participant_last_name: string;
  birth_date: string;
  gender: string | null;
  club_name: string | null;
  guardian_first_name: string;
  guardian_last_name: string;
  guardian_email: string;
  guardian_phone: string | null;
  notes: string | null;
  registration_status: RegistrationStatus;
  payment_status: PaymentStatus;
  amount_paid: number;
  reserved_until: string | null;
  rejection_reason: string | null;
  created_at: string;
  updated_at: string;
  documents: RegistrationDocumentDetail[];
  /** aggregated stats to help the UI decide capacity */
  stats: CampRegistrationStats;
  viewer_role: "admin" | "dirigeant" | "coach";
  camp_price: number;
  camp_currency: string;
}

async function getViewerClubRole(
  supabase: any,
  userId: string,
  clubId: string,
): Promise<"admin" | "dirigeant" | "coach"> {
  // super admin treated as admin
  const { data: sa } = await supabaseAdmin
    .from("super_admins")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (sa) return "admin";
  const { data } = await supabase
    .from("club_members")
    .select("roles, role")
    .eq("club_id", clubId)
    .eq("user_id", userId)
    .maybeSingle();
  const roles = new Set<string>([
    ...((data?.roles as string[] | null) ?? []),
    ...(data?.role ? [data.role as string] : []),
  ]);
  if (roles.has("admin")) return "admin";
  if (roles.has("dirigeant")) return "dirigeant";
  return "coach";
}

async function loadRegistrationAndClub(registrationId: string) {
  const { data, error } = await supabaseAdmin
    .from("club_camp_registrations")
    .select(
      "*, club_camps!inner(club_id, capacity, price, currency, title, start_date, end_date, document_retention_months)",
    )
    .eq("id", registrationId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("NOT_FOUND");
  return data as any;
}

const DetailInput = z.object({ registrationId: z.string().uuid() });

export const getCampRegistrationDetail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => DetailInput.parse(input))
  .handler(async ({ data, context }): Promise<RegistrationDetail> => {
    const reg = await loadRegistrationAndClub(data.registrationId);
    const clubId = reg.club_camps.club_id as string;
    await assertClubRole({
      supabase: context.supabase,
      userId: context.userId,
      clubId,
      allowedRoles: MANAGER_ROLES,
    });
    const viewerRole = await getViewerClubRole(context.supabase, context.userId, clubId);
    const canSeeSensitive = viewerRole === "admin" || viewerRole === "dirigeant";

    const [{ data: docs, error: docsErr }, { data: stats, error: statsErr }] = await Promise.all([
      supabaseAdmin
        .from("club_camp_registration_documents")
        .select(
          `id, required_document_id, review_status, rejection_reason, uploaded_at, file_path,
           club_camp_required_documents!inner ( title, is_sensitive, document_type )`,
        )
        .eq("registration_id", data.registrationId)
        .order("uploaded_at", { ascending: true }),
      supabaseAdmin.rpc("get_camp_registration_stats" as any, { _camp_id: reg.camp_id }),
    ]);
    if (docsErr) throw new Error(docsErr.message);
    if (statsErr) throw new Error(statsErr.message);

    const documents: RegistrationDocumentDetail[] = (docs ?? []).map((d: any) => {
      const rd = d.club_camp_required_documents;
      const isSensitive = !!rd?.is_sensitive;
      return {
        id: d.id,
        required_document_id: d.required_document_id,
        title: rd?.title ?? "",
        is_sensitive: isSensitive,
        document_type: rd?.document_type ?? null,
        review_status: d.review_status as DocReviewStatus,
        rejection_reason: d.rejection_reason,
        uploaded_at: d.uploaded_at,
        file_path: d.file_path,
        file_name: (d.file_path as string).split("/").pop() ?? "document",
        viewer_can_view: !isSensitive || canSeeSensitive,
      };
    });

    return {
      id: reg.id,
      camp_id: reg.camp_id,
      access_token: reg.access_token,
      participant_first_name: reg.participant_first_name,
      participant_last_name: reg.participant_last_name,
      birth_date: reg.birth_date,
      gender: reg.gender,
      club_name: reg.club_name,
      guardian_first_name: reg.guardian_first_name,
      guardian_last_name: reg.guardian_last_name,
      guardian_email: reg.guardian_email,
      guardian_phone: reg.guardian_phone,
      notes: reg.notes,
      registration_status: reg.registration_status as RegistrationStatus,
      payment_status: reg.payment_status as PaymentStatus,
      amount_paid: Number(reg.amount_paid ?? 0),
      reserved_until: reg.reserved_until,
      rejection_reason: reg.rejection_reason,
      created_at: reg.created_at,
      updated_at: reg.updated_at,
      documents,
      stats: (stats ?? {
        capacity: 0,
        approved: 0,
        reserved: 0,
        pending: 0,
        waitlist: 0,
        expired_reservations: 0,
        remaining: 0,
      }) as CampRegistrationStats,
      viewer_role: viewerRole,
      camp_price: Number(reg.club_camps?.price ?? 0),
      camp_currency: (reg.club_camps?.currency as string) ?? "EUR",
    };
  });

// ---------------------------------------------------------------------------
// setCampRegistrationStatus — transitions + reserved_until + capacity guard
// ---------------------------------------------------------------------------

const SetStatusInput = z.object({
  registrationId: z.string().uuid(),
  status: z.enum(["pending", "under_review", "approved", "waitlist", "rejected", "cancelled"]),
  reason: z.string().trim().max(1000).optional(),
});

export const setCampRegistrationStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => SetStatusInput.parse(input))
  .handler(
    async ({
      data,
      context,
    }): Promise<{
      registration_status: RegistrationStatus;
      reserved_until: string | null;
      rejection_reason: string | null;
    }> => {
      const reg = await loadRegistrationAndClub(data.registrationId);
      const clubId = reg.club_camps.club_id as string;
      await assertClubRole({
        supabase: context.supabase,
        userId: context.userId,
        clubId,
        allowedRoles: MANAGER_ROLES,
      });

      const current = reg.registration_status as RegistrationStatus;
      const next = data.status;

      if (current === next) {
        return {
          registration_status: current,
          reserved_until: reg.reserved_until,
          rejection_reason: reg.rejection_reason,
        };
      }

      // Rejection requires a reason
      if (next === "rejected" && !(data.reason && data.reason.trim().length > 0)) {
        throw new Error("REASON_REQUIRED");
      }

      // Capacity guard when moving to `approved`
      if (next === "approved") {
        const { data: stats, error: sErr } = await supabaseAdmin.rpc(
          "get_camp_registration_stats" as any,
          { _camp_id: reg.camp_id },
        );
        if (sErr) throw new Error(sErr.message);
        const s = (stats ?? { remaining: 0 }) as CampRegistrationStats;
        const alreadyApproved = current === "approved";
        if (!alreadyApproved && s.remaining <= 0) {
          // Signal the UI; it will propose waitlist.
          const err = new Error("CAPACITY_FULL");
          (err as any).code = "CAPACITY_FULL";
          throw err;
        }
      }

      const patch: any = {
        registration_status: next,
        updated_at: new Date().toISOString(),
      };

      if (next === "under_review") {
        patch.reserved_until = new Date(Date.now() + 72 * 3600 * 1000).toISOString();
      } else if (next === "approved" || next === "waitlist" || next === "cancelled") {
        patch.reserved_until = null;
      }

      if (next === "rejected") {
        patch.rejection_reason = data.reason!.trim();
      } else if (current === "rejected") {
        // Clear stale reason when leaving rejected state
        patch.rejection_reason = null;
      }

      const { data: updated, error } = await supabaseAdmin
        .from("club_camp_registrations")
        .update(patch)
        .eq("id", data.registrationId)
        .select("registration_status, reserved_until, rejection_reason")
        .maybeSingle();
      if (error) throw new Error(error.message);
      return {
        registration_status: (updated?.registration_status ?? next) as RegistrationStatus,
        reserved_until: (updated?.reserved_until as string | null) ?? null,
        rejection_reason: (updated?.rejection_reason as string | null) ?? null,
      };
    },
  );

// ---------------------------------------------------------------------------
// setCampRegistrationPayment — mark as paid / pending / refunded (manuel)
// ---------------------------------------------------------------------------

const SetPaymentInput = z.object({
  registrationId: z.string().uuid(),
  status: z.enum(["not_required", "pending", "declared", "paid", "partial", "refunded"]),
  amount: z.number().min(0).optional(),
});

export const setCampRegistrationPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => SetPaymentInput.parse(input))
  .handler(
    async ({ data, context }): Promise<{ payment_status: PaymentStatus; amount_paid: number }> => {
      const reg = await loadRegistrationAndClub(data.registrationId);
      const clubId = reg.club_camps.club_id as string;
      await assertClubRole({
        supabase: context.supabase,
        userId: context.userId,
        clubId,
        allowedRoles: MANAGER_ROLES,
      });

      const campPrice = Number(reg.club_camps?.price ?? 0);
      const patch: any = {
        payment_status: data.status,
        updated_at: new Date().toISOString(),
      };
      if (data.amount !== undefined) {
        patch.amount_paid = data.amount;
      } else if (data.status === "paid") {
        patch.amount_paid = campPrice;
      } else if (data.status === "pending" || data.status === "not_required") {
        patch.amount_paid = 0;
      }

      const { data: updated, error } = await supabaseAdmin
        .from("club_camp_registrations")
        .update(patch)
        .eq("id", data.registrationId)
        .select("payment_status, amount_paid")
        .maybeSingle();
      if (error) throw new Error(error.message);
      return {
        payment_status: (updated?.payment_status ?? data.status) as PaymentStatus,
        amount_paid: Number(updated?.amount_paid ?? 0),
      };
    },
  );

// ---------------------------------------------------------------------------
// reviewCampRegistrationDocument — approve / reject a single uploaded file
// ---------------------------------------------------------------------------

const ReviewDocInput = z.object({
  documentId: z.string().uuid(),
  status: z.enum(["approved", "rejected", "pending"]),
  reason: z.string().trim().max(1000).optional(),
});

export const reviewCampRegistrationDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ReviewDocInput.parse(input))
  .handler(
    async ({
      data,
      context,
    }): Promise<{
      id: string;
      review_status: DocReviewStatus;
      rejection_reason: string | null;
    }> => {
      const { data: doc, error: dErr } = await supabaseAdmin
        .from("club_camp_registration_documents")
        .select(
          `id, registration_id, required_document_id,
           club_camp_required_documents!inner ( title ),
           club_camp_registrations!inner (
             access_token, guardian_email, guardian_first_name,
             participant_first_name, participant_last_name,
             camp_id,
             club_camps!inner ( club_id, title, slug, clubs!inner ( name, slug, default_language ) )
           )`,
        )
        .eq("id", data.documentId)
        .maybeSingle();
      if (dErr) throw new Error(dErr.message);
      if (!doc) throw new Error("NOT_FOUND");
      const reg = (doc as any).club_camp_registrations;
      const camp = reg.club_camps;
      const club = camp.clubs;
      const clubId = camp.club_id as string;
      await assertClubRole({
        supabase: context.supabase,
        userId: context.userId,
        clubId,
        allowedRoles: MANAGER_ROLES,
      });

      if (data.status === "rejected" && !(data.reason && data.reason.trim().length > 0)) {
        throw new Error("REASON_REQUIRED");
      }

      const patch: any = {
        review_status: data.status,
        rejection_reason: data.status === "rejected" ? data.reason!.trim() : null,
      };

      const { data: updated, error } = await supabaseAdmin
        .from("club_camp_registration_documents")
        .update(patch)
        .eq("id", data.documentId)
        .select("id, review_status, rejection_reason")
        .maybeSingle();
      if (error) throw new Error(error.message);

      // Notify guardian on rejection (idempotent per doc+reason)
      if (data.status === "rejected" && reg.guardian_email) {
        try {
          let origin = "https://clubero.app";
          try {
            const req = getRequest();
            const h = req.headers.get("origin") || req.headers.get("referer");
            if (h) origin = new URL(h).origin;
          } catch {
            // fallback ok
          }
          const trackingUrl = `${origin}/stages/${club.slug}/${camp.slug}/suivi/${reg.access_token}`;
          const reasonHash = data
            .reason!.trim()
            .slice(0, 40)
            .replace(/[^a-z0-9]/gi, "-");
          await enqueueTransactionalEmailServer({
            templateName: "camp-document-rejected",
            recipientEmail: reg.guardian_email,
            templateData: {
              guardianFirstName: reg.guardian_first_name,
              participantName: `${reg.participant_first_name} ${reg.participant_last_name}`,
              campTitle: camp.title,
              clubName: club.name,
              documentLabel: (doc as any).club_camp_required_documents.title,
              rejectionReason: data.reason!.trim(),
              trackingUrl,
              locale: resolveEmailLocale(club.default_language),
            },
            idempotencyKey: `camp-doc-rejected:${data.documentId}:${reasonHash}`,
          });
        } catch (e) {
          console.error("[camp-document-rejected] email failed", e);
        }
      }

      return {
        id: updated!.id as string,
        review_status: updated!.review_status as DocReviewStatus,
        rejection_reason: (updated!.rejection_reason as string | null) ?? null,
      };
    },
  );

// ---------------------------------------------------------------------------
// getRegistrationDocumentSignedUrl — admin/dirigeant only for sensitive files
// ---------------------------------------------------------------------------

const SignedUrlInput = z.object({ documentId: z.string().uuid() });

export const getRegistrationDocumentSignedUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => SignedUrlInput.parse(input))
  .handler(async ({ data, context }): Promise<{ url: string; expiresIn: number }> => {
    const { data: doc, error: dErr } = await supabaseAdmin
      .from("club_camp_registration_documents")
      .select(
        `id, file_path, registration_id,
         club_camp_required_documents!inner ( is_sensitive ),
         club_camp_registrations!inner ( camp_id, club_camps!inner ( club_id ) )`,
      )
      .eq("id", data.documentId)
      .maybeSingle();
    if (dErr) throw new Error(dErr.message);
    if (!doc) throw new Error("NOT_FOUND");
    const clubId = (doc as any).club_camp_registrations.club_camps.club_id as string;
    const isSensitive = !!(doc as any).club_camp_required_documents.is_sensitive;

    await assertClubRole({
      supabase: context.supabase,
      userId: context.userId,
      clubId,
      allowedRoles: isSensitive ? ["admin", "dirigeant"] : MANAGER_ROLES,
    });

    const { data: signed, error } = await supabaseAdmin.storage
      .from("camp-registration-documents")
      .createSignedUrl((doc as any).file_path as string, 600);
    if (error || !signed?.signedUrl) throw new Error("SIGN_FAILED");
    return { url: signed.signedUrl, expiresIn: 600 };
  });
