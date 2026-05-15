import { useEffect, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { MessageCircle, X, Sparkles, RotateCcw } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import {
  Message,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message";
import {
  PromptInput,
  PromptInputTextarea,
  PromptInputFooter,
  PromptInputSubmit,
  type PromptInputMessage,
} from "@/components/ai-elements/prompt-input";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { cn } from "@/lib/utils";

const SUGGESTIONS = [
  "C'est quoi Clubero, en 1 phrase ?",
  "Quels sont vos tarifs ?",
  "Comment se passe la démo ?",
  "Est-ce adapté à mon club de 60 joueurs ?",
];

export function MarketingChatWidget() {
  const [open, setOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const transport = useRef(
    new DefaultChatTransport({ api: "/api/public/marketing-chat" })
  ).current;

  const { messages, sendMessage, status, setMessages, stop } = useChat({
    id: "clubero-marketing",
    transport,
  });

  useEffect(() => {
    if (open && status === "ready") textareaRef.current?.focus();
  }, [open, status, messages.length]);

  function handleSubmit(msg: PromptInputMessage) {
    const text = (msg.text ?? "").trim();
    if (!text) return;
    sendMessage({ text });
  }

  const isLoading = status === "submitted" || status === "streaming";

  return (
    <>
      {/* Floating launcher button */}
      <button
        type="button"
        onClick={() => setOpen((s) => !s)}
        aria-label={open ? "Fermer l'assistant" : "Ouvrir l'assistant"}
        className={cn(
          "fixed bottom-5 right-5 z-50 flex items-center gap-2 rounded-full px-4 py-3 shadow-xl shadow-primary/20 transition-all",
          "bg-[color:var(--brand-blue-deep,theme(colors.primary.DEFAULT))] text-white hover:scale-[1.03]",
          open && "opacity-0 pointer-events-none"
        )}
      >
        <Sparkles className="h-4 w-4" />
        <span className="text-sm font-medium">Une question ?</span>
      </button>

      {/* Panel */}
      <div
        className={cn(
          "fixed inset-x-0 bottom-0 z-50 sm:inset-auto sm:bottom-5 sm:right-5",
          "transition-all duration-200",
          open ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0 pointer-events-none"
        )}
        aria-hidden={!open}
      >
        <div className="mx-auto flex h-[80dvh] w-full flex-col overflow-hidden border border-border bg-background shadow-2xl sm:h-[600px] sm:w-[400px] sm:rounded-2xl">
          <header className="flex items-center justify-between border-b border-border px-4 py-3">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                <MessageCircle className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="text-sm font-semibold leading-tight">Assistant Clubero</p>
                <p className="text-[11px] text-muted-foreground">
                  Posez vos questions sur le produit
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {messages.length > 0 && (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => setMessages([])}
                  aria-label="Réinitialiser"
                >
                  <RotateCcw className="h-4 w-4" />
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setOpen(false)}
                aria-label="Fermer"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </header>

          <Conversation className="flex-1 min-h-0">
            <ConversationContent className="gap-5 p-4">
              {messages.length === 0 ? (
                <ConversationEmptyState
                  icon={<Sparkles className="h-7 w-7 text-primary" />}
                  title="Bonjour 👋"
                  description="Je peux vous expliquer Clubero, les tarifs, ou organiser une démo."
                >
                  <div className="mt-4 grid w-full gap-2">
                    {SUGGESTIONS.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => sendMessage({ text: s })}
                        className="rounded-xl border border-border bg-card px-3 py-2 text-left text-sm hover:bg-muted/50 transition-colors"
                      >
                        {s}
                      </button>
                    ))}
                    <Button asChild size="sm" className="mt-2 w-full">
                      <Link to="/demo" onClick={() => setOpen(false)}>
                        Demander une démo directement
                      </Link>
                    </Button>
                  </div>
                </ConversationEmptyState>
              ) : (
                messages.map((m) => (
                  <Message key={m.id} from={m.role === "user" ? "user" : "assistant"}>
                    <MessageContent
                      className={m.role === "assistant" ? "bg-transparent p-0" : undefined}
                    >
                      {m.parts.map((part, idx) => {
                        if (part.type === "text") {
                          return m.role === "assistant" ? (
                            <MessageResponse key={idx}>{part.text}</MessageResponse>
                          ) : (
                            <span key={idx} className="whitespace-pre-wrap">
                              {part.text}
                            </span>
                          );
                        }
                        return null;
                      })}
                    </MessageContent>
                  </Message>
                ))
              )}
              {status === "submitted" && (
                <Message from="assistant">
                  <MessageContent className="bg-transparent p-0">
                    <Shimmer>Réflexion...</Shimmer>
                  </MessageContent>
                </Message>
              )}
            </ConversationContent>
            <ConversationScrollButton />
          </Conversation>

          <div className="border-t border-border p-2">
            <PromptInput onSubmit={handleSubmit}>
              <PromptInputTextarea
                ref={textareaRef}
                placeholder="Posez votre question..."
              />
              <PromptInputFooter className="justify-end">
                <PromptInputSubmit
                  status={status}
                  onStop={stop}
                  disabled={isLoading}
                />
              </PromptInputFooter>
            </PromptInput>
          </div>
        </div>
      </div>
    </>
  );
}
