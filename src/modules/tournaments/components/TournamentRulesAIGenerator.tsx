/**
 * Sprint 5 Feature 3 — AI rules generator button + preview modal.
 *
 * Self-contained: shows a button, opens a Dialog with the generated HTML in
 * an editable textarea (so it stays modifiable by definition), then on
 * "Insert" hands the HTML back to the parent via onInsert OR copies to
 * clipboard if no callback is provided.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { generateTournamentRules } from "@/lib/llm/tournament-rules.functions";

interface Props {
  tournamentId: string;
  locale?: "fr" | "en";
  onInsert?: (html: string) => void;
}

export function TournamentRulesAIGenerator({ tournamentId, locale = "fr", onInsert }: Props) {
  const { t } = useTranslation("tournaments");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [html, setHtml] = useState("");
  const generate = useServerFn(generateTournamentRules);

  async function run() {
    setLoading(true);
    try {
      const res = await generate({ data: { tournamentId, locale } });
      if (res.ok) {
        setHtml(res.html);
      } else if ("fallback" in res && res.fallback) {
        setHtml(res.fallback);
        toast.info(
          res.reason === "rate_limited" ? t("rulesAi.rateLimited") : t("rulesAi.error"),
        );
      } else {
        toast.error(t("rulesAi.error"));
      }
    } finally {
      setLoading(false);
    }
  }

  async function openAndGenerate() {
    setOpen(true);
    if (!html) await run();
  }

  function insert() {
    if (onInsert) {
      onInsert(html);
    } else {
      navigator.clipboard?.writeText(html).catch(() => {});
    }
    toast.success(t("rulesAi.insert"));
    setOpen(false);
  }

  return (
    <>
      <Button type="button" variant="outline" onClick={openAndGenerate}>
        <Sparkles className="h-4 w-4" />
        {t("rulesAi.generate")}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t("rulesAi.modalTitle")}</DialogTitle>
            <DialogDescription>{t("rulesAi.modalDescription")}</DialogDescription>
          </DialogHeader>

          {loading ? (
            <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
              {t("rulesAi.loading")}
            </div>
          ) : (
            <div className="space-y-3">
              <Textarea
                value={html}
                onChange={(e) => setHtml(e.target.value)}
                rows={12}
                className="font-mono text-xs"
              />
              <div className="rounded-md border border-border p-3 prose prose-sm max-w-none">
                <div dangerouslySetInnerHTML={{ __html: html }} />
              </div>
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              {t("rulesAi.close")}
            </Button>
            <Button variant="outline" onClick={run} disabled={loading}>
              {t("rulesAi.regenerate")}
            </Button>
            <Button onClick={insert} disabled={loading || !html}>
              {t("rulesAi.insert")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
