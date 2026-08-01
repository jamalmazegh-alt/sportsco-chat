import { useEffect, useMemo, useRef, useState, type ComponentType } from "react";
import { useTranslation } from "react-i18next";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, useActiveRole, useMyRoles } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import {
  BarChart3,
  Eye,
  ExternalLink,
  Flag,
  Loader2,
  Lock,
  MegaphoneIcon,
  MessageSquare,
  Pin,
  PinOff,
  Send,
  Trash2,
  Users,
  UserX,
} from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { format } from "date-fns";
import { toast } from "sonner";
import { dateLocale, fmt } from "@/lib/date-locale";
import { AttachmentPicker, AttachmentList, type Attachment } from "@/components/attachments";
import { hasMissingLabel } from "@/lib/wall/documents";
import { MentionInput, RenderWithMentions, parseMentions } from "@/components/mention-input";
import { WallFeedSkeleton } from "@/components/skeletons";
import { cn } from "@/lib/utils";
import { dispatchWallPostPush } from "@/lib/push-dispatch.functions";
import { notifyWallComment } from "@/lib/wall-comment-notify.functions";
import { notifyWallReaction } from "@/lib/wall-reaction-notify.functions";
import { notifyWallCommentReaction } from "@/lib/wall-comment-reaction-notify.functions";

import { sendWallPostEmails } from "@/lib/wall/send-wall-emails.functions";
import { getWallPostAudienceCounts } from "@/lib/wall/audience-count.functions";
import { listPublications } from "@/lib/publications/publications.functions";
import { FacebookIcon, InstagramIcon, XIcon } from "@/components/social-icons";
import { WallReactions, type WallReaction } from "@/components/wall-reactions";
import { WallReportDialog, type ReportedUser } from "@/components/wall-report-dialog";
import { useUserMutes } from "@/lib/use-mutes";
import { filterMutedWallPosts } from "@/lib/mutes";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type Profile = { id: string; full_name: string | null; avatar_url: string | null };
type Comment = {
  id: string;
  post_id: string;
  author_user_id: string;
  body: string;
  created_at: string;
  author?: Profile | null;
  hidden_at?: string | null;
  reactions?: WallReaction[];
};
type PostSource = "clubero" | "instagram" | "facebook" | "twitter";
type AudienceType = "club" | "team" | "multi_team" | "group" | "team_staff";
type Team = { id: string; name: string };
type Group = { id: string; name: string };
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
  audience_group_ids: string[] | null;
  audience_type: AudienceType;
  send_email: boolean;
  hidden_at?: string | null;
  author?: Profile | null;
  comments?: Comment[];
  reads?: { user_id: string; read_at: string }[];
  reactions?: WallReaction[];
};
type PollOptionResult = { id: string; label: string; votes: number };
type PollAudience = {
  audience_type: string;
  team_id: string | null;
  group_id: string | null;
  category_label: string | null;
  event_id: string | null;
};
type PollItem = {
  id: string;
  publication_type: string;
  title: string;
  content: string | null;
  poll_visibility: string | null;
  published_at: string | null;
  closed_at: string | null;
  voter_count?: number;
  options?: PollOptionResult[];
  audiences?: PollAudience[];
  can_vote?: boolean;
};

const SOURCE_META: Record<
  Exclude<PostSource, "clubero">,
  { label: string; cls: string; icon: ComponentType<{ className?: string }> }
> = {
  instagram: {
    label: "Instagram",
    cls: "bg-pink-500/15 text-pink-600 dark:text-pink-400 border-pink-500/30",
    icon: InstagramIcon,
  },
  facebook: {
    label: "Facebook",
    cls: "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30",
    icon: FacebookIcon,
  },
  twitter: {
    label: "X",
    cls: "bg-foreground/10 text-foreground border-foreground/20",
    icon: XIcon,
  },
};

