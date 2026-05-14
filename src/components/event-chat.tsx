import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Send, MessageCircle, Lock, ChevronDown } from "lucide-react";
import { fmt } from "@/lib/date-locale";
import { cn } from "@/lib/utils";
import { AttachmentPicker, AttachmentList, type Attachment } from "@/components/attachments";

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

export function EventChat({ eventId }: { eventId: string }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [body, setBody] = useState("");
  const [atts, setAtts] = useState<Attachment[]>([]);
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [sending, setSending] = useState(false);
  const [open, setOpen] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

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
      const ec = (ev as { teams?: { clubs?: { event_chat_enabled?: boolean } } } | null)?.teams?.clubs?.event_chat_enabled;
      if (!active) return;
      setEnabled(ec === undefined ? true : !!ec);
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
    return () => { active = false; };
  }, [eventId]);

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
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "event_messages", filter: `event_id=eq.${eventId}` },
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
            prev.some((m) => m.id === incoming.id) ? prev : [...prev, withAuthor]
          );
        })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [eventId, enabled]);

  useEffect(() => { if (open) endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages.length, open]);

  async function send() {
    if ((!body.trim() && atts.length === 0) || !user) return;
    setSending(true);
    const text = body.trim();
    const attachmentsToSend = atts;
    setBody("");
    setAtts([]);
    const { error } = await supabase
      .from("event_messages")
      .insert({ event_id: eventId, author_user_id: user.id, body: text, attachments: attachmentsToSend as unknown as never });
    setSending(false);
    if (error) {
      setBody(text);
      setAtts(attachmentsToSend);
    }
  }

  if (enabled === false) {
    return (
      <div className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground flex flex-col items-center gap-2">
        <Lock className="h-5 w-5" />
        {t("chat.disabled")}
      </div>
    );
  }

  return (
    <section className="rounded-2xl border border-border bg-card overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-2 px-4 py-3 hover:bg-muted/40 transition-colors"
      >
        <div className="flex items-center gap-2">
          <MessageCircle className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">{t("chat.title")}</h3>
          {messages.length > 0 && (
            <span className="text-[11px] text-muted-foreground">· {messages.length}</span>
          )}
        </div>
        <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <>
          <div className="max-h-80 overflow-y-auto px-3 py-3 space-y-2 border-t border-border">
            {messages.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-6">{t("chat.empty")}</p>
            )}
            {messages.map((m) => {
              const mine = m.author_user_id === user?.id;
              return (
                <div key={m.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
                  <div className={cn(
                    "max-w-[78%] rounded-2xl px-3 py-2 text-sm",
                    mine ? "bg-primary text-primary-foreground" : "bg-muted"
                  )}>
                    <p className={cn("text-[11px] font-medium mb-0.5", mine ? "opacity-90" : "text-foreground/80")}>
                      {mine ? t("chat.you") : (m.author?.full_name ?? "—")}
                    </p>
                    {m.body && <p className="whitespace-pre-wrap break-words">{m.body}</p>}
                    {m.attachments?.length > 0 && (
                      <div className="mt-1.5"><AttachmentList items={m.attachments as Attachment[]} /></div>
                    )}
                    <p className={cn("text-[10px] mt-0.5", mine ? "opacity-80" : "text-muted-foreground")}>
                      {fmt(m.created_at, "HH:mm")}
                    </p>
                  </div>
                </div>
              );
            })}
            <div ref={endRef} />
          </div>

          <form
            onSubmit={(e) => { e.preventDefault(); send(); }}
            className="p-3 border-t border-border space-y-2"
          >
            <div className="flex gap-2">
              <Input
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder={t("chat.placeholder")}
                className="h-10"
              />
              <Button type="submit" size="icon" className="h-10 w-10 shrink-0" disabled={sending || (!body.trim() && atts.length === 0)}>
                <Send className="h-4 w-4" />
              </Button>
            </div>
            <AttachmentPicker value={atts} onChange={setAtts} prefix={`chat/${eventId}`} />
          </form>
        </>
      )}
    </section>
  );
}
