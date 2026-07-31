/**
 * Signalement et modération manuelle des contenus du mur (posts + commentaires).
 *
 * - `reportWallContent` : tout membre du club peut signaler un contenu qu'il voit.
 *   Insert via `context.supabase` (RLS), puis fan-out notification / push / e-mail
 *   vers les admins + dirigeants du club (best-effort).
 * - `listWallReports` / `resolveWallReport` : réservés aux admins/dirigeants du club.
 *   Modération 100 % manuelle : aucun masquage automatique.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const WALL_REPORT_REASONS = [
  "inappropriate",
  "harassment",
  "spam",
  "misinformation",
  "privacy",
  "other",
] as const;
export type WallReportReason = (typeof WALL_REPORT_REASONS)[number];

const ReportSchema = z.object({
  postId: z.string().uuid(),
  commentId: z.string().uuid().nullable().optional(),
  reason: z.enum(WALL_REPORT_REASONS),
  details: z.string().trim().max(500).optional(),
});

const ListSchema = z.object({
  clubId: z.string().uuid(),
  status: z.enum(["pending", "reviewing", "dismissed", "actioned", "all"]).default("pending"),
});

const ResolveSchema = z.object({
  reportId: z.string().uuid(),
  action: z.enum(["dismiss", "hide", "unhide", "delete", "reviewing"]),
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
    title: "🚩 Contenu signalé",
    body: (r, m) => `${r} a signalé un contenu du mur — ${m}`,
  },
  en: { title: "🚩 Content reported", body: (r, m) => `${r} reported wall content — ${m}` },
};

function reasonLabel(reason: WallReportReason, lang: string) {
  return (REASON_LABELS[lang] ?? REASON_LABELS.fr)[reason];
}

export const reportWallContent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => ReportSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const commentId = data.commentId ?? null;

    // Le post doit être lisible par l'appelant (RLS) → garantit l'appartenance à l'audience.
    const { data: post, error: postErr } = await supabase
      .from("wall_posts")
      .select("id, club_id, body, author_user_id, deleted_at")
      .eq("id", data.postId)
      .maybeSingle();
    if (postErr || !post || (post as { deleted_at?: string | null }).deleted_at) {
      throw new Error("not_found");
    }
    const clubId = (post as { club_id: string }).club_id;

    let excerpt = ((post as { body: string | null }).body ?? "").slice(0, 240);
    if (commentId) {
      const { data: comment } = await supabase
        .from("wall_comments")
        .select("id, post_id, body")
        .eq("id", commentId)
        .maybeSingle();
      if (!comment || (comment as { post_id: string }).post_id !== data.postId) {
        throw new Error("not_found");
      }
      excerpt = ((comment as { body: string | null }).body ?? "").slice(0, 240);
    }

    const { error: insertErr } = await supabase.from("wall_content_reports").insert({
      club_id: clubId,
      post_id: data.postId,
      comment_id: commentId,
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
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { sendPushToUser } = await import("@/lib/push-send.server");
      const { enqueueTransactionalEmailServer } = await import("@/lib/email/send.server");

      const { data: reporter } = await supabaseAdmin
        .from("profiles")
        .select("first_name, last_name, full_name")
        .eq("id", userId)
        .maybeSingle();
      const r = reporter as {
        first_name?: string | null;
        last_name?: string | null;
        full_name?: string | null;
      } | null;
      const reporterName =
        [r?.first_name, r?.last_name].filter(Boolean).join(" ").trim() ||
        r?.full_name ||
        "Un membre";

      const { data: club } = await supabaseAdmin
        .from("clubs")
        .select("name, default_language")
        .eq("id", clubId)
        .maybeSingle();
      const clubName = (club as { name?: string | null } | null)?.name ?? null;
      const clubLang = (club as { default_language?: string | null } | null)?.default_language;

      // Modérateurs = rôle principal OU présence dans roles[] (admin / dirigeant).
      const { data: mods } = await supabaseAdmin
        .from("club_members")
        .select("user_id, role, roles")
        .eq("club_id", clubId);
      const MOD_ROLES = new Set(["admin", "dirigeant"]);
      const modIds = Array.from(
        new Set(
          ((mods ?? []) as Array<{ user_id: string | null; role: string | null; roles: string[] | null }>)
            .filter(
              (m) =>
                (m.role && MOD_ROLES.has(m.role)) ||
                (m.roles ?? []).some((x) => MOD_ROLES.has(x)),
            )
            .map((m) => m.user_id)
            .filter((x): x is string => !!x && x !== userId),
        ),
      );

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
        const label = reasonLabel(data.reason, lang === "fr" ? "fr" : "en");
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
            tag: `wall-report-${data.postId}`,
          }).catch(() => ({ sent: 0, pruned: 0 }));
        }

        if (prof.notifications_email !== false) {
          const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(uid);
          const email = authUser?.user?.email;
          if (email) {
            await enqueueTransactionalEmailServer({
              templateName: "wall-content-reported",
              recipientEmail: email,
              idempotencyKey: `wall-report-${data.postId}-${commentId ?? "post"}-${userId}-${uid}`,
              recipientId: uid,
              notificationType: "wall_report",
              fromName: clubName ? `${clubName} via Clubero` : undefined,
              templateData: {
                moderatorFirstName: (prof.first_name as string) ?? undefined,
                reporterName,
                contentKind: commentId ? "comment" : "post",
                reasonLabel: label,
                details: data.details || null,
                excerpt,
                moderationUrl: `${baseUrl}${link}`,
                locale: lang,
              },
            }).catch(() => undefined);
          }
        }
      }
    } catch (e) {
      console.error("[wall-report] fan-out failed", (e as Error).message);
    }

    return { ok: true, notified };
  });

export const listWallReports = createServerFn({ method: "POST" })
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
      .from("wall_content_reports")
      .select(
        "id, post_id, comment_id, reporter_user_id, reason, details, status, resolution_note, reviewed_at, created_at",
      )
      .eq("club_id", data.clubId)
      .order("created_at", { ascending: false })
      .limit(200);
    if (data.status !== "all") q = q.eq("status", data.status);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    const reports = (rows ?? []) as Array<{
      id: string;
      post_id: string;
      comment_id: string | null;
      reporter_user_id: string;
      reason: WallReportReason;
      details: string | null;
      status: string;
      resolution_note: string | null;
      reviewed_at: string | null;
      created_at: string;
    }>;
    if (reports.length === 0) return { reports: [] };

    const postIds = Array.from(new Set(reports.map((r) => r.post_id)));
    const commentIds = reports.map((r) => r.comment_id).filter((x): x is string => !!x);
    const userIds = Array.from(new Set(reports.map((r) => r.reporter_user_id)));

    const [{ data: posts }, { data: comments }, { data: profs }] = await Promise.all([
      supabaseAdmin
        .from("wall_posts")
        .select("id, body, author_user_id, hidden_at, deleted_at")
        .in("id", postIds),
      commentIds.length
        ? supabaseAdmin
            .from("wall_comments")
            .select("id, body, author_user_id, hidden_at, deleted_at")
            .in("id", commentIds)
        : Promise.resolve({ data: [] as Array<Record<string, unknown>> }),
      supabaseAdmin.from("profiles").select("id, full_name, first_name").in("id", userIds),
    ]);

    const postById = new Map(
      ((posts ?? []) as Array<Record<string, unknown>>).map((p) => [p.id as string, p]),
    );
    const commentById = new Map(
      ((comments ?? []) as Array<Record<string, unknown>>).map((c) => [c.id as string, c]),
    );
    const nameById = new Map(
      ((profs ?? []) as Array<Record<string, unknown>>).map((p) => [
        p.id as string,
        ((p.full_name as string) || (p.first_name as string) || "—") as string,
      ]),
    );

    return {
      reports: reports.map((r) => {
        const target = r.comment_id ? commentById.get(r.comment_id) : postById.get(r.post_id);
        return {
          ...r,
          reporterName: nameById.get(r.reporter_user_id) ?? "—",
          kind: (r.comment_id ? "comment" : "post") as "comment" | "post",
          excerpt: ((target?.body as string) ?? "").slice(0, 300),
          hidden: !!target?.hidden_at,
          deleted: !!target?.deleted_at,
        };
      }),
    };
  });

export const resolveWallReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => ResolveSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: report } = await supabaseAdmin
      .from("wall_content_reports")
      .select("id, club_id, post_id, comment_id")
      .eq("id", data.reportId)
      .maybeSingle();
    if (!report) throw new Error("not_found");
    const rep = report as { club_id: string; post_id: string; comment_id: string | null };

    const { assertClubRole } = await import("@/lib/authz.server");
    await assertClubRole({
      supabase: context.supabase,
      userId: context.userId,
      clubId: rep.club_id,
      allowedRoles: ["admin", "dirigeant"],
    });

    const table = rep.comment_id ? "wall_comments" : "wall_posts";
    const targetId = rep.comment_id ?? rep.post_id;
    const now = new Date().toISOString();

    if (data.action === "hide") {
      await supabaseAdmin
        .from(table)
        .update({
          hidden_at: now,
          hidden_by: context.userId,
          hidden_reason: data.note || null,
        } as never)
        .eq("id", targetId);
    } else if (data.action === "unhide") {
      await supabaseAdmin
        .from(table)
        .update({ hidden_at: null, hidden_by: null, hidden_reason: null } as never)
        .eq("id", targetId);
    } else if (data.action === "delete") {
      await supabaseAdmin.rpc("soft_delete_entity", {
        _kind: rep.comment_id ? "wall_comment" : "wall_post",
        _id: targetId,
      } as never);
    }

    const status =
      data.action === "dismiss"
        ? "dismissed"
        : data.action === "reviewing"
          ? "reviewing"
          : data.action === "unhide"
            ? "reviewing"
            : "actioned";

    const { error } = await supabaseAdmin
      .from("wall_content_reports")
      .update({
        status,
        reviewed_by: context.userId,
        reviewed_at: now,
        resolution_note: data.note || null,
      } as never)
      .eq("id", data.reportId);
    if (error) throw new Error(error.message);

    try {
      await supabaseAdmin.from("audit_logs").insert({
        user_id: context.userId,
        action: `wall.moderation.${data.action}`,
        entity_type: rep.comment_id ? "wall_comment" : "wall_post",
        entity_id: targetId,
        metadata: { report_id: data.reportId, club_id: rep.club_id, note: data.note ?? null },
      } as never);
    } catch {
      /* best-effort */
    }

    return { ok: true, status };
  });
