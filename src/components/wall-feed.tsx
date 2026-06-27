import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, useActiveRole, useMyRoles } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import {
  Eye,
  ExternalLink,
  Loader2,
  MegaphoneIcon,
  MessageSquare,
  Pin,
  PinOff,
  Send,
  Trash2,
} from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { format } from "date-fns";
import { toast } from "sonner";
import { dateLocale, fmt } from "@/lib/date-locale";
import { AttachmentPicker, AttachmentList, type Attachment } from "@/components/attachments";
import { MentionInput, RenderWithMentions, parseMentions } from "@/components/mention-input";
import { WallFeedSkeleton } from "@/components/skeletons";
import { cn } from "@/lib/utils";
import { dispatchWallPostPush } from "@/lib/push-dispatch.functions";

type Profile = { id: string; full_name: string | null; avatar_url: string | null };
type Comment = {
  id: string;
  post_id: string;
  author_user_id: string;
  body: string;
  created_at: string;
  author?: Profile | null;
};
type PostSource = "clubero" | "instagram" | "facebook" | "twitter";
type AudienceType = "club" | "team" | "multi_team";
type Team = { id: string; name: string };
type Post = {
  id: string;
  club_id: string;
  author_user_id: string | null;
  body: string;
  created_at: string;
  is_pinned: boolean;
  attachments: Attachment[];
  source: PostSource;
  external_id: string | null;
  external_url: string | null;
  external_media_url: string | null;
  audience_team_ids: string[] | null;
  audience_type: AudienceType;
  author?: Profile | null;
  comments?: Comment[];
  reads?: { user_id: string; read_at: string }[];
};

const SOURCE_META: Record<Exclude<PostSource, "clubero">, { label: string; cls: string }> = {
  instagram: {
    label: "Instagram",
    cls: "bg-pink-500/15 text-pink-600 dark:text-pink-400 border-pink-500/30",
  },
  facebook: {
    label: "Facebook",
    cls: "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30",
  },
  twitter: { label: "X", cls: "bg-foreground/10 text-foreground border-foreground/20" },
};

