import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useTranslation } from "react-i18next";
import { Bot, Trash2, Wrench, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
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
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/_authenticated/assistant")({
  component: AssistantPage,
  head: () => ({ meta: [{ title: "Assistant — Clubero" }] }),
});

const STORAGE_KEY = "clubero-assistant-messages-v1";

function loadMessages(): UIMessage[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as UIMessage[]) : [];
  } catch {
    return [];
  }
}

function AssistantPage() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const [initialMessages] = useState<UIMessage[]>(() => loadMessages());
  const authTokenRef = useRef<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (mounted) authTokenRef.current = data.session?.access_token ?? null;
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      authTokenRef.current = session?.access_token ?? null;
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const [transport] = useState(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        headers: () =>
          authTokenRef.current
            ? { Authorization: `Bearer ${authTokenRef.current}` }
            : ({} as Record<string, string>),
      })
  );

  const { messages, sendMessage, status, setMessages, stop } = useChat({
    id: "clubero-assistant",
    messages: initialMessages,
    transport,
    onError: (err) => {
      console.error(err);
      toast.error(err.message || t("assistant.error", { defaultValue: "Une erreur est survenue." }));
    },
  });

  // Persist to localStorage
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
    } catch {
      // ignore quota errors
    }
  }, [messages]);

  // Keep textarea focused
  useEffect(() => {
    if (status === "ready") textareaRef.current?.focus();
  }, [status, messages.length]);

  function handleSubmit(msg: PromptInputMessage) {
    const text = (msg.text ?? "").trim();
    if (!text) return;
    sendMessage({ text });
  }

  function clearConversation() {
    setMessages([]);
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
    textareaRef.current?.focus();
  }

  const isLoading = status === "submitted" || status === "streaming";
  const lng = i18n.language?.slice(0, 2) ?? "en";
  const suggestions = lng === "fr"
    ? [
        "Quels sont mes prochains événements ?",
        "Montre-moi mes statistiques de présence",
        "Comment répondre à une convocation ?",
        "Comment fonctionne l'export de mes données ?",
      ]
    : [
        "What are my upcoming events?",
        "Show my training attendance stats",
        "How do I respond to a convocation?",
        "How does data export work?",
      ];

  return (
    <div className="flex flex-col h-[calc(100dvh-72px)]">
      <header className="px-5 pt-6 pb-3 flex items-center justify-between border-b border-border">
        <div className="flex items-center gap-2">
          <div className="h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center">
            <Bot className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-semibold leading-tight">
              {t("assistant.title", { defaultValue: "Assistant Clubero" })}
            </h1>
            <p className="text-xs text-muted-foreground">
              {t("assistant.subtitle", { defaultValue: "Pose une question sur l'app ou tes données" })}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {messages.length > 0 && (
            <Button variant="ghost" size="icon-sm" onClick={clearConversation} aria-label="Clear">
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
          <Button asChild variant="ghost" size="icon-sm" aria-label={t("assistant.close", { defaultValue: "Close" })}>
            <Link to="/home">
              <X className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </header>

      <Conversation className="flex-1 min-h-0">
        <ConversationContent>
          {messages.length === 0 ? (
            <ConversationEmptyState
              icon={<Bot className="h-8 w-8 text-primary" />}
              title={t("assistant.emptyTitle", { defaultValue: "Comment puis-je t'aider ?" })}
              description={t("assistant.emptyHint", {
                defaultValue: "Je connais ton club, tes équipes et tes prochains événements.",
              })}
            >
              <div className="grid gap-2 mt-4 w-full max-w-md">
                {suggestions.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => sendMessage({ text: s })}
                    disabled={!authToken || !user}
                    className="text-left text-sm px-3 py-2 rounded-xl border border-border bg-card hover:bg-muted/50 transition-colors disabled:opacity-50"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </ConversationEmptyState>
          ) : (
            messages.map((m) => (
              <Message key={m.id} from={m.role === "user" ? "user" : "assistant"}>
                <MessageContent className={m.role === "assistant" ? "bg-transparent p-0" : undefined}>
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
                    if (part.type?.startsWith("tool-")) {
                      const toolName = part.type.replace("tool-", "");
                      const state = (part as any).state;
                      return (
                        <details
                          key={idx}
                          className="my-2 rounded-lg border border-border bg-muted/30 text-xs"
                        >
                          <summary className="cursor-pointer px-3 py-1.5 flex items-center gap-1.5 text-muted-foreground">
                            <Wrench className="h-3 w-3" />
                            <span className="font-medium">{toolName}</span>
                            <span className="text-[10px] opacity-70">· {state}</span>
                          </summary>
                          <pre className="px-3 py-2 overflow-auto text-[11px] leading-snug">
                            {JSON.stringify(
                              { input: (part as any).input, output: (part as any).output },
                              null,
                              2,
                            )}
                          </pre>
                        </details>
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
                <Shimmer>{t("assistant.thinking", { defaultValue: "Réflexion..." })}</Shimmer>
              </MessageContent>
            </Message>
          )}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      <div className="px-3 pb-3 pt-2 border-t border-border">
        <PromptInput onSubmit={handleSubmit}>
          <PromptInputTextarea
            ref={textareaRef}
            placeholder={t("assistant.placeholder", { defaultValue: "Pose ta question..." })}
            disabled={!authToken || !user}
          />
          <PromptInputFooter className="justify-end">
            <PromptInputSubmit status={status} onStop={stop} disabled={!authToken || !user || isLoading} />
          </PromptInputFooter>
        </PromptInput>
      </div>
    </div>
  );
}
