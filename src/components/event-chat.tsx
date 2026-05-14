import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Send, MessageCircle, Lock } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

type Msg = {
  id: string;
  event_id: string;
  author_user_id: string;
  body: string;
  created_at: string;
  author?: { full_name: string | null; avatar_url: string | null } | null;
};

export function EventChat({ eventId }: { eventId: string }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [body, setBody] = useState("");
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  // Check club setting + load messages
  useEffect(() => {
    let active = true;
    (async () => {
      const { data: ev } = await supabase
        .from("events")
        .select("team_id, teams:team_id(club_id, clubs:club_id(event_chat_enabled))")
        .eq("id", eventId)
        .single();
      // fallback: try to read setting; if select with embed not allowed, just allow
      const ec = (ev as { teams?: { clubs?: { event_chat_enabled?: boolean } } } | null)?.teams?.clubs?.event_chat_enabled;
      if (!active) return;
      setEnabled(ec === undefined ? true : !!ec);
      const { data } = await supabase
        .from("event_messages")
        .select("id, event_id, author_user_id, body, created_at")
        .eq("event_id", eventId)
        .order("created_at", { ascending: true });
      const msgs = (data ?? []) as Msg[];
      const ids = Array.from(new Set(msgs.map((m) => m.author_user_id)));
      if (ids.length > 0) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("id, full_name, avatar_url")
          .in("id", ids);
        const map = new Map((profs ?? []).map((p) => [p.id, p]));
        msgs.forEach((m) => { m.author = map.get(m.author_user_id) ?? null; });
      }
      if (!active) return;
      setMessages(msgs);
    })();
    return () => { active = false; };
  }, [eventId]);

  // Realtime
  useEffect(() => {
    if (!enabled) return;
    const ch = supabase
      .channel(`event_messages:${eventId}`)
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "event_messages", filter: `event_id=eq.${eventId}` },
        (payload) => {
          setMessages((prev) =>
            prev.some((m) => m.id === (payload.new as Msg).id) ? prev : [...prev, payload.new as Msg]
          );
        })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [eventId, enabled]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages.length]);

  async function send() {
    if (!body.trim() || !user) return;
    setSending(true);
    const text = body.trim();
    setBody("");
    const { error } = await supabase
      .from("event_messages")
      .insert({ event_id: eventId, author_user_id: user.id, body: text });
    setSending(false);
    if (error) {
      setBody(text);
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
      <header className="flex items-center gap-2 px-4 py-3 border-b border-border">
        <MessageCircle className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold">{t("chat.title")}</h3>
      </header>

      <div className="max-h-80 overflow-y-auto px-3 py-3 space-y-2">
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
                {!mine && (
                  <p className="text-[10px] opacity-70 mb-0.5">{m.author?.full_name ?? "—"}</p>
                )}
                <p className="whitespace-pre-wrap break-words">{m.body}</p>
                <p className={cn("text-[10px] mt-0.5", mine ? "opacity-80" : "text-muted-foreground")}>
                  {format(new Date(m.created_at), "HH:mm")}
                </p>
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>

      <form
        onSubmit={(e) => { e.preventDefault(); send(); }}
        className="flex gap-2 p-3 border-t border-border"
      >
        <Input
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={t("chat.placeholder")}
          className="h-10"
        />
        <Button type="submit" size="icon" className="h-10 w-10 shrink-0" disabled={sending || !body.trim()}>
          <Send className="h-4 w-4" />
        </Button>
      </form>
    </section>
  );
}
