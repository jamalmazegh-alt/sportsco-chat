import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { enqueueTransactionalEmailServer } from "@/lib/email/send.server";
import { sendPushToUser } from "@/lib/push-send.server";

const SUPPORTED_LOCALES = ["fr", "en", "de", "es", "it", "nl", "pt"] as const;
type SupportLocale = (typeof SUPPORTED_LOCALES)[number];

function pickLocale(pref?: string | null): SupportLocale {
  const l = (pref ?? "").toLowerCase().slice(0, 2);
  return (SUPPORTED_LOCALES as readonly string[]).includes(l) ? (l as SupportLocale) : "fr";
}

const STATUS_LABELS: Record<SupportLocale, Record<string, string>> = {
  fr: {
    open: "Ouvert",
    in_progress: "En cours",
    waiting_user: "En attente de votre réponse",
    resolved: "Résolu",
    closed: "Clôturé",
  },
  en: {
    open: "Open",
    in_progress: "In progress",
    waiting_user: "Waiting for your reply",
    resolved: "Resolved",
    closed: "Closed",
  },
  de: {
    open: "Offen",
    in_progress: "In Bearbeitung",
    waiting_user: "Warten auf Ihre Antwort",
    resolved: "Gelöst",
    closed: "Geschlossen",
  },
  es: {
    open: "Abierto",
    in_progress: "En curso",
    waiting_user: "Esperando tu respuesta",
    resolved: "Resuelto",
    closed: "Cerrado",
  },
  it: {
    open: "Aperto",
    in_progress: "In corso",
    waiting_user: "In attesa della tua risposta",
    resolved: "Risolto",
    closed: "Chiuso",
  },
  nl: {
    open: "Open",
    in_progress: "In behandeling",
    waiting_user: "Wachten op je antwoord",
    resolved: "Opgelost",
    closed: "Gesloten",
  },
  pt: {
    open: "Aberto",
    in_progress: "Em curso",
    waiting_user: "A aguardar a sua resposta",
    resolved: "Resolvido",
    closed: "Fechado",
  },
};

const PUSH_STRINGS: Record<
  SupportLocale,
  {
    reply: { title: (id: string) => string; body: (subject: string) => string };
    status: {
      title: (id: string, statusLabel: string) => string;
      body: (subject: string, statusLabel: string) => string;
      inAppBody: (subject: string, statusLabel: string) => string;
    };
  }
> = {
  fr: {
    reply: { title: (id) => `Réponse à votre ticket #${id}`, body: (s) => s },
    status: {
      title: (id, l) => `Ticket #${id} : ${l}`,
      body: (s, l) => `${s} — Nouveau statut : ${l}`,
      inAppBody: (s, l) => `${s} — Nouveau statut : ${l}`,
    },
  },
  en: {
    reply: { title: (id) => `Reply to your ticket #${id}`, body: (s) => s },
    status: {
      title: (id, l) => `Ticket #${id}: ${l}`,
      body: (s, l) => `${s} — New status: ${l}`,
      inAppBody: (s, l) => `${s} — New status: ${l}`,
    },
  },
  de: {
    reply: { title: (id) => `Antwort auf Ihr Ticket #${id}`, body: (s) => s },
    status: {
      title: (id, l) => `Ticket #${id}: ${l}`,
      body: (s, l) => `${s} — Neuer Status: ${l}`,
      inAppBody: (s, l) => `${s} — Neuer Status: ${l}`,
    },
  },
  es: {
    reply: { title: (id) => `Respuesta a tu ticket #${id}`, body: (s) => s },
    status: {
      title: (id, l) => `Ticket #${id}: ${l}`,
      body: (s, l) => `${s} — Nuevo estado: ${l}`,
      inAppBody: (s, l) => `${s} — Nuevo estado: ${l}`,
    },
  },
  it: {
    reply: { title: (id) => `Risposta al tuo ticket #${id}`, body: (s) => s },
    status: {
      title: (id, l) => `Ticket #${id}: ${l}`,
      body: (s, l) => `${s} — Nuovo stato: ${l}`,
      inAppBody: (s, l) => `${s} — Nuovo stato: ${l}`,
    },
  },
  nl: {
    reply: { title: (id) => `Antwoord op je ticket #${id}`, body: (s) => s },
    status: {
      title: (id, l) => `Ticket #${id}: ${l}`,
      body: (s, l) => `${s} — Nieuwe status: ${l}`,
      inAppBody: (s, l) => `${s} — Nieuwe status: ${l}`,
    },
  },
  pt: {
    reply: { title: (id) => `Resposta ao seu ticket #${id}`, body: (s) => s },
    status: {
      title: (id, l) => `Ticket #${id}: ${l}`,
      body: (s, l) => `${s} — Novo estado: ${l}`,
      inAppBody: (s, l) => `${s} — Novo estado: ${l}`,
    },
  },
};

