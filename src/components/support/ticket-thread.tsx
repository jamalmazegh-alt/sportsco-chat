import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Paperclip, X, Lock, Send, Download } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { replyToSupportTicket, getSupportAttachmentUrl } from "@/lib/support.functions";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";

export type ThreadMessage = {
  id: string;
  sender_id: string;
  sender_role: string;
  body: string;
  attachment_paths: string[];
  is_internal_note: boolean;
  created_at: string;
};

export function TicketThread({
  ticketId,
  messages,
  isStaffView,
  onReplied,
}: {
  ticketId: string;
  messages: ThreadMessage[];
  isStaffView: boolean;
  onReplied: () => void;
}) {
  const { user } = useAuth();
  const [body, setBody] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [internalNote, setInternalNote] = useState(false);

  const send = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("not_authenticated");
      const paths: string[] = [];
      for (const f of files) {
        if (f.size > 5 * 1024 * 1024) throw new Error(`${f.name} dépasse 5 Mo`);
        const ext = f.name.split(".").pop() || "bin";
        const path = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const { error } = await supabase.storage
          .from("support-attachments")
          .upload(path, f, { contentType: f.type });
        if (error) throw error;
        paths.push(path);
      }
      await replyToSupportTicket({
        data: {
          ticket_id: ticketId,
          body: body.trim(),
          attachment_paths: paths,
          internal_note: internalNote,
        },
      });
    },
    onSuccess: () => {
      setBody("");
      setFiles([]);
      setInternalNote(false);
      onReplied();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erreur"),
  });

  const openAttachment = async (path: string) => {
    try {
      const { url } = await getSupportAttachmentUrl({ data: { path } });
      window.open(url, "_blank");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Lien indisponible");
    }
  };

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        {messages.map((m) => {
          const mine = m.sender_id === user?.id;
          const isStaff = m.sender_role === "staff";
          return (
            <div key={m.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
              <div
                className={cn(
                  "max-w-[85%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap break-words",
                  m.is_internal_note
                    ? "bg-amber-50 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-800"
                    : mine
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted",
                )}
              >
                {m.is_internal_note && (
                  <div className="flex items-center gap-1 text-[10px] uppercase tracking-wide opacity-70 mb-1">
                    <Lock className="h-3 w-3" /> Note interne
                  </div>
                )}
                {!m.is_internal_note && isStaff && !mine && (
                  <div className="text-[10px] uppercase tracking-wide opacity-70 mb-1">Équipe Clubero</div>
                )}
                <div>{m.body}</div>
                {m.attachment_paths.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {m.attachment_paths.map((p) => (
                      <button
                        key={p}
                        onClick={() => openAttachment(p)}
                        className={cn(
                          "flex items-center gap-1.5 text-xs underline-offset-2 hover:underline",
                          mine && !m.is_internal_note ? "text-primary-foreground/90" : "text-foreground/80",
                        )}
                      >
                        <Download className="h-3 w-3" />
                        {p.split("/").pop()}
                      </button>
                    ))}
                  </div>
                )}
                <div className={cn("text-[10px] mt-1.5 opacity-60")}>
                  {new Date(m.created_at).toLocaleString()}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="sticky bottom-0 pt-3 bg-background border-t">
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Écrire une réponse…"
          rows={3}
          maxLength={10000}
        />
        {files.length > 0 && (
          <ul className="space-y-1 mt-2">
            {files.map((f, i) => (
              <li key={i} className="flex items-center gap-2 text-xs bg-muted rounded px-2 py-1">
                <span className="truncate flex-1">{f.name}</span>
                <button
                  onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex items-center justify-between gap-2 mt-2">
          <div className="flex items-center gap-2">
            <label className="cursor-pointer text-muted-foreground hover:text-foreground">
              <Paperclip className="h-5 w-5" />
              <input
                type="file"
                accept="image/*,application/pdf"
                multiple
                className="hidden"
                onChange={(e) => {
                  const list = Array.from(e.target.files ?? []);
                  setFiles((prev) => [...prev, ...list].slice(0, 5));
                  e.currentTarget.value = "";
                }}
              />
            </label>
            {isStaffView && (
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
                <input
                  type="checkbox"
                  checked={internalNote}
                  onChange={(e) => setInternalNote(e.target.checked)}
                />
                Note interne
              </label>
            )}
          </div>
          <Button
            onClick={() => send.mutate()}
            disabled={send.isPending || !body.trim()}
            size="sm"
          >
            {send.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Envoyer
          </Button>
        </div>
      </div>
    </div>
  );
}
