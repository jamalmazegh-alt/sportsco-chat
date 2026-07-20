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
import { projectConfirmedSignups } from "./confirmed-signups-visibility";

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

const UpdateNeedInput = z.object({
  need_id: z.string().uuid(),
  role_key: z.string().min(1).max(80).optional(),
  label: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().max(2000).nullish(),
  capacity: z.number().int().min(1).max(200).optional(),
  validation_mode: z.enum(["auto", "manual"]).optional(),
});

const PublishInput = z.object({
  need_id: z.string().uuid(),
  audiences: AudienceSpecSchema,
});

const RepublishInput = z.object({
  need_id: z.string().uuid(),
  audiences: AudienceSpecSchema,
  // "delta"  : notify only user_ids not present in any prior publication
  //            → intent "Modifier les destinataires" (correct an audience mistake
  //            without re-spamming those already reached).
  // "resend" : notify the full new snapshot (may re-notify prior recipients)
  //            → intent "Relancer" (nudge everyone again).
  mode: z.enum(["delta", "resend"]).default("resend"),
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
/* 1bis. updateEventNeed — édition d'un brouillon ou besoin publié          */
/* ------------------------------------------------------------------------ */

export const updateEventNeed = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => UpdateNeedInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // RPC atomique : verrou event_needs, garde is_club_staff, garde capacité
    // (refus si nouvelle capacité < confirmed_count actuels). role_key ignoré
    // sur un besoin publié (nature immuable après notifications).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: rpcData, error } = await supabase.rpc("update_event_need_atomic" as any, {
      _need_id: data.need_id,
      _actor: userId,
      _label: data.label ?? null,
      _description: data.description === undefined ? null : (data.description ?? null),
      _capacity: data.capacity ?? null,
      _validation_mode: data.validation_mode ?? null,
      _has_description: data.description !== undefined,
    });
    if (error) throw new Error(error.message);
    const row = (Array.isArray(rpcData) ? rpcData[0] : rpcData) as {
      id: string;
      event_id: string;
      club_id: string;
      status: string;
      capacity: number;
      validation_mode: string;
      label: string;
      role_key: string;
      description: string | null;
      capacity_changed: boolean;
    } | null;
    if (!row) throw new Error("need_update_failed");

    if (row.status === "open" && row.capacity_changed) {
      await recomputeCoverageServiceRole(row.event_id);
    }
    return row;
  });

/* ------------------------------------------------------------------------ */
/* 1ter. declareUnavailable — membre se déclare indisponible                */
/* ------------------------------------------------------------------------ */

export const declareUnavailable = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => NeedIdInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: rpcData, error } = await supabase.rpc("declare_unavailable_atomic" as any, {
      _need_id: data.need_id,
      _user_id: userId,
    });
    if (error) throw new Error(error.message);
    const row = (Array.isArray(rpcData) ? rpcData[0] : rpcData) as {
      signup_id: string;
      status: "unavailable";
    } | null;
    if (!row) throw new Error("declare_unavailable_failed");
    return row;
  });

/* ------------------------------------------------------------------------ */
/* 1quater. deleteEventNeed — suppression stricte d'un brouillon             */
/* ------------------------------------------------------------------------ */

