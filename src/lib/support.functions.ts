import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { enqueueTransactionalEmailServer } from "@/lib/email/send.server";

const CATEGORIES = ["bug", "payment", "account", "team", "event", "feature_request", "other"] as const;
const PRIORITIES = ["low", "normal", "high", "urgent"] as const;
const STATUSES = ["open", "in_progress", "waiting_user", "resolved", "closed"] as const;

const APP_BASE_URL = "https://www.clubero.app";
const shortId = (id: string) => id.slice(0, 6).toUpperCase();

// ---------- Helpers ----------

async function notifySuperAdmins(opts: {
  title: string;
  body: string;
  link: string;
}) {
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
    .select("full_name, first_name")
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

    // Notify superadmins in-app
    await notifySuperAdmins({
      title: `Nouveau ticket #${shortId(ticket.id)}`,
      body: ticket.subject,
      link: `/superadmin/support-tickets/${ticket.id}`,
    });

    // Email confirmation to user
    const profile = await getUserProfile(userId);
    const email = await getUserEmail(userId);
    if (email) {
      await enqueueTransactionalEmailServer({
        templateName: "support-ticket-created",
        recipientEmail: email,
        templateData: {
          name: profile?.first_name ?? profile?.full_name ?? null,
          subject: ticket.subject,
          ticketShortId: shortId(ticket.id),
          category: ticket.category,
          ticketUrl: `${APP_BASE_URL}/support/${ticket.id}`,
        },
        idempotencyKey: `support-created-${ticket.id}`,
      }).catch((e) => console.error("[support] email failed", e));
    }

    return { id: ticket.id };
  });

// ---------- My tickets ----------

export const listMySupportTickets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("support_tickets")
      .select("id, subject, category, priority, status, last_activity_at, created_at, user_unread_count")
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

    const { error: insErr } = await context.supabase.from("support_messages").insert({
      ticket_id: data.ticket_id,
      sender_id: userId,
      sender_role: senderRole,
      body: data.body,
      attachment_paths: data.attachment_paths ?? [],
      is_internal_note: !!data.internal_note,
    });
    if (insErr) throw new Error(insErr.message);

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
          },
          idempotencyKey: `support-reply-${ticket.id}-${Date.now()}`,
        }).catch((e) => console.error("[support] reply email failed", e));
      }
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
    const { data: isAdmin } = await context.supabase.rpc("has_super_admin", { _user_id: context.userId });
    if (!isAdmin) throw new Error("forbidden");

    let q = supabaseAdmin
      .from("support_tickets")
      .select("id, user_id, club_id, subject, category, priority, status, staff_unread_count, last_activity_at, created_at, assigned_to")
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
    const { data: isAdmin } = await context.supabase.rpc("has_super_admin", { _user_id: context.userId });
    if (!isAdmin) throw new Error("forbidden");

    const patch: Record<string, unknown> = {};
    if (data.status !== undefined) patch.status = data.status;
    if (data.priority !== undefined) patch.priority = data.priority;
    if (data.assigned_to !== undefined) patch.assigned_to = data.assigned_to;
    if (!Object.keys(patch).length) return { ok: true };

    const { error } = await supabaseAdmin
      .from("support_tickets")
      .update(patch)
      .eq("id", data.ticket_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- My unread count ----------

export const getSupportUnreadCount = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_super_admin", { _user_id: context.userId });
    if (isAdmin) {
      const { data } = await supabaseAdmin
        .from("support_tickets")
        .select("id", { count: "exact", head: true })
        .gt("staff_unread_count", 0);
      return { count: (data as any) ?? 0 };
    }
    const { count } = await context.supabase
      .from("support_tickets")
      .select("id", { count: "exact", head: true })
      .eq("user_id", context.userId)
      .gt("user_unread_count", 0);
    return { count: count ?? 0 };
  });
