/**
 * PublishWorkflow — bannière statut + checklist + dialog de confirmation.
 * Remplace le petit bouton "Publier" par un parcours guidé qui explique
 * ce qui se passe et vérifie la complétude avant de publier.
 */
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  CheckCircle2,
  Circle,
  AlertCircle,
  ChevronDown,
  Rocket,
  PlayCircle,
  Flag,
  Trophy,
  Copy,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type Status = "draft" | "published" | "in_progress" | "completed" | "cancelled";

interface Tournament {
  name: string | null;
  starts_on: string | null;
  ends_on: string | null;
  location: string | null;
  format: string | null;
  cover_image_url: string | null;
  slug: string;
  status: Status;
}

interface Props {
  tournament: Tournament;
  teamsCount: number;
  fieldsCount: number;
  publicUrl: string;
  busy: boolean;
  onPublish: () => void;
  onStart: () => void;
  onClose: () => void;
}

type Check = {
  key: string;
  label: string;
  ok: boolean;
  required: boolean;
};

const STEPS: Status[] = ["draft", "published", "in_progress", "completed"];

export function PublishWorkflow({
  tournament,
  teamsCount,
  fieldsCount,
  publicUrl,
  busy,
  onPublish,
  onStart,
  onClose,
}: Props) {
  const { t } = useTranslation("tournaments");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [checklistOpen, setChecklistOpen] = useState(true);

  const registrationEnabled =
    (tournament as any)?.settings?.registration?.enabled === true;

  const checks: Check[] = useMemo(
    () => [
      {
        key: "name",
        label: t("publishFlow.checks.name"),
        ok: !!tournament.name?.trim(),
        required: true,
      },
      {
        key: "dates",
        label: t("publishFlow.checks.dates"),
        ok: !!tournament.starts_on,
        required: true,
      },
      {
        key: "teams",
        label: t("publishFlow.checks.teams", { count: teamsCount }),
        // When public registration is enabled, teams will register AFTER
        // publication — don't block the publish step on team count.
        ok: registrationEnabled ? true : teamsCount >= 2,
        required: !registrationEnabled,
      },
      {
        key: "format",
        label: t("publishFlow.checks.format"),
        ok: !!tournament.format,
        required: true,
      },
      {
        key: "location",
        label: t("publishFlow.checks.location"),
        ok: !!tournament.location?.trim(),
        required: false,
      },
      {
        key: "cover",
        label: t("publishFlow.checks.cover"),
        ok: !!tournament.cover_image_url,
        required: false,
      },
      {
        key: "fields",
        label: t("publishFlow.checks.fields"),
        ok: fieldsCount > 0,
        required: false,
      },
    ],
    [tournament, teamsCount, fieldsCount, t],
  );

  const blockingMissing = checks.some((c) => c.required && !c.ok);
  const requiredChecks = checks.filter((c) => c.required);
  const recommendedChecks = checks.filter((c) => !c.required);
  const doneRequired = requiredChecks.filter((c) => c.ok).length;

  const status = tournament.status;
  const stepIndex = Math.max(0, STEPS.indexOf(status));

  const handlePublishClick = () => {
    if (blockingMissing) {
      setChecklistOpen(true);
      toast.error(t("publishFlow.blockingHint"));
      return;
    }
    setConfirmOpen(true);
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(publicUrl);
      toast.success(t("publishFlow.linkCopied"));
    } catch {
      /* ignore */
    }
  };

  const meta = bannerMeta(status, t);

  return (
    <section
      className={cn(
        "rounded-2xl border overflow-hidden",
        meta.borderClass,
        meta.bgClass,
      )}
    >
      {/* Stepper */}
      <div className="px-4 pt-4 pb-3 flex items-center gap-2">
        {STEPS.map((s, i) => {
          const reached = i <= stepIndex;
          const active = i === stepIndex;
          return (
            <div key={s} className="flex items-center gap-2 flex-1 min-w-0">
              <div
                className={cn(
                  "h-6 w-6 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 transition-colors",
                  active && "bg-primary text-primary-foreground ring-4 ring-primary/20",
                  reached && !active && "bg-primary/80 text-primary-foreground",
                  !reached && "bg-muted text-muted-foreground",
                )}
              >
                {i + 1}
              </div>
              <span
                className={cn(
                  "text-xs font-medium truncate",
                  active ? "text-foreground" : "text-muted-foreground",
                )}
              >
                {t(`publishFlow.step${capitalize(s)}` as any)}
              </span>
              {i < STEPS.length - 1 && (
                <div
                  className={cn(
                    "flex-1 h-0.5 rounded-full transition-colors",
                    i < stepIndex ? "bg-primary/60" : "bg-muted",
                  )}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Banner body */}
      <div className="px-5 pb-5">
        <div className="flex items-start gap-4">
          <div
            className={cn(
              "h-12 w-12 rounded-2xl flex items-center justify-center shrink-0",
              meta.iconBgClass,
            )}
          >
            <meta.Icon className={cn("h-6 w-6", meta.iconClass)} />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-bold leading-tight">{meta.title}</h2>
            <p className="text-sm text-muted-foreground mt-1">{meta.subtitle}</p>

            {status !== "completed" && status !== "cancelled" && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {status === "draft" && (
                  <Button
                    size="sm"
                    onClick={handlePublishClick}
                    disabled={busy}
                    className="gap-2"
                  >
                    <Rocket className="h-4 w-4" />
                    {t("publishFlow.ctaPublish")}
                  </Button>
                )}
                {status === "published" && (
                  <>
                    <Button
                      size="sm"
                      onClick={onStart}
                      disabled={busy}
                      className="gap-2"
                    >
                      <PlayCircle className="h-4 w-4" />
                      {t("publishFlow.ctaStart")}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={copyLink}
                      className="gap-2"
                    >
                      <Copy className="h-4 w-4" />
                      {t("publishFlow.copyLink")}
                    </Button>
                  </>
                )}
                {status === "in_progress" && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={onClose}
                    disabled={busy}
                    className="gap-2"
                  >
                    <Flag className="h-4 w-4" />
                    {t("publishFlow.ctaClose")}
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Checklist — only in draft */}
        {status === "draft" && (
          <div className="mt-4 rounded-xl bg-background/70 border border-border">
            <button
              type="button"
              onClick={() => setChecklistOpen((v) => !v)}
              className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold"
            >
              <span className="flex items-center gap-2">
                {t("publishFlow.checklistTitle")}
                <span className="text-xs font-normal text-muted-foreground">
                  {doneRequired}/{requiredChecks.length}
                </span>
              </span>
              <ChevronDown
                className={cn(
                  "h-4 w-4 transition-transform text-muted-foreground",
                  checklistOpen && "rotate-180",
                )}
              />
            </button>
            {checklistOpen && (
              <div className="px-4 pb-4 space-y-3 animate-fade-in">
                <ChecklistGroup
                  title={t("publishFlow.checklistRequired")}
                  items={requiredChecks}
                  tone="required"
                />
                {recommendedChecks.length > 0 && (
                  <ChecklistGroup
                    title={t("publishFlow.checklistRecommended")}
                    items={recommendedChecks}
                    tone="recommended"
                  />
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Confirm dialog */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Rocket className="h-5 w-5 text-primary" />
              {t("publishFlow.confirmTitle")}
            </DialogTitle>
            <DialogDescription>
              {t("publishFlow.confirmBody")}
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-lg border border-border bg-muted/40 p-3 flex items-center justify-between gap-2">
            <span className="text-sm font-mono truncate" title={publicUrl}>
              {publicUrl}
            </span>
            <a
              href={publicUrl}
              target="_blank"
              rel="noreferrer"
              className="text-muted-foreground hover:text-foreground shrink-0"
              aria-label={t("detail.viewPublic")}
            >
              <ExternalLink className="h-4 w-4" />
            </a>
          </div>

          <p className="text-xs text-muted-foreground">
            {t("publishFlow.confirmFooterNote")}
          </p>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setConfirmOpen(false)}
              disabled={busy}
            >
              {t("publishFlow.confirmCancel")}
            </Button>
            <Button
              onClick={() => {
                onPublish();
                setConfirmOpen(false);
                // Friendly toast with copy action
                toast.success(t("publishFlow.publishedToast"), {
                  description: t("publishFlow.publishedToastBody"),
                  action: {
                    label: t("publishFlow.copyLink"),
                    onClick: copyLink,
                  },
                });
              }}
              disabled={busy}
              className="gap-2"
            >
              <Rocket className="h-4 w-4" />
              {t("publishFlow.confirmCta")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function ChecklistGroup({
  title,
  items,
  tone,
}: {
  title: string;
  items: Check[];
  tone: "required" | "recommended";
}) {
  return (
    <div className="space-y-1">
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">
        {title}
      </p>
      <ul className="space-y-1.5">
        {items.map((c) => (
          <li
            key={c.key}
            className="flex items-start gap-2 text-sm"
          >
            {c.ok ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
            ) : tone === "required" ? (
              <AlertCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
            ) : (
              <Circle className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
            )}
            <span
              className={cn(
                c.ok && "text-muted-foreground line-through",
              )}
            >
              {c.label}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function bannerMeta(
  status: Status,
  t: (key: string) => string,
): {
  title: string;
  subtitle: string;
  Icon: typeof Rocket;
  iconClass: string;
  iconBgClass: string;
  borderClass: string;
  bgClass: string;
} {
  switch (status) {
    case "published":
      return {
        title: t("publishFlow.publishedTitle"),
        subtitle: t("publishFlow.publishedSubtitle"),
        Icon: PlayCircle,
        iconClass: "text-emerald-600",
        iconBgClass: "bg-emerald-500/10",
        borderClass: "border-emerald-500/30",
        bgClass: "bg-emerald-500/5",
      };
    case "in_progress":
      return {
        title: t("publishFlow.inProgressTitle"),
        subtitle: t("publishFlow.inProgressSubtitle"),
        Icon: Flag,
        iconClass: "text-amber-600",
        iconBgClass: "bg-amber-500/10",
        borderClass: "border-amber-500/30",
        bgClass: "bg-amber-500/5",
      };
    case "completed":
    case "cancelled":
      return {
        title: t("publishFlow.completedTitle"),
        subtitle: t("publishFlow.completedSubtitle"),
        Icon: Trophy,
        iconClass: "text-muted-foreground",
        iconBgClass: "bg-muted",
        borderClass: "border-border",
        bgClass: "bg-muted/30",
      };
    case "draft":
    default:
      return {
        title: t("publishFlow.draftTitle"),
        subtitle: t("publishFlow.draftSubtitle"),
        Icon: Rocket,
        iconClass: "text-primary",
        iconBgClass: "bg-primary/10",
        borderClass: "border-primary/30",
        bgClass: "bg-primary/5",
      };
  }
}

function capitalize(s: string) {
  return s
    .split("_")
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join("");
}