export const deleteEventNeed = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => NeedIdInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await supabase.rpc("delete_event_need_draft" as any, {
      _need_id: data.need_id,
      _actor: userId,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ------------------------------------------------------------------------ */
/* 1quinquies. republishEventNeed — relance avec sélection rééditable        */
/* ------------------------------------------------------------------------ */

export const republishEventNeed = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => RepublishInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const need = await loadNeedCore(data.need_id);
    if (need.status !== "open") throw new Error("need_not_open");
    const { data: isStaff } = await supabase.rpc("is_club_staff", {
      _user_id: userId,
      _club_id: need.club_id,
    });
    if (!isStaff) throw new Error("forbidden");

    // Réutilise publish_event_need_atomic — remplace la sélection d'audiences,
    // recalcule la photographie et exclut les 'unavailable' (garde en SQL).
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
    if (!row) throw new Error("republish_failed");

    // Décide qui recevra vraiment la notification :
    //  - "delta"  → only user_ids never notified in a prior publication of this need
    //  - "resend" → the full new snapshot (may re-notify prior recipients)
    let toNotify: string[] = row.recipient_user_ids ?? [];
    if (!row.was_idempotent_skip && data.mode === "delta" && toNotify.length > 0) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: prior } = await supabaseAdmin
        .from("event_need_publication_recipients")
        .select("user_id, publication_id, event_need_publications!inner(need_id)")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .eq("event_need_publications.need_id" as any, data.need_id)
        .neq("publication_id", row.publication_id);
      const alreadyNotified = new Set(
        (prior ?? []).map((r: { user_id: string | null }) => r.user_id).filter(Boolean) as string[],
      );
      toNotify = toNotify.filter((uid) => !alreadyNotified.has(uid));
    }

    if (!row.was_idempotent_skip && toNotify.length > 0) {
      const { dispatchEventNeedPublication } = await import("./dispatch.server");
      try {
        await dispatchEventNeedPublication({
          needId: data.need_id,
          publicationId: row.publication_id,
          recipientUserIds: toNotify,
        });
      } catch (e) {
        console.error("[republishEventNeed] dispatch failed", e);
      }
    }

    await recomputeCoverageServiceRole(need.event_id);
    return {
      publication_id: row.publication_id,
      recipients_count: row.recipients_count,
      notified_count: toNotify.length,
      status: row.status,
      was_idempotent_skip: row.was_idempotent_skip,
      mode: data.mode,
    };
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

    // 1) Récupère les 'applied' encore en attente avant transition, pour
    //    les décliner et les notifier ("le poste est pourvu").
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: pendingApplied } = await supabaseAdmin
      .from("event_need_signups")
      .select("id, user_id")
      .eq("need_id", data.need_id)
      .eq("status", "applied");

    // 2) Fermeture + decline en cascade en un seul batch.
    const nowIso = new Date().toISOString();
    const { error: closeErr } = await supabaseAdmin
      .from("event_needs")
      .update({ status: "closed" })
      .eq("id", data.need_id);
    if (closeErr) throw new Error(closeErr.message);

    if ((pendingApplied?.length ?? 0) > 0) {
      const ids = pendingApplied!.map((r) => r.id);
      await supabaseAdmin
        .from("event_need_signups")
        .update({ status: "declined", declined_at: nowIso, decided_by: userId })
        .in("id", ids);
    }

    await recomputeCoverageServiceRole(need.event_id);

    // 3) Notification aux applied → declined (poste pourvu). Les confirmed
    //    ne reçoivent RIEN (mission tenue, rappel conservé).
    if ((pendingApplied?.length ?? 0) > 0) {
      try {
        const { notifyApplicantOfDecision } = await import("./dispatch.server");
        await Promise.allSettled(
          pendingApplied!
            .filter((r) => r.user_id)
            .map((r) =>
              notifyApplicantOfDecision({
                needId: data.need_id,
                signupId: r.id,
                decision: "decline",
                applicantUserId: r.user_id as string,
              }),
            ),
        );
      } catch (e) {
        console.error("[closeEventNeed] notify applied failed", e);
      }
    }

    return { ok: true, declined_count: pendingApplied?.length ?? 0 };
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

    // Notif dédiée aux confirmés + candidats (push + email dédupliqué).
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

/* ------------------------------------------------------------------------ */
/* 8. listEventNeeds — payload évènement (visible pour user autorisé)       */
/* ------------------------------------------------------------------------ */

/**
 * Retourne la liste des besoins d'un évènement.
 * - RLS filtre naturellement : staff voit tout ; membre destinataire voit
 *   uniquement les besoins ouverts pour lesquels il est dans les recipients
 *   ou déjà candidat.
 * - Places restantes calculées en agrégat (service_role) — jamais de liste
 *   de confirmés retournée côté membre.
 * - my_signup : la ligne du user courant s'il a déjà candidaté.
 */