const CATEGORIES = [
  "bug",
  "payment",
  "account",
  "team",
  "event",
  "feature_request",
  "other",
] as const;
const PRIORITIES = ["low", "normal", "high", "urgent"] as const;
const STATUSES = ["open", "in_progress", "waiting_user", "resolved", "closed"] as const;

const APP_BASE_URL = "https://www.clubero.app";
const SUPPORT_FROM_NAME = "Support Clubero";
const shortId = (id: string) => id.slice(0, 6).toUpperCase();

async function logSupportAudit(entry: {
  ticket_id: string;
  actor_user_id: string | null;
  actor_role: "user" | "staff" | "system";
  action: "status_changed" | "priority_changed" | "assigned" | "reply" | "internal_note" | "created";
  from_value?: string | null;
  to_value?: string | null;
  meta?: Record<string, unknown> | null;
}) {
  try {
    await supabaseAdmin.from("support_ticket_audit").insert({
      ticket_id: entry.ticket_id,
      actor_user_id: entry.actor_user_id,
      actor_role: entry.actor_role,
      action: entry.action,
      from_value: entry.from_value ?? null,
      to_value: entry.to_value ?? null,
      meta: (entry.meta ?? null) as any,
    });
  } catch (e) {
    console.error("[support] audit log failed", e);
  }
}


// ---------- Helpers ----------

async function notifySuperAdmins(opts: { title: string; body: string; link: string }) {
  const { data: admins } = await supabaseAdmin.from("super_admins").select("user_id");
  if (!admins?.length) return;
  await supabaseAdmin.from("notifications").insert(
    admins.map((a) => ({
      user_id: a.user_id,
      type: "support_ticket",
      title: opts.title,
      body: opts.body,
      link: opts.link,
    })),
  );
}

async function getUserProfile(userId: string) {
  const { data } = await supabaseAdmin
    .from("profiles")
    .select("full_name, first_name, preferred_language")
    .eq("id", userId)
    .maybeSingle();
  return data ?? null;
}

async function getUserEmail(userId: string): Promise<string | null> {
  const { data } = await supabaseAdmin.auth.admin.getUserById(userId);
  return data?.user?.email ?? null;
}

// ---------- Create ticket ----------

const CreateInput = z.object({
  subject: z.string().trim().min(1).max(200),
  description: z.string().trim().min(1).max(10000),
  category: z.enum(CATEGORIES).default("other"),
  priority: z.enum(PRIORITIES).default("normal"),
  club_id: z.string().uuid().nullable().optional(),
  user_intent: z.string().trim().max(2000).optional(),
  context: z
    .object({
      url: z.string().max(500).optional(),
      user_agent: z.string().max(500).optional(),
      viewport: z.string().max(50).optional(),
      locale: z.string().max(20).optional(),
      app_version: z.string().max(40).optional(),
    })
    .partial()
    .optional(),
  attachment_paths: z.array(z.string().max(500)).max(5).optional(),
});

