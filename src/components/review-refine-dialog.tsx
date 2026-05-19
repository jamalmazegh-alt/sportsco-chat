import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import { Loader2, Sparkles, Send, Wand2 } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { refinePlayerReview } from "@/lib/player-feedback.functions";

type Turn =
  | { role: "user"; text: string }
  | { role: "assistant"; changes: string; preview: string };

export function ReviewRefineDialog({
  open,
  onOpenChange,
  reviewId,
  playerId,
  initialContent,
  onUpdated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  reviewId: string;
  playerId: string;
  initialContent: string;
  onUpdated?: (review: any) => void;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const refineFn = useServerFn(refinePlayerReview);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [currentContent, setCurrentContent] = useState(initialContent);
  const [busy, setBusy] = useState(false);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setCurrentContent(initialContent);
      setTurns([]);
      setInput("");
      setTimeout(() => taRef.current?.focus(), 50);
    }
  }, [open, initialContent]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [turns, busy]);

  async function send() {
    const instruction = input.trim();
    if (instruction.length < 2 || busy) return;
    setBusy(true);
    setTurns((s) => [...s, { role: "user", text: instruction }]);
    setInput("");
    try {
      const res: any = await refineFn({ data: { reviewId, instruction } });
      const review = res?.review;
      const changes: string = (res?.changes ?? "").trim();
      if (!review?.content) throw new Error("Réponse IA vide");

      setCurrentContent(review.content);
      qc.setQueryData(["player-reviews", playerId], (current: any) => {
        const reviews = Array.isArray(current?.reviews) ? current.reviews : [];
        const exists = reviews.some((r: any) => r.id === review.id);
        return {
          ...(current ?? {}),
          reviews: exists
            ? reviews.map((r: any) => (r.id === review.id ? { ...r, ...review } : r))
            : [review, ...reviews],
        };
      });
      onUpdated?.(review);
      await qc.invalidateQueries({ queryKey: ["player-reviews", playerId] });

      const preview = String(review.content ?? "").slice(0, 360);
      setTurns((s) => [
        ...s,
        {
          role: "assistant",
          changes:
            changes ||
            t("feedback.refineDoneFallback", {
              defaultValue: "Synthèse mise à jour selon ta demande.",
            }),
          preview,
        },
      ]);
      toast.success(t("feedback.refineUpdated", { defaultValue: "Synthèse mise à jour" }));
    } catch (e: any) {
      const msg = e?.message ?? "";
      if (msg.includes("429"))
        toast.error(t("feedback.rateLimit", { defaultValue: "Trop de requêtes." }));
      else if (msg.includes("402"))
        toast.error(t("feedback.creditsExhausted", { defaultValue: "Crédits IA épuisés." }));
      else toast.error(msg || "Error");
      setTurns((s) => [
        ...s,
        {
          role: "assistant",
          changes: t("feedback.refineFailed", {
            defaultValue: "Je n'ai pas pu appliquer ta demande, réessaie.",
          }),
          preview: "",
        },
      ]);
    } finally {
      setBusy(false);
      setTimeout(() => taRef.current?.focus(), 50);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg p-0 overflow-hidden">
        <DialogHeader className="px-5 pt-5 pb-3 border-b border-border">
          <DialogTitle className="flex items-center gap-2 text-base">
            <div className="h-8 w-8 rounded-xl bg-primary/10 flex items-center justify-center">
              <Wand2 className="h-4 w-4 text-primary" />
            </div>
            {t("feedback.refineChatTitle", { defaultValue: "Affiner la synthèse avec l'IA" })}
          </DialogTitle>
        </DialogHeader>

        <div ref={scrollRef} className="max-h-[55vh] overflow-y-auto px-5 py-4 space-y-4">
          {turns.length === 0 && (
            <div className="rounded-xl border border-dashed border-border bg-muted/30 p-4 text-sm text-muted-foreground">
              <p className="flex items-center gap-2 font-medium text-foreground">
                <Sparkles className="h-4 w-4 text-primary" />
                {t("feedback.refineChatHint", {
                  defaultValue:
                    "Décris ce que tu veux changer (ton, longueur, structure…). Tu verras la synthèse se mettre à jour à chaque échange.",
                })}
              </p>
              <ul className="mt-2 space-y-1 text-xs">
                <li>· « Résume en 5 phrases »</li>
                <li>· « Insiste davantage sur le mental »</li>
                <li>· « Ajoute une recommandation sur le placement »</li>
              </ul>
            </div>
          )}
          {turns.map((turn, i) =>
            turn.role === "user" ? (
              <div key={i} className="flex justify-end">
                <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-primary px-3 py-2 text-sm text-primary-foreground">
                  {turn.text}
                </div>
              </div>
            ) : (
              <div key={i} className="space-y-1.5">
                <p className="text-xs font-medium text-primary inline-flex items-center gap-1">
                  <Sparkles className="h-3 w-3" />
                  {turn.changes}
                </p>
                {turn.preview && (
                  <p className="text-xs text-muted-foreground italic line-clamp-3 border-l-2 border-primary/30 pl-2">
                    {turn.preview}
                    {turn.preview.length >= 360 && "…"}
                  </p>
                )}
              </div>
            )
          )}
          {busy && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
              {t("feedback.refineWorking", { defaultValue: "L'IA réécrit la synthèse…" })}
            </div>
          )}
        </div>

        <div className="border-t border-border bg-muted/20 px-5 py-3">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {t("feedback.currentSynthesis", { defaultValue: "Synthèse actuelle" })}
          </p>
          <p className="max-h-24 overflow-y-auto whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">
            {currentContent}
          </p>
        </div>

        <div className="border-t border-border p-3">
          <div className="flex items-end gap-2">
            <Textarea
              ref={taRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              placeholder={t("feedback.refineChatPlaceholder", {
                defaultValue: "Que veux-tu changer ?",
              })}
              className="min-h-[44px] max-h-[140px] text-sm resize-none flex-1"
              disabled={busy}
            />
            <Button
              size="icon"
              onClick={send}
              disabled={busy || input.trim().length < 2}
              aria-label={t("feedback.send", { defaultValue: "Envoyer" })}
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
          <p className="mt-1.5 text-[10px] text-muted-foreground">
            {t("feedback.refineChatFooter", {
              defaultValue:
                "Chaque message met à jour la synthèse affichée. L'historique de cet échange n'est pas sauvegardé.",
            })}
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