export const listEventNeeds = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ event_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: needs, error } = await supabase
      .from("event_needs")
      .select(
        "id, event_id, club_id, team_id, role_key, label, description, capacity, validation_mode, status, last_published_at, created_at",
      )
      .eq("event_id", data.event_id)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    const rows = needs ?? [];
    if (rows.length === 0) {
      // Pas de besoin encore : on doit quand même dire si l'appelant est staff,
      // pour afficher le bouton "Ajouter" côté UI. Le club est résolu via l'équipe de l'event.
      const { data: ev } = await supabase
        .from("events")
        .select("team_id")
        .eq("id", data.event_id)
        .maybeSingle();
      let clubId: string | null = null;
      if (ev?.team_id) {
        const { data: team } = await supabase
          .from("teams")
          .select("club_id")
          .eq("id", ev.team_id)
          .maybeSingle();
        clubId = team?.club_id ?? null;
      }
      const { data: isStaff } = clubId
        ? await supabase.rpc("is_club_staff", { _user_id: userId, _club_id: clubId })
        : { data: false };
      return { needs: [], is_staff: Boolean(isStaff) };
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Agrégats confirmés par need (bypass RLS pour ne compter QUE l'agrégat).
    const needIds = rows.map((r) => r.id);
    const { data: confirmedRows } = await supabaseAdmin
      .from("event_need_signups")
      .select("need_id, user_id")
      .in("need_id", needIds)
      .eq("status", "confirmed");
    const confirmedByNeed: Record<string, number> = {};
    const confirmedUserIdsByNeed: Record<string, string[]> = {};
    for (const r of confirmedRows ?? []) {
      confirmedByNeed[r.need_id] = (confirmedByNeed[r.need_id] ?? 0) + 1;
      if (r.user_id) {
        (confirmedUserIdsByNeed[r.need_id] ??= []).push(r.user_id);
      }
    }

    // Staff view ? (déterminé tôt : gate la résolution des noms de confirmés)
    const clubId = rows[0]?.club_id;
    const { data: isStaff } = clubId
      ? await supabase.rpc("is_club_staff", { _user_id: userId, _club_id: clubId })
      : { data: false };

    // Résoudre les noms des confirmés — STAFF UNIQUEMENT (invariant 2 : les
    // membres ne doivent pas voir les noms des autres volontaires).
    const allConfirmedUserIds = isStaff
      ? Array.from(new Set(Object.values(confirmedUserIdsByNeed).flat()))
      : [];
    const nameByUser: Record<string, string | null> = {};
    let contextByUser: Map<string, import("./member-context").MemberContext> | undefined;
    if (allConfirmedUserIds.length > 0) {
      const { data: profs } = await supabaseAdmin
        .from("profiles")
        .select("id, full_name")
        .in("id", allConfirmedUserIds);
      for (const p of profs ?? []) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        nameByUser[(p as any).id] = ((p as any).full_name as string | null) ?? null;
      }
      // Enrichissement rôle + catégorie (staff-only).
      if (clubId) {
        const { data: cm } = await supabaseAdmin
          .from("club_members")
          .select("user_id, roles, role")
          .eq("club_id", clubId)
          .in("user_id", allConfirmedUserIds);
        const { buildMemberContextByUser } = await import("./member-context.server");
        contextByUser = await buildMemberContextByUser(
          supabaseAdmin,
          clubId,
          (cm ?? []).map((m) => ({
            user_id: (m as { user_id: string | null }).user_id ?? null,
            roles: (m as unknown as { roles: string[] | null }).roles ?? null,
            role: (m as unknown as { role: string | null }).role ?? null,
          })),
        );
      }
    }

    // Candidatures 'applied' en attente (pour badges staff).
    const { data: appliedRows } = await supabaseAdmin
      .from("event_need_signups")
      .select("need_id")
      .in("need_id", needIds)
      .eq("status", "applied");
    const appliedByNeed: Record<string, number> = {};
    for (const r of appliedRows ?? []) {
      appliedByNeed[r.need_id] = (appliedByNeed[r.need_id] ?? 0) + 1;
    }

    // My signup (via RLS owner_read).
    type MySignup = {
      id: string;
      need_id: string;
      status: string;
      comment: string | null;
      applied_at: string | null;
      confirmed_at: string | null;
      withdrawn_at: string | null;
      declined_at: string | null;
    };
    const { data: mySignups } = await supabase
      .from("event_need_signups")
      .select("id, need_id, status, comment, applied_at, confirmed_at, withdrawn_at, declined_at")
      .in("need_id", needIds)
      .eq("user_id", userId);
    const mySignupByNeed: Record<string, MySignup> = {};
    for (const s of (mySignups ?? []) as MySignup[]) mySignupByNeed[s.need_id] = s;


    // Dernière publication par besoin (recipients_count + published_at).
    const { data: pubs } = await supabaseAdmin
      .from("event_need_publications")
      .select("need_id, recipients_count, published_at")
      .in("need_id", needIds)
      .order("published_at", { ascending: false });
    const lastPubByNeed: Record<string, { recipients_count: number | null; published_at: string }> = {};
    for (const p of pubs ?? []) {
      if (!lastPubByNeed[p.need_id]) {
        lastPubByNeed[p.need_id] = {
          recipients_count: p.recipients_count ?? null,
          published_at: p.published_at as string,
        };
      }
    }

    return {
      is_staff: Boolean(isStaff),
      needs: rows.map((n) => ({
        ...n,
        confirmed_count: confirmedByNeed[n.id] ?? 0,
        confirmed_signups: projectConfirmedSignups(
          Boolean(isStaff),
          confirmedUserIdsByNeed[n.id] ?? [],
          nameByUser,
          contextByUser,
        ),
        applied_count: appliedByNeed[n.id] ?? 0,
        remaining_seats: Math.max(n.capacity - (confirmedByNeed[n.id] ?? 0), 0),
        my_signup: (mySignupByNeed[n.id] ?? null) as MySignup | null,
        last_recipients_count: lastPubByNeed[n.id]?.recipients_count ?? null,
        last_published_at: lastPubByNeed[n.id]?.published_at ?? n.last_published_at ?? null,
      })),
    };
  });

/* ------------------------------------------------------------------------ */
/* 9. listStaffSignupsForNeed — staff-only, liste détaillée des candidats   */
/* ------------------------------------------------------------------------ */