export const createSupportTicket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => CreateInput.parse(input))
  .handler(async ({ data, context }) => {
    const userId = context.userId;

    // Validate attachments belong to the user's folder
    if (data.attachment_paths?.length) {
      for (const p of data.attachment_paths) {
        if (!p.startsWith(`${userId}/`)) {
          throw new Error("invalid_attachment_path");
        }
      }
    }

    const contextData = {
      ...(data.context ?? {}),
      user_intent: data.user_intent ?? null,
      submitted_at: new Date().toISOString(),
    };

    const { data: ticket, error } = await context.supabase
      .from("support_tickets")
      .insert({
        user_id: userId,
        club_id: data.club_id ?? null,
        subject: data.subject,
        description: data.description,
        category: data.category,
        priority: data.priority,
        context_data: contextData,
      })
      .select("id, subject, category, created_at")
      .single();
    if (error) throw new Error(error.message);

    // First message (mirrors the description so the thread is self-contained)
    await context.supabase.from("support_messages").insert({
      ticket_id: ticket.id,
      sender_id: userId,
      sender_role: "user",
      body: data.description,
      attachment_paths: data.attachment_paths ?? [],
    });

    // Audit: ticket created
    await logSupportAudit({
      ticket_id: ticket.id,
      actor_user_id: userId,
      actor_role: "user",
      action: "created",
      to_value: ticket.subject,
    });


    // Notify superadmins in-app
    await notifySuperAdmins({
      title: `Nouveau ticket #${shortId(ticket.id)}`,
      body: ticket.subject,
      link: `/superadmin/support-tickets/${ticket.id}`,
    });

    // Internal notification to hello@clubero.app
    const profile = await getUserProfile(userId);
    const email = await getUserEmail(userId);
    await enqueueTransactionalEmailServer({
      templateName: "support-ticket-internal",
      recipientEmail: "hello@clubero.app",
      templateData: {
        kind: "new_ticket",
        ticketShortId: shortId(ticket.id),
        subject: ticket.subject,
        category: ticket.category,
        priority: data.priority,
        authorName: profile?.full_name ?? profile?.first_name ?? null,
        authorEmail: email,
        bodyPreview: data.description.slice(0, 600),
        ticketUrl: `${APP_BASE_URL}/superadmin/support-tickets/${ticket.id}`,
      },
      idempotencyKey: `support-internal-created-${ticket.id}`,
    }).catch((e) => console.error("[support] internal email failed", e));

    // Confirmation email to the user
    if (email) {
      const locale = pickLocale(profile?.preferred_language);
      await enqueueTransactionalEmailServer({
        templateName: "support-ticket-created",
        recipientEmail: email,
        fromName: SUPPORT_FROM_NAME,
        templateData: {
          name: profile?.first_name ?? profile?.full_name ?? null,
          subject: ticket.subject,
          ticketShortId: shortId(ticket.id),
          category: ticket.category,
          ticketUrl: `${APP_BASE_URL}/support/${ticket.id}`,
          locale,
        },
        idempotencyKey: `support-created-user-${ticket.id}`,
      }).catch((e) => console.error("[support] user confirmation email failed", e));

    }

    return { id: ticket.id };
  });

// ---------- My tickets ----------

export const listMySupportTickets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("support_tickets")
      .select(
        "id, subject, category, priority, status, last_activity_at, created_at, user_unread_count",
      )
      .eq("user_id", context.userId)
      .order("last_activity_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

// ---------- Ticket detail ----------

const TicketIdInput = z.object({ ticket_id: z.string().uuid() });

export const getSupportTicket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => TicketIdInput.parse(input))
  .handler(async ({ data, context }) => {
    const { data: ticket, error } = await context.supabase
      .from("support_tickets")
      .select("*")
      .eq("id", data.ticket_id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!ticket) throw new Error("not_found");

    const { data: messages, error: mErr } = await context.supabase
      .from("support_messages")
      .select("id, sender_id, sender_role, body, attachment_paths, is_internal_note, created_at")
      .eq("ticket_id", data.ticket_id)
      .order("created_at", { ascending: true });
    if (mErr) throw new Error(mErr.message);

    // Mark read for the caller
    await context.supabase.rpc("mark_support_ticket_read", { _ticket_id: data.ticket_id });

    // Lookup author profile for staff display (superadmin view)
    const ownerProfile = await getUserProfile(ticket.user_id);
    const ownerEmail = await getUserEmail(ticket.user_id);

    return {
      ticket,
      messages: messages ?? [],
      owner: { full_name: ownerProfile?.full_name ?? null, email: ownerEmail },
    };
  });

