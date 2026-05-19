import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { Loader2, Lock, Sparkles, Trash2, Star, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  listPlayerFeedback,
  listPlayerReviews,
  generatePlayerReview,
  refinePlayerReview,
  deletePlayerFeedback,
  deletePlayerReview,
} from "@/lib/player-feedback.functions";
import { cn } from "@/lib/utils";

export function CoachFeedbackTab({
  playerId,
  isCoach,
}: {
  playerId: string;
  isCoach: boolean;
}) {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const fetchFb = useServerFn(listPlayerFeedback);
  const fetchRv = useServerFn(listPlayerReviews);
  const genFn = useServerFn(generatePlayerReview);
  const delFb = useServerFn(deletePlayerFeedback);
  const delRv = useServerFn(deletePlayerReview);
  const refineFn = useServerFn(refinePlayerReview);
  const [refineInputs, setRefineInputs] = useState<Record<string, string>>({});
  const [refineBusy, setRefineBusy] = useState<Record<string, boolean>>({});

  async function onRefine(reviewId: string) {
    const instruction = (refineInputs[reviewId] ?? "").trim();
    if (instruction.length < 2) return;
    setRefineBusy((s) => ({ ...s, [reviewId]: true }));
    try {
      const res = await refineFn({ data: { reviewId, instruction } });
      if (res?.review) {
        const review = res.review as any;
        qc.setQueryData(["player-reviews", playerId], (current: any) => ({
          reviews: (current?.reviews ?? []).map((r: any) =>
            r.id === review.id ? { ...r, ...review } : r
          ),
        }));
      }
      setRefineInputs((s) => ({ ...s, [reviewId]: "" }));
      toast.success(t("feedback.reviewRefined", { defaultValue: "Synthèse affinée" }));
    } catch (e: any) {
      const msg = e?.message ?? "";
      if (msg.includes("429")) toast.error(t("feedback.rateLimit", { defaultValue: "Trop de requêtes." }));
      else if (msg.includes("402")) toast.error(t("feedback.creditsExhausted", { defaultValue: "Crédits IA épuisés." }));
      else toast.error(msg || "Error");
    } finally {
      setRefineBusy((s) => ({ ...s, [reviewId]: false }));
    }
  }

  const { data: fb, isLoading: lFb } = useQuery({
    queryKey: ["player-feedback", playerId],
    queryFn: () => fetchFb({ data: { playerId } }),
  });
  const { data: rv, isLoading: lRv } = useQuery({
    queryKey: ["player-reviews", playerId],
    queryFn: () => fetchRv({ data: { playerId } }),
  });

  const [genOpen, setGenOpen] = useState(false);
  const [genBusy, setGenBusy] = useState(false);
  const [kind, setKind] = useState<"end_of_season" | "meeting" | "development" | "coaching">("development");
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");

  const locale = i18n.language?.startsWith("fr") ? fr : undefined;

  async function onGenerate() {
    setGenBusy(true);
    try {
      const generated = await genFn({
        data: {
          playerId,
          kind,
          visibility: "coach_only",
          periodStart: periodStart || null,
          periodEnd: periodEnd || null,
        },
      });
      if (generated?.review) {
        const review = generated.review as any;
        qc.setQueryData(["player-reviews", playerId], (current: any) => ({
          reviews: [review, ...((current?.reviews ?? []).filter((r: any) => r.id !== review.id))],
        }));
      }
      toast.success(t("feedback.reviewGenerated", { defaultValue: "Synthèse générée — disponible ci-dessous" }));
      setGenOpen(false);
      await qc.invalidateQueries({ queryKey: ["player-reviews", playerId] });
      // Scroll to the reviews section so the new synthesis is immediately visible.
      setTimeout(() => {
        document.getElementById("coach-reviews-anchor")?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 150);
    } catch (e: any) {
      const msg = e?.message ?? "";
      if (msg.includes("429")) toast.error(t("feedback.rateLimit", { defaultValue: "Trop de requêtes, réessaie dans un instant." }));
      else if (msg.includes("402")) toast.error(t("feedback.creditsExhausted", { defaultValue: "Crédits IA épuisés." }));
      else toast.error(msg || "Error");
    } finally {
      setGenBusy(false);
    }
  }

  async function onDeleteFb(id: string) {
    await delFb({ data: { id } });
    qc.invalidateQueries({ queryKey: ["player-feedback", playerId] });
  }
  async function onDeleteRv(id: string) {
    await delRv({ data: { id } });
    qc.invalidateQueries({ queryKey: ["player-reviews", playerId] });
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            {t("feedback.coachTab", { defaultValue: "Retours Coach" })}
          </h2>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {t("feedback.profileInternalHint", { defaultValue: "Profil joueur · interne staff" })}
          </p>
        </div>
        {isCoach && (
          <Button size="sm" variant="outline" className="h-8" onClick={() => setGenOpen(true)}>
            <Sparkles className="h-4 w-4" />
            {t("feedback.generate", { defaultValue: "Générer une synthèse" })}
          </Button>
        )}
      </div>

      {/* Reviews */}
      <div className="space-y-2 scroll-mt-20" id="coach-reviews-anchor">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <Sparkles className="h-3 w-3 text-primary" />
          {t("feedback.aiSyntheses", { defaultValue: "Synthèses IA" })}
        </p>
        {(rv?.reviews ?? []).length > 0 ? (
          (rv?.reviews ?? []).map((r: any, idx: number) => (
            <details key={r.id} className="rounded-xl border border-primary/30 bg-primary/5 p-3" open={idx === 0}>
              <summary className="cursor-pointer flex items-center gap-2 text-sm font-medium">
                <Sparkles className="h-4 w-4 text-primary" />
                <span className="flex-1 truncate">
                  {t(`feedback.kind_${r.kind}`, { defaultValue: r.kind })}
                </span>
                <span className="text-[11px] text-muted-foreground">
                  {format(new Date(r.created_at), "d MMM yyyy", { locale })}
                </span>
              </summary>
              <div className="mt-3 text-sm whitespace-pre-wrap leading-relaxed">{r.content}</div>
              {isCoach && (
                <button
                  type="button"
                  onClick={() => onDeleteRv(r.id)}
                  className="mt-2 text-[11px] text-destructive inline-flex items-center gap-1"
                >
                  <Trash2 className="h-3 w-3" /> {t("common.delete")}
                </button>
              )}
            </details>
          ))
        ) : !lRv ? (
          <div className="rounded-xl border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
            {t("feedback.noSyntheses", { defaultValue: "Aucune synthèse IA pour ce joueur." })}
          </div>
        ) : null}
      </div>

      {/* Timeline */}
      {lFb || lRv ? (
        <div className="flex justify-center py-6">
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
        </div>
      ) : (fb?.feedback ?? []).length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          {t("feedback.empty", { defaultValue: "Pas encore de retours coach pour ce joueur." })}
        </div>
      ) : (
        <ul className="space-y-2">
          {(fb?.feedback ?? []).map((f: any) => {
            const authorName =
              f.author?.full_name ??
              [f.author?.first_name, f.author?.last_name].filter(Boolean).join(" ") ??
              "—";
            return (
              <li key={f.id} className="rounded-xl border border-border bg-muted/20 p-3 space-y-2">
                <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                  <span>{format(new Date(f.created_at), "d MMM yyyy", { locale })}</span>
                  <span>·</span>
                  <span className="truncate">{authorName}</span>
                  {f.event && (
                    <>
                      <span>·</span>
                      <span className="truncate">{f.event.title}</span>
                    </>
                  )}
                  
                </div>

                {f.rating && (
                  <div className="flex items-center gap-0.5 text-amber-500">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <Star
                        key={n}
                        className={cn(
                          "h-3.5 w-3.5",
                          n <= f.rating ? "fill-current" : "text-muted-foreground/30"
                        )}
                      />
                    ))}
                  </div>
                )}

                {f.tags?.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {f.tags.map((tag: string) => (
                      <span
                        key={tag}
                        className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary"
                      >
                        {t(`feedback.tag.${tag}`, { defaultValue: tag })}
                      </span>
                    ))}
                  </div>
                )}

                {f.strengths && (
                  <p className="text-sm">
                    <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                      {t("feedback.strengths")} : 
                    </span>
                    {f.strengths}
                  </p>
                )}
                {f.improvements && (
                  <p className="text-sm">
                    <span className="text-xs font-semibold text-amber-600 dark:text-amber-400">
                      {t("feedback.improvements")} : 
                    </span>
                    {f.improvements}
                  </p>
                )}
                {f.comment && <p className="text-sm text-muted-foreground">{f.comment}</p>}
                {f.shared_summary && (
                  <p className="text-sm border-l-2 border-primary/40 pl-2 italic">
                    {f.shared_summary}
                  </p>
                )}
                {isCoach && (
                  <button
                    type="button"
                    onClick={() => onDeleteFb(f.id)}
                    className="text-[11px] text-destructive inline-flex items-center gap-1"
                  >
                    <Trash2 className="h-3 w-3" /> {t("common.delete")}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <Dialog open={genOpen} onOpenChange={setGenOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("feedback.generateTitle", { defaultValue: "Générer une synthèse" })}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">{t("feedback.kindLabel", { defaultValue: "Type" })}</Label>
              <Select value={kind} onValueChange={(v) => setKind(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="end_of_season">{t("feedback.kind_end_of_season", { defaultValue: "Bilan de saison" })}</SelectItem>
                  <SelectItem value="meeting">{t("feedback.kind_meeting", { defaultValue: "Préparation d'entretien" })}</SelectItem>
                  <SelectItem value="development">{t("feedback.kind_development", { defaultValue: "Rapport de développement" })}</SelectItem>
                  <SelectItem value="coaching">{t("feedback.kind_coaching", { defaultValue: "Synthèse staff coaching" })}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">{t("feedback.periodStart", { defaultValue: "Début" })}</Label>
                <Input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">{t("feedback.periodEnd", { defaultValue: "Fin" })}</Label>
                <Input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
              <Lock className="h-3 w-3" />
              {t("feedback.generateInternalHint", { defaultValue: "Synthèse interne, visible uniquement par le staff coach." })}
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGenOpen(false)} disabled={genBusy}>
              {t("common.cancel")}
            </Button>
            <Button onClick={onGenerate} disabled={genBusy}>
              {genBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {t("feedback.generate", { defaultValue: "Générer" })}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