export const listStaffSignupsForNeed = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ need_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const need = await loadNeedCore(data.need_id);
    const { data: isStaff } = await supabase.rpc("is_club_staff", {
      _user_id: userId,
      _club_id: need.club_id,
    });
    if (!isStaff) throw new Error("forbidden");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: signups, error } = await supabaseAdmin
      .from("event_need_signups")
      .select("id, user_id, status, comment, applied_at, confirmed_at, declined_at, withdrawn_at")
      .eq("need_id", data.need_id)
      .order("applied_at", { ascending: true });
    if (error) throw new Error(error.message);

    const userIds = Array.from(
      new Set(
        (signups ?? []).map((s) => s.user_id).filter((v): v is string => typeof v === "string"),
      ),
    );
    const profiles: Record<string, { full_name: string | null }> = {};
    if (userIds.length > 0) {
      const { data: profs } = await supabaseAdmin
        .from("profiles")
        .select("id, full_name")
        .in("id", userIds);
      for (const p of profs ?? []) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const pid = (p as any).id as string;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        profiles[pid] = { full_name: ((p as any).full_name as string | null) ?? null };
      }
    }

    // Rôles club pour chaque candidat.
    const rolesByUser: Record<string, string[]> = {};
    if (userIds.length > 0) {
      const { data: memberRows } = await supabaseAdmin
        .from("club_members")
        .select("user_id, roles")
        .eq("club_id", need.club_id)
        .in("user_id", userIds);
      for (const m of memberRows ?? []) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        rolesByUser[m.user_id] = ((m as any).roles as string[] | null) ?? [];
      }
    }

    // Licence + date de naissance (via players.user_id).
    const licenseByUser: Record<string, string | null> = {};
    const birthByUser: Record<string, string | null> = {};
    if (userIds.length > 0) {
      const { data: players } = await supabaseAdmin
        .from("players")
        .select("user_id, license_number, birth_date")
        .in("user_id", userIds);
      for (const p of players ?? []) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const uid = (p as any).user_id as string | null;
        if (!uid) continue;
        if (!licenseByUser[uid]) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          licenseByUser[uid] = ((p as any).license_number as string | null) ?? null;
        }
        if (!birthByUser[uid]) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          birthByUser[uid] = ((p as any).birth_date as string | null) ?? null;
        }
      }
    }

    const isMinor = (dob: string | null | undefined): boolean => {
      if (!dob) return false;
      const d = new Date(dob);
      if (Number.isNaN(d.getTime())) return false;
      const now = new Date();
      let age = now.getFullYear() - d.getFullYear();
      const m = now.getMonth() - d.getMonth();
      if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age -= 1;
      return age < 18;
    };

    return {
      signups: (signups ?? []).map((s) => {
        const prof = (s.user_id && profiles[s.user_id]) || { full_name: null };
        const dob = s.user_id ? birthByUser[s.user_id] ?? null : null;
        return {
          ...s,
          profile: { full_name: prof.full_name },
          roles: (s.user_id && rolesByUser[s.user_id]) || [],
          license_number: (s.user_id && licenseByUser[s.user_id]) || null,
          is_minor: isMinor(dob),
        };
      }),
    };
  });

/* ------------------------------------------------------------------------ */
/* 11. previewEventNeedAudience — compte unique de destinataires (staff)    */
/* ------------------------------------------------------------------------ */

export const previewEventNeedAudience = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        need_id: z.string().uuid(),
        audiences: AudienceSpecSchema,
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const need = await loadNeedCore(data.need_id);
    const { data: isStaff } = await supabase.rpc("is_club_staff", {
      _user_id: userId,
      _club_id: need.club_id,
    });
    if (!isStaff) throw new Error("forbidden");

    // Hydrater event_id sur les sélecteurs qui l'exigent.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const hydrated = (data.audiences as any[]).map((a) => {
      if (a?.type === "convoked_players" || a?.type === "convoked_parents") {
        return { ...a, event_id: need.event_id };
      }
      return a;
    });

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin.rpc("resolve_audience_members", {
      _club_id: need.club_id,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      _spec: hydrated as any,
    });
    if (error) throw new Error(error.message);
    const list = (rows ?? []) as Array<{ user_id: string }>;
    return { count: list.length };
  });

/* ------------------------------------------------------------------------ */
/* 12. getNeedAudienceContext — staff-only : listes pour le picker          */
/* ------------------------------------------------------------------------ */

export const getNeedAudienceContext = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ need_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const need = await loadNeedCore(data.need_id);
    const { data: isStaff } = await supabase.rpc("is_club_staff", {
      _user_id: userId,
      _club_id: need.club_id,
    });
    if (!isStaff) throw new Error("forbidden");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [teamsRes, groupsRes] = await Promise.all([
      supabaseAdmin
        .from("teams")
        .select("id, name, age_group")
        .eq("club_id", need.club_id)
        .is("deleted_at", null)
        .order("name", { ascending: true }),
      supabaseAdmin
        .from("club_groups")
        .select("id, name, is_active")
        .eq("club_id", need.club_id)
        .eq("is_active", true)
        .order("name", { ascending: true }),
    ]);

    const teams = (teamsRes.data ?? []).map((r) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const row = r as any;
      return {
        id: row.id as string,
        name: row.name as string,
        age_group: (row.age_group as string | null) ?? null,
      };
    });

    const cats = Array.from(
      new Set(
        teams
          .map((t) => t.age_group?.trim())
          .filter((c): c is string => !!c),
      ),
    ).sort();

    return {
      club_id: need.club_id,
      event_id: need.event_id,
      teams,
      groups: groupsRes.data ?? [],
      categories: cats,
    };
  });

/* ------------------------------------------------------------------------ */
/* 12bis. getEventAudienceContext — staff-only : picker à la CRÉATION       */
/* (avant qu'un event_need existe → on part de event_id).                   */
/* ------------------------------------------------------------------------ */