// ---------- Reply ----------

const ReplyInput = z.object({
  ticket_id: z.string().uuid(),
  body: z.string().trim().min(1).max(10000),
  attachment_paths: z.array(z.string().max(500)).max(5).optional(),
  internal_note: z.boolean().optional(),
});

export const replyToSupportTicket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => ReplyInput.parse(input))
  .handler(async ({ data, context }) => {
    const userId = context.userId;
    const { data: ticket, error: tErr } = await context.supabase
      .from("support_tickets")
      .select("id, user_id, subject")
      .eq("id", data.ticket_id)
      .maybeSingle();
    if (tErr) throw new Error(tErr.message);
    if (!ticket) throw new Error("not_found");

    const isOwner = ticket.user_id === userId;
    const { data: isAdmin } = await context.supabase.rpc("has_super_admin", { _user_id: userId });
    if (!isOwner && !isAdmin) throw new Error("forbidden");
    if (data.internal_note && !isAdmin) throw new Error("forbidden");

    const senderRole = isOwner && !isAdmin ? "user" : "staff";

    if (data.attachment_paths?.length) {
      for (const p of data.attachment_paths) {
        if (!p.startsWith(`${userId}/`)) throw new Error("invalid_attachment_path");
      }
    }

    const { data: inserted, error: insErr } = await context.supabase
      .from("support_messages")
      .insert({
        ticket_id: data.ticket_id,
        sender_id: userId,
        sender_role: senderRole,
        body: data.body,
        attachment_paths: data.attachment_paths ?? [],
        is_internal_note: !!data.internal_note,
      })
      .select("id")
      .single();
    if (insErr) throw new Error(insErr.message);
    const messageId = inserted.id;

    if (!data.internal_note && senderRole === "staff") {
      // Notify ticket owner
      await supabaseAdmin.from("notifications").insert({
        user_id: ticket.user_id,
        type: "support_reply",
        title: `Réponse à #${shortId(ticket.id)}`,
        body: data.body.slice(0, 140),
        link: `/support/${ticket.id}`,
      });
      const profile = await getUserProfile(ticket.user_id);
      const email = await getUserEmail(ticket.user_id);
      const locale = pickLocale(profile?.preferred_language);
      const pushStrings = PUSH_STRINGS[locale];
      await sendPushToUser(ticket.user_id, {
        title: pushStrings.reply.title(shortId(ticket.id)),
        body: pushStrings.reply.body(ticket.subject),
        url: `/support/${ticket.id}`,
        tag: `support-reply-${messageId}`,
      }).catch((e) => console.error("[support] reply push failed", e));

      if (email) {
        await enqueueTransactionalEmailServer({
          templateName: "support-ticket-reply",
          recipientEmail: email,
          templateData: {
            name: profile?.first_name ?? profile?.full_name ?? null,
            subject: ticket.subject,
            ticketShortId: shortId(ticket.id),
            messagePreview: data.body.slice(0, 400),
            ticketUrl: `${APP_BASE_URL}/support/${ticket.id}`,
            locale,
          },
          // Use the inserted message id so retries stay idempotent.
          idempotencyKey: `support-reply-${messageId}`,
        }).catch((e) => console.error("[support] reply email failed", e));
      }
    }

    if (!data.internal_note && senderRole === "user") {
      // Internal notification to hello@clubero.app on user reply
      const profile = await getUserProfile(userId);
      const email = await getUserEmail(userId);
      await enqueueTransactionalEmailServer({
        templateName: "support-ticket-internal",
        recipientEmail: "hello@clubero.app",
        templateData: {
          kind: "user_reply",
          ticketShortId: shortId(ticket.id),
          subject: ticket.subject,
          authorName: profile?.full_name ?? profile?.first_name ?? null,
          authorEmail: email,
          bodyPreview: data.body.slice(0, 600),
          ticketUrl: `${APP_BASE_URL}/superadmin/support-tickets/${ticket.id}`,
        },
        idempotencyKey: `support-internal-reply-${messageId}`,
      }).catch((e) => console.error("[support] internal reply email failed", e));
    }

    return { ok: true };
  });

