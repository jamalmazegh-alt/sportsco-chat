/**
 * LOT 1 / Phase A — Server functions "Coups de main".
 *
 * Contraintes cadrées :
 *  1) publishEventNeed : audiences résolues en service_role → publication +
 *     recipients + draft→open dans une transaction (via RPC) → dispatch push/email
 *     après commit uniquement. Jamais de notification avant commit.
 *  2) applyToEventNeed : `apply_to_event_need_atomic` verrouille la ligne
 *     event_needs (SELECT FOR UPDATE) → deux clics simultanés sur le dernier
 *     siège ne peuvent pas produire deux 'confirmed'.
 *  3) recompute_event_need_coverage via service_role après commit sur TOUS les
 *     déclencheurs : apply auto-confirmé, decide, withdraw, close, cancel.
 *  4) getEventNeedDetail (payload membre) : places restantes en AGRÉGAT
 *     uniquement — jamais la liste des confirmés / candidats / destinataires
 *     (invariant 2).
 *  5) Mineur → 'applied' même en mode auto (logique côté RPC + test unit dédié).
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { AudienceSpecSchema } from "@/modules/groups/groups.functions";
import { findNeedTemplate } from "./templates";

/* ------------------------------------------------------------------------ */
/* Schemas                                                                  */
/* ------------------------------------------------------------------------ */

const CreateNeedInput = z.object({
  event_id: z.string().uuid(),
  role_key: z.string().min(1).max(80),
  label: z.string().trim().min(1).max(120),
  description: z.string().trim().max(2000).nullish(),
  capacity: z.number().int().min(1).max(200),
  validation_mode: z.enum(["auto", "manual"]),
});

const PublishInput = z.object({
  need_id: z.string().uuid(),
  audiences: AudienceSpecSchema,
});

const ApplyInput = z.object({
  need_id: z.string().uuid(),
  comment: z.string().trim().max(1000).optional(),
});

const DecideInput = z.object({
  signup_id: z.string().uuid(),
  decision: z.enum(["confirm", "decline"]),
});

const WithdrawInput = z.object({
  signup_id: z.string().uuid(),
});

const NeedIdInput = z.object({ need_id: z.string().uuid() });

const GetDetailInput = z.object({ need_id: z.string().uuid() });

/* ------------------------------------------------------------------------ */
/* Helpers                                                                  */
/* ------------------------------------------------------------------------ */

async function loadNeedCore(needId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("event_needs")
    .select("id, event_id, club_id, team_id, status, capacity, validation_mode, label, role_key")
    .eq("id", needId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("need_not_found");
  return data;
}

async function recomputeCoverageServiceRole(eventId: string) {
  // Appelé APRÈS commit, en service_role (bypasse la garde staff/user).
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.rpc("recompute_event_need_coverage", {
    _event_id: eventId,
  });
  if (error) {
    console.error("[needs] recompute_event_need_coverage failed", { eventId, error });
    return null;
  }
  const row = Array.isArray(data) ? data[0] : data;
  return row as {
    is_fully_covered: boolean;
    did_transition: boolean;
    open_needs_count: number;
    missing_seats: number;
  } | null;
}

/* ------------------------------------------------------------------------ */
/* 1. createEventNeed — brouillon (draft)                                   */
/* ------------------------------------------------------------------------ */

export const createEventNeed = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => CreateNeedInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Récup club_id via event.team.club_id (le trigger valide de toute façon).
    const { data: ev, error: evErr } = await supabase
      .from("events")
      .select("id, team_id, teams:team_id(club_id)")
      .eq("id", data.event_id)
      .maybeSingle();
    if (evErr) throw new Error(evErr.message);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const clubId = ((ev as any)?.teams?.club_id as string | null) ?? null;
    if (!clubId) {
      throw new Error("event_needs_require_team_linked_event");
    }

    // Validation soft du role_key (référentiel de templates ; "other" toléré).
    if (!findNeedTemplate(data.role_key) && data.role_key !== "other") {
      // On accepte quand même — les clubs peuvent créer un role_key custom.
    }

    const { data: row, error } = await supabase
      .from("event_needs")
      .insert({
        event_id: data.event_id,
        club_id: clubId,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        team_id: ((ev as any).team_id as string | null) ?? null,
        role_key: data.role_key,
        label: data.label,
        description: data.description ?? null,
        capacity: data.capacity,
        validation_mode: data.validation_mode,
        status: "draft",
        created_by: userId,
      })
      .select("id, event_id, club_id, status, capacity, validation_mode, label, role_key")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

/* ------------------------------------------------------------------------ */
/* 2. publishEventNeed — audiences + publication + open + dispatch          */
/* ------------------------------------------------------------------------ */

export const publishEventNeed = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => PublishInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Défense en profondeur : la RPC re-vérifie is_club_staff sous verrou,
    // mais on refuse tôt côté client pour un message clair.
    const need = await loadNeedCore(data.need_id);
    const { data: isStaff } = await supabase.rpc("is_club_staff", {
      _user_id: userId,
      _club_id: need.club_id,
    });
    if (!isStaff) throw new Error("forbidden");

    // Transaction atomique : verrou event_needs, résolution audiences,
    // audiences/publication/recipients/open en un bloc, idempotence <15 s.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: rpcData, error } = await supabase.rpc("publish_event_need_atomic" as any, {
      _need_id: data.need_id,
      _actor: userId,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      _audiences: data.audiences as any,
    });
    if (error) throw new Error(error.message);
    const row = (Array.isArray(rpcData) ? rpcData[0] : rpcData) as {
      publication_id: string;
      recipients_count: number;
      recipient_user_ids: string[] | null;
      was_idempotent_skip: boolean;
      status: string;
    } | null;
    if (!row) throw new Error("publish_failed");

    // Dispatch UNIQUEMENT si nouvelle publication (idempotence double-tap).
    if (!row.was_idempotent_skip && (row.recipient_user_ids?.length ?? 0) > 0) {
      const { dispatchEventNeedPublication } = await import("./dispatch.server");
      try {
        await dispatchEventNeedPublication({
          needId: data.need_id,
          publicationId: row.publication_id,
          recipientUserIds: row.recipient_user_ids ?? [],
        });
      } catch (e) {
        console.error("[publishEventNeed] dispatch failed", e);
      }
    }

    // Recompute coverage après commit.
    await recomputeCoverageServiceRole(need.event_id);

    return {
      publication_id: row.publication_id,
      recipients_count: row.recipients_count,
      status: row.status,
      was_idempotent_skip: row.was_idempotent_skip,
    };
  });

