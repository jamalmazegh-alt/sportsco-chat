/**
 * Drawer de signalement d'un contenu du mur (publication ou commentaire)
 * et/ou d'un membre du club.
 *
 * Modes :
 * - contenu (postId fourni) : signale le post/commentaire ; si `reportedUser`
 *   est fourni, une case permet de signaler aussi l'auteur.
 * - membre seul (postId null + reportedUser) : signale la personne — utilisé
 *   depuis la fiche joueur.
 *
 * Modération manuelle : le signalement notifie les admins/dirigeants du club,
 * la personne visée n'est jamais informée et ne voit pas qui a signalé.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AlertTriangle, Ban, EyeOff, Megaphone, MessageSquareWarning, Shield } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { WizardOptionCard } from "@/components/wizard/wizard-primitives";
import { reportWallContent, WALL_REPORT_REASONS } from "@/lib/wall/moderation.functions";
import { reportUser } from "@/lib/user-report.functions";
import { reportEventMessage } from "@/lib/event-message-report.functions";

type Reason = (typeof WALL_REPORT_REASONS)[number];

const ICONS: Record<Reason, typeof AlertTriangle> = {
  inappropriate: AlertTriangle,
  harassment: Ban,
  spam: Megaphone,
  misinformation: MessageSquareWarning,
  privacy: EyeOff,
  other: Shield,
};

export type ReportedUser = { userId: string; name: string; clubId: string };

export function WallReportDialog({
  open,
  onOpenChange,
  postId,
  commentId,
  eventMessageId,
  reportedUser,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** null = signalement d'un membre seul ou d'un message de chat. */
  postId: string | null;
  commentId?: string | null;
  /** Signalement d'un message du chat d'événement. */
  eventMessageId?: string | null;
  reportedUser?: ReportedUser | null;
}) {
  const { t } = useTranslation();
  const report = useServerFn(reportWallContent);
  const reportUserFn = useServerFn(reportUser);
  const reportMessageFn = useServerFn(reportEventMessage);
  const [reason, setReason] = useState<Reason | null>(null);
  const [details, setDetails] = useState("");
  const [alsoUser, setAlsoUser] = useState(false);
  const [busy, setBusy] = useState(false);

  const userOnly = !postId && !eventMessageId && !!reportedUser;

  const labels: Record<Reason, { title: string; description: string }> = {
    inappropriate: {
      title: t("wall.report.inappropriate"),
      description: t("wall.report.inappropriateHint"),
    },
    harassment: {
      title: t("wall.report.harassment"),
      description: t("wall.report.harassmentHint"),
    },
    spam: {
      title: t("wall.report.spam"),
      description: t("wall.report.spamHint"),
    },
    misinformation: {
      title: t("wall.report.misinformation"),
      description: t("wall.report.misinformationHint"),
    },
    privacy: {
      title: t("wall.report.privacy"),
      description: t("wall.report.privacyHint"),
    },
    other: {
      title: t("wall.report.other"),
      description: t("wall.report.otherHint"),
    },
  };

  function reset() {
    setReason(null);
    setDetails("");
    setAlsoUser(false);
  }

  async function submit() {
    if (!reason) return;
    setBusy(true);
    try {
      const trimmed = details.trim() || undefined;
      let contentDuplicate = false;
      if (postId) {
        const res = (await report({
          data: { postId, commentId: commentId ?? null, reason, details: trimmed },
        })) as { duplicate?: boolean };
        contentDuplicate = !!res?.duplicate;
      } else if (eventMessageId) {
        const res = (await reportMessageFn({
          data: { messageId: eventMessageId, reason, details: trimmed },
        })) as { duplicate?: boolean };
        contentDuplicate = !!res?.duplicate;
      }
      let userDuplicate = false;
      if (reportedUser && (userOnly || alsoUser)) {
        const res = (await reportUserFn({
          data: {
            clubId: reportedUser.clubId,
            reportedUserId: reportedUser.userId,
            reason,
            details: trimmed,
          },
        })) as { duplicate?: boolean };
        userDuplicate = !!res?.duplicate;
      }
      if (userOnly ? userDuplicate : contentDuplicate) {
        toast.info(userOnly ? t("userReport.already") : t("wall.report.already"));
      } else {
        toast.success(t("wall.report.sent"));
      }
      onOpenChange(false);
      reset();
    } catch (e) {
      toast.error(
        e instanceof Error && e.message === "not_found"
          ? t("wall.report.notFound")
          : t("common.error"),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[92vh] overflow-y-auto rounded-t-2xl">
        <SheetHeader className="text-left">
          <SheetTitle>
            {userOnly
              ? t("userReport.title", {
                  name: reportedUser?.name ?? "",
                })
              : t("wall.report.title")}
          </SheetTitle>
          <SheetDescription>
            {userOnly ? t("userReport.subtitle") : t("wall.report.subtitle")}
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-2 py-2">
          {WALL_REPORT_REASONS.map((r) => {
            const Icon = ICONS[r];
            return (
              <WizardOptionCard
                key={r}
                active={reason === r}
                onClick={() => setReason(r)}
                title={labels[r].title}
                description={labels[r].description}
                icon={<Icon className="h-4 w-4" />}
              />
            );
          })}
        </div>

        <Textarea
          value={details}
          onChange={(e) => setDetails(e.target.value.slice(0, 500))}
          placeholder={t("wall.report.detailsPlaceholder")}
          rows={3}
        />

        {!userOnly && reportedUser && (
          <label className="mt-3 flex items-center gap-2.5 rounded-lg border border-border p-3 text-sm cursor-pointer">
            <Checkbox checked={alsoUser} onCheckedChange={(v) => setAlsoUser(v === true)} />
            <span>
              {t("userReport.also", {
                name: reportedUser.name,
              })}
            </span>
          </label>
        )}

        <div className="flex gap-2 pt-3 pb-[env(safe-area-inset-bottom)]">
          <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button className="flex-1" disabled={!reason || busy} onClick={submit}>
            {t("wall.report.submit")}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
