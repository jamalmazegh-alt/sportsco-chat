import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Globe, Copy, Loader2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export function PublicProfileCard({
  playerId,
  enabled,
  slug,
  onChanged,
}: {
  playerId: string;
  enabled: boolean;
  slug: string | null;
  onChanged: () => void;
}) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);

  const publicUrl =
    slug && typeof window !== "undefined"
      ? `${window.location.origin}/p/${slug}`
      : null;

  async function toggle(next: boolean) {
    setBusy(true);
    const { error } = await supabase.rpc("set_player_public_profile", {
      _player_id: playerId,
      _enabled: next,
    });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(
      next
        ? t("players.publicProfile.enabled", { defaultValue: "Public profile enabled" })
        : t("players.publicProfile.disabled", { defaultValue: "Public profile disabled" }),
    );
    onChanged();
  }

  async function copy() {
    if (!publicUrl) return;
    await navigator.clipboard.writeText(publicUrl);
    toast.success(t("common.copied", { defaultValue: "Link copied" }));
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-5 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <Globe className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0">
            <h3 className="font-semibold text-sm">
              {t("players.publicProfile.title", { defaultValue: "Public profile" })}
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {t("players.publicProfile.help", {
                defaultValue:
                  "Share a public link to this player's achievements, seasons and timeline. Only public-tagged items are shown.",
              })}
            </p>
          </div>
        </div>
        <Switch checked={enabled} onCheckedChange={toggle} disabled={busy} />
      </div>

      {enabled && publicUrl && (
        <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2">
          <code className="flex-1 text-xs truncate">{publicUrl}</code>
          <Button type="button" size="icon" variant="ghost" className="h-7 w-7" onClick={copy}>
            <Copy className="h-3.5 w-3.5" />
          </Button>
          <a
            href={publicUrl}
            target="_blank"
            rel="noreferrer"
            className="text-xs font-medium text-primary hover:underline"
          >
            {t("common.open", { defaultValue: "Open" })}
          </a>
        </div>
      )}

      {busy && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> …
        </div>
      )}
    </div>
  );
}