/* ------------------------------------------------------------------------ */
/* 3. applyToEventNeed — RPC atomique                                       */
/* ------------------------------------------------------------------------ */

export const applyToEventNeed = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => ApplyInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Le RPC vérifie can_apply + verrou de ligne + décision de statut.
    const { data: result, error } = await supabase.rpc("apply_to_event_need_atomic", {
      _need_id: data.need_id,
      _user_id: userId,
      _comment: data.comment ?? undefined,
    });
    if (error) throw new Error(error.message);
    const row = (Array.isArray(result) ? result[0] : result) as {
      signup_id: string;
      status: "applied" | "confirmed";
      auto_confirmed: boolean;
      is_minor: boolean;
    } | null;
    if (!row) throw new Error("apply_failed");

    // Recompute + dispatch après commit du RPC.
    const need = await loadNeedCore(data.need_id);
    if (row.auto_confirmed) {
      await recomputeCoverageServiceRole(need.event_id);
    }
    // Notification staff (candidature reçue) — awaité pour éviter la
    // terminaison prématurée du Worker (les promesses orphelines peuvent être
    // tuées quand la réponse part). Erreur non bloquante pour l'apply.
    try {
      const { notifyStaffOfSignup } = await import("./dispatch.server");
      await notifyStaffOfSignup({
        needId: data.need_id,
        signupId: row.signup_id,
        status: row.status,
        applicantUserId: userId,
      });
    } catch (e) {
      console.error("[applyToEventNeed] notify failed", e);
    }

    return row;
  });

/* ------------------------------------------------------------------------ */
/* 4. decideSignup — staff confirme / décline une candidature 'applied'      */
/* ------------------------------------------------------------------------ */

export const decideSignup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => DecideInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Transaction atomique : verrou event_needs, staff-check, capacity-check
    // sous verrou → deux staff confirmant simultanément la dernière place ne
    // peuvent pas produire deux 'confirmed'.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: rpcData, error } = await supabase.rpc("decide_signup_atomic" as any, {
      _signup_id: data.signup_id,
      _actor: userId,
      _decision: data.decision,
    });
    if (error) throw new Error(error.message);
    const row = (Array.isArray(rpcData) ? rpcData[0] : rpcData) as {
      signup_id: string;
      need_id: string;
      event_id: string;
      applicant_user_id: string;
      new_status: "confirmed" | "declined";
    } | null;
    if (!row) throw new Error("decide_failed");

    await recomputeCoverageServiceRole(row.event_id);

    // Notification au candidat (décision reçue) — awaitée.
    try {
      const { notifyApplicantOfDecision } = await import("./dispatch.server");
      await notifyApplicantOfDecision({
        needId: row.need_id,
        signupId: row.signup_id,
        decision: data.decision,
        applicantUserId: row.applicant_user_id,
      });
    } catch (e) {
      console.error("[decideSignup] notify failed", e);
    }

    return { ok: true, status: row.new_status };
  });

/* ------------------------------------------------------------------------ */
/* 5. withdrawSignup — le candidat retire sa propre candidature             */
/* ------------------------------------------------------------------------ */

