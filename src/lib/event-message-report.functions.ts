/**
 * Signalement et modération des messages du chat d'événement.
 *
 * - `reportEventMessage` : quiconque voit le message (RLS du chat) peut le
 *   signaler. L'extrait et l'auteur sont figés côté serveur au moment du
 *   signalement (la table n'est pas insérable par les clients), puis fan-out
 *   notification / push / e-mail vers les admins + dirigeants du club, en
 *   excluant le signaleur et l'auteur du message.
 * - `listEventMessageReports` / `resolveEventMessageReport` : réservés aux
 *   admins/dirigeants. L'action « delete » supprime réellement le message
 *   (le signalement conserve l'extrait).
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { WALL_REPORT_REASONS, type WallReportReason } from "@/lib/wall/moderation.functions";
import { pickModeratorIds } from "@/lib/moderation-helpers";

const ReportSchema = z.object({
  messageId: z.string().uuid(),
  reason: z.enum(WALL_REPORT_REASONS),
  details: z.string().trim().max(500).optional(),
});

const ListSchema = z.object({
  clubId: z.string().uuid(),
  status: z.enum(["pending", "reviewing", "dismissed", "actioned", "all"]).default("pending"),
});

const ResolveSchema = z.object({
  reportId: z.string().uuid(),
  action: z.enum(["dismiss", "reviewing", "delete", "actioned"]),
  note: z.string().trim().max(500).optional(),
});

const REASON_LABELS: Record<string, Record<WallReportReason, string>> = {
  fr: {
    inappropriate: "Contenu inapproprié",
    harassment: "Harcèlement",
    spam: "Spam",
    misinformation: "Désinformation",
    privacy: "Atteinte à la vie privée",
    other: "Autre",
  },
  en: {
    inappropriate: "Inappropriate content",
    harassment: "Harassment",
    spam: "Spam",
    misinformation: "Misinformation",
    privacy: "Privacy issue",
    other: "Other",
  },
};

const PUSH_I18N: Record<string, { title: string; body: (r: string, m: string) => string }> = {
  fr: {
    title: "🚩 Message signalé",
    body: (r, m) => `${r} a signalé un message du chat — ${m}`,
  },
  en: { title: "🚩 Message reported", body: (r, m) => `${r} reported a chat message — ${m}` },
};

export const reportEventMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => ReportSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Le message doit être visible par l'appelant (RLS can_access_event_chat).
    const { data: msg } = await supabase
      .from("event_messages")
      .select("id, event_id, author_user_id, body")
      .eq("id", data.messageId)
      .maybeSingle();
    if (!msg) throw new Error("not_found");
    const message = msg as {
      id: string;
      event_id: string;
      author_user_id: string;
      body: string | null;
    };
    if (message.author_user_id === userId) throw new Error("cannot_report_self");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: ev } = await supabaseAdmin
      .from("events")
      .select("id, team_id, teams:team_id(club_id)")
      .eq("id", message.event_id)
      .maybeSingle();
    const clubId = (ev as { teams?: { club_id?: string } } | null)?.teams?.club_id;
    if (!clubId) throw new Error("not_found");

    // Snapshot serveur : extrait + auteur figés même si le message est supprimé.
    const { error: insertErr } = await supabaseAdmin.from("event_message_reports").insert({
      club_id: clubId,
      event_id: message.event_id,
      message_id: message.id,
      message_author_user_id: message.author_user_id,
      excerpt: (message.body ?? "").slice(0, 300) || null,
      reporter_user_id: userId,
      reason: data.reason,
      details: data.details || null,
    } as never);
    if (insertErr) {
      if (insertErr.code === "23505") return { ok: true, duplicate: true as const, notified: 0 };
      throw new Error(insertErr.message);
    }

    // ---- Fan-out vers les modérateurs (best-effort) -------------------------
    let notified = 0;
    try {
      const { sendPushToUser } = await import("@/lib/push-send.server");
      const { enqueueTransactionalEmailServer } = await import("@/lib/email/send.server");

      const [{ data: reporter }, { data: club }, { data: mods }] = await Promise.all([
        supabaseAdmin
          .from("profiles")
          .select("first_name, last_name, full_name")
          .eq("id", userId)
          .maybeSingle(),
        supabaseAdmin.from("clubs").select("name, default_language").eq("id", clubId).maybeSingle(),
        supabaseAdmin.from("club_members").select("user_id, role, roles").eq("club_id", clubId),
      ]);

      const r = reporter as {
        first_name?: string | null;
        last_name?: string | null;
        full_name?: string | null;
      } | null;
      const reporterName =
        [r?.first_name, r?.last_name].filter(Boolean).join(" ").trim() ||
        r?.full_name ||
        "Un membre";
      const clubName = (club as { name?: string | null } | null)?.name ?? null;
      const clubLang = (club as { default_language?: string | null } | null)?.default_language;

      // Exclut le signaleur et l'auteur du message signalé.
      const modIds = pickModeratorIds((mods ?? []) as never, [userId, message.author_user_id]);
      if (modIds.length === 0) return { ok: true, notified: 0 };

      const { data: profs } = await supabaseAdmin
        .from("profiles")
        .select("id, first_name, preferred_language, notifications_push, notifications_email")
        .in("id", modIds);
      const profById = new Map(
        ((profs ?? []) as Array<Record<string, unknown>>).map((p) => [p.id as string, p]),
      );

      const link = "/admin/moderation";
      const baseUrl = process.env.SITE_URL || "https://www.clubero.app";

      for (const uid of modIds) {
        const prof = profById.get(uid) ?? {};
        const lang = ((prof.preferred_language as string) || clubLang || "fr").slice(0, 2);
        const i18n = PUSH_I18N[lang] ?? PUSH_I18N.fr;
        const label = (REASON_LABELS[lang === "fr" ? "fr" : "en"] ?? REASON_LABELS.fr)[data.reason];
        const bodyText = i18n.body(reporterName, label);

        await supabaseAdmin.from("notifications").insert({
          user_id: uid,
          type: "wall_report",
          title: i18n.title,
          body: bodyText,
          link,
        } as never);
        notified += 1;

        if (prof.notifications_push !== false) {
          await sendPushToUser(uid, {
            title: i18n.title,
            body: bodyText,
            url: `${link}?from=push`,
            tag: `chat-report-${message.id}`,
          }).catch(() => ({ sent: 0, pruned: 0 }));
        }

        if (prof.notifications_email !== false) {
          const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(uid);
          const email = authUser?.user?.email;
          if (email) {
            await enqueueTransactionalEmailServer({
              templateName: "wall-content-reported",
              recipientEmail: email,
              idempotencyKey: `chat-report-${message.id}-${userId}-${uid}`,
              recipientId: uid,
              notificationType: "wall_report",
              fromName: clubName ? `${clubName} via Clubero` : undefined,
              templateData: {
                moderatorFirstName: (prof.first_name as string) ?? undefined,
                reporterName,
                contentKind: "message",
                reasonLabel: label,
                details: data.details || null,
                excerpt: (message.body ?? "").slice(0, 240) || null,
                moderationUrl: `${baseUrl}${link}`,
                locale: lang,
              },
            }).catch(() => undefined);
          }
        }
      }
    } catch (e) {
      console.error("[chat-report] fan-out failed", (e as Error).message);
    }

    return { ok: true, notified };
  });

export const listEventMessageReports = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => ListSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { assertClubRole } = await import("@/lib/authz.server");
    await assertClubRole({
      supabase: context.supabase,
      userId: context.userId,
      clubId: data.clubId,
      allowedRoles: ["admin", "dirigeant"],
    });
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let q = supabaseAdmin
      .from("event_message_reports")
      .select(
        "id, event_id, message_id, message_author_user_id, excerpt, reporter_user_id, reason, details, status, resolution_note, reviewed_at, created_at",
      )
      .eq("club_id", data.clubId)
      .order("created_at", { ascending: false })
      .limit(200);
    if (data.status !== "all") q = q.eq("status", data.status);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    const reports = (rows ?? []) as Array<{
      id: string;
      event_id: string;
      message_id: string | null;
      message_author_user_id: string | null;
      excerpt: string | null;
      reporter_user_id: string;
      reason: WallReportReason;
      details: string | null;
      status: string;
      resolution_note: string | null;
      reviewed_at: string | null;
      created_at: string;
    }>;
    if (reports.length === 0) return { reports: [] };

    const userIds = Array.from(
      new Set(
        reports.flatMap((r) => [r.reporter_user_id, r.message_author_user_id].filter(Boolean)),
      ),
    ) as string[];
    const { data: profs } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name, first_name, last_name")
      .in("id", userIds);
    const nameById = new Map(
      ((profs ?? []) as Array<Record<string, unknown>>).map((p) => [
        p.id as string,
        ([p.first_name, p.last_name].filter(Boolean).join(" ").trim() ||
          (p.full_name as string) ||
          "—") as string,
      ]),
    );

    return {
      reports: reports.map((r) => ({
        ...r,
        reporterName: nameById.get(r.reporter_user_id) ?? "—",
        authorName: r.message_author_user_id
          ? (nameById.get(r.message_author_user_id) ?? "—")
          : "—",
        deleted: !r.message_id,
      })),
    };
  });

export const resolveEventMessageReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => ResolveSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: report } = await supabaseAdmin
      .from("event_message_reports")
      .select("id, club_id, message_id")
      .eq("id", data.reportId)
      .maybeSingle();
    if (!report) throw new Error("not_found");
    const rep = report as { club_id: string; message_id: string | null };

    const { assertClubRole } = await import("@/lib/authz.server");
    await assertClubRole({
      supabase: context.supabase,
      userId: context.userId,
      clubId: rep.club_id,
      allowedRoles: ["admin", "dirigeant"],
    });

    if (data.action === "delete" && rep.message_id) {
      const { error: delErr } = await supabaseAdmin
        .from("event_messages")
        .delete()
        .eq("id", rep.message_id);
      if (delErr) throw new Error(delErr.message);
    }

    const status =
      data.action === "dismiss"
        ? "dismissed"
        : data.action === "reviewing"
          ? "reviewing"
          : "actioned";

    const { error } = await supabaseAdmin
      .from("event_message_reports")
      .update({
        status,
        reviewed_by: context.userId,
        reviewed_at: new Date().toISOString(),
        resolution_note: data.note || null,
      } as never)
      .eq("id", data.reportId);
    if (error) throw new Error(error.message);

    try {
      await supabaseAdmin.from("audit_logs").insert({
        user_id: context.userId,
        action: `chat.moderation.${data.action}`,
        entity_type: "event_message_report",
        entity_id: data.reportId,
        metadata: {
          club_id: rep.club_id,
          message_id: rep.message_id,
          note: data.note ?? null,
        },
      } as never);
    } catch {
      /* best-effort */
    }

    return { ok: true, status };
  });