export const getEventAudienceContext = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ event_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: ev, error: evErr } = await supabase
      .from("events")
      .select("id, team_id, teams:team_id(club_id)")
      .eq("id", data.event_id)
      .maybeSingle();
    if (evErr) throw new Error(evErr.message);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const clubId = ((ev as any)?.teams?.club_id as string | null) ?? null;
    if (!clubId) throw new Error("event_needs_require_team_linked_event");

    const { data: isStaff } = await supabase.rpc("is_club_staff", {
      _user_id: userId,
      _club_id: clubId,
    });
    if (!isStaff) throw new Error("forbidden");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [teamsRes, groupsRes] = await Promise.all([
      supabaseAdmin
        .from("teams")
        .select("id, name, age_group")
        .eq("club_id", clubId)
        .is("deleted_at", null)
        .order("name", { ascending: true }),
      supabaseAdmin
        .from("club_groups")
        .select("id, name, is_active")
        .eq("club_id", clubId)
        .eq("is_active", true)
        .order("name", { ascending: true }),
    ]);

    const teams = (teamsRes.data ?? []).map((r) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const row = r as any;
      return {
        id: row.id as string,
        name: row.name as string,
        age_group: (row.age_group as string | null) ?? null,
      };
    });

    const cats = Array.from(
      new Set(teams.map((t) => t.age_group?.trim()).filter((c): c is string => !!c)),
    ).sort();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const eventTeamId = ((ev as any)?.team_id as string | null) ?? null;
    const eventCategory =
      teams.find((t) => t.id === eventTeamId)?.age_group?.trim() || null;

    return {
      club_id: clubId,
      event_id: data.event_id,
      teams,
      groups: groupsRes.data ?? [],
      categories: cats,
      event_team_id: eventTeamId,
      event_category: eventCategory,
    };
  });


/* ------------------------------------------------------------------------ */
/* 12ter. previewEventAudience — preview par event_id (avant création need) */
/* ------------------------------------------------------------------------ */

export const previewEventAudience = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        event_id: z.string().uuid(),
        audiences: AudienceSpecSchema,
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: ev, error: evErr } = await supabase
      .from("events")
      .select("id, team_id, teams:team_id(club_id)")
      .eq("id", data.event_id)
      .maybeSingle();
    if (evErr) throw new Error(evErr.message);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const clubId = ((ev as any)?.teams?.club_id as string | null) ?? null;
    if (!clubId) throw new Error("event_needs_require_team_linked_event");

    const { data: isStaff } = await supabase.rpc("is_club_staff", {
      _user_id: userId,
      _club_id: clubId,
    });
    if (!isStaff) throw new Error("forbidden");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const hydrated = (data.audiences as any[]).map((a) => {
      if (a?.type === "convoked_players" || a?.type === "convoked_parents") {
        return { ...a, event_id: data.event_id };
      }
      return a;
    });

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin.rpc("resolve_audience_members", {
      _club_id: clubId,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      _spec: hydrated as any,
    });
    if (error) throw new Error(error.message);
    return { count: (rows ?? []).length };
  });

/* ------------------------------------------------------------------------ */
/* 12quater. searchClubMembersForNeed — staff picks someone to add manually */
/* ------------------------------------------------------------------------ */

export const searchClubMembersForNeed = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        need_id: z.string().uuid(),
        search: z.string().trim().max(80).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const need = await loadNeedCore(data.need_id);
    const { data: isStaff } = await supabase.rpc("is_club_staff", {
      _user_id: userId,
      _club_id: need.club_id,
    });
    if (!isStaff) throw new Error("forbidden");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { buildMemberContextByUser } = await import("./member-context.server");

    // Exclude members already signed up (any active status).
    const { data: existing } = await supabaseAdmin
      .from("event_need_signups")
      .select("member_id, status")
      .eq("need_id", data.need_id);
    const excludedMemberIds = new Set(
      (existing ?? [])
        .filter((s) => s.status === "confirmed" || s.status === "applied")
        .map((s) => s.member_id as string),
    );

    const { data: members, error } = await supabaseAdmin
      .from("club_members")
      .select("id, user_id, roles, role")
      .eq("club_id", need.club_id)
      .limit(500);
    if (error) throw new Error(error.message);

    const rawMembers = (members ?? []).filter((m) => !excludedMemberIds.has(m.id));
    const userIds = rawMembers.map((m) => m.user_id).filter(Boolean);
    const { data: profs } = userIds.length
      ? await supabaseAdmin.from("profiles").select("id, full_name").in("id", userIds)
      : { data: [] as { id: string; full_name: string | null }[] };
    const nameByUser: Record<string, string | null> = {};
    for (const p of profs ?? []) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      nameByUser[(p as any).id] = ((p as any).full_name as string | null) ?? null;
    }

    const ctxMap = await buildMemberContextByUser(
      supabaseAdmin,
      need.club_id,
      rawMembers.map((m) => ({
        user_id: (m.user_id as string) ?? null,
        roles: (m as unknown as { roles: string[] | null }).roles ?? null,
        role: (m as unknown as { role: string | null }).role ?? null,
      })),
    );

    const q = (data.search ?? "").toLowerCase().trim();
    const rows = rawMembers
      .map((m) => {
        const uid = m.user_id as string;
        const ctx = ctxMap.get(uid) ?? null;
        return {
          member_id: m.id as string,
          user_id: uid,
          full_name: nameByUser[uid] ?? null,
          roles: ((m as unknown as { roles: string[] }).roles ?? []) as string[],
          primary_role: ctx?.primary_role ?? null,
          player_category: ctx?.player_category ?? null,
          player_categories: ctx?.player_categories ?? [],
          children: ctx?.children ?? [],
          coached_teams: ctx?.coached_teams ?? [],
          context: ctx,
        };
      })
      .filter((r) => (q ? (r.full_name ?? "").toLowerCase().includes(q) : true))
      .sort((a, b) => (a.full_name ?? "").localeCompare(b.full_name ?? ""))
      .slice(0, 30);

    return { members: rows };
  });