// ---------- Signed URL for attachment ----------

const AttachmentInput = z.object({ path: z.string().min(1).max(500) });

export const getSupportAttachmentUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => AttachmentInput.parse(input))
  .handler(async ({ data, context }) => {
    const userId = context.userId;
    const { data: isAdmin } = await context.supabase.rpc("has_super_admin", { _user_id: userId });
    if (!isAdmin && !data.path.startsWith(`${userId}/`)) {
      // Double-check via tickets: file may belong to a thread the user owns
      const owner = data.path.split("/")[0];
      if (owner !== userId) throw new Error("forbidden");
    }
    const { data: signed, error } = await supabaseAdmin.storage
      .from("support-attachments")
      .createSignedUrl(data.path, 60 * 5);
    if (error) throw new Error(error.message);
    return { url: signed.signedUrl };
  });

// ---------- Super admin: list / update / assign ----------

const ListInput = z
  .object({
    status: z.enum(STATUSES).optional(),
    priority: z.enum(PRIORITIES).optional(),
    category: z.enum(CATEGORIES).optional(),
    search: z.string().trim().max(120).optional(),
    limit: z.number().int().min(1).max(200).default(50),
  })
  .partial();

export const listAllSupportTickets = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => ListInput.parse(input ?? {}))
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_super_admin", {
      _user_id: context.userId,
    });
    if (!isAdmin) throw new Error("forbidden");

    let q = supabaseAdmin
      .from("support_tickets")
      .select(
        "id, user_id, club_id, subject, category, priority, status, staff_unread_count, last_activity_at, created_at, assigned_to",
      )
      .order("last_activity_at", { ascending: false })
      .limit(data.limit ?? 50);
    if (data.status) q = q.eq("status", data.status);
    if (data.priority) q = q.eq("priority", data.priority);
    if (data.category) q = q.eq("category", data.category);
    if (data.search) q = q.ilike("subject", `%${data.search}%`);

    const { data: tickets, error } = await q;
    if (error) throw new Error(error.message);

    // Hydrate user names
    const userIds = Array.from(new Set((tickets ?? []).map((t) => t.user_id)));
    const profileMap = new Map<string, { full_name: string | null }>();
    if (userIds.length) {
      const { data: profiles } = await supabaseAdmin
        .from("profiles")
        .select("id, full_name")
        .in("id", userIds);
      for (const p of profiles ?? []) profileMap.set(p.id, { full_name: p.full_name });
    }

    return (tickets ?? []).map((t) => ({
      ...t,
      user_full_name: profileMap.get(t.user_id)?.full_name ?? null,
    }));
  });

const UpdateInput = z.object({
  ticket_id: z.string().uuid(),
  status: z.enum(STATUSES).optional(),
  priority: z.enum(PRIORITIES).optional(),
  assigned_to: z.string().uuid().nullable().optional(),
});