export function WallFeed({ clubId, staffTeamId }: { clubId: string; staffTeamId?: string }) {
  const { t } = useTranslation();
  const dispatchWallPostPushFn = useServerFn(dispatchWallPostPush);
  const sendWallPostEmailsFn = useServerFn(sendWallPostEmails);
  const getAudienceCountsFn = useServerFn(getWallPostAudienceCounts);
  const listPublicationsFn = useServerFn(listPublications);
  const { user } = useAuth();
  const role = useActiveRole();
  const roles = useMyRoles();
  const { muted: mutedUsers, mute: muteUser } = useUserMutes();
  const [posts, setPosts] = useState<Post[]>([]);
  const postsRef = useRef<Post[]>([]);
  postsRef.current = posts;
  // Masquage personnel : les contenus des personnes masquées sont filtrés au rendu.
  const visiblePosts = useMemo(() => filterMutedWallPosts(posts, mutedUsers), [posts, mutedUsers]);
  const [polls, setPolls] = useState<PollItem[]>([]);
  const [body, setBody] = useState("");
  const [atts, setAtts] = useState<Attachment[]>([]);
  const [posting, setPosting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [commentsEnabled, setCommentsEnabled] = useState(true);
  const [memberCount, setMemberCount] = useState(0);
  // Taille d'audience réelle par post (dénominateur du "Lu par X/Y").
  const [audienceByPost, setAudienceByPost] = useState<Record<string, number>>({});
  // Targetable teams for the audience picker; computed from club teams + user rights.
  const [allTeams, setAllTeams] = useState<Team[]>([]);
  const [targetableTeams, setTargetableTeams] = useState<Team[]>([]);
  // Groups the current user can target from the composer (staff-visible via RLS).
  const [targetableGroups, setTargetableGroups] = useState<Group[]>([]);
  // Names of groups referenced by loaded posts (may include groups not in targetableGroups).
  const [postGroups, setPostGroups] = useState<Group[]>([]);
  // Group selection is disjoint from team selection: non-empty ⇒ audience_type='group'.
  const [audienceGroups, setAudienceGroups] = useState<string[]>([]);
  // "Aussi par e-mail" checkbox — triggers a best-effort outbox after the insert.
  const [sendEmail, setSendEmail] = useState(false);
  // null = "Tout le club"; [] = nothing selected yet (forces explicit choice for multi-team coaches).
  const [audience, setAudience] = useState<string[] | null>(null);
  // When true (and staffTeamId not set), the team pill selection publishes to
  // `team_staff` — coaches+dirigeants of the selected teams, plus club admins.
  const [staffAudienceMode, setStaffAudienceMode] = useState(false);

  async function load() {
    setLoading(true);
    const { data: club } = await supabase
      .from("clubs")
      .select("wall_comments_enabled")
      .eq("id", clubId)
      .single();
    setCommentsEnabled(!!club?.wall_comments_enabled);

    // Les contenus masqués par la modération ne sont visibles que des
    // admins/dirigeants (avec un badge « Masqué »).
    const canSeeHidden = roles.includes("admin") || roles.includes("dirigeant");

    let postsQuery = supabase
      .from("wall_posts")
      .select(
        "id, club_id, author_user_id, body, created_at, is_pinned, attachments, source, external_id, external_url, external_media_url, audience_team_ids, audience_group_ids, audience_type, send_email, hidden_at",
      )
      .eq("club_id", clubId)
      .is("deleted_at", null);
    if (!canSeeHidden) postsQuery = postsQuery.is("hidden_at", null);
    if (staffTeamId) {
      postsQuery = postsQuery
        .eq("audience_type", "team_staff")
        .contains("audience_team_ids", [staffTeamId]);
    }
    const { data: rawPosts } = await postsQuery
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
      let commentsQuery = supabase
        .from("wall_comments")
        .select("id, post_id, author_user_id, body, created_at, hidden_at")
        .in("post_id", ids)
        .is("deleted_at", null);
      if (!canSeeHidden) commentsQuery = commentsQuery.is("hidden_at", null);
      const { data: rawComments } = await commentsQuery.order("created_at", { ascending: true });
      const { data: rawReactions } = await supabase
        .from("wall_post_reactions")
        .select("post_id, user_id, emoji")
        .in("post_id", ids);
      const commentIds = (rawComments ?? []).map((c) => c.id);
      const { data: rawCommentReactions } = commentIds.length
        ? await supabase
            .from("wall_comment_reactions")
            .select("comment_id, user_id, emoji")
            .in("comment_id", commentIds)
        : { data: [] as { comment_id: string; user_id: string; emoji: string }[] };
      const allUserIds = Array.from(
        new Set([
          ...ps.map((p) => p.author_user_id).filter((x): x is string => !!x),
          ...(rawComments ?? []).map((c) => c.author_user_id),
          ...(rawReactions ?? []).map((r) => r.user_id),
          ...(rawCommentReactions ?? []).map((r) => r.user_id),
        ]),
      );
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, full_name, avatar_url")
        .in("id", allUserIds);
      const map = new Map((profs ?? []).map((p) => [p.id, p as Profile]));
      // Réactions emoji sur les commentaires
      const creByComment = new Map<string, WallReaction[]>();
      (rawCommentReactions ?? []).forEach((r) => {
        const arr = creByComment.get(r.comment_id) ?? [];
        arr.push({
          user_id: r.user_id,
          emoji: r.emoji,
          name: map.get(r.user_id)?.full_name ?? null,
        });
        creByComment.set(r.comment_id, arr);
      });
      const cByPost = new Map<string, Comment[]>();
      const seenComments = new Set<string>();
      (rawComments ?? []).forEach((c) => {
        if (seenComments.has(c.id)) return;
        seenComments.add(c.id);
        const cm = {
          ...c,
          author: map.get(c.author_user_id) ?? null,
          reactions: creByComment.get(c.id) ?? [],
        } as Comment;
        const arr = cByPost.get(c.post_id) ?? [];
        arr.push(cm);
        cByPost.set(c.post_id, arr);
      });
      // Réactions emoji

      const reByPost = new Map<string, WallReaction[]>();
      (rawReactions ?? []).forEach((r) => {
        const arr = reByPost.get(r.post_id) ?? [];
        arr.push({
          user_id: r.user_id,
          emoji: r.emoji,
          name: map.get(r.user_id)?.full_name ?? null,
        });
        reByPost.set(r.post_id, arr);
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
        p.reactions = reByPost.get(p.id) ?? [];
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
    // Fetch names for groups referenced by these posts (RLS-scoped).
    const groupIdSet = new Set<string>();
    for (const p of ps) {
      if (p.audience_group_ids) for (const gid of p.audience_group_ids) groupIdSet.add(gid);
    }
    if (groupIdSet.size > 0) {
      const { data: gRows } = await supabase
        .from("club_groups")
        .select("id, name")
        .in("id", Array.from(groupIdSet));
      setPostGroups((gRows ?? []) as Group[]);
    } else {
      setPostGroups([]);
    }
    // Total club members (fallback denominator for "Lu par X/Y")
    const { count } = await supabase
      .from("club_members")
      .select("id", { count: "exact", head: true })
      .eq("club_id", clubId);
    setMemberCount(count ?? 0);
    // Audience réelle par post (staff uniquement côté serveur, sinon {}).
    if (ps.length > 0) {
      try {
        const counts = await getAudienceCountsFn({
          data: { clubId, postIds: ps.slice(0, 100).map((p) => p.id) },
        });
        setAudienceByPost((counts ?? {}) as Record<string, number>);
      } catch {
        setAudienceByPost({});
      }
    } else {
      setAudienceByPost({});
    }
    setPosts(ps);
    setLoading(false);
  }

  /**
   * Recharge uniquement les réactions des posts déjà affichés, sans toucher au
   * spinner ni au reste du feed (évite le "refresh" visuel à chaque réaction).
   */
  async function refreshReactions() {
    const ids = postsRef.current.map((p: Post) => p.id);
    if (ids.length === 0) return;
    const commentIds = postsRef.current.flatMap((p: Post) => (p.comments ?? []).map((c) => c.id));
    const { data: rawReactions } = await supabase
      .from("wall_post_reactions")
      .select("post_id, user_id, emoji")
      .in("post_id", ids);
    const { data: rawCommentReactions } = commentIds.length
      ? await supabase
          .from("wall_comment_reactions")
          .select("comment_id, user_id, emoji")
          .in("comment_id", commentIds)
      : { data: [] as { comment_id: string; user_id: string; emoji: string }[] };
    const userIds = Array.from(
      new Set([
        ...(rawReactions ?? []).map((r) => r.user_id),
        ...(rawCommentReactions ?? []).map((r) => r.user_id),
      ]),
    );
    const names = new Map<string, string | null>();
    if (userIds.length > 0) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", userIds);
      (profs ?? []).forEach((p) => names.set(p.id, p.full_name ?? null));
    }
    const byPost = new Map<string, WallReaction[]>();
    (rawReactions ?? []).forEach((r) => {
      const arr = byPost.get(r.post_id) ?? [];
      arr.push({ user_id: r.user_id, emoji: r.emoji, name: names.get(r.user_id) ?? null });
      byPost.set(r.post_id, arr);
    });
    const byComment = new Map<string, WallReaction[]>();
    (rawCommentReactions ?? []).forEach((r) => {
      const arr = byComment.get(r.comment_id) ?? [];
      arr.push({ user_id: r.user_id, emoji: r.emoji, name: names.get(r.user_id) ?? null });
      byComment.set(r.comment_id, arr);
    });
    setPosts((prev) =>
      prev.map((p) => ({
        ...p,
        reactions: byPost.get(p.id) ?? [],
        comments: (p.comments ?? []).map((c) => ({
          ...c,
          reactions: byComment.get(c.id) ?? [],
        })),
      })),
    );
  }

  useEffect(() => {
    load(); /* eslint-disable-next-line */
  }, [clubId]);

  // Load polls visible to the current user (publish_to_wall + RLS enforce audience).
  // Filter to publication_type='poll' as a safety net; messages now live on the wall.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await listPublicationsFn({ data: { clubId, limit: 50 } });
        let list = ((r?.publications ?? []) as any[]).filter(
          (p) => p.publication_type === "poll",
        ) as PollItem[];
        // Staff team wall: only polls scoped to that team's staff.
        if (staffTeamId) {
          list = list.filter((p) =>
            (p.audiences ?? []).some(
              (a) => a.audience_type === "staff_equipe" && a.team_id === staffTeamId,
            ),
          );
        }
        if (list.length === 0) {
          if (!cancelled) setPolls([]);
          return;
        }
        // Best-effort voter count (RLS on club_poll_votes: voters are visible per policy).
        const ids = list.map((p) => p.id);
        const { data: votes } = await supabase
          .from("club_poll_votes")
          .select("publication_id, option_id")
          .in("publication_id", ids);
        const counts = new Map<string, number>();
        const perOption = new Map<string, Map<string, number>>();
        for (const v of (votes ?? []) as { publication_id: string; option_id: string }[]) {
          counts.set(v.publication_id, (counts.get(v.publication_id) ?? 0) + 1);
          let m = perOption.get(v.publication_id);
          if (!m) {
            m = new Map();
            perOption.set(v.publication_id, m);
          }
          m.set(v.option_id, (m.get(v.option_id) ?? 0) + 1);
        }
        // Fetch options for closed polls so we can render inline results.
        const closedIds = list.filter((p) => !!p.closed_at).map((p) => p.id);
        const optionsByPoll = new Map<string, PollOptionResult[]>();
        if (closedIds.length > 0) {
          const { data: opts } = await supabase
            .from("club_poll_options")
            .select("id, publication_id, label, sort_order")
            .in("publication_id", closedIds)
            .order("sort_order", { ascending: true });
          for (const o of (opts ?? []) as {
            id: string;
            publication_id: string;
            label: string;
          }[]) {
            const arr = optionsByPoll.get(o.publication_id) ?? [];
            arr.push({
              id: o.id,
              label: o.label,
              votes: perOption.get(o.publication_id)?.get(o.id) ?? 0,
            });
            optionsByPoll.set(o.publication_id, arr);
          }
        }
        // Voting eligibility per poll (staff-only viewers get 0 subjects).
        const eligibility = new Map<string, boolean>();
        await Promise.all(
          list.map(async (p) => {
            try {
              const { data: subjects } = await supabase.rpc("get_eligible_vote_subjects" as any, {
                _publication_id: p.id,
              });
              eligibility.set(p.id, Array.isArray(subjects) && subjects.length > 0);
            } catch {
              eligibility.set(p.id, false);
            }
          }),
        );
        if (!cancelled) {
          setPolls(
            list.map((p) => ({
              ...p,
              voter_count: counts.get(p.id) ?? 0,
              options: optionsByPoll.get(p.id),
              can_vote: eligibility.get(p.id) ?? false,
            })),
          );
        }
      } catch {
        if (!cancelled) setPolls([]);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line
  }, [clubId, staffTeamId]);

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
      // Réactions : rafraîchissement silencieux (pas de reload complet du mur,
      // qui provoquait un "flash" de l'écran à chaque réaction).
      .on("postgres_changes", { event: "*", schema: "public", table: "wall_post_reactions" }, () =>
        refreshReactions(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "wall_comment_reactions" },
        () => refreshReactions(),
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
        .eq("is_internal", false)
        .is("deleted_at", null)
        .is("archived_at", null)
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

      // Groups targetable from the composer — visibility is enforced by RLS on
      // club_groups (staff-only). We do not fetch group members here; sending
      // the email is done server-side after the insert.
      let groups: Group[] = [];
      if (isPriv || roles.includes("coach") || roles.includes("assistant_coach")) {
        const { data: gRows } = await supabase
          .from("club_groups")
          .select("id, name")
          .eq("club_id", clubId)
          .order("name", { ascending: true });
        if (!cancelled) groups = (gRows ?? []) as Group[];
      }
      if (cancelled) return;
      setTargetableGroups(groups);

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
      setAudienceGroups([]);
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
    //   staffTeamId set  → audience_type='team_staff', audience_team_ids=[staffTeamId]
    //   groups non-empty → audience_type='group', audience_group_ids=[…], team_ids=null
    //   null             → "Tout le club"
    //   [] (forced)      → coach must pick at least one team
    //   [ids]            → team-scoped (1 or many)
    const isPriv = roles.includes("admin") || roles.includes("dirigeant");
    const isStaffMode = !!staffTeamId;
    // "Staff d'équipes" composer mode: team pill selection publishes as team_staff.
    const isStaffPick = !isStaffMode && staffAudienceMode;
    const hasGroups = !isStaffMode && !isStaffPick && audienceGroups.length > 0;
    const audienceForInsert: string[] | null = isStaffMode
      ? [staffTeamId!]
      : isStaffPick
        ? audience === null || audience.length === 0
          ? null
          : audience
        : hasGroups
          ? null
          : audience === null
            ? null
            : audience.length === 0
              ? null
              : audience;
    if (isStaffPick && (audienceForInsert === null || audienceForInsert.length === 0)) {
      toast.error(
        t("wall.staff.pickTeamRequired", {
          defaultValue: "Choisis au moins une équipe pour cibler son staff.",
        }),
      );
      return;
    }
    if (
      !isStaffMode &&
      !isStaffPick &&
      !isPriv &&
      !hasGroups &&
      audienceForInsert === null &&
      audience !== null
    ) {
      toast.error(
        t("wall.audienceRequired", {
          defaultValue: "Choisissez au moins une équipe ou « Tout le club ».",
        }),
      );
      return;
    }

    const audienceTypeForInsert: AudienceType =
      isStaffMode || isStaffPick
        ? "team_staff"
        : hasGroups
          ? "group"
          : audienceForInsert === null
            ? "club"
            : audienceForInsert.length === 1
              ? "team"
              : "multi_team";

    setPosting(true);
    const insertPayload = {
      club_id: clubId,
      author_user_id: user.id,
      body: body.trim(),
      attachments: atts as unknown as never,
      audience_type: audienceTypeForInsert as unknown as never,
      audience_team_ids: audienceForInsert as unknown as never,
      audience_group_ids: (hasGroups ? audienceGroups : null) as unknown as never,
      send_email: sendEmail as unknown as never,
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
      if (isStaffMode || isStaffPick) {
        // Staff wall: coaches + dirigeants of the target team(s), plus club admins/dirigeants.
        const { data: priv } = await supabase
          .from("club_members")
          .select("user_id, role")
          .eq("club_id", clubId)
          .in("role", ["admin", "dirigeant"]);
        for (const m of priv ?? []) {
          const uid = (m as any).user_id as string | null;
          if (uid) recipientSet.add(uid);
        }
        const staffTeamIds = isStaffMode ? [staffTeamId!] : (audienceForInsert ?? []);
        if (staffTeamIds.length > 0) {
          const { data: tm } = await supabase
            .from("team_members")
            .select("user_id, role")
            .in("team_id", staffTeamIds)
            .in("role", ["coach", "dirigeant"]);
          for (const r of tm ?? []) {
            const uid = (r as any).user_id as string | null;
            if (uid) recipientSet.add(uid);
          }
        }
      } else if (hasGroups) {
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
        // Members of the targeted group(s).
        const { data: gm } = await supabase
          .from("club_group_members")
          .select("club_members:member_id(user_id)")
          .in("group_id", audienceGroups);
        for (const row of gm ?? []) {
          const uid = ((row as any).club_members?.user_id as string | null) ?? null;
          if (uid) recipientSet.add(uid);
        }
      } else if (audienceForInsert === null) {
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
    // "Aussi par e-mail" — outbox best-effort ; les erreurs n'impactent pas le post.
    if (data?.id && sendEmail) {
      void (async () => {
        try {
          await sendWallPostEmailsFn({ data: { postId: data.id } });
        } catch (e) {
          console.warn("[email] wall dispatch failed", e);
        }
      })();
    }
    setBody("");
    setAtts([]);
    setAudienceGroups([]);
    setSendEmail(false);
    setStaffAudienceMode(false);
    // Reset audience to the per-role default for the next post.
    if (isPriv) setAudience(null);
    else if (targetableTeams.length === 1) setAudience([targetableTeams[0].id]);
    else setAudience([]);
  }

  async function toggleReaction(p: Post, emoji: string) {
    if (!user) return;
    const uid = user.id;
    const already = (p.reactions ?? []).some((r) => r.user_id === uid && r.emoji === emoji);
    const myName =
      (p.reactions ?? []).find((r) => r.user_id === uid)?.name ??
      ((user.user_metadata as Record<string, unknown> | undefined)?.full_name as
        | string
        | undefined) ??
      null;
    setPosts((prev) =>
      prev.map((x) =>
        x.id !== p.id
          ? x
          : {
              ...x,
              reactions: already
                ? (x.reactions ?? []).filter((r) => r.user_id !== uid)
                : [
                    ...(x.reactions ?? []).filter((r) => r.user_id !== uid),
                    { user_id: uid, emoji, name: myName },
                  ],
            },
      ),
    );
    const { error } = already
      ? await supabase
          .from("wall_post_reactions")
          .delete()
          .eq("post_id", p.id)
          .eq("user_id", uid)
          .eq("emoji", emoji)
      : await supabase
          .from("wall_post_reactions")
          .upsert({ post_id: p.id, user_id: uid, emoji }, { onConflict: "post_id,user_id" });
    if (error) {
      toast.error(t("wall.reactions.error", { defaultValue: "Réaction impossible" }));
      load();
      return;
    }
    if (!already) {
      notifyWallReaction({ data: { postId: p.id, emoji } }).catch(() => {});
    }
  }

  /** Même logique que les posts, appliquée à un commentaire. */
  async function toggleCommentReaction(comment: Comment, emoji: string) {
    if (!user) return;
    const uid = user.id;
    const already = (comment.reactions ?? []).some((r) => r.user_id === uid && r.emoji === emoji);
    const myName =
      (comment.reactions ?? []).find((r) => r.user_id === uid)?.name ??
      ((user.user_metadata as Record<string, unknown> | undefined)?.full_name as
        | string
        | undefined) ??
      null;
    setPosts((prev) =>
      prev.map((p) =>
        p.id !== comment.post_id
          ? p
          : {
              ...p,
              comments: (p.comments ?? []).map((c) =>
                c.id !== comment.id
                  ? c
                  : {
                      ...c,
                      reactions: already
                        ? (c.reactions ?? []).filter((r) => r.user_id !== uid)
                        : [
                            ...(c.reactions ?? []).filter((r) => r.user_id !== uid),
                            { user_id: uid, emoji, name: myName },
                          ],
                    },
              ),
            },
      ),
    );
    const { error } = already
      ? await supabase
          .from("wall_comment_reactions")
          .delete()
          .eq("comment_id", comment.id)
          .eq("user_id", uid)
          .eq("emoji", emoji)
      : await supabase
          .from("wall_comment_reactions")
          .upsert(
            { comment_id: comment.id, user_id: uid, emoji },
            { onConflict: "comment_id,user_id" },
          );
    if (error) {
      toast.error(t("wall.reactions.error", { defaultValue: "Réaction impossible" }));
      load();
      return;
    }
    if (!already) {
      notifyWallCommentReaction({ data: { commentId: comment.id, emoji } }).catch(() => {});
    }
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
  const groupsById = useMemo(() => {
    const m = new Map<string, Group>();
    for (const g of targetableGroups) m.set(g.id, g);
    for (const g of postGroups) if (!m.has(g.id)) m.set(g.id, g);
    return m;
  }, [targetableGroups, postGroups]);

  if (loading) {
    return <WallFeedSkeleton />;
  }

  const isStaffMode = !!staffTeamId;
  const canPost = isStaffMode
    ? roles.includes("admin") ||
      roles.includes("dirigeant") ||
      roles.includes("coach") ||
      roles.includes("assistant_coach")
    : roles.includes("admin") || roles.includes("coach") || roles.includes("assistant_coach");
  const audienceMissing =
    !isStaffMode &&
    canPost &&
    !(roles.includes("admin") || roles.includes("dirigeant")) &&
    audience !== null &&
    audience.length === 0;
  // Docuthèque : sur le mur (et lui seul), chaque pièce jointe doit être nommée
  // avant publication, sinon elle serait introuvable dans l'onglet Documents.
  const labelMissing = hasMissingLabel(atts);

  return (
    <div className="space-y-4">
      {canPost && (
        <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
          <MentionInput
            clubId={clubId}
            value={body}
            onChange={setBody}
            placeholder={
              isStaffMode
                ? t("wall.staff.placeholder", {
                    defaultValue: "Message privé au staff de cette équipe…",
                  })
                : t("wall.placeholder")
            }
            rows={3}
          />
          {isStaffMode ? (
            <p className="text-[11px] text-muted-foreground inline-flex items-center gap-1">
              <Lock className="h-3 w-3" />
              {t("wall.staff.audienceLocked", {
                defaultValue: "Visible uniquement par le staff de l'équipe et les admins du club.",
              })}
            </p>
          ) : (
            <AudiencePicker
              teams={targetableTeams}
              value={audience}
              onChange={(next) => {
                setAudience(next);
                if (next !== null) setAudienceGroups([]);
              }}
              groups={targetableGroups}
              groupValue={audienceGroups}
              onGroupChange={(next) => {
                setAudienceGroups(next);
                if (next.length > 0) {
                  setAudience([]);
                  setStaffAudienceMode(false);
                }
              }}
              canPickClubWide={
                roles.includes("admin") ||
                roles.includes("dirigeant") ||
                targetableTeams.length === allTeams.length
              }
              staffMode={staffAudienceMode}
              onStaffModeChange={(next) => {
                setStaffAudienceMode(next);
                if (next) {
                  // Switching to Staff mode: clear groups & "Tout le club".
                  setAudienceGroups([]);
                  if (audience === null) setAudience([]);
                }
              }}
              canPickStaff={targetableTeams.length > 0}
            />
          )}
          <AttachmentPicker value={atts} onChange={setAtts} prefix="wall" requireLabel />
          <label className="flex items-center gap-2 text-xs text-muted-foreground select-none cursor-pointer">
            <input
              type="checkbox"
              className="h-3.5 w-3.5 rounded border-border"
              checked={sendEmail}
              onChange={(e) => setSendEmail(e.target.checked)}
            />
            {t("wall.compose.alsoEmail", { defaultValue: "Envoyer une copie par e-mail" })}
          </label>
          {!isStaffMode && (
            <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-border/50">
              <Button asChild size="sm" variant="outline">
                <Link to="/publications/new">
                  <BarChart3 className="h-4 w-4 mr-1.5" />
                  {t("wall.compose.newPoll", { defaultValue: "Nouveau sondage" })}
                </Link>
              </Button>
              <Button asChild size="sm" variant="ghost">
                <Link to="/publications">
                  {t("publications:seeAllPolls", { defaultValue: "Voir tous les sondages" })}
                </Link>
              </Button>
            </div>
          )}
          <div className="flex items-center justify-between gap-2">
            {audienceMissing ? (
              <p className="text-xs text-destructive">
                {t("wall.audienceRequired", { defaultValue: "Choisissez au moins une équipe." })}
              </p>
            ) : labelMissing ? (
              <p className="text-xs text-destructive">
                {t("attachments.labelRequired", {
                  defaultValue: "Donnez un nom à chaque document avant de publier.",
                })}
              </p>
            ) : (
              <span />
            )}
            <Button
              onClick={submitPost}
              disabled={
                posting || (!body.trim() && atts.length === 0) || audienceMissing || labelMissing
              }
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
        posts={visiblePosts}
        polls={polls}
        currentUserId={user?.id ?? null}
        role={role}
        commentsEnabled={commentsEnabled}
        canPin={canPost}
        memberCount={memberCount}
        audienceByPost={audienceByPost}
        teamsById={teamsById}
        groupsById={groupsById}
        onDelete={deletePost}
        onTogglePin={togglePin}
        onToggleReaction={toggleReaction}
        onToggleCommentReaction={toggleCommentReaction}
        onMuteUser={muteUser}
      />
    </div>
  );
}

// Inline audience picker — "À : Tout le club | U13 | U15 …"
function AudiencePicker({
  teams,
  value,
  onChange,
  groups,
  groupValue,
  onGroupChange,
  canPickClubWide,
  staffMode,
  onStaffModeChange,
  canPickStaff,
}: {
  teams: Team[];
  value: string[] | null;
  onChange: (next: string[] | null) => void;
  groups: Group[];
  groupValue: string[];
  onGroupChange: (next: string[]) => void;
  canPickClubWide: boolean;
  staffMode: boolean;
  onStaffModeChange: (next: boolean) => void;
  canPickStaff: boolean;
}) {
  const { t } = useTranslation();
  const groupsActive = groupValue.length > 0;
  const isClubWide = !groupsActive && !staffMode && value === null;
  function toggleTeam(id: string) {
    if (groupsActive) onGroupChange([]);
    if (value === null) {
      onChange([id]);
      return;
    }
    if (value.includes(id)) {
      onChange(value.filter((x) => x !== id));
    } else {
      onChange([...value, id]);
    }
  }
  function toggleGroup(id: string) {
    if (groupValue.includes(id)) {
      onGroupChange(groupValue.filter((x) => x !== id));
    } else {
      onGroupChange([...groupValue, id]);
    }
  }
  if (teams.length === 0 && groups.length === 0 && !canPickClubWide) return null;

  // Team pill helpers — clicking under "Joueurs" or "Staff" implicitly sets the mode.
  function selectTeamAsPlayers(id: string) {
    if (groupsActive) onGroupChange([]);
    if (staffMode) onStaffModeChange(false);
    const base = value === null ? [] : value;
    if (base.includes(id) && !staffMode) {
      onChange(base.filter((x) => x !== id));
    } else {
      onChange([...base.filter((x) => x !== id), id]);
    }
  }
  function selectTeamAsStaff(id: string) {
    if (groupsActive) onGroupChange([]);
    if (!staffMode) onStaffModeChange(true);
    const base = value === null ? [] : value;
    if (base.includes(id) && staffMode) {
      onChange(base.filter((x) => x !== id));
    } else {
      onChange([...base.filter((x) => x !== id), id]);
    }
  }

  return (
    <div className="space-y-2">
      {/* "Tout le club" quick toggle at the top */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs font-medium text-muted-foreground mr-1">
          {t("wall.audienceTo", { defaultValue: "À :" })}
        </span>
        {canPickClubWide && (
          <button
            type="button"
            onClick={() => {
              onGroupChange([]);
              onStaffModeChange(false);
              onChange(null);
            }}
            className={cn(
              "text-xs px-2.5 py-1 rounded-full border transition-colors",
              isClubWide
                ? "bg-primary text-primary-foreground border-primary hover:bg-primary/90"
                : "bg-background text-foreground border-border hover:bg-accent",
            )}
          >
            {t("wall.scope.allClub", { defaultValue: "Tout le club" })}
          </button>
        )}
      </div>

      {/* Joueurs & parents (équipes) — block */}
      {teams.length > 0 && (
        <div
          className={cn(
            "rounded-lg border p-2.5",
            !staffMode && !groupsActive && !isClubWide
              ? "border-sky-500/60 bg-sky-500/10"
              : "border-sky-500/30 bg-sky-500/5",
          )}
        >
          <div className="flex items-center gap-1.5 mb-1.5">
            <Users className="h-3 w-3 text-sky-700 dark:text-sky-300" />
            <span className="text-[10px] uppercase tracking-wider font-semibold text-sky-700 dark:text-sky-300">
              {t("wall.scope.teamsBlock", { defaultValue: "Équipes (joueurs + parents)" })}
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {teams.map((tt) => {
              const active = !staffMode && (value ?? []).includes(tt.id);
              return (
                <button
                  key={tt.id}
                  type="button"
                  onClick={() => selectTeamAsPlayers(tt.id)}
                  className={cn(
                    "text-xs px-2.5 py-1 rounded-full border transition-colors",
                    active
                      ? "bg-sky-600 text-white border-sky-600"
                      : "bg-background text-foreground border-border hover:bg-accent",
                  )}
                >
                  {tt.name}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Staff d'équipes — block */}
      {canPickStaff && teams.length > 0 && (
        <div
          className={cn(
            "rounded-lg border p-2.5",
            staffMode
              ? "border-violet-500/60 bg-violet-500/10"
              : "border-violet-500/30 bg-violet-500/5",
          )}
        >
          <div className="flex items-center gap-1.5 mb-1.5">
            <Lock className="h-3 w-3 text-violet-700 dark:text-violet-300" />
            <span className="text-[10px] uppercase tracking-wider font-semibold text-violet-700 dark:text-violet-300">
              {t("wall.scope.staffTeamsBlock", { defaultValue: "Staff d'équipes" })}
            </span>
            <span className="text-[10px] text-violet-700/80 dark:text-violet-300/80">
              {t("wall.scope.staffTeamsHint", {
                defaultValue: "Coachs et dirigeants uniquement",
              })}
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {teams.map((tt) => {
              const active = staffMode && (value ?? []).includes(tt.id);
              return (
                <button
                  key={tt.id}
                  type="button"
                  onClick={() => selectTeamAsStaff(tt.id)}
                  className={cn(
                    "text-xs px-2.5 py-1 rounded-full border transition-colors inline-flex items-center gap-1",
                    active
                      ? "bg-violet-600 text-white border-violet-600"
                      : "bg-background text-violet-700 dark:text-violet-300 border-violet-500/40 hover:bg-violet-500/10",
                  )}
                >
                  <Lock className="h-3 w-3" />
                  {tt.name}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Groupes — block */}
      {groups.length > 0 && (
        <div
          className={cn(
            "rounded-lg border border-dashed p-2.5",
            groupsActive
              ? "border-amber-500/60 bg-amber-500/10"
              : "border-amber-500/40 bg-amber-500/5",
          )}
        >
          <div className="flex items-center gap-1.5 mb-1.5">
            <Users className="h-3 w-3 text-amber-700 dark:text-amber-300" />
            <span className="text-[10px] uppercase tracking-wider font-semibold text-amber-700 dark:text-amber-300">
              {t("wall.compose.targetGroup", { defaultValue: "Groupes" })}
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {groups.map((g) => {
              const active = groupValue.includes(g.id);
              return (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => toggleGroup(g.id)}
                  className={cn(
                    "inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border border-dashed transition-colors",
                    active
                      ? "bg-amber-500 text-white border-amber-500"
                      : "bg-background text-amber-700 dark:text-amber-300 border-amber-500/40 hover:bg-amber-500/10",
                  )}
                >
                  <Users className="h-3 w-3" />
                  {g.name}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// Reusable audience badge — used on each post in the feed.
// Mirrors push scopeLabel logic; "Tout le club" is the only translated label,
// team names are data (not translated). Deleted/unknown teams are filtered out;
// if none survive, we surface a discreet "Audience restreinte" hint so admins
// understand why the post is now narrower than originally targeted.
function AudienceBadge({
  post,
  teamsById,
  groupsById,
}: {
  post: Post;
  teamsById: Map<string, Team>;
  groupsById: Map<string, Group>;
}) {
  const { t } = useTranslation();
  // Group audience — visually distinct (amber palette + Users icon, dashed border)
  // to make groups instantly recognizable next to team badges.
  if (post.audience_group_ids && post.audience_group_ids.length > 0) {
    const liveG = post.audience_group_ids
      .map((id) => groupsById.get(id))
      .filter((x): x is Group => !!x);
    let gLabel: string;
    if (liveG.length === 0) {
      gLabel = t("wall.scope.group", { defaultValue: "Groupe" });
    } else if (liveG.length === 1) {
      gLabel = liveG[0].name;
    } else if (liveG.length === 2) {
      gLabel = `${liveG[0].name} + ${liveG[1].name}`;
    } else {
      gLabel = t("wall.scope.plusOthers", {
        defaultValue: "{{first}} + {{n}} autres",
        first: liveG[0].name,
        n: liveG.length - 1,
      });
    }
    const gTooltip = liveG.length
      ? liveG.map((g) => g.name).join(" · ")
      : t("wall.scope.groupTooltip", { defaultValue: "Audience : groupe personnalisé" });
    return (
      <span
        className="inline-flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider px-1.5 py-0.5 rounded border border-dashed shrink-0 bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/40"
        title={gTooltip}
      >
        <Users className="h-2.5 w-2.5" />
        {gLabel}
      </span>
    );
  }
  if (post.audience_type === "team_staff") {
    const liveT = (post.audience_team_ids ?? [])
      .map((id) => teamsById.get(id))
      .filter((x): x is Team => !!x);
    let teamLabel: string | null = null;
    if (liveT.length === 1) teamLabel = liveT[0].name;
    else if (liveT.length === 2) teamLabel = `${liveT[0].name} + ${liveT[1].name}`;
    else if (liveT.length > 2)
      teamLabel = t("wall.scope.plusOthers", {
        defaultValue: "{{first}} + {{n}} autres",
        first: liveT[0].name,
        n: liveT.length - 1,
      });
    const tooltip = liveT.length
      ? `${t("wall.staff.badgeTitle", { defaultValue: "Message privé au staff de l'équipe" })} · ${liveT.map((x) => x.name).join(" · ")}`
      : t("wall.staff.badgeTitle", { defaultValue: "Message privé au staff de l'équipe" });
    return (
      <span
        className="inline-flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider px-1.5 py-0.5 rounded border shrink-0 bg-violet-500/10 text-violet-700 dark:text-violet-300 border-violet-500/40"
        title={tooltip}
      >
        <Lock className="h-2.5 w-2.5" />
        {teamLabel
          ? t("wall.staff.badgeWithTeam", { defaultValue: "Staff {{team}}", team: teamLabel })
          : t("wall.staff.badge", { defaultValue: "Staff équipe" })}
      </span>
    );
  }
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

type TimelineEntry =
  | { kind: "post"; date: Date; post: Post }
  | { kind: "poll"; date: Date; poll: PollItem };

function WallGrouped({
  posts,
  polls,
  currentUserId,
  role,
  commentsEnabled,
  canPin,
  memberCount,
  audienceByPost,
  teamsById,
  groupsById,
  onDelete,
  onTogglePin,
  onToggleReaction,
  onToggleCommentReaction,
  onMuteUser,
}: {
  posts: Post[];
  polls: PollItem[];
  currentUserId: string | null;
  role: string | null;
  commentsEnabled: boolean;
  canPin: boolean;
  memberCount: number;
  audienceByPost: Record<string, number>;
  teamsById: Map<string, Team>;
  groupsById: Map<string, Group>;
  onDelete: (id: string) => void;
  onTogglePin: (id: string, next: boolean) => void;
  onToggleReaction: (post: Post, emoji: string) => void;
  onToggleCommentReaction: (comment: Comment, emoji: string) => void;
  onMuteUser: (userId: string) => Promise<{ error: string | null }>;
}) {
  const { t } = useTranslation();
  // Cible du signalement (publication ou commentaire) — modération manuelle.
  // reportedUser permet de signaler aussi l'auteur depuis le même drawer.
  const [reportTarget, setReportTarget] = useState<{
    postId: string;
    commentId: string | null;
    reportedUser: ReportedUser | null;
  } | null>(null);
  // Cible du masquage personnel (« bloquer » cette personne).
  const [muteTarget, setMuteTarget] = useState<{ userId: string; name: string } | null>(null);
  const [muting, setMuting] = useState(false);

  async function confirmMute() {
    if (!muteTarget) return;
    setMuting(true);
    const { error } = await onMuteUser(muteTarget.userId);
    setMuting(false);
    if (error) {
      toast.error(t("common.error", { defaultValue: "Une erreur est survenue" }));
      return;
    }
    toast.success(
      t("mutes.muted", {
        defaultValue: "Les contenus de {{name}} sont masqués.",
        name: muteTarget.name,
      }),
    );
    setMuteTarget(null);
  }
  const pinned = useMemo(() => posts.filter((p) => p.is_pinned), [posts]);
  const rest = useMemo(() => posts.filter((p) => !p.is_pinned), [posts]);

  const grouped = useMemo(() => {
    const entries: TimelineEntry[] = [
      ...rest.map((p) => ({ kind: "post" as const, date: new Date(p.created_at), post: p })),
      ...polls.map((pl) => ({
        kind: "poll" as const,
        date: new Date(pl.published_at ?? new Date().toISOString()),
        poll: pl,
      })),
    ].sort((a, b) => b.date.getTime() - a.date.getTime());

    const map = new Map<string, { label: string; items: TimelineEntry[] }>();
    for (const e of entries) {
      const key = `${e.date.getFullYear()}-${String(e.date.getMonth()).padStart(2, "0")}`;
      const label = format(e.date, "MMMM yyyy", { locale: dateLocale() });
      if (!map.has(key)) map.set(key, { label, items: [] });
      map.get(key)!.items.push(e);
    }
    return Array.from(map.entries()).map(([key, v]) => ({ key, ...v }));
  }, [rest, polls]);

  if (posts.length === 0 && polls.length === 0) {
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
            <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
              {p.is_pinned && <Pin className="h-3.5 w-3.5 text-primary fill-primary/30 shrink-0" />}
              <p className="text-sm font-semibold truncate">{authorLabel}</p>
              {sourceMeta && (
                <span
                  className={cn(
                    "inline-flex items-center justify-center p-1 rounded border shrink-0",
                    sourceMeta.cls,
                  )}
                  title={sourceMeta.label}
                  aria-label={sourceMeta.label}
                >
                  <sourceMeta.icon className="h-3.5 w-3.5" />
                </span>
              )}
              {isExternal && (
                <span className="text-[11px] text-muted-foreground tabular-nums shrink-0">
                  {fmt(d, "d MMM yyyy, HH:mm")}
                </span>
              )}
              <AudienceBadge post={p} teamsById={teamsById} groupsById={groupsById} />
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
              {!isExternal && currentUserId && p.author_user_id !== currentUserId && (
                <button
                  onClick={() =>
                    setReportTarget({
                      postId: p.id,
                      commentId: null,
                      reportedUser: p.author_user_id
                        ? { userId: p.author_user_id, name: authorLabel, clubId: p.club_id }
                        : null,
                    })
                  }
                  className="text-muted-foreground hover:text-amber-600 p-1 -m-1 rounded-md hover:bg-amber-500/10 transition-colors"
                  aria-label={t("wall.report.action", { defaultValue: "Signaler" })}
                  title={t("wall.report.action", { defaultValue: "Signaler" })}
                >
                  <Flag className="h-4 w-4" />
                </button>
              )}
              {!isExternal &&
                currentUserId &&
                p.author_user_id &&
                p.author_user_id !== currentUserId && (
                  <button
                    onClick={() =>
                      setMuteTarget({ userId: p.author_user_id as string, name: authorLabel })
                    }
                    className="text-muted-foreground hover:text-destructive p-1 -m-1 rounded-md hover:bg-destructive/10 transition-colors"
                    aria-label={t("mutes.action", { defaultValue: "Masquer cette personne" })}
                    title={t("mutes.action", { defaultValue: "Masquer cette personne" })}
                  >
                    <UserX className="h-4 w-4" />
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
          {p.hidden_at && (
            <p className="mb-1.5 inline-flex items-center gap-1 rounded-md bg-destructive/10 px-2 py-0.5 text-[11px] font-medium text-destructive">
              <Flag className="h-3 w-3" />
              {t("wall.moderation.hiddenBadge", {
                defaultValue: "Masqué par la modération — visible par les responsables uniquement",
              })}
            </p>
          )}
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
            (audienceByPost[p.id] ?? memberCount) > 0 &&
            (() => {
              // Dénominateur = audience réelle du post (fallback: membres du club),
              // moins l'auteur qui n'est pas compté comme lecteur.
              const total = audienceByPost[p.id] ?? memberCount;
              const denom = Math.max(total - 1, 0);
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
          {!isExternal && (
            <WallReactions
              reactions={p.reactions ?? []}
              currentUserId={currentUserId}
              onToggle={(emoji) => onToggleReaction(p, emoji)}
            />
          )}
          {!isExternal && commentsEnabled && (
            <CommentBlock
              post={p}
              currentUserId={currentUserId}
              role={role}
              clubId={p.club_id}
              onToggleCommentReaction={onToggleCommentReaction}
              onReportComment={(commentId, author) =>
                setReportTarget({ postId: p.id, commentId, reportedUser: author })
              }
              onMuteAuthor={(userId, name) => setMuteTarget({ userId, name })}
            />
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
          <ul className="space-y-2.5">
            {group.items.map((entry) =>
              entry.kind === "post" ? (
                renderItem(entry.post)
              ) : (
                <PollCard key={entry.poll.id} poll={entry.poll} teamsById={teamsById} />
              ),
            )}
          </ul>
        </section>
      ))}
      {(polls.length > 0 || posts.length > 0) && (
        <div className="pt-2 text-center">
          <Link to="/publications" className="text-xs text-primary hover:underline">
            {t("publications:seeAllPolls", { defaultValue: "Voir tous les sondages" })}
          </Link>
        </div>
      )}
      {reportTarget && (
        <WallReportDialog
          open
          onOpenChange={(v) => !v && setReportTarget(null)}
          postId={reportTarget.postId}
          commentId={reportTarget.commentId}
          reportedUser={reportTarget.reportedUser}
        />
      )}
      <AlertDialog open={!!muteTarget} onOpenChange={(v) => !v && setMuteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("mutes.confirmTitle", {
                defaultValue: "Masquer les contenus de {{name}} ?",
                name: muteTarget?.name ?? "",
              })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("mutes.confirmBody", {
                defaultValue:
                  "Vous ne verrez plus ses publications, commentaires, réactions et messages. Les communications officielles (convocations, événements, notifications) restent visibles. Vous pourrez la réafficher à tout moment depuis Profil → Confidentialité.",
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel", { defaultValue: "Annuler" })}</AlertDialogCancel>
            <AlertDialogAction onClick={confirmMute} disabled={muting}>
              {t("mutes.confirm", { defaultValue: "Masquer" })}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function PollCard({ poll, teamsById }: { poll: PollItem; teamsById: Map<string, Team> }) {
  const { t } = useTranslation();
  const d = new Date(poll.published_at ?? Date.now());
  const isClosed = !!poll.closed_at;
  const isAnonymous = poll.poll_visibility === "anonymous";
  const staffTeams = (poll.audiences ?? [])
    .filter((a) => a.audience_type === "staff_equipe" && a.team_id)
    .map((a) => teamsById.get(a.team_id as string))
    .filter((x): x is Team => !!x);
  const staffLabel =
    staffTeams.length === 0
      ? null
      : staffTeams.length === 1
        ? t("wall.staff.badgeWithTeam", {
            defaultValue: "Staff {{team}}",
            team: staffTeams[0].name,
          })
        : t("wall.staff.badgeWithTeam", {
            defaultValue: "Staff {{team}}",
            team: `${staffTeams[0].name} +${staffTeams.length - 1}`,
          });
  // Audience target badges (excluding staff_equipe already rendered above).
  const targetLabels = Array.from(
    new Set(
      (poll.audiences ?? [])
        .filter((a) => a.audience_type !== "staff_equipe")
        .map((a) => {
          const base = t(`publications:audience.types.${a.audience_type}`, {
            defaultValue: a.audience_type,
          });
          const team = a.team_id ? teamsById.get(a.team_id)?.name : null;
          if (team) return `${base} · ${team}`;
          if (a.category_label) return `${base} · ${a.category_label}`;
          return base;
        }),
    ),
  ).slice(0, 3);
  return (
    <li
      className={cn(
        "group flex items-stretch gap-3 rounded-2xl border bg-card overflow-hidden",
        "transition-all duration-200 hover:shadow-md hover:-translate-y-px",
        "animate-in fade-in-0 slide-in-from-bottom-1 duration-300",
        "border-primary/30 bg-primary/[0.02]",
      )}
    >
      <div className="flex flex-col items-center justify-center w-16 shrink-0 py-3 bg-primary/12">
        <BarChart3 className="h-5 w-5 text-primary" />
        <span className="text-[10px] text-muted-foreground mt-1 tabular-nums">
          {format(d, "d MMM")}
        </span>
      </div>
      <div className="flex-1 min-w-0 py-3 pr-3">
        <header className="flex items-center gap-1.5 mb-1.5 flex-wrap">
          <span className="text-[10px] font-medium uppercase tracking-wider px-1.5 py-0.5 rounded border bg-primary/10 text-primary border-primary/30 inline-flex items-center gap-1">
            <BarChart3 className="h-3 w-3" />
            {t("publications:card.tagPoll", { defaultValue: "Sondage" })}
          </span>
          {staffLabel && (
            <span
              className="inline-flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider px-1.5 py-0.5 rounded border bg-violet-500/10 text-violet-700 dark:text-violet-300 border-violet-500/40"
              title={t("wall.staff.badgeTitle", {
                defaultValue: "Message privé au staff de l'équipe",
              })}
            >
              <Lock className="h-2.5 w-2.5" />
              {staffLabel}
            </span>
          )}
          {targetLabels.map((label) => (
            <span
              key={label}
              className="inline-flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider px-1.5 py-0.5 rounded border bg-muted text-muted-foreground border-border whitespace-normal break-words text-left"
              title={label}
            >
              <Users className="h-2.5 w-2.5 shrink-0" />
              {label}
            </span>
          ))}

          {isAnonymous && (
            <span className="text-[10px] font-medium uppercase tracking-wider px-1.5 py-0.5 rounded border bg-muted text-muted-foreground border-border">
              {t("publications:card.anonymous", { defaultValue: "Anonyme" })}
            </span>
          )}
          {isClosed && (
            <span className="text-[10px] font-medium uppercase tracking-wider px-1.5 py-0.5 rounded border bg-muted text-muted-foreground border-border inline-flex items-center gap-1">
              <Lock className="h-3 w-3" />
              {t("publications:card.closed", { defaultValue: "Fermé" })}
            </span>
          )}
        </header>
        <p className="text-sm font-semibold">{poll.title}</p>
        {poll.content && (
          <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{poll.content}</p>
        )}
        {isClosed &&
          poll.options &&
          poll.options.length > 0 &&
          (() => {
            const total = poll.options.reduce((s, o) => s + o.votes, 0);
            const belowThreshold =
              isAnonymous && poll.options.some((o) => o.votes > 0 && o.votes < 3);
            if (belowThreshold) {
              return (
                <p className="text-[11px] text-muted-foreground mt-2 italic">
                  {t("publications:poll.belowThreshold", {
                    defaultValue: "Pas assez de réponses pour afficher les résultats",
                  })}
                </p>
              );
            }
            const max = Math.max(1, ...poll.options.map((o) => o.votes));
            const winner = poll.options.reduce((a, b) => (b.votes > a.votes ? b : a));
            return (
              <ul className="mt-2 space-y-1.5">
                {poll.options.map((o) => {
                  const pct = total === 0 ? 0 : Math.round((o.votes / total) * 100);
                  const isWinner = total > 0 && o.id === winner.id && o.votes > 0;
                  return (
                    <li key={o.id} className="text-xs">
                      <div className="flex items-center justify-between gap-2 mb-0.5">
                        <span className={cn("truncate", isWinner && "font-semibold")}>
                          {o.label}
                        </span>
                        <span className="tabular-nums text-muted-foreground shrink-0">
                          {o.votes} · {pct}%
                        </span>
                      </div>
                      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                        <div
                          className={cn(
                            "h-full rounded-full transition-all",
                            isWinner ? "bg-primary" : "bg-primary/40",
                          )}
                          style={{ width: `${total === 0 ? 0 : (o.votes / max) * 100}%` }}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
            );
          })()}
        <div className="flex items-center gap-3 mt-2 flex-wrap">
          <span className="text-[11px] text-muted-foreground tabular-nums">
            {t("publications:card.voters", {
              defaultValue: "{{count}} votants",
              count: poll.voter_count ?? 0,
            })}
          </span>
          <Button asChild size="sm" variant={isClosed || !poll.can_vote ? "outline" : "default"}>
            <Link to="/publications/$publicationId" params={{ publicationId: poll.id }}>
              {isClosed || !poll.can_vote
                ? t("publications:card.viewResults", { defaultValue: "Voir les résultats" })
                : t("publications:card.vote", { defaultValue: "Voter" })}
            </Link>
          </Button>
        </div>
      </div>
    </li>
  );
}

function CommentBlock({
  post,
  currentUserId,
  role,
  clubId,
  onToggleCommentReaction,
  onReportComment,
  onMuteAuthor,
}: {
  post: Post;
  currentUserId: string | null;
  role: string | null;
  clubId: string;
  onToggleCommentReaction: (comment: Comment, emoji: string) => void;
  onReportComment: (commentId: string, author: ReportedUser | null) => void;
  onMuteAuthor: (userId: string, name: string) => void;
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
    if (data?.id) {
      // Notify the post author + previous commenters (mentions already handled).
      notifyWallComment({
        data: { commentId: data.id, excludeUserIds: mentioned },
      }).catch(() => {});
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
            {c.hidden_at && (
              <p className="mt-0.5 inline-flex items-center gap-1 rounded-md bg-destructive/10 px-1.5 py-0.5 text-[10px] font-medium text-destructive">
                <Flag className="h-2.5 w-2.5" />
                {t("wall.moderation.hiddenBadgeShort", { defaultValue: "Masqué" })}
              </p>
            )}
            <p className="text-[10px] text-muted-foreground">{fmt(c.created_at, "d MMM HH:mm")}</p>
            <WallReactions
              reactions={c.reactions ?? []}
              currentUserId={currentUserId}
              onToggle={(emoji) => onToggleCommentReaction(c, emoji)}
            />
          </div>
          {currentUserId && c.author_user_id !== currentUserId && (
            <button
              type="button"
              onClick={() =>
                onReportComment(c.id, {
                  userId: c.author_user_id,
                  name: c.author?.full_name ?? "—",
                  clubId,
                })
              }
              className="shrink-0 inline-flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-amber-500/10 hover:text-amber-600"
              aria-label={t("wall.report.action", { defaultValue: "Signaler" })}
              title={t("wall.report.action", { defaultValue: "Signaler" })}
            >
              <Flag className="h-4 w-4" />
            </button>
          )}
          {currentUserId && c.author_user_id !== currentUserId && (
            <button
              type="button"
              onClick={() => onMuteAuthor(c.author_user_id, c.author?.full_name ?? "—")}
              className="shrink-0 inline-flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
              aria-label={t("mutes.action", { defaultValue: "Masquer cette personne" })}
              title={t("mutes.action", { defaultValue: "Masquer cette personne" })}
            >
              <UserX className="h-4 w-4" />
            </button>
          )}
          {(c.author_user_id === currentUserId || role === "admin") && (
            <button
              type="button"
              onClick={() => del(c.id)}
              className="shrink-0 inline-flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
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