export const withdrawSignup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => WithdrawInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // RLS owner_update autorise uniquement le propriétaire.
    const { data: signup, error: sErr } = await supabase
      .from("event_need_signups")
      .select("id, need_id, user_id, status, event_needs:need_id(event_id)")
      .eq("id", data.signup_id)
      .maybeSingle();
    if (sErr) throw new Error(sErr.message);
    if (!signup || signup.user_id !== userId) throw new Error("forbidden");
    if (signup.status === "withdrawn") return { ok: true };

    const { error: upErr } = await supabase
      .from("event_need_signups")
      .update({
        status: "withdrawn",
        withdrawn_at: new Date().toISOString(),
      })
      .eq("id", data.signup_id);
    if (upErr) throw new Error(upErr.message);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const eventId = ((signup as any).event_needs?.event_id as string | undefined) ?? null;
    if (eventId) await recomputeCoverageServiceRole(eventId);

    return { ok: true };
  });

/* ------------------------------------------------------------------------ */
/* 6. closeEventNeed / cancelEventNeed                                      */
/* ------------------------------------------------------------------------ */

export const closeEventNeed = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => NeedIdInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const need = await loadNeedCore(data.need_id);
    const { data: isStaff } = await supabase.rpc("is_club_staff", {
      _user_id: userId,
      _club_id: need.club_id,
    });
    if (!isStaff) throw new Error("forbidden");

    const { error } = await supabase
      .from("event_needs")
      .update({ status: "closed" })
      .eq("id", data.need_id);
    if (error) throw new Error(error.message);

    await recomputeCoverageServiceRole(need.event_id);
    return { ok: true };
  });

export const cancelEventNeed = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => NeedIdInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const need = await loadNeedCore(data.need_id);
    const { data: isStaff } = await supabase.rpc("is_club_staff", {
      _user_id: userId,
      _club_id: need.club_id,
    });
    if (!isStaff) throw new Error("forbidden");

    const { error } = await supabase
      .from("event_needs")
      .update({ status: "cancelled" })
      .eq("id", data.need_id);
    if (error) throw new Error(error.message);

    await recomputeCoverageServiceRole(need.event_id);

    // Notifier les signups actifs de l'annulation — awaité (Cloudflare Workers
    // peut tuer une promesse orpheline après la réponse).
    try {
      const { notifyNeedCancelled } = await import("./dispatch.server");
      await notifyNeedCancelled({ needId: data.need_id });
    } catch (e) {
      console.error("[cancelEventNeed] notify failed", e);
    }

    return { ok: true };
  });

/* ------------------------------------------------------------------------ */
/* 7. getEventNeedDetail — payload MEMBRE : agrégat seul, aucune liste      */
/* ------------------------------------------------------------------------ */

/**
 * Payload minimal pour un membre destinataire :
 *  - label / description / capacity / status
 *  - remaining_seats : AGRÉGAT (INT). Jamais de liste de confirmés,
 *    ni de candidats, ni de destinataires (invariant 2).
 *  - my_signup : la ligne de l'appelant s'il a déjà candidaté (owner_read RLS).
 *
 * Staff : peut appeler la même fn ; on renvoie en plus `is_staff_view=true`
 * pour signaler à l'UI qu'elle peut charger la liste détaillée via une
 * autre fn (à ajouter Phase B côté staff). Aucune donnée nominative
 * supplémentaire n'est retournée ici, même pour le staff.
 */
export const getEventNeedDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => GetDetailInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // RLS event_needs_recipient_read + event_needs_staff_all filtrent.
    const { data: need, error } = await supabase
      .from("event_needs")
      .select(
        "id, event_id, club_id, team_id, role_key, label, description, capacity, validation_mode, status, last_published_at",
      )
      .eq("id", data.need_id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!need) throw new Error("need_not_found_or_forbidden");

    // Agrégat des sièges (service_role — le membre standard ne peut pas
    // compter en direct sur event_need_signups d'autres users).
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { count: confirmedCount } = await supabaseAdmin
      .from("event_need_signups")
      .select("*", { count: "exact", head: true })
      .eq("need_id", need.id)
      .eq("status", "confirmed");
    const remaining = Math.max(need.capacity - (confirmedCount ?? 0), 0);

    // La propre candidature de l'appelant (via son user_id).
    const { data: mySignup } = await supabase
      .from("event_need_signups")
      .select("id, status, comment, applied_at, confirmed_at, withdrawn_at, declined_at")
      .eq("need_id", need.id)
      .eq("user_id", userId)
      .maybeSingle();

    const { data: isStaff } = await supabase.rpc("is_club_staff", {
      _user_id: userId,
      _club_id: need.club_id,
    });

    return {
      need: {
        id: need.id,
        event_id: need.event_id,
        role_key: need.role_key,
        label: need.label,
        description: need.description,
        capacity: need.capacity,
        validation_mode: need.validation_mode,
        status: need.status,
        last_published_at: need.last_published_at,
      },
      remaining_seats: remaining, // INT, agrégat seul. Jamais de liste.
      my_signup: mySignup ?? null,
      is_staff_view: Boolean(isStaff),
    };
  });