/* ------------------------------------------------------------------------ */
/* 12quater-bis. searchClubMembersForAssignment — pré-assignation (avant   */
/* création du need). Basé sur club_id, exclut des user_ids si demandé.    */
/* ------------------------------------------------------------------------ */

export const searchClubMembersForAssignment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        club_id: z.string().uuid(),
        search: z.string().trim().max(80).optional(),
        exclude_user_ids: z.array(z.string().uuid()).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: isStaff } = await supabase.rpc("is_club_staff", {
      _user_id: userId,
      _club_id: data.club_id,
    });
    if (!isStaff) throw new Error("forbidden");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { buildMemberContextByUser } = await import("./member-context.server");

    const { data: members, error } = await supabaseAdmin
      .from("club_members")
      .select("id, user_id, roles, role")
      .eq("club_id", data.club_id)
      .limit(500);
    if (error) throw new Error(error.message);

    const excluded = new Set(data.exclude_user_ids ?? []);
    const rawMembers = (members ?? []).filter(
      (m) => m.user_id && !excluded.has(m.user_id as string),
    );
    const userIds = rawMembers.map((m) => m.user_id as string);

    const { data: profs } = userIds.length
      ? await supabaseAdmin.from("profiles").select("id, full_name").in("id", userIds)
      : { data: [] as { id: string; full_name: string | null }[] };
    const nameByUser: Record<string, string | null> = {};
    for (const p of profs ?? []) {
      nameByUser[(p as { id: string }).id] =
        ((p as { full_name: string | null }).full_name as string | null) ?? null;
    }

    const ctxMap = await buildMemberContextByUser(
      supabaseAdmin,
      data.club_id,
      rawMembers.map((m) => ({
        user_id: (m.user_id as string) ?? null,
        roles: (m as unknown as { roles: string[] | null }).roles ?? null,
        role: (m as unknown as { role: string | null }).role ?? null,
      })),
    );

    const q = (data.search ?? "").toLowerCase().trim();
    const rows = rawMembers
      .map((m) => {
        const uid = m.user_id as string;
        const ctx = ctxMap.get(uid) ?? null;
        const uniqRoles = Array.from(
          new Set(
            [
              ...(((m as unknown as { roles: string[] | null }).roles ?? []) as string[]),
              ...((m as unknown as { role: string | null }).role
                ? [(m as unknown as { role: string }).role]
                : []),
            ].filter(Boolean),
          ),
        );
        return {
          member_id: m.id as string,
          user_id: uid,
          full_name: nameByUser[uid] ?? null,
          roles: uniqRoles,
          primary_role: ctx?.primary_role ?? null,
          player_category: ctx?.player_category ?? null,
          player_categories: ctx?.player_categories ?? [],
          children: ctx?.children ?? [],
          coached_teams: ctx?.coached_teams ?? [],
          context: ctx,
        };
      })
      .filter((r) => (q ? (r.full_name ?? "").toLowerCase().includes(q) : true))
      .sort((a, b) => (a.full_name ?? "").localeCompare(b.full_name ?? ""))
      .slice(0, 30);

    return { members: rows };
  });

/* ------------------------------------------------------------------------ */
/* 12sexies. listClubMembersWithContext — liste enrichie pour /admin/groups */
/* ------------------------------------------------------------------------ */

export const listClubMembersWithContext = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ club_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: isStaff } = await supabase.rpc("is_club_staff", {
      _user_id: userId,
      _club_id: data.club_id,
    });
    if (!isStaff) throw new Error("forbidden");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { buildMemberContextByUser } = await import("./member-context.server");

    const { data: members, error } = await supabaseAdmin
      .from("club_members")
      .select("id, user_id, roles, role")
      .eq("club_id", data.club_id);
    if (error) throw new Error(error.message);

    const rawMembers = (members ?? []).filter((m) => m.user_id);
    const userIds = rawMembers.map((m) => m.user_id as string);

    const { data: profs } = userIds.length
      ? await supabaseAdmin
          .from("profiles")
          .select("id, full_name, first_name, last_name")
          .in("id", userIds)
      : { data: [] as Array<{
          id: string;
          full_name: string | null;
          first_name: string | null;
          last_name: string | null;
        }> };
    const profileById = new Map(
      (profs ?? []).map((p) => [
        (p as { id: string }).id,
        p as {
          id: string;
          full_name: string | null;
          first_name: string | null;
          last_name: string | null;
        },
      ]),
    );

    const ctxMap = await buildMemberContextByUser(
      supabaseAdmin,
      data.club_id,
      rawMembers.map((m) => ({
        user_id: (m.user_id as string) ?? null,
        roles: (m as unknown as { roles: string[] | null }).roles ?? null,
        role: (m as unknown as { role: string | null }).role ?? null,
      })),
    );

    const rows = rawMembers.map((m) => {
      const uid = m.user_id as string;
      const p = profileById.get(uid);
      const ctx = ctxMap.get(uid) ?? null;
      const rolesArr = Array.from(
        new Set(
          [
            ...(((m as unknown as { roles: string[] | null }).roles ?? []) as string[]),
            ...((m as unknown as { role: string | null }).role
              ? [(m as unknown as { role: string }).role]
              : []),
          ].filter(Boolean),
        ),
      );
      return {
        id: m.id as string,
        user_id: uid,
        role: (m as unknown as { role: string | null }).role ?? null,
        roles: rolesArr,
        full_name: p?.full_name ?? null,
        first_name: p?.first_name ?? null,
        last_name: p?.last_name ?? null,
        context: ctx,
      };
    });

    return { members: rows };
  });



