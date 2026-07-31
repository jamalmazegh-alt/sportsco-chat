/**
 * Drawer de signalement d'un contenu du mur (publication ou commentaire).
 *
 * Modération manuelle : le signalement notifie les admins/dirigeants du club,
 * l'auteur du contenu n'est jamais informé et ne voit pas qui a signalé.
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
import { WizardOptionCard } from "@/components/wizard/wizard-primitives";
import { reportWallContent, WALL_REPORT_REASONS } from "@/lib/wall/moderation.functions";

type Reason = (typeof WALL_REPORT_REASONS)[number];

const ICONS: Record<Reason, typeof AlertTriangle> = {
  inappropriate: AlertTriangle,
  harassment: Ban,
  spam: Megaphone,
  misinformation: MessageSquareWarning,
  privacy: EyeOff,
  other: Shield,
};

export function WallReportDialog({
  open,
  onOpenChange,
  postId,
  commentId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  postId: string;
  commentId?: string | null;
}) {
  const { t } = useTranslation();
  const report = useServerFn(reportWallContent);
  const [reason, setReason] = useState<Reason | null>(null);
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);

  const labels: Record<Reason, { title: string; description: string }> = {
    inappropriate: {
      title: t("wall.report.inappropriate", { defaultValue: "Contenu inapproprié" }),
      description: t("wall.report.inappropriateHint", {
        defaultValue: "Propos choquants, violents ou déplacés",
      }),
    },
    harassment: {
      title: t("wall.report.harassment", { defaultValue: "Harcèlement" }),
      description: t("wall.report.harassmentHint", {
        defaultValue: "Attaques personnelles, intimidation",
      }),
    },
    spam: {
      title: t("wall.report.spam", { defaultValue: "Spam ou publicité" }),
      description: t("wall.report.spamHint", { defaultValue: "Message répétitif ou promotionnel" }),
    },
    misinformation: {
      title: t("wall.report.misinformation", { defaultValue: "Information erronée" }),
      description: t("wall.report.misinformationHint", {
        defaultValue: "Information fausse ou trompeuse",
      }),
    },
    privacy: {
      title: t("wall.report.privacy", { defaultValue: "Atteinte à la vie privée" }),
      description: t("wall.report.privacyHint", {
        defaultValue: "Données personnelles, photo d'un mineur",
      }),
    },
    other: {
      title: t("wall.report.other", { defaultValue: "Autre" }),
      description: t("wall.report.otherHint", { defaultValue: "Précisez ci-dessous" }),
    },
  };

  async function submit() {
    if (!reason) return;
    setBusy(true);
    try {
      const res = (await report({
        data: {
          postId,
          commentId: commentId ?? null,
          reason,
          details: details.trim() || undefined,
        },
      })) as { duplicate?: boolean };
      if (res?.duplicate) {
        toast.info(
          t("wall.report.already", { defaultValue: "Vous avez déjà signalé ce contenu." }),
        );
      } else {
        toast.success(
          t("wall.report.sent", {
            defaultValue: "Signalement transmis aux responsables du club.",
          }),
        );
      }
      onOpenChange(false);
      setReason(null);
      setDetails("");
    } catch (e) {
      toast.error(
        e instanceof Error && e.message === "not_found"
          ? t("wall.report.notFound", { defaultValue: "Ce contenu n'est plus disponible." })
          : t("common.error", { defaultValue: "Une erreur est survenue" }),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[92vh] overflow-y-auto rounded-t-2xl">
        <SheetHeader className="text-left">
          <SheetTitle>{t("wall.report.title", { defaultValue: "Signaler ce contenu" })}</SheetTitle>
          <SheetDescription>
            {t("wall.report.subtitle", {
              defaultValue:
                "Votre signalement est envoyé aux responsables du club. L'auteur n'est pas informé.",
            })}
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
          placeholder={t("wall.report.detailsPlaceholder", {
            defaultValue: "Précisions (facultatif)",
          })}
          rows={3}
        />

        <div className="flex gap-2 pt-3 pb-[env(safe-area-inset-bottom)]">
          <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
            {t("common.cancel", { defaultValue: "Annuler" })}
          </Button>
          <Button className="flex-1" disabled={!reason || busy} onClick={submit}>
            {t("wall.report.submit", { defaultValue: "Signaler" })}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
