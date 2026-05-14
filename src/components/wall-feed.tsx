import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, useActiveRole } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, MessageSquare, Send, Trash2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { AttachmentPicker, AttachmentList, type Attachment } from "@/components/attachments";

type Profile = { id: string; full_name: string | null; avatar_url: string | null };
type Comment = { id: string; post_id: string; author_user_id: string; body: string; created_at: string; author?: Profile | null };
type Post = {
  id: string;
  club_id: string;
  author_user_id: string;
  body: string;
  created_at: string;
  attachments: Attachment[];
  author?: Profile | null;
  comments?: Comment[];
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

  async function load() {
    setLoading(true);
    const { data: club } = await supabase
      .from("clubs").select("wall_comments_enabled").eq("id", clubId).single();
    setCommentsEnabled(!!club?.wall_comments_enabled);

    const { data: rawPosts } = await supabase
      .from("wall_posts")
      .select("id, club_id, author_user_id, body, created_at, attachments")
      .eq("club_id", clubId)
      .order("created_at", { ascending: false })
      .limit(50);
    const ps = (rawPosts ?? []) as Post[];
    if (ps.length) {
      const ids = ps.map((p) => p.id);
      const { data: rawComments } = await supabase
        .from("wall_comments")
        .select("id, post_id, author_user_id, body, created_at")
        .in("post_id", ids)
        .order("created_at", { ascending: true });
      const allUserIds = Array.from(new Set([
        ...ps.map((p) => p.author_user_id),
        ...((rawComments ?? []).map((c) => c.author_user_id)),
      ]));
      const { data: profs } = await supabase
        .from("profiles").select("id, full_name, avatar_url").in("id", allUserIds);
      const map = new Map((profs ?? []).map((p) => [p.id, p as Profile]));
      const cByPost = new Map<string, Comment[]>();
      (rawComments ?? []).forEach((c) => {
        const cm = { ...c, author: map.get(c.author_user_id) ?? null } as Comment;
        const arr = cByPost.get(c.post_id) ?? [];
        arr.push(cm);
        cByPost.set(c.post_id, arr);
      });
      ps.forEach((p) => {
        p.author = map.get(p.author_user_id) ?? null;
        p.comments = cByPost.get(p.id) ?? [];
      });
    }
    setPosts(ps);
    setLoading(false);
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [clubId]);

  // Realtime
  useEffect(() => {
    const ch = supabase
      .channel(`wall:${clubId}`)
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

  async function submitPost() {
    if ((!body.trim() && atts.length === 0) || !user) return;
    setPosting(true);
    const { error } = await supabase
      .from("wall_posts")
      .insert({ club_id: clubId, author_user_id: user.id, body: body.trim(), attachments: atts as unknown as never });
    setPosting(false);
    if (error) { toast.error(error.message); return; }
    setBody("");
    setAtts([]);
  }

  async function deletePost(id: string) {
    const { error } = await supabase.from("wall_posts").delete().eq("id", id);
    if (error) toast.error(error.message);
  }

  if (loading) {
    return <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
        <Textarea
          rows={3}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={t("wall.placeholder")}
        />
        <AttachmentPicker value={atts} onChange={setAtts} prefix="wall" />
        <div className="flex justify-end">
          <Button onClick={submitPost} disabled={posting || (!body.trim() && atts.length === 0)}>
            {posting ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Send className="h-4 w-4 mr-1.5" />{t("wall.post")}</>}
          </Button>
        </div>
      </div>

      {posts.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">{t("wall.empty")}</p>
      ) : (
        <ul className="space-y-3">
          {posts.map((p) => (
            <li key={p.id} className="rounded-2xl border border-border bg-card p-4">
              <header className="flex items-start justify-between gap-2 mb-2">
                <div>
                  <p className="text-sm font-semibold">{p.author?.full_name ?? "—"}</p>
                  <p className="text-xs text-muted-foreground">{formatDistanceToNow(new Date(p.created_at), { addSuffix: true })}</p>
                </div>
                {(p.author_user_id === user?.id || role === "admin") && (
                  <button onClick={() => deletePost(p.id)} className="text-muted-foreground hover:text-destructive">
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </header>
              <p className="text-sm whitespace-pre-wrap break-words">{p.body}</p>

              {commentsEnabled && (
                <CommentBlock post={p} currentUserId={user?.id ?? null} role={role} />
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function CommentBlock({ post, currentUserId, role }: { post: Post; currentUserId: string | null; role: string | null }) {
  const { t } = useTranslation();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  async function add() {
    if (!text.trim() || !currentUserId) return;
    setBusy(true);
    const { error } = await supabase
      .from("wall_comments")
      .insert({ post_id: post.id, author_user_id: currentUserId, body: text.trim() });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    setText("");
  }

  async function del(id: string) {
    const { error } = await supabase.from("wall_comments").delete().eq("id", id);
    if (error) toast.error(error.message);
  }

  return (
    <div className="mt-3 pt-3 border-t border-border space-y-2">
      {(post.comments ?? []).map((c) => (
        <div key={c.id} className="flex items-start gap-2 text-sm">
          <MessageSquare className="h-3.5 w-3.5 mt-1 text-muted-foreground shrink-0" />
          <div className="min-w-0 flex-1">
            <p>
              <span className="font-medium">{c.author?.full_name ?? "—"}</span>{" "}
              <span className="whitespace-pre-wrap break-words">{c.body}</span>
            </p>
            <p className="text-[10px] text-muted-foreground">
              {formatDistanceToNow(new Date(c.created_at), { addSuffix: true })}
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
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t("wall.commentPlaceholder")}
          className="flex-1 h-9 rounded-md border border-border bg-background px-3 text-sm"
        />
        <Button type="submit" size="sm" disabled={busy || !text.trim()}>
          {t("wall.comment")}
        </Button>
      </form>
    </div>
  );
}