/* ------------------------------------------------------------------------ */
/* 12quinquies. staffAddManualSignup — staff adds a confirmed participant  */
/* ------------------------------------------------------------------------ */

export const staffAddManualSignup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        need_id: z.string().uuid(),
        user_id: z.string().uuid(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const need = await loadNeedCore(data.need_id);
    const { data: isStaff } = await supabase.rpc("is_club_staff", {
      _user_id: userId,
      _club_id: need.club_id,
    });
    if (!isStaff) throw new Error("forbidden");
    if (need.status !== "open" && need.status !== "draft") {
      throw new Error("need_not_open");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Resolve member_id (required FK) for this user in this club.
    const { data: member, error: memErr } = await supabaseAdmin
      .from("club_members")
      .select("id")
      .eq("club_id", need.club_id)
      .eq("user_id", data.user_id)
      .maybeSingle();
    if (memErr) throw new Error(memErr.message);
    if (!member) throw new Error("user_not_in_club");

    // Capacity check.
    const { count: confirmedCount } = await supabaseAdmin
      .from("event_need_signups")
      .select("*", { count: "exact", head: true })
      .eq("need_id", data.need_id)
      .eq("status", "confirmed");
    if ((confirmedCount ?? 0) >= need.capacity) throw new Error("need_full");

    // Upsert: if a prior signup exists for this member (withdrawn/declined/applied), flip to confirmed.
    const { data: existing } = await supabaseAdmin
      .from("event_need_signups")
      .select("id, status")
      .eq("need_id", data.need_id)
      .eq("member_id", member.id)
      .maybeSingle();

    const nowIso = new Date().toISOString();
    let signupId: string | null = null;
    if (existing) {
      if (existing.status === "confirmed") return { ok: true, already: true };
      const { error: upErr } = await supabaseAdmin
        .from("event_need_signups")
        .update({
          status: "confirmed",
          confirmed_at: nowIso,
          declined_at: null,
          withdrawn_at: null,
          decided_by: userId,
        })
        .eq("id", existing.id);
      if (upErr) throw new Error(upErr.message);
      signupId = existing.id;
    } else {
      const { data: inserted, error: insErr } = await supabaseAdmin
        .from("event_need_signups")
        .insert({
          need_id: data.need_id,
          member_id: member.id,
          user_id: data.user_id,
          status: "confirmed",
          confirmed_at: nowIso,
          decided_by: userId,
        })
        .select("id")
        .single();
      if (insErr) throw new Error(insErr.message);
      signupId = inserted?.id ?? null;
    }

    await recomputeCoverageServiceRole(need.event_id);

    // Notifier la personne assignée manuellement : même parcours que la
    // confirmation d'une candidature (push + email "confirm").
    if (signupId) {
      try {
        const { notifyApplicantOfDecision } = await import("./dispatch.server");
        await notifyApplicantOfDecision({
          needId: data.need_id,
          signupId,
          decision: "confirm",
          applicantUserId: data.user_id,
        });
      } catch (e) {
        console.error("[staffAddManualSignup] notify failed", e);
      }
    }

    return { ok: true, already: false };
  });

/* ------------------------------------------------------------------------ */
/* 9c. staffUnassignSignup — staff retire une candidature confirmée         */
/* ------------------------------------------------------------------------ */

// Exported for unit testing — pure orchestration around injected deps.
// The real server-fn handler wires supabase/admin/dispatch below.
export async function _staffUnassignSignupImpl(deps: {
  signupId: string;
  actorUserId: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseAdmin: any;
  recomputeCoverage: (eventId: string) => Promise<unknown>;
  notify: (params: {
    needId: string;
    signupId: string;
    decision: "unassign";
    applicantUserId: string;
  }) => Promise<void>;
  now?: () => string;
}) {
  const now = deps.now ?? (() => new Date().toISOString());
  const { data: signup, error: sErr } = await deps.supabaseAdmin
    .from("event_need_signups")
    .select("id, need_id, user_id, status, event_needs:need_id(club_id, event_id)")
    .eq("id", deps.signupId)
    .maybeSingle();
  if (sErr) throw new Error(sErr.message);
  if (!signup) throw new Error("signup_not_found");

  const clubId = signup.event_needs?.club_id ?? null;
  const eventId = signup.event_needs?.event_id ?? null;
  if (!clubId) throw new Error("club_not_found");

  const { data: isStaff } = await deps.supabase.rpc("is_club_staff", {
    _user_id: deps.actorUserId,
    _club_id: clubId,
  });
  if (!isStaff) throw new Error("forbidden");

  if (signup.status !== "confirmed") return { ok: true, already: true };

  // Le retrait par le staff = decline serveur (maquette S4-2), pas withdraw.
  // withdrawn = « s'est désisté soi-même » ; ici c'est le staff qui retire.
  // decided_by porte l'ID du staff pour tracer qui a fait quoi.
  const { error: upErr } = await deps.supabaseAdmin
    .from("event_need_signups")
    .update({
      status: "declined",
      declined_at: now(),
      confirmed_at: null,
      withdrawn_at: null,
      decided_by: deps.actorUserId,
    })
    .eq("id", deps.signupId);
  if (upErr) throw new Error(upErr.message);

  if (eventId) await deps.recomputeCoverage(eventId);

  // Notification obligatoire au retiré (push + email). Sans ça la personne
  // se présente au match. Routage mineur → parent via le pipeline habituel.
  if (signup.user_id) {
    try {
      await deps.notify({
        needId: signup.need_id,
        signupId: signup.id,
        decision: "unassign",
        applicantUserId: signup.user_id,
      });
    } catch (e) {
      console.error("[staffUnassignSignup] notify failed", e);
    }
  }

  return { ok: true, already: false };
}

