import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, useActiveRole } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Eye, Loader2, MegaphoneIcon, MessageSquare, Pin, PinOff, Send, Trash2 } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { format } from "date-fns";
import { toast } from "sonner";
import { dateLocale, fmt } from "@/lib/date-locale";
import { AttachmentPicker, AttachmentList, type Attachment } from "@/components/attachments";
import { MentionInput, RenderWithMentions, parseMentions } from "@/components/mention-input";
import { WallFeedSkeleton } from "@/components/skeletons";

type Profile = { id: string; full_name: string | null; avatar_url: string | null };
type Comment = { id: string; post_id: string; author_user_id: string; body: string; created_at: string; author?: Profile | null };
type Post = {
  id: string;
  club_id: string;
  author_user_id: string;
  body: string;
  created_at: string;
  is_pinned: boolean;
  attachments: Attachment[];
  author?: Profile | null;
  comments?: Comment[];
  reads?: { user_id: string; read_at: string }[];
};

export function WallFeed({ clubId }: { clubId: string }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const role = useActiveRole();
  const [posts, setPosts] = useState<Post[]>([]);
  const [body, setBody] = useState("");
  const [atts, setAtts] = useState<Attachment[]>([]);
  const [posting, setPosting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [commentsEnabled, setCommentsEnabled] = useState(true);
  const [memberCount, setMemberCount] = useState(0);

  async function load() {
    setLoading(true);
    const { data: club } = await supabase
      .from("clubs").select("wall_comments_enabled").eq("id", clubId).single();
    setCommentsEnabled(!!club?.wall_comments_enabled);

    const { data: rawPosts } = await supabase
      .from("wall_posts")
      .select("id, club_id, author_user_id, body, created_at, is_pinned, attachments")
      .eq("club_id", clubId)
      .is("deleted_at", null)
      .order("is_pinned", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(50);
    // Dedupe by id (realtime + initial fetch sometimes overlap)
    const seen = new Set<string>();
    const ps = ((rawPosts ?? []) as Post[]).filter((p) => (seen.has(p.id) ? false : (seen.add(p.id), true)));
    if (ps.length) {
      const ids = ps.map((p) => p.id);
      const { data: rawComments } = await supabase
        .from("wall_comments")
        .select("id, post_id, author_user_id, body, created_at")
        .in("post_id", ids)
        .is("deleted_at", null)
        .order("created_at", { ascending: true });
      const allUserIds = Array.from(new Set([
        ...ps.map((p) => p.author_user_id),
        ...((rawComments ?? []).map((c) => c.author_user_id)),
      ]));
      const { data: profs } = await supabase
        .from("profiles").select("id, full_name, avatar_url").in("id", allUserIds);
      const map = new Map((profs ?? []).map((p) => [p.id, p as Profile]));
      const cByPost = new Map<string, Comment[]>();
      const seenComments = new Set<string>();
      (rawComments ?? []).forEach((c) => {
        if (seenComments.has(c.id)) return;
        seenComments.add(c.id);
        const cm = { ...c, author: map.get(c.author_user_id) ?? null } as Comment;
        const arr = cByPost.get(c.post_id) ?? [];
        arr.push(cm);
        cByPost.set(c.post_id, arr);
      });
      // Read receipts
      const { data: rawReads } = await supabase
        .from("wall_post_reads")
        .select("post_id, user_id, read_at")
        .in("post_id", ids);
      const rByPost = new Map<string, { user_id: string; read_at: string }[]>();
      (rawReads ?? []).forEach((r) => {
        const arr = rByPost.get(r.post_id) ?? [];
        arr.push({ user_id: r.user_id, read_at: r.read_at });
        rByPost.set(r.post_id, arr);
      });
      ps.forEach((p) => {
        p.author = map.get(p.author_user_id) ?? null;
        p.comments = cByPost.get(p.id) ?? [];
        p.reads = rByPost.get(p.id) ?? [];
      });

      // Mark unread posts as read for current user (best-effort, ignore errors)
      if (user) {
        const unread = ps.filter((p) => !(p.reads ?? []).some((r) => r.user_id === user.id));
        if (unread.length > 0) {
          supabase
            .from("wall_post_reads")
            .insert(unread.map((p) => ({ post_id: p.id, user_id: user.id })))
            .then(() => {});
        }
      }
    }
    // Total club members (denominator for "Lu par X/Y")
    const { count } = await supabase
      .from("club_members")
      .select("id", { count: "exact", head: true })
      .eq("club_id", clubId);
    setMemberCount(count ?? 0);
    setPosts(ps);
    setLoading(false);
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [clubId]);

  // Realtime — unique channel suffix to prevent collisions if effect double-mounts.
  useEffect(() => {
    const channelName = `wall:${clubId}:${Math.random().toString(36).slice(2)}`;
    const ch = supabase
      .channel(channelName)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "wall_posts", filter: `club_id=eq.${clubId}` },
        () => load())
      .on("postgres_changes",
        { event: "*", schema: "public", table: "wall_comments" },
        () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line
  }, [clubId]);

  async function notifyMentioned(ids: string[], link: string, snippet: string) {
    if (!user || ids.length === 0) return;
    const recipients = ids.filter((id) => id !== user.id);
    if (recipients.length === 0) return;
    const authorName = (await supabase.from("profiles").select("full_name").eq("id", user.id).single()).data?.full_name ?? "—";
    await supabase.from("notifications").insert(
      recipients.map((uid) => ({
        user_id: uid,
        type: "wall_mention",
        title: t("wall.mentionTitle", { defaultValue: "{{name}} vous a mentionné", name: authorName }),
        body: snippet.slice(0, 140),
        link,
      })),
    );
  }

  async function submitPost() {
    if ((!body.trim() && atts.length === 0) || !user) return;
    setPosting(true);
    const { data, error } = await supabase
      .from("wall_posts")
      .insert({ club_id: clubId, author_user_id: user.id, body: body.trim(), attachments: atts as unknown as never })
      .select("id")
      .single();
    setPosting(false);
    if (error) { toast.error(error.message); return; }
    const mentioned = parseMentions(body);
    if (mentioned.length && data?.id) {
      await notifyMentioned(mentioned, `/wall#${data.id}`, body.trim());
    }
    setBody("");
    setAtts([]);
  }

  async function deletePost(id: string) {
    const { error } = await supabase.rpc("soft_delete_entity", { _kind: "wall_post", _id: id });
    if (error) { toast.error(error.message); return; }
    toast(t("wall.postDeleted", { defaultValue: "Post deleted" }), {
      action: {
        label: t("common.undo", { defaultValue: "Undo" }),
        onClick: async () => {
          const { error: e2 } = await supabase.rpc("restore_entity", { _kind: "wall_post", _id: id });
          if (e2) toast.error(e2.message);
          else load();
        },
      },
    });
  }

  async function togglePin(id: string, next: boolean) {
    const { error } = await supabase.from("wall_posts").update({ is_pinned: next }).eq("id", id);
    if (error) toast.error(error.message);
  }

  if (loading) {
    return <WallFeedSkeleton />;
  }

  const canPost = role === "admin" || role === "coach";

  return (
    <div className="space-y-4">
      {canPost && (
        <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
          <MentionInput
            clubId={clubId}
            value={body}
            onChange={setBody}
            placeholder={t("wall.placeholder")}
            rows={3}
          />
          <AttachmentPicker value={atts} onChange={setAtts} prefix="wall" />
          <div className="flex justify-end">
            <Button onClick={submitPost} disabled={posting || (!body.trim() && atts.length === 0)}>
              {posting ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Send className="h-4 w-4 mr-1.5" />{t("wall.post")}</>}
            </Button>
          </div>
        </div>
      )}

      <WallGrouped
        posts={posts}
        currentUserId={user?.id ?? null}
        role={role}
        commentsEnabled={commentsEnabled}
        canPin={canPost}
        memberCount={memberCount}
        onDelete={deletePost}
        onTogglePin={togglePin}
      />
    </div>
  );
}

function WallGrouped({
  posts,
  currentUserId,
  role,
  commentsEnabled,
  canPin,
  memberCount,
  onDelete,
  onTogglePin,
}: {
  posts: Post[];
  currentUserId: string | null;
  role: string | null;
  commentsEnabled: boolean;
  canPin: boolean;
  memberCount: number;
  onDelete: (id: string) => void;
  onTogglePin: (id: string, next: boolean) => void;
}) {
  const { t } = useTranslation();
  const pinned = useMemo(() => posts.filter((p) => p.is_pinned), [posts]);
  const rest = useMemo(() => posts.filter((p) => !p.is_pinned), [posts]);

  const grouped = useMemo(() => {
    const map = new Map<string, { label: string; items: Post[] }>();
    for (const p of rest) {
      const d = new Date(p.created_at);
      const key = `${d.getFullYear()}-${String(d.getMonth()).padStart(2, "0")}`;
      const label = format(d, "MMMM yyyy", { locale: dateLocale() });
      if (!map.has(key)) map.set(key, { label, items: [] });
      map.get(key)!.items.push(p);
    }
    return Array.from(map.entries()).map(([key, v]) => ({ key, ...v }));
  }, [rest]);

  if (posts.length === 0) {
    return (
      <EmptyState
        icon={<MegaphoneIcon className="h-6 w-6" />}
        title={t("wall.empty")}
        description={t("wall.emptyHint", { defaultValue: "Aucune annonce pour l'instant. Les coachs et admins peuvent en publier ici." })}
      />
    );
  }

  const renderItem = (p: Post) => {
    const d = new Date(p.created_at);
    const canManage = p.author_user_id === currentUserId || role === "admin";
    return (
      <li
        key={p.id}
        className={cn(
          "group flex items-stretch gap-3 rounded-2xl border bg-card overflow-hidden",
          "transition-all duration-200 hover:shadow-md hover:-translate-y-px",
          "animate-in fade-in-0 slide-in-from-bottom-1 duration-300",
          p.is_pinned ? "border-primary/40 ring-1 ring-primary/15 shadow-sm" : "border-border"
        )}
      >
        <div className={cn(
          "flex flex-col items-center justify-center w-16 shrink-0 py-3 transition-colors",
          p.is_pinned ? "bg-primary/15" : "bg-primary/8 group-hover:bg-primary/12"
        )}>
          <span className="text-[10px] font-semibold uppercase tracking-wider text-primary">
            {fmt(d, "EEE")}
          </span>
          <span className="text-2xl font-bold leading-none mt-0.5 tabular-nums">{format(d, "d")}</span>
          <span className="text-[10px] text-muted-foreground mt-1 tabular-nums">{format(d, "HH:mm")}</span>
        </div>
        <div className="flex-1 min-w-0 py-3 pr-3">
          <header className="flex items-start justify-between gap-2 mb-1.5">
            <p className="text-sm font-semibold truncate flex items-center gap-1.5">
              {p.is_pinned && <Pin className="h-3.5 w-3.5 text-primary fill-primary/30" />}
              {p.author?.full_name ?? "—"}
            </p>
            <div className="flex items-center gap-1 shrink-0 opacity-60 group-hover:opacity-100 transition-opacity">
              {canPin && (
                <button
                  onClick={() => onTogglePin(p.id, !p.is_pinned)}
                  className="text-muted-foreground hover:text-primary p-1 -m-1 rounded-md hover:bg-primary/10 transition-colors"
                  aria-label={p.is_pinned ? t("wall.unpin", { defaultValue: "Désépingler" }) : t("wall.pin", { defaultValue: "Épingler" })}
                  title={p.is_pinned ? t("wall.unpin", { defaultValue: "Désépingler" }) : t("wall.pin", { defaultValue: "Épingler" })}
                >
                  {p.is_pinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
                </button>
              )}
              {canManage && (
                <button
                  onClick={() => onDelete(p.id)}
                  className="text-muted-foreground hover:text-destructive p-1 -m-1 rounded-md hover:bg-destructive/10 transition-colors"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          </header>
          {p.body && <RenderWithMentions text={p.body} className="text-sm" />}
          {p.attachments?.length > 0 && (
            <div className="mt-2">
              <AttachmentList items={p.attachments as Attachment[]} />
            </div>
          )}
          {(p.author_user_id === currentUserId || role === "admin" || role === "coach") &&
            memberCount > 0 && (() => {
              // Exclude the post author from the denominator: they don't need to "read" their own post
              const denom = Math.max(memberCount - 1, 0);
              const readers = (p.reads ?? []).filter((r) => r.user_id !== p.author_user_id).length;
              const capped = Math.min(readers, denom);
              return (
                <p className="mt-2 text-[11px] text-muted-foreground inline-flex items-center gap-1">
                  <Eye className="h-3 w-3" />
                  {t("wall.readBy", {
                    defaultValue: "Lu par {{n}}/{{total}}",
                    n: capped,
                    total: denom,
                  })}
                </p>
              );
            })()}
          {commentsEnabled && (
            <CommentBlock post={p} currentUserId={currentUserId} role={role} clubId={p.club_id} />
          )}
        </div>
      </li>
    );
  };

  return (
    <div className="space-y-7">
      {pinned.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-primary flex items-center gap-1.5">
            <Pin className="h-3 w-3" /> {t("wall.pinned", { defaultValue: "Épinglé" })}
          </h2>
          <ul className="space-y-2.5">{pinned.map(renderItem)}</ul>
        </section>
      )}
      {grouped.map((group) => (
        <section key={group.key} className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground sticky top-0 bg-background/80 backdrop-blur py-1 -mx-5 px-5">
            {group.label}
          </h2>
          <ul className="space-y-2.5">{group.items.map(renderItem)}</ul>
        </section>
      ))}
    </div>
  );
}

function CommentBlock({ post, currentUserId, role, clubId }: { post: Post; currentUserId: string | null; role: string | null; clubId: string }) {
  const { t } = useTranslation();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  async function add() {
    if (!text.trim() || !currentUserId) return;
    setBusy(true);
    const { data, error } = await supabase
      .from("wall_comments")
      .insert({ post_id: post.id, author_user_id: currentUserId, body: text.trim() })
      .select("id")
      .single();
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    const mentioned = parseMentions(text).filter((id) => id !== currentUserId);
    if (mentioned.length && data?.id) {
      const authorName = (await supabase.from("profiles").select("full_name").eq("id", currentUserId).single()).data?.full_name ?? "—";
      await supabase.from("notifications").insert(
        mentioned.map((uid) => ({
          user_id: uid,
          type: "wall_mention",
          title: t("wall.mentionTitle", { defaultValue: "{{name}} vous a mentionné", name: authorName }),
          body: text.trim().slice(0, 140),
          link: `/wall#${post.id}`,
        })),
      );
    }
    setText("");
  }

  async function del(id: string) {
    const { error } = await supabase.rpc("soft_delete_entity", { _kind: "wall_comment", _id: id });
    if (error) { toast.error(error.message); return; }
    toast(t("wall.commentDeleted", { defaultValue: "Comment deleted" }), {
      action: {
        label: t("common.undo", { defaultValue: "Undo" }),
        onClick: async () => {
          const { error: e2 } = await supabase.rpc("restore_entity", { _kind: "wall_comment", _id: id });
          if (e2) toast.error(e2.message);
        },
      },
    });
  }

  return (
    <div className="mt-3 pt-3 border-t border-border space-y-2">
      {(post.comments ?? []).map((c) => (
        <div key={c.id} className="flex items-start gap-2 text-sm">
          <MessageSquare className="h-3.5 w-3.5 mt-1 text-muted-foreground shrink-0" />
          <div className="min-w-0 flex-1">
            <p>
              <span className="font-medium">{c.author?.full_name ?? "—"}</span>{" "}
              <RenderWithMentions text={c.body} />
            </p>
            <p className="text-[10px] text-muted-foreground">
              {fmt(c.created_at, "d MMM HH:mm")}
            </p>
          </div>
          {(c.author_user_id === currentUserId || role === "admin") && (
            <button onClick={() => del(c.id)} className="text-muted-foreground hover:text-destructive">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      ))}
      <form onSubmit={(e) => { e.preventDefault(); add(); }} className="flex gap-2">
        <div className="flex-1">
          <MentionInput
            clubId={clubId}
            value={text}
            onChange={setText}
            placeholder={t("wall.commentPlaceholder")}
            asInput
          />
        </div>
        <Button type="submit" size="sm" disabled={busy || !text.trim()}>
          {t("wall.comment")}
        </Button>
      </form>
    </div>
  );
}
