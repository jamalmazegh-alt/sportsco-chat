import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { QRCodeCanvas } from "qrcode.react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Share2, Copy, Download } from "lucide-react";
import { toast } from "sonner";

interface Props {
  url: string;
  title?: string;
  trigger?: React.ReactNode;
}

export function ShareDialog({ url, title, trigger }: Props) {
  const { t } = useTranslation("tournaments");
  const wrapRef = useRef<HTMLDivElement>(null);

  const copy = async () => {
    await navigator.clipboard.writeText(url);
    toast.success(t("share.linkCopied"));
  };

  const download = () => {
    const canvas = wrapRef.current?.querySelector("canvas");
    if (!canvas) return;
    const link = document.createElement("a");
    link.download = `qr-${(title ?? "tournament").replace(/\s+/g, "-").toLowerCase()}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  };

  const nativeShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title, url });
      } catch {
        /* user cancelled */
      }
    } else {
      copy();
    }
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm" variant="outline">
            <Share2 className="h-4 w-4" />
            {t("share.trigger")}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{t("share.title")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div
            ref={wrapRef}
            className="flex items-center justify-center rounded-lg bg-white p-4 border border-border"
          >
            <QRCodeCanvas
              value={url}
              size={220}
              level="M"
              includeMargin={false}
            />
          </div>
          <p className="text-xs text-center text-muted-foreground">
            {t("share.qrHint")}
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
              {t("share.qrCode")}
            </Button>
            <Button className="flex-1" onClick={nativeShare}>
              <Share2 className="h-4 w-4" />
              {t("share.trigger")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