export const updateSupportTicket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => UpdateInput.parse(input))
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_super_admin", {
      _user_id: context.userId,
    });

    // Owner exception: the ticket owner may either mark their own ticket as
    // "resolved" (when it's still active) or reopen it back to "open" (when
    // it's currently "resolved" or "closed"). Single-field update only.
    if (!isAdmin) {
      const isOwnerStatusChange =
        (data.status === "resolved" || data.status === "open") &&
        data.priority === undefined &&
        data.assigned_to === undefined;
      if (!isOwnerStatusChange) throw new Error("forbidden");
      const { data: owned } = await supabaseAdmin
        .from("support_tickets")
        .select("user_id, status")
        .eq("id", data.ticket_id)
        .maybeSingle();
      if (!owned || owned.user_id !== context.userId) throw new Error("forbidden");
      const closedLike = owned.status === "resolved" || owned.status === "closed";
      if (data.status === "resolved" && closedLike) throw new Error("forbidden");
      if (data.status === "open" && !closedLike) throw new Error("forbidden");
    }

    const patch: {
      status?: (typeof STATUSES)[number];
      priority?: (typeof PRIORITIES)[number];
      assigned_to?: string | null;
    } = {};
    if (data.status !== undefined) patch.status = data.status;
    if (data.priority !== undefined) patch.priority = data.priority;
    if (data.assigned_to !== undefined) patch.assigned_to = data.assigned_to;
    if (!Object.keys(patch).length) return { ok: true };

    // Read current status to detect change
    const { data: before } = await supabaseAdmin
      .from("support_tickets")
      .select("status, user_id, subject")
      .eq("id", data.ticket_id)
      .maybeSingle();

    const { error } = await supabaseAdmin
      .from("support_tickets")
      .update(patch)
      .eq("id", data.ticket_id);
    if (error) throw new Error(error.message);

    // Notify ticket owner on status change
    if (before && patch.status !== undefined && patch.status !== before.status && before.user_id) {
      const profile = await getUserProfile(before.user_id);
      const email = await getUserEmail(before.user_id);
      const locale = pickLocale(profile?.preferred_language);
      const pushStrings = PUSH_STRINGS[locale];
      const statusLabel = STATUS_LABELS[locale][patch.status] ?? patch.status;

      await supabaseAdmin.from("notifications").insert({
        user_id: before.user_id,
        type: "support_status",
        title: pushStrings.status.title(shortId(data.ticket_id), statusLabel),
        body: pushStrings.status.inAppBody(before.subject, statusLabel),
        link: `/support/${data.ticket_id}`,
      });
      await sendPushToUser(before.user_id, {
        title: pushStrings.status.title(shortId(data.ticket_id), statusLabel),
        body: pushStrings.status.body(before.subject, statusLabel),
        url: `/support/${data.ticket_id}`,
        tag: `support-status-${data.ticket_id}-${patch.status}`,
      }).catch((e) => console.error("[support] status push failed", e));

      if (email) {
        await enqueueTransactionalEmailServer({
          templateName: "support-ticket-status",
          recipientEmail: email,
          templateData: {
            name: profile?.first_name ?? profile?.full_name ?? null,
            subject: before.subject,
            ticketShortId: shortId(data.ticket_id),
            newStatus: patch.status,
            ticketUrl: `${APP_BASE_URL}/support/${data.ticket_id}`,
            locale,
          },
          idempotencyKey: `support-status-${data.ticket_id}-${patch.status}`,
        }).catch((e) => console.error("[support] status email failed", e));
      }
    }

    return { ok: true };
  });

// ---------- Stats for admin dashboard ----------

export const getSupportStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_super_admin", {
      _user_id: context.userId,
    });
    if (!isAdmin) throw new Error("forbidden");

    const { count: openCount } = await supabaseAdmin
      .from("support_tickets")
      .select("id", { count: "exact", head: true })
      .in("status", ["open", "in_progress", "waiting_user"]);

    const { count: urgentCount } = await supabaseAdmin
      .from("support_tickets")
      .select("id", { count: "exact", head: true })
      .eq("priority", "urgent")
      .in("status", ["open", "in_progress", "waiting_user"]);

    const { count: unreadCount } = await supabaseAdmin
      .from("support_tickets")
      .select("id", { count: "exact", head: true })
      .gt("staff_unread_count", 0);

    return {
      open: openCount ?? 0,
      urgent: urgentCount ?? 0,
      unread: unreadCount ?? 0,
    };
  });

// ---------- My unread count ----------

export const getSupportUnreadCount = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_super_admin", {
      _user_id: context.userId,
    });
    if (isAdmin) {
      // With head:true, Supabase returns `count` and `data` is null.
      const { count } = await supabaseAdmin
        .from("support_tickets")
        .select("id", { count: "exact", head: true })
        .gt("staff_unread_count", 0);
      return { count: count ?? 0 };
    }
    const { count } = await context.supabase
      .from("support_tickets")
      .select("id", { count: "exact", head: true })
      .eq("user_id", context.userId)
      .gt("user_unread_count", 0);
    return { count: count ?? 0 };
  });
