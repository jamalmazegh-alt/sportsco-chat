import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, useMyRoles } from "@/lib/auth-context";
import { useUserMutes } from "@/lib/use-mutes";
import { filterMutedMessages } from "@/lib/mutes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Send, MessageCircle, Lock, ChevronDown, Flag, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { fmt } from "@/lib/date-locale";
import { cn } from "@/lib/utils";
import { AttachmentPicker, AttachmentList, type Attachment } from "@/components/attachments";
import { dispatchEventChatPush } from "@/lib/event-chat-notify.functions";
import { WallReportDialog, type ReportedUser } from "@/components/wall-report-dialog";

type Msg = {
  id: string;
  event_id: string;
  author_user_id: string;
  body: string;
  created_at: string;
  attachments: Attachment[];
  author?: { full_name: string | null; avatar_url: string | null } | null;
};

const PAGE_SIZE = 30;

export function EventChat({
  eventId,
  embedded = false,
}: {
  eventId: string;
  /**
   * Rendu dans une section repliable, qui porte déjà carte, titre et repli :
   * on retire la coquille et le repli interne, sinon la page imbrique deux
   * accordéons pour une seule conversation.
   */
  embedded?: boolean;
}) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const roles = useMyRoles();
  const { muted } = useUserMutes();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [clubId, setClubId] = useState<string | null>(null);
  // Cible du signalement d'un message (+ éventuellement de son auteur).
  const [reportTarget, setReportTarget] = useState<{
    messageId: string;
    author: ReportedUser | null;
  } | null>(null);
  // Modération : admins/dirigeants et staff de l'équipe de l'événement
  // peuvent supprimer n'importe quel message (aligné sur la policy RLS).
  const [isEventStaff, setIsEventStaff] = useState(false);
  const canModerate = roles.includes("admin") || roles.includes("dirigeant") || isEventStaff;
  const [body, setBody] = useState("");
  const [atts, setAtts] = useState<Attachment[]>([]);
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [canPost, setCanPost] = useState<boolean | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [ownOpen, setOwnOpen] = useState(false);
  const open = embedded || ownOpen;
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  // Masquage personnel : les messages des personnes masquées sont filtrés au rendu.
  const visibleMessages = useMemo(() => filterMutedMessages(messages, muted), [messages, muted]);

  async function attachAuthors(msgs: Msg[]): Promise<Msg[]> {
    const ids = Array.from(new Set(msgs.map((m) => m.author_user_id).filter(Boolean)));
    if (ids.length === 0) return msgs;
    const { data: profs } = await supabase
      .from("profiles")
      .select("id, full_name, avatar_url")
      .in("id", ids);
    const map = new Map((profs ?? []).map((p) => [p.id, p]));
    return msgs.map((m) => ({ ...m, author: map.get(m.author_user_id) ?? m.author ?? null }));
  }

  // Check club setting + load most recent page
  useEffect(() => {
    let active = true;
    (async () => {
      const { data: ev } = await supabase
        .from("events")
        .select("team_id, teams:team_id(club_id, clubs:club_id(event_chat_enabled))")
        .eq("id", eventId)
        .single();
      const teams = (
        ev as {
          teams?: { club_id?: string; clubs?: { event_chat_enabled?: boolean } };
        } | null
      )?.teams;
      const ec = teams?.clubs?.event_chat_enabled;
      if (!active) return;
      setClubId(teams?.club_id ?? null);
      setEnabled(ec === undefined ? true : !!ec);
      // Access is governed by RLS (can_access_event_chat): staff always, players
      // and parents only when the club opened the chat to them.
      const { data: access } = await (supabase.rpc as any)("can_access_event_chat", {
        _user_id: user?.id ?? null,
        _event_id: eventId,
      });
      if (!active) return;
      setCanPost(access === true);

      if (user?.id) {
        const { data: staff } = await (supabase.rpc as any)("is_team_staff_of_event", {
          p_event_id: eventId,
          p_user_id: user.id,
        });
        if (!active) return;
        setIsEventStaff(staff === true);
      }

      const { data } = await supabase
        .from("event_messages")
        .select("id, event_id, author_user_id, body, created_at, attachments")
        .eq("event_id", eventId)
        .order("created_at", { ascending: false })
        .limit(PAGE_SIZE + 1);
      const rows = (data ?? []) as Msg[];
      const more = rows.length > PAGE_SIZE;
      const page = more ? rows.slice(0, PAGE_SIZE) : rows;
      const ordered = page.reverse();
      const withAuthors = await attachAuthors(ordered);
      if (!active) return;
      setMessages(withAuthors);
      setHasMore(more);
    })();
    return () => {
      active = false;
    };
  }, [eventId, user?.id]);

  async function loadMore() {
    if (loadingMore || messages.length === 0) return;
    setLoadingMore(true);
    const oldest = messages[0].created_at;
    const { data } = await supabase
      .from("event_messages")
      .select("id, event_id, author_user_id, body, created_at, attachments")
      .eq("event_id", eventId)
      .lt("created_at", oldest)
      .order("created_at", { ascending: false })
      .limit(PAGE_SIZE + 1);
    const rows = (data ?? []) as Msg[];
    const more = rows.length > PAGE_SIZE;
    const page = more ? rows.slice(0, PAGE_SIZE) : rows;
    const withAuthors = await attachAuthors(page.reverse());
    setMessages((prev) => [...withAuthors, ...prev]);
    setHasMore(more);
    setLoadingMore(false);
  }

  // Realtime
  useEffect(() => {
    if (!enabled) return;
    const ch = supabase
      .channel(`event_messages:${eventId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "event_messages",
          filter: `event_id=eq.${eventId}`,
        },
        async (payload) => {
          const incoming = payload.new as Msg;
          // Fetch author profile so the name doesn't appear as "—"
          const { data: prof } = await supabase
            .from("profiles")
            .select("id, full_name, avatar_url")
            .eq("id", incoming.author_user_id)
            .maybeSingle();
          const withAuthor = { ...incoming, author: prof ?? null };
          setMessages((prev) =>
            prev.some((m) => m.id === incoming.id) ? prev : [...prev, withAuthor],
          );
        },
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "event_messages" },
        (payload) => {
          const deletedId = (payload.old as { id?: string } | null)?.id;
          if (deletedId) setMessages((prev) => prev.filter((m) => m.id !== deletedId));
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [eventId, enabled]);

  useEffect(() => {
    if (open) endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, open]);

  async function deleteMessage(id: string) {
    const prev = messages;
    setMessages((cur) => cur.filter((m) => m.id !== id));
    const { error } = await supabase.from("event_messages").delete().eq("id", id);
    if (error) {
      setMessages(prev);
      toast.error(t("common.error"));
    }
  }

  async function send() {
    if ((!body.trim() && atts.length === 0) || !user) return;
    setSending(true);
    setSendError(null);
    const text = body.trim();
    const attachmentsToSend = atts;
    setBody("");
    setAtts([]);
    const { data: inserted, error } = await supabase
      .from("event_messages")
      .insert({
        event_id: eventId,
        author_user_id: user.id,
        body: text,
        attachments: attachmentsToSend as unknown as never,
      })
      .select("id")
      .maybeSingle();
    setSending(false);
    if (error) {
      setBody(text);
      setAtts(attachmentsToSend);
      setSendError(t("chat.sendFailed"));
      setCanPost(false);
      return;
    }
    if (inserted?.id) {
      // Fire-and-forget push fan-out to convoked players, parents and staff.
      dispatchEventChatPush({ data: { messageId: inserted.id } }).catch(() => {});
    }
  }

  if (enabled === false || canPost === false) {
    return (
      <div className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground flex flex-col items-center gap-2">
        <Lock className="h-5 w-5" />
        {enabled === false ? t("chat.disabled") : t("chat.noAccess")}
      </div>
    );
  }

  return (
    <section
      className={cn("overflow-hidden", !embedded && "rounded-2xl border border-border bg-card")}
    >
      {!embedded && (
        <button
          type="button"
          onClick={() => setOwnOpen((v) => !v)}
          className="w-full flex items-center justify-between gap-2 px-4 py-3 hover:bg-muted/40 transition-colors"
        >
          <div className="flex items-center gap-2">
            <MessageCircle className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold">{t("chat.title")}</h3>
            {visibleMessages.length > 0 && (
              <span className="text-[11px] text-muted-foreground">· {visibleMessages.length}</span>
            )}
          </div>
          <ChevronDown
            className={cn(
              "h-4 w-4 text-muted-foreground transition-transform",
              open && "rotate-180",
            )}
          />
        </button>
      )}

      {open && (
        <>
          <div
            className={cn(
              "max-h-80 space-y-2 overflow-y-auto py-3",
              embedded ? "px-0" : "border-t border-border px-3",
            )}
          >
            {hasMore && (
              <div className="flex justify-center pb-1">
                <button
                  type="button"
                  onClick={loadMore}
                  disabled={loadingMore}
                  className="text-[11px] font-medium text-primary hover:underline disabled:opacity-50"
                >
                  {loadingMore ? t("common.loading") : t("chat.loadMore")}
                </button>
              </div>
            )}
            {visibleMessages.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-6">{t("chat.empty")}</p>
            )}
            {visibleMessages.map((m) => {
              const mine = m.author_user_id === user?.id;
              return (
                <div
                  key={m.id}
                  className={cn("flex items-end gap-1", mine ? "justify-end" : "justify-start")}
                >
                  {(mine || canModerate) && (
                    <button
                      type="button"
                      onClick={() => deleteMessage(m.id)}
                      className={cn(
                        "shrink-0 p-1 text-muted-foreground/60 hover:text-destructive",
                        !mine && "order-last",
                      )}
                      aria-label={t("common.delete")}
                      title={t("common.delete")}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                  {!mine && user && (
                    <button
                      type="button"
                      onClick={() =>
                        setReportTarget({
                          messageId: m.id,
                          author: clubId
                            ? {
                                userId: m.author_user_id,
                                name: m.author?.full_name ?? "—",
                                clubId,
                              }
                            : null,
                        })
                      }
                      className="order-last shrink-0 p-1 text-muted-foreground/60 hover:text-amber-600"
                      aria-label={t("wall.report.action")}
                      title={t("wall.report.action")}
                    >
                      <Flag className="h-3.5 w-3.5" />
                    </button>
                  )}
                  <div
                    className={cn(
                      "max-w-[78%] rounded-2xl px-3 py-2 text-sm",
                      mine ? "bg-primary text-primary-foreground" : "bg-muted",
                    )}
                  >
                    <p
                      className={cn(
                        "text-[11px] font-medium mb-0.5",
                        mine ? "opacity-90" : "text-foreground/80",
                      )}
                    >
                      {mine ? t("chat.you") : (m.author?.full_name ?? "—")}
                    </p>
                    {m.body && <p className="whitespace-pre-wrap break-words">{m.body}</p>}
                    {m.attachments?.length > 0 && (
                      <div className="mt-1.5">
                        <AttachmentList items={m.attachments as Attachment[]} />
                      </div>
                    )}
                    <p
                      className={cn(
                        "text-[10px] mt-0.5",
                        mine ? "opacity-80" : "text-muted-foreground",
                      )}
                    >
                      {fmt(m.created_at, "HH:mm")}
                    </p>
                  </div>
                </div>
              );
            })}
            <div ref={endRef} />
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
            className="p-3 border-t border-border space-y-2"
          >
            <div className="flex gap-2">
              <Input
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder={t("chat.placeholder")}
                className="h-10"
              />
              <Button
                type="submit"
                size="icon"
                className="h-10 w-10 shrink-0"
                disabled={sending || (!body.trim() && atts.length === 0)}
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
            {sendError && <p className="text-xs text-destructive">{sendError}</p>}
            <AttachmentPicker value={atts} onChange={setAtts} prefix={`chat/${eventId}`} />
          </form>
        </>
      )}
      {reportTarget && (
        <WallReportDialog
          open
          onOpenChange={(v) => !v && setReportTarget(null)}
          postId={null}
          eventMessageId={reportTarget.messageId}
          reportedUser={reportTarget.author}
        />
      )}
    </section>
  );
}
