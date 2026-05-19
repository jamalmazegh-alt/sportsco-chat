import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Lock, Star, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { FEEDBACK_TAGS, VISIBILITY_VALUES } from "@/lib/player-feedback.functions";
import { getFeedbackTagsForSport } from "@/lib/feedback-tags";

export type FeedbackFormValue = {
  rating: number | null;
  comment: string;
  strengths: string;
  improvements: string;
  devNotes: string;
  tags: string[];
  visibility: (typeof VISIBILITY_VALUES)[number];
  sharedSummary: string;
};

export const EMPTY_FEEDBACK: FeedbackFormValue = {
  rating: null,
  comment: "",
  strengths: "",
  improvements: "",
  devNotes: "",
  tags: [],
  visibility: "coach_only",
  sharedSummary: "",
};

const RATING_LABELS = [
  "feedback.rating1",
  "feedback.rating2",
  "feedback.rating3",
  "feedback.rating4",
  "feedback.rating5",
  "feedback.rating6",
  "feedback.rating7",
  "feedback.rating8",
  "feedback.rating9",
  "feedback.rating10",
];

export function PlayerFeedbackForm({
  value,
  onChange,
  onSubmit,
  busy,
  compact,
  sport,
}: {
  value: FeedbackFormValue;
  onChange: (next: FeedbackFormValue) => void;
  onSubmit: () => Promise<void> | void;
  busy?: boolean;
  compact?: boolean;
  sport?: string | null;
}) {
  const { t } = useTranslation();
  const [advanced, setAdvanced] = useState(!compact);
  const tags = sport !== undefined ? getFeedbackTagsForSport(sport) : (FEEDBACK_TAGS as readonly string[]);

  const set = <K extends keyof FeedbackFormValue>(k: K, v: FeedbackFormValue[K]) =>
    onChange({ ...value, [k]: v });

  const toggleTag = (tag: string) =>
    set(
      "tags",
      value.tags.includes(tag) ? value.tags.filter((x) => x !== tag) : [...value.tags, tag]
    );

  return (
    <div className="space-y-3">
      {/* Rating */}
      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">
          {t("feedback.ratingLabel", { defaultValue: "Évaluation (optionnel)" })}
        </Label>
        <div className="flex items-center gap-1">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => {
            const active = (value.rating ?? 0) >= n;
            return (
              <button
                key={n}
                type="button"
                aria-label={t(RATING_LABELS[n - 1], { defaultValue: `Niveau ${n}` })}
                onClick={() => set("rating", value.rating === n ? null : n)}
                className={cn(
                  "h-8 w-7 rounded-md flex items-center justify-center transition-colors",
                  active ? "text-amber-500" : "text-muted-foreground/40 hover:text-muted-foreground"
                )}
              >
                <Star className={cn("h-4 w-4", active && "fill-current")} />
              </button>
            );
          })}
          {value.rating && (
            <span className="ml-2 text-xs text-muted-foreground">
              {t(RATING_LABELS[value.rating - 1], { defaultValue: "" })}
            </span>
          )}
        </div>
      </div>

      {/* Tags */}
      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">{t("feedback.tags")}</Label>
        <div className="flex flex-wrap gap-1.5">
          {tags.map((tag) => {
            const active = value.tags.includes(tag);
            return (
              <button
                key={tag}
                type="button"
                onClick={() => toggleTag(tag)}
                className={cn(
                  "text-[11px] px-2 py-1 rounded-full border transition-colors",
                  active
                    ? "border-primary bg-primary/15 text-primary"
                    : "border-border bg-muted/30 text-muted-foreground hover:bg-muted"
                )}
              >
                {t(`feedback.tag.${tag}`, { defaultValue: tag })}
              </button>
            );
          })}
        </div>
      </div>

      {/* Strengths */}
      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">{t("feedback.strengths")}</Label>
        <Textarea
          value={value.strengths}
          onChange={(e) => set("strengths", e.target.value)}
          rows={2}
          placeholder={t("feedback.strengthsPlaceholder", {
            defaultValue: "Ce qui a bien fonctionné…",
          })}
        />
      </div>

      {/* Improvements */}
      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">{t("feedback.improvements")}</Label>
        <Textarea
          value={value.improvements}
          onChange={(e) => set("improvements", e.target.value)}
          rows={2}
          placeholder={t("feedback.improvementsPlaceholder", {
            defaultValue: "À développer…",
          })}
        />
      </div>

      {/* Advanced (private notes) */}
      {!advanced ? (
        <button
          type="button"
          className="text-xs text-muted-foreground underline underline-offset-2"
          onClick={() => setAdvanced(true)}
        >
          {t("feedback.showMore", { defaultValue: "Notes & commentaire détaillé" })}
        </button>
      ) : (
        <>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">{t("feedback.comment")}</Label>
            <Textarea
              value={value.comment}
              onChange={(e) => set("comment", e.target.value)}
              rows={2}
              placeholder={t("feedback.commentPlaceholder", {
                defaultValue: "Commentaire général…",
              })}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">{t("feedback.devNotes")}</Label>
            <Textarea
              value={value.devNotes}
              onChange={(e) => set("devNotes", e.target.value)}
              rows={2}
              placeholder={t("feedback.devNotesPlaceholder", {
                defaultValue: "Notes de développement à long terme…",
              })}
            />
          </div>
        </>
      )}

      {/* Visibility is locked to coach_only — feedback always stays internal. */}

      <Button
        type="button"
        onClick={() => onSubmit()}
        disabled={busy}
        className="w-full h-10"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : t("common.save")}
      </Button>
    </div>
  );
}
