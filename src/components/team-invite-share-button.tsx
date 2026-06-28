import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useServerFn } from "@tanstack/react-start";
import { QRCodeCanvas } from "qrcode.react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { generateTeamPoster } from "@/lib/team-poster/team-poster.functions";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Share2, Copy, Download, Loader2, FileText } from "lucide-react";
import { toast } from "sonner";

interface Props {
  clubId: string;
  teamName?: string;
}

/**
 * Shareable club invite (role=player) shown as a QR code from the team page.
 * Admin-only: club_invites RLS restricts insert/select to club admins.
 * Reuses an existing non-expired token for the club when possible.
 */
export function TeamInviteShareButton({ clubId, teamName }: Props) {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [posterBusy, setPosterBusy] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const downloadPoster = useServerFn(generateTeamPoster);

  const handleDownloadPoster = async () => {
    if (!teamName) return;
    setPosterBusy(true);
    try {
      const { base64, filename } = await downloadPoster({
        data: { clubId, teamName, lang: i18n.language?.slice(0, 2) },
      });
      const bin = atob(base64);
      const arr = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      const blob = new Blob([arr], { type: "application/pdf" });
      const href = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = href;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(href);
      toast.success(
        t("teams.posterReady", { defaultValue: "Affiche prête" }),
      );
    } catch (e: any) {
      toast.error(e?.message ?? "Error");
    } finally {
      setPosterBusy(false);
    }
  };

  async function ensureToken() {
    if (!user?.id) return;
    setBusy(true);
    try {
      // Try to reuse an existing player invite for this club
      const { data: existing } = await supabase
        .from("club_invites")
        .select("token, expires_at, max_uses, uses_count")
        .eq("club_id", clubId)
        .eq("role", "player")
        .order("created_at", { ascending: false })
        .limit(1);

      let token = existing?.[0]?.token as string | undefined;
      const row = existing?.[0];
      const expired =
        !!row?.expires_at && new Date(row.expires_at).getTime() < Date.now();
      const usedUp =
        row?.max_uses != null && (row.uses_count ?? 0) >= row.max_uses;

      if (!token || expired || usedUp) {
        token = `${crypto.randomUUID()}${crypto.randomUUID()}`.replace(/-/g, "");
        const { error } = await supabase.from("club_invites").insert({
          club_id: clubId,
          role: "player",
          token,
          created_by: user.id,
        });
        if (error) throw error;
      }
      setUrl(`${window.location.origin}/register?invite=${encodeURIComponent(token)}`);
    } catch (e: any) {
      toast.error(e?.message ?? "Error");
    } finally {
      setBusy(false);
    }
  }

  async function onOpenChange(o: boolean) {
    setOpen(o);
    if (o && !url) await ensureToken();
  }

  const copy = async () => {
    if (!url) return;
    await navigator.clipboard.writeText(url);
    toast.success(t("share.linkCopied", { defaultValue: "Lien copié" }));
  };

  const download = () => {
    const canvas = wrapRef.current?.querySelector("canvas");
    if (!canvas) return;
    const link = document.createElement("a");
    link.download = `qr-${(teamName ?? "team").replace(/\s+/g, "-").toLowerCase()}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  };

  const nativeShare = async () => {
    if (!url) return;
    if (navigator.share) {
      try {
        await navigator.share({ title: teamName, url });
      } catch {
        /* cancelled */
      }
    } else {
      copy();
    }
  };

  return (
    <>
      <Button
        size="icon"
        variant="ghost"
        className="h-8 w-8 shrink-0"
        onClick={() => onOpenChange(true)}
        aria-label={t("teams.shareInvite", { defaultValue: "Partager le lien d'invitation" })}
      >
        <Share2 className="h-4 w-4" />
      </Button>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {t("teams.shareInviteTitle", { defaultValue: "Inviter à rejoindre" })}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {busy || !url ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : (
              <>
                <div
                  ref={wrapRef}
                  className="flex items-center justify-center rounded-lg bg-white p-4 border border-border"
                >
                  <QRCodeCanvas value={url} size={220} level="M" includeMargin={false} />
                </div>
                <p className="text-xs text-center text-muted-foreground">
                  {t("teams.shareInviteHint", {
                    defaultValue:
                      "Scannez le QR ou partagez le lien. Les nouveaux membres rejoignent le club en tant que joueur.",
                  })}
                </p>
                <div className="flex gap-2">
                  <Input value={url} readOnly className="text-xs" />
                  <Button size="icon" variant="outline" onClick={copy}>
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1" onClick={download}>
                    <Download className="h-4 w-4" />
                    {t("share.qrCode", { defaultValue: "QR code" })}
                  </Button>
                  <Button className="flex-1" onClick={nativeShare}>
                    <Share2 className="h-4 w-4" />
                    {t("share.trigger", { defaultValue: "Partager" })}
                  </Button>
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