export function WallFeed({ clubId }: { clubId: string }) {
  const { t } = useTranslation();
  const dispatchWallPostPushFn = useServerFn(dispatchWallPostPush);
  const { user } = useAuth();
  const role = useActiveRole();
  const roles = useMyRoles();
  const [posts, setPosts] = useState<Post[]>([]);
  const [body, setBody] = useState("");
  const [atts, setAtts] = useState<Attachment[]>([]);
  const [posting, setPosting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [commentsEnabled, setCommentsEnabled] = useState(true);
  const [memberCount, setMemberCount] = useState(0);
  // Targetable teams for the audience picker; computed from club teams + user rights.
  const [allTeams, setAllTeams] = useState<Team[]>([]);
  const [targetableTeams, setTargetableTeams] = useState<Team[]>([]);
  // null = "Tout le club"; [] = nothing selected yet (forces explicit choice for multi-team coaches).
  const [audience, setAudience] = useState<string[] | null>(null);

  async function load() {
    setLoading(true);
    const { data: club } = await supabase
      .from("clubs")
      .select("wall_comments_enabled")
      .eq("id", clubId)
      .single();
    setCommentsEnabled(!!club?.wall_comments_enabled);

    const { data: rawPosts } = await supabase
      .from("wall_posts")
      .select(
        "id, club_id, author_user_id, body, created_at, is_pinned, attachments, source, external_id, external_url, external_media_url, audience_team_ids, audience_type",
      )
      .eq("club_id", clubId)
      .is("deleted_at", null)
      .order("is_pinned", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(50);

    // Dedupe by id (realtime + initial fetch sometimes overlap)
    const seen = new Set<string>();
    const ps = ((rawPosts ?? []) as Post[]).filter((p) =>
      seen.has(p.id) ? false : (seen.add(p.id), true),
    );
    if (ps.length) {
      const ids = ps.map((p) => p.id);
      const { data: rawComments } = await supabase
        .from("wall_comments")
        .select("id, post_id, author_user_id, body, created_at")
        .in("post_id", ids)
        .is("deleted_at", null)
        .order("created_at", { ascending: true });
      const allUserIds = Array.from(
        new Set([
          ...ps.map((p) => p.author_user_id).filter((x): x is string => !!x),
          ...(rawComments ?? []).map((c) => c.author_user_id),
        ]),
      );
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, full_name, avatar_url")
        .in("id", allUserIds);
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
        p.author = p.author_user_id ? (map.get(p.author_user_id) ?? null) : null;
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

  useEffect(() => {
    load(); /* eslint-disable-next-line */
  }, [clubId]);

  // Realtime — unique channel suffix to prevent collisions if effect double-mounts.
  useEffect(() => {
    const channelName = `wall:${clubId}:${Math.random().toString(36).slice(2)}`;
    const ch = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "wall_posts", filter: `club_id=eq.${clubId}` },
        () => load(),
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "wall_comments" }, () =>
        load(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line
  }, [clubId]);

  // Load club teams + compute targetable subset for the audience picker.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const { data: teamRows } = await supabase
        .from("teams")
        .select("id, name")
        .eq("club_id", clubId)
        .is("deleted_at", null)
        .order("name", { ascending: true });
      if (cancelled) return;
      const all = (teamRows ?? []) as Team[];
      setAllTeams(all);

      const isPriv = roles.includes("admin") || roles.includes("dirigeant");
      let targetable: Team[] = [];
      if (isPriv || roles.includes("coach")) {
        // Club-wide coach / admin / dirigeant → every team is targetable.
        targetable = all;
      } else {
        // Team-level staff only → keep teams where the user has a non-player role.
        const { data: tm } = await supabase
          .from("team_members")
          .select("team_id")
          .eq("user_id", user.id)
          .in(
            "team_id",
            all.map((t) => t.id),
          );
        const allowed = new Set((tm ?? []).map((r) => (r as any).team_id as string));
        targetable = all.filter((t) => allowed.has(t.id));
      }
      if (cancelled) return;
      setTargetableTeams(targetable);

      // Preselection rules (nuancées) :
      // - admin / dirigeant → club-wide (null).
      // - coach with exactly one targetable team → preselect that team.
      // - coach with several teams → leave empty (force an explicit choice).
      if (isPriv) {
        setAudience(null);
      } else if (targetable.length === 1) {
        setAudience([targetable[0].id]);
      } else {
        setAudience([]);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line
  }, [clubId, user?.id, roles.join("|")]);

  async function notifyMentioned(ids: string[], link: string, snippet: string) {
    if (!user || ids.length === 0) return;
    const recipients = ids.filter((id) => id !== user.id);
    if (recipients.length === 0) return;
    const authorName =
      (await supabase.from("profiles").select("full_name").eq("id", user.id).single()).data
        ?.full_name ?? "—";
    await supabase.from("notifications").insert(
      recipients.map((uid) => ({
        user_id: uid,
        type: "wall_mention",
        title: t("wall.mentionTitle", {
          defaultValue: "{{name}} vous a mentionné",
          name: authorName,
        }),
        body: snippet.slice(0, 140),
        link,
      })),
    );
  }

  async function submitPost() {
    if ((!body.trim() && atts.length === 0) || !user) return;

    // Resolve final audience for the insert.
    //   null         → "Tout le club"
    //   [] (forced)  → coach must pick at least one team
    //   [ids]        → team-scoped (1 or many)
    const isPriv = roles.includes("admin") || roles.includes("dirigeant");
    const audienceForInsert: string[] | null =
      audience === null ? null : audience.length === 0 ? null : audience;
    if (!isPriv && audienceForInsert === null && audience !== null) {
      toast.error(
        t("wall.audienceRequired", {
          defaultValue: "Choisissez au moins une équipe ou « Tout le club ».",
        }),
      );
      return;
    }

    setPosting(true);
    const insertPayload = {
      club_id: clubId,
      author_user_id: user.id,
      body: body.trim(),
      attachments: atts as unknown as never,
      audience_team_ids: audienceForInsert as unknown as never,
    };

    // Pre-flight: confirm the JWT subject matches user.id and that the active
    // club is actually one we're a member of. Either mismatch is the only way
    // the wall_posts_insert policy can return 42501 for a non-trigger reason.
    const { data: sess } = await supabase.auth.getSession();
    const jwtSub = sess.session?.user?.id ?? null;
    const { data: memberRow } = await supabase
      .from("club_members")
      .select("club_id, role, roles")
      .eq("user_id", user.id)
      .eq("club_id", clubId)
      .maybeSingle();

    const { data, error } = await supabase
      .from("wall_posts")
      .insert(insertPayload)
      .select("id")
      .single();
    setPosting(false);
    if (error) {
      // eslint-disable-next-line no-console
      console.error("[wall_posts.insert] failed", {
        code: (error as any).code,
        message: error.message,
        details: (error as any).details,
        hint: (error as any).hint,
        payload: { ...insertPayload, body: `<${insertPayload.body.length} chars>` },
        userId: user.id,
        jwtSub,
        jwtMatchesUser: jwtSub === user.id,
        hasSession: !!sess.session,
        clubMembershipRow: memberRow,
        roles,
      });
      const code = (error as any).code as string | undefined;
      const isRls = code === "42501" || /row-level security/i.test(error.message);
      if (isRls && !sess.session) {
        toast.error(
          t("wall.errorNoSession", {
            defaultValue: "Ta session a expiré. Reconnecte-toi puis recommence.",
          }),
        );
      } else if (isRls && !memberRow) {
        toast.error(
          t("wall.errorNotMember", {
            defaultValue: "Tu n'es plus membre de ce club. Change de club actif puis recommence.",
          }),
        );
      } else if (isRls) {
        toast.error(
          t("wall.errorNoPermission", {
            defaultValue:
              "Tu n'as pas les droits pour publier ici. Vérifie ton club actif et l'équipe sélectionnée.",
          }),
        );
      } else {
        toast.error(error.message);
      }
      return;
    }
    const mentioned = parseMentions(body);
    if (mentioned.length && data?.id) {
      await notifyMentioned(mentioned, `/inbox#${data.id}`, body.trim());
    }
    if (data?.id) {
      const authorName =
        (await supabase.from("profiles").select("full_name").eq("id", user.id).single()).data
          ?.full_name ?? "—";

      // Recipient set for in-app notifications must mirror the post audience
      // (same rule as push dispatch / RLS) — never notify someone who can't see the post.
      const recipientSet = new Set<string>();
      if (audienceForInsert === null) {
        const { data: members } = await supabase
          .from("club_members")
          .select("user_id")
          .eq("club_id", clubId);
        for (const m of members ?? []) {
          const uid = (m as any).user_id as string | null;
          if (uid) recipientSet.add(uid);
        }
      } else {
        // Admins/dirigeants always see every post.
        const { data: priv } = await supabase
          .from("club_members")
          .select("user_id, role")
          .eq("club_id", clubId)
          .in("role", ["admin", "dirigeant"]);
        for (const m of priv ?? []) {
          const uid = (m as any).user_id as string | null;
          if (uid) recipientSet.add(uid);
        }
        const { data: tm } = await supabase
          .from("team_members")
          .select("user_id, player_id")
          .in("team_id", audienceForInsert);
        const playerIds: string[] = [];
        for (const r of tm ?? []) {
          const uid = (r as any).user_id as string | null;
          const pid = (r as any).player_id as string | null;
          if (uid) recipientSet.add(uid);
          if (pid) playerIds.push(pid);
        }
        if (playerIds.length) {
          const { data: pls } = await supabase
            .from("players")
            .select("user_id")
            .in("id", playerIds);
          for (const p of pls ?? []) {
            const uid = (p as any).user_id as string | null;
            if (uid) recipientSet.add(uid);
          }
          const { data: parents } = await supabase
            .from("player_parents")
            .select("parent_user_id")
            .in("player_id", playerIds);
          for (const pr of parents ?? []) {
            const uid = (pr as any).parent_user_id as string | null;
            if (uid) recipientSet.add(uid);
          }
        }
      }
      recipientSet.delete(user.id);
      for (const m of mentioned) recipientSet.delete(m);

      const recipients = Array.from(recipientSet);
      if (recipients.length) {
        const snippet =
          body.trim() || t("wall.newAttachment", { defaultValue: "Nouvelle pièce jointe" });
        await supabase.from("notifications").insert(
          recipients.map((uid) => ({
            user_id: uid,
            type: "wall_post",
            title: t("wall.newPostTitle", {
              defaultValue: "{{name}} a publié sur le mur",
              name: authorName,
            }),
            body: snippet.slice(0, 140),
            link: `/inbox#${data.id}`,
          })),
        );
      }
    }
    // Web Push fire-and-forget (server re-derives audience from the post).
    if (data?.id) {
      void (async () => {
        try {
          await dispatchWallPostPushFn({ data: { postId: data.id } });
        } catch (e) {
          console.warn("[push] wall dispatch failed", e);
        }
      })();
    }
    setBody("");
    setAtts([]);
    // Reset audience to the per-role default for the next post.
    if (isPriv) setAudience(null);
    else if (targetableTeams.length === 1) setAudience([targetableTeams[0].id]);
    else setAudience([]);
  }

  async function deletePost(id: string) {
    const { error } = await supabase.rpc("soft_delete_entity", { _kind: "wall_post", _id: id });
    if (error) {
      toast.error(error.message);
      return;
    }
    toast(t("wall.postDeleted", { defaultValue: "Post deleted" }), {
      action: {
        label: t("common.undo", { defaultValue: "Undo" }),
        onClick: async () => {
          const { error: e2 } = await supabase.rpc("restore_entity", {
            _kind: "wall_post",
            _id: id,
          });
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

  const teamsById = useMemo(() => {
    const m = new Map<string, Team>();
    for (const tt of allTeams) m.set(tt.id, tt);
    return m;
  }, [allTeams]);

  if (loading) {
    return <WallFeedSkeleton />;
  }

  const canPost =
    roles.includes("admin") || roles.includes("coach") || roles.includes("assistant_coach");
  const audienceMissing =
    canPost &&
    !(roles.includes("admin") || roles.includes("dirigeant")) &&
    audience !== null &&
    audience.length === 0;

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
          <AudiencePicker
            teams={targetableTeams}
            value={audience}
            onChange={setAudience}
            canPickClubWide={
              roles.includes("admin") ||
              roles.includes("dirigeant") ||
              targetableTeams.length === allTeams.length
            }
          />
          <AttachmentPicker value={atts} onChange={setAtts} prefix="wall" />
          <div className="flex items-center justify-between gap-2">
            {audienceMissing ? (
              <p className="text-xs text-destructive">
                {t("wall.audienceRequired", { defaultValue: "Choisissez au moins une équipe." })}
              </p>
            ) : (
              <span />
            )}
            <Button
              onClick={submitPost}
              disabled={posting || (!body.trim() && atts.length === 0) || audienceMissing}
            >
              {posting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <Send className="h-4 w-4 mr-1.5" />
                  {t("wall.post")}
                </>
              )}
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
        teamsById={teamsById}
        onDelete={deletePost}
        onTogglePin={togglePin}
      />
    </div>
  );
}

// Inline audience picker — "À : Tout le club | U13 | U15 …"
function AudiencePicker({
  teams,
  value,
  onChange,
  canPickClubWide,
}: {
  teams: Team[];
  value: string[] | null;
  onChange: (next: string[] | null) => void;
  canPickClubWide: boolean;
}) {
  const { t } = useTranslation();
  const isClubWide = value === null;
  function toggleTeam(id: string) {
    if (value === null) {
      onChange([id]);
      return;
    }
    if (value.includes(id)) {
      const next = value.filter((x) => x !== id);
      onChange(next);
    } else {
      onChange([...value, id]);
    }
  }
  if (teams.length === 0 && !canPickClubWide) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-xs font-medium text-muted-foreground mr-1">
        {t("wall.audienceTo", { defaultValue: "À :" })}
      </span>
      {canPickClubWide && (
        <button
          type="button"
          onClick={() => onChange(null)}
          className={cn(
            "text-xs px-2.5 py-1 rounded-full border transition-colors",
            isClubWide
              ? "bg-primary text-primary-foreground border-primary"
              : "bg-background text-foreground border-border hover:bg-accent",
          )}
        >
          {t("wall.scope.allClub", { defaultValue: "Tout le club" })}
        </button>
      )}
      {teams.map((tt) => {
        const active = !isClubWide && (value ?? []).includes(tt.id);
        return (
          <button
            key={tt.id}
            type="button"
            onClick={() => toggleTeam(tt.id)}
            className={cn(
              "text-xs px-2.5 py-1 rounded-full border transition-colors",
              active
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background text-foreground border-border hover:bg-accent",
            )}
          >
            {tt.name}
          </button>
        );
      })}
    </div>
  );
}

// Reusable audience badge — used on each post in the feed.
// Mirrors push scopeLabel logic; "Tout le club" is the only translated label,
// team names are data (not translated). Deleted/unknown teams are filtered out;
// if none survive, we surface a discreet "Audience restreinte" hint so admins
// understand why the post is now narrower than originally targeted.
function AudienceBadge({ post, teamsById }: { post: Post; teamsById: Map<string, Team> }) {
  const { t } = useTranslation();
  if (post.audience_team_ids === null) {
    return (
      <span className="text-[10px] font-medium uppercase tracking-wider px-1.5 py-0.5 rounded border shrink-0 bg-primary/10 text-primary border-primary/30">
        {t("wall.scope.allClub", { defaultValue: "Tout le club" })}
      </span>
    );
  }
  const live = post.audience_team_ids.map((id) => teamsById.get(id)).filter((x): x is Team => !!x);
  if (live.length === 0) {
    return (
      <span
        className="text-[10px] font-medium uppercase tracking-wider px-1.5 py-0.5 rounded border shrink-0 bg-muted text-muted-foreground border-border"
        title={t("wall.scope.restrictedTitle", {
          defaultValue:
            "Toutes les équipes ciblées ont été supprimées — visible des admins uniquement.",
        })}
      >
        {t("wall.scope.restricted", { defaultValue: "Audience restreinte" })}
      </span>
    );
  }
  let label: string;
  if (live.length === 1) label = live[0].name;
  else if (live.length === 2) label = `${live[0].name} + ${live[1].name}`;
  else
    label = t("wall.scope.plusOthers", {
      defaultValue: "{{first}} + {{n}} autres",
      first: live[0].name,
      n: live.length - 1,
    });
  const tooltip = live.map((tt) => tt.name).join(" · ");
  return (
    <span
      className="text-[10px] font-medium uppercase tracking-wider px-1.5 py-0.5 rounded border shrink-0 bg-primary/10 text-primary border-primary/30"
      title={tooltip}
    >
      {label}
    </span>
  );
}

function WallGrouped({
  posts,
  currentUserId,
  role,
  commentsEnabled,
  canPin,
  memberCount,
  teamsById,
  onDelete,
  onTogglePin,
}: {
  posts: Post[];
  currentUserId: string | null;
  role: string | null;
  commentsEnabled: boolean;
  canPin: boolean;
  memberCount: number;
  teamsById: Map<string, Team>;
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
        description={t("wall.emptyHint", {
          defaultValue:
            "Aucune annonce pour l'instant. Les coachs et admins peuvent en publier ici.",
        })}
      />
    );
  }

  const renderItem = (p: Post) => {
    const d = new Date(p.created_at);
    const isExternal = p.source && p.source !== "clubero";
    const sourceMeta = isExternal ? SOURCE_META[p.source as Exclude<PostSource, "clubero">] : null;
    const canManage = !isExternal && (p.author_user_id === currentUserId || role === "admin");
    const authorLabel = isExternal ? (sourceMeta?.label ?? "—") : (p.author?.full_name ?? "—");
    return (
      <li
        key={p.id}
        id={`wall-post-${p.id}`}
        className={cn(
          "group flex items-stretch gap-3 rounded-2xl border bg-card overflow-hidden",
          "transition-all duration-200 hover:shadow-md hover:-translate-y-px",
          "animate-in fade-in-0 slide-in-from-bottom-1 duration-300",
          p.is_pinned ? "border-primary/40 ring-1 ring-primary/15 shadow-sm" : "border-border",
        )}
      >
        <div
          className={cn(
            "flex flex-col items-center justify-center w-16 shrink-0 py-3 transition-colors",
            p.is_pinned ? "bg-primary/15" : "bg-primary/8 group-hover:bg-primary/12",
          )}
        >
          <span className="text-[10px] font-semibold uppercase tracking-wider text-primary">
            {fmt(d, "EEE")}
          </span>
          <span className="text-2xl font-bold leading-none mt-0.5 tabular-nums">
            {format(d, "d")}
          </span>
          <span className="text-[10px] text-muted-foreground mt-1 tabular-nums">
            {format(d, "HH:mm")}
          </span>
        </div>
        <div className="flex-1 min-w-0 py-3 pr-3">
          <header className="flex items-start justify-between gap-2 mb-1.5">
            <div className="flex items-center gap-1.5 min-w-0">
              {p.is_pinned && <Pin className="h-3.5 w-3.5 text-primary fill-primary/30 shrink-0" />}
              <p className="text-sm font-semibold truncate">{authorLabel}</p>
              {sourceMeta && (
                <span
                  className={cn(
                    "text-[10px] font-medium uppercase tracking-wider px-1.5 py-0.5 rounded border shrink-0",
                    sourceMeta.cls,
                  )}
                >
                  {sourceMeta.label}
                </span>
              )}
              <AudienceBadge post={p} teamsById={teamsById} />
            </div>

            <div className="flex items-center gap-1 shrink-0 opacity-60 group-hover:opacity-100 transition-opacity">
              {canPin && !isExternal && (
                <button
                  onClick={() => onTogglePin(p.id, !p.is_pinned)}
                  className="text-muted-foreground hover:text-primary p-1 -m-1 rounded-md hover:bg-primary/10 transition-colors"
                  aria-label={
                    p.is_pinned
                      ? t("wall.unpin", { defaultValue: "Désépingler" })
                      : t("wall.pin", { defaultValue: "Épingler" })
                  }
                  title={
                    p.is_pinned
                      ? t("wall.unpin", { defaultValue: "Désépingler" })
                      : t("wall.pin", { defaultValue: "Épingler" })
                  }
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
          {isExternal && p.external_media_url && (
            <a
              href={p.external_url ?? p.external_media_url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 block overflow-hidden rounded-lg border border-border"
            >
              <img
                src={p.external_media_url}
                alt=""
                loading="lazy"
                className="w-full max-h-96 object-cover"
              />
            </a>
          )}
          {!isExternal && p.attachments?.length > 0 && (
            <div className="mt-2">
              <AttachmentList items={p.attachments as Attachment[]} />
            </div>
          )}
          {isExternal && p.external_url && (
            <a
              href={p.external_url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors"
            >
              <ExternalLink className="h-3 w-3" />
              {t("wall.viewOn", {
                defaultValue: "Voir sur {{network}}",
                network: sourceMeta?.label ?? "",
              })}
            </a>
          )}
          {!isExternal &&
            (p.author_user_id === currentUserId || role === "admin" || role === "coach") &&
            memberCount > 0 &&
            (() => {
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
          {!isExternal && commentsEnabled && (
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

function CommentBlock({
  post,
  currentUserId,
  role,
  clubId,
}: {
  post: Post;
  currentUserId: string | null;
  role: string | null;
  clubId: string;
}) {
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
    if (error) {
      toast.error(error.message);
      return;
    }
    const mentioned = parseMentions(text).filter((id) => id !== currentUserId);
    if (mentioned.length && data?.id) {
      const authorName =
        (await supabase.from("profiles").select("full_name").eq("id", currentUserId).single()).data
          ?.full_name ?? "—";
      await supabase.from("notifications").insert(
        mentioned.map((uid) => ({
          user_id: uid,
          type: "wall_mention",
          title: t("wall.mentionTitle", {
            defaultValue: "{{name}} vous a mentionné",
            name: authorName,
          }),
          body: text.trim().slice(0, 140),
          link: `/inbox#${post.id}`,
        })),
      );
    }
    setText("");
  }

  async function del(id: string) {
    const { error } = await supabase.rpc("soft_delete_entity", { _kind: "wall_comment", _id: id });
    if (error) {
      toast.error(error.message);
      return;
    }
    toast(t("wall.commentDeleted", { defaultValue: "Comment deleted" }), {
      action: {
        label: t("common.undo", { defaultValue: "Undo" }),
        onClick: async () => {
          const { error: e2 } = await supabase.rpc("restore_entity", {
            _kind: "wall_comment",
            _id: id,
          });
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
            <p className="text-[10px] text-muted-foreground">{fmt(c.created_at, "d MMM HH:mm")}</p>
          </div>
          {(c.author_user_id === currentUserId || role === "admin") && (
            <button
              onClick={() => del(c.id)}
              className="text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      ))}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
        className="flex gap-2"
      >
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