export const staffUnassignSignup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ signup_id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { notifyApplicantOfDecision } = await import("./dispatch.server");
    return _staffUnassignSignupImpl({
      signupId: data.signup_id,
      actorUserId: userId,
      supabase,
      supabaseAdmin,
      recomputeCoverage: recomputeCoverageServiceRole,
      notify: notifyApplicantOfDecision,
    });
  });



/* ------------------------------------------------------------------------ */
/* 10. listMyOpenNeeds — feed membre "Coups de main" (toutes évènements)    */
/* ------------------------------------------------------------------------ */

export const listMyOpenNeeds = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(() => ({}))
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    // RLS `event_needs_recipient_read` filtre déjà pour ne remonter que les
    // besoins ouverts dont l'user est destinataire (ou déjà signup).
    const { data: needs, error } = await supabase
      .from("event_needs")
      .select(
        "id, event_id, club_id, team_id, role_key, label, description, capacity, validation_mode, status, last_published_at, updated_at, events:event_id(id, title, starts_at, location, type)",
      )
      .eq("status", "open")
      .order("last_published_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    const rows = needs ?? [];
    if (rows.length === 0) return { needs: [] };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const needIds = rows.map((r) => r.id);
    const { data: confirmedRows } = await supabaseAdmin
      .from("event_need_signups")
      .select("need_id")
      .in("need_id", needIds)
      .eq("status", "confirmed");
    const confirmedByNeed: Record<string, number> = {};
    for (const r of confirmedRows ?? []) {
      confirmedByNeed[r.need_id] = (confirmedByNeed[r.need_id] ?? 0) + 1;
    }

    const { data: mySignups } = await supabase
      .from("event_need_signups")
      .select("id, need_id, status")
      .in("need_id", needIds)
      .eq("user_id", userId);
    const mySignupByNeed: Record<string, { id: string; status: string }> = {};
    for (const s of mySignups ?? []) mySignupByNeed[s.need_id] = { id: s.id, status: s.status };

    return {
      needs: rows.map((n) => ({
        ...n,
        remaining_seats: Math.max(n.capacity - (confirmedByNeed[n.id] ?? 0), 0),
        my_signup: mySignupByNeed[n.id] ?? null,
      })),
    };
  });

/* ------------------------------------------------------------------------ */
/* 14. listNeedRecipients — staff: everyone notified for a given need       */
/* ------------------------------------------------------------------------ */

export const listNeedRecipients = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ need_id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const need = await loadNeedCore(data.need_id);
    const { data: isStaff } = await supabase.rpc("is_club_staff", {
      _user_id: userId,
      _club_id: need.club_id,
    });
    if (!isStaff) throw new Error("forbidden");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Union of every user_id ever notified across all publications of this need.
    const { data: pubRows } = await supabaseAdmin
      .from("event_need_publication_recipients")
      .select("user_id, publication_id, event_need_publications!inner(need_id, published_at)")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .eq("event_need_publications.need_id" as any, data.need_id);

    const uniqUserIds = Array.from(
      new Set(
        (pubRows ?? [])
          .map((r: { user_id: string | null }) => r.user_id)
          .filter(Boolean) as string[],
      ),
    );

    if (uniqUserIds.length === 0) {
      return { recipients: [] as Array<{ user_id: string; full_name: string | null; roles: string[] }> };
    }

    const [{ data: profs }, { data: members }] = await Promise.all([
      supabaseAdmin.from("profiles").select("id, full_name").in("id", uniqUserIds),
      supabaseAdmin
        .from("club_members")
        .select("user_id, roles")
        .eq("club_id", need.club_id)
        .in("user_id", uniqUserIds),
    ]);

    const nameByUser: Record<string, string | null> = {};
    for (const p of profs ?? []) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      nameByUser[(p as any).id] = ((p as any).full_name as string | null) ?? null;
    }
    const rolesByUser: Record<string, string[]> = {};
    for (const m of members ?? []) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mm = m as any;
      if (mm.user_id) rolesByUser[mm.user_id as string] = (mm.roles as string[]) ?? [];
    }

    const recipients = uniqUserIds
      .map((uid) => ({
        user_id: uid,
        full_name: nameByUser[uid] ?? null,
        roles: rolesByUser[uid] ?? [],
      }))
      .sort((a, b) => (a.full_name ?? "").localeCompare(b.full_name ?? ""));

    return { recipients };
  });
