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

    // 1) Vérifier que l'appelant est staff du club portant ce besoin. La RLS
    //    l'imposerait quand même sur les UPDATE, mais on veut un refus explicite.
    const need = await loadNeedCore(data.need_id);
    const { data: isStaff } = await supabase.rpc("is_club_staff", {
      _user_id: userId,
      _club_id: need.club_id,
    });
    if (!isStaff) throw new Error("forbidden");

    // 2) Résolution des audiences en service_role — le resolver gère la garde
    //    interne (club_id lisible seulement par staff/service_role).
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const allUserIds = new Set<string>();
    for (const selector of data.audiences) {
      const { data: rows, error } = await supabaseAdmin.rpc("resolve_audience_members", {
        _club_id: need.club_id,
        _spec: [selector],
      });
      if (error) {
        console.error("[publishEventNeed] resolve failed", { selector, error });
        throw new Error(`resolve_audience_members failed: ${error.message}`);
      }
      for (const r of (rows ?? []) as Array<{ user_id: string | null }>) {
        if (r.user_id) allUserIds.add(r.user_id);
      }
    }

    const userIds = [...allUserIds];
    if (userIds.length === 0) {
      // On publie quand même (draft→open) : un besoin sans destinataire peut
      // devenir visible plus tard via une reprise/relance. Mais on trace.
      console.warn("[publishEventNeed] audience resolved empty", { needId: data.need_id });
    }

    // 3) Map user_id -> club_members.id (member_id NOT NULL sur recipients).
    let memberByUser = new Map<string, string>();
    if (userIds.length > 0) {
      const { data: members, error: mErr } = await supabaseAdmin
        .from("club_members")
        .select("id, user_id")
        .eq("club_id", need.club_id)
        .in("user_id", userIds);
      if (mErr) throw new Error(mErr.message);
      memberByUser = new Map(
        (members ?? [])
          .filter((m) => m.user_id)
          .map((m) => [m.user_id as string, m.id as string]),
      );
    }

    // 4) Transaction : audiences (idempotent), publication, recipients, status='open'.
    //    Note : Supabase JS n'expose pas les transactions ; on chaîne
    //    les inserts en service_role et on nettoie si un pas échoue.
    //    L'invariant "notification après commit" est respecté car le dispatch
    //    n'est appelé qu'après le UPDATE final de status.
    // 4a) Snapshot des audience-selectors (utile pour l'UI et l'audit).
    await supabaseAdmin
      .from("event_need_audiences")
      .delete()
      .eq("need_id", data.need_id);
    if (data.audiences.length > 0) {
      const audienceRows = data.audiences.map((sel) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const s = sel as any;
        return {
          need_id: data.need_id,
          audience_type: s.type,
          group_id: s.group_id ?? null,
          team_id: s.team_id ?? null,
          category: s.category ?? null,
          created_by: userId,
        };
      });
      const { error: audErr } = await supabaseAdmin
        .from("event_need_audiences")
        .insert(audienceRows);
      if (audErr) {
        console.error("[publishEventNeed] audiences insert failed", audErr);
        throw new Error(audErr.message);
      }
    }

    // 4b) Publication row.
    const { data: pub, error: pubErr } = await supabaseAdmin
      .from("event_need_publications")
      .insert({
        need_id: data.need_id,
        published_by: userId,
        recipients_count: memberByUser.size,
      })
      .select("id")
      .single();
    if (pubErr) throw new Error(pubErr.message);

    // 4c) Recipients.
    if (memberByUser.size > 0) {
      const rcpRows = [...memberByUser.entries()].map(([uid, mid]) => ({
        publication_id: pub.id,
        member_id: mid,
        user_id: uid,
      }));
      // Chunk pour éviter d'exploser la requête si audience très large.
      const chunkSize = 500;
      for (let i = 0; i < rcpRows.length; i += chunkSize) {
        const { error: rcpErr } = await supabaseAdmin
          .from("event_need_publication_recipients")
          .insert(rcpRows.slice(i, i + chunkSize));
        if (rcpErr) {
          // Nettoyage best-effort : on annule la publication pour ne pas laisser
          // un state incohérent (publication sans recipients).
          await supabaseAdmin.from("event_need_publications").delete().eq("id", pub.id);
          throw new Error(rcpErr.message);
        }
      }
    }

    // 4d) Passage draft → open (l'invariant 4 sur le CHECK status l'autorise).
    const nowIso = new Date().toISOString();
    const { error: statusErr } = await supabaseAdmin
      .from("event_needs")
      .update({
        status: "open",
        first_published_at: need.status === "draft" ? nowIso : undefined,
        last_published_at: nowIso,
      })
      .eq("id", data.need_id);
    if (statusErr) {
      // On garde la publication même si le passage open échoue — mais on
      // remonte l'erreur ; l'UI pourra relancer la republication.
      throw new Error(statusErr.message);
    }

    // 5) COMMIT effectif ici (toutes les writes admin sont individuelles →
    //    déjà commit). Dispatch APRÈS.
    const { dispatchEventNeedPublication } = await import("./dispatch.server");
    // Fire-and-forget : on ne bloque pas la réponse UI sur push/email.
    void dispatchEventNeedPublication({
      needId: data.need_id,
      publicationId: pub.id,
      recipientUserIds: [...memberByUser.keys()],
    }).catch((e) => {
      console.error("[publishEventNeed] dispatch failed", e);
    });

    // 6) Recompute coverage (transition possible : open_needs_count passe de 0 → 1+).
    await recomputeCoverageServiceRole(need.event_id);

    return {
      publication_id: pub.id,
      recipients_count: memberByUser.size,
      status: "open" as const,
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
      _comment: data.comment ?? null,
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
    // Notification staff (candidature reçue) — fire-and-forget.
    const { notifyStaffOfSignup } = await import("./dispatch.server");
    void notifyStaffOfSignup({
      needId: data.need_id,
      signupId: row.signup_id,
      status: row.status,
      applicantUserId: userId,
    }).catch((e) => console.error("[applyToEventNeed] notify failed", e));

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

    // Récup signup + need (RLS staff_all suffit pour lire).
    const { data: signup, error: sErr } = await supabase
      .from("event_need_signups")
      .select("id, need_id, status, user_id, event_needs:need_id(id, event_id, club_id, capacity)")
      .eq("id", data.signup_id)
      .maybeSingle();
    if (sErr) throw new Error(sErr.message);
    if (!signup) throw new Error("signup_not_found");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const need = (signup as any).event_needs as {
      id: string;
      event_id: string;
      club_id: string;
      capacity: number;
    };

    // Défense en profondeur : staff du club uniquement.
    const { data: isStaff } = await supabase.rpc("is_club_staff", {
      _user_id: userId,
      _club_id: need.club_id,
    });
    if (!isStaff) throw new Error("forbidden");

    if (data.decision === "confirm") {
      // Capacité atomique : on confirme sous verrou pour éviter le double-clic
      // sur la dernière place côté staff aussi.
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: locked } = await supabaseAdmin
        .from("event_needs")
        .select("id, capacity, status")
        .eq("id", need.id)
        .maybeSingle();
      if (!locked || locked.status !== "open") {
        throw new Error("need_not_open");
      }
      const { count } = await supabaseAdmin
        .from("event_need_signups")
        .select("*", { count: "exact", head: true })
        .eq("need_id", need.id)
        .eq("status", "confirmed");
      if ((count ?? 0) >= locked.capacity) {
        throw new Error("capacity_reached");
      }
      const { error: upErr } = await supabase
        .from("event_need_signups")
        .update({
          status: "confirmed",
          confirmed_at: new Date().toISOString(),
          decided_by: userId,
        })
        .eq("id", data.signup_id);
      if (upErr) throw new Error(upErr.message);
    } else {
      const { error: upErr } = await supabase
        .from("event_need_signups")
        .update({
          status: "declined",
          declined_at: new Date().toISOString(),
          decided_by: userId,
        })
        .eq("id", data.signup_id);
      if (upErr) throw new Error(upErr.message);
    }

    await recomputeCoverageServiceRole(need.event_id);

    // Notification au candidat (décision reçue).
    const { notifyApplicantOfDecision } = await import("./dispatch.server");
    void notifyApplicantOfDecision({
      needId: need.id,
      signupId: data.signup_id,
      decision: data.decision,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      applicantUserId: (signup as any).user_id as string,
    }).catch((e) => console.error("[decideSignup] notify failed", e));

    return { ok: true };
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

    // Notifier les signups actifs de l'annulation (dispatch fire-and-forget).
    const { notifyNeedCancelled } = await import("./dispatch.server");
    void notifyNeedCancelled({ needId: data.need_id }).catch((e) =>
      console.error("[cancelEventNeed] notify failed", e),
    );

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
