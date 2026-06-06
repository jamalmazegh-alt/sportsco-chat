import { useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import { Loader2, Trash2, Upload, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { updateTournamentSponsors } from "../tournaments.functions";
import type { Sponsor, SponsorTier } from "../lib/rules";

interface Props {
  tournamentId: string;
  sponsors: Sponsor[];
  onChange: (sponsors: Sponsor[]) => void;
}

export function SponsorsEditor({ tournamentId, sponsors, onChange }: Props) {
  const { t } = useTranslation("tournaments");
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const saveFn = useServerFn(updateTournamentSponsors);
  const persist = useMutation({
    mutationFn: (next: Sponsor[]) =>
      saveFn({ data: { tournament_id: tournamentId, sponsors: next } }),
    onError: (e: any) => toast.error(e?.message ?? t("sponsorsEditor.saveError")),
  });

  const commit = (next: Sponsor[]) => {
    onChange(next);
    persist.mutate(next);
  };

  const handleUpload = async (file: File) => {
    if (file.size > 2 * 1024 * 1024) {
      toast.error(t("sponsorsEditor.tooHeavy"));
      return;
    }
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() ?? "png";
      const path = `${tournamentId}/sponsors/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage
        .from("tournament-documents")
        .upload(path, file, { cacheControl: "3600", upsert: false });
      if (error) throw error;
      const { data: pub } = supabase.storage
        .from("tournament-documents")
        .getPublicUrl(path);
      const newSponsor: Sponsor = {
        id: crypto.randomUUID(),
        name: file.name.replace(/\.[^.]+$/, ""),
        logo_url: pub.publicUrl,
        website: null,
        tier: "partner",
      };
      commit([...sponsors, newSponsor]);
      toast.success(t("sponsorsEditor.added"));
    } catch (e: any) {
      toast.error(e?.message ?? t("sponsorsEditor.uploadError"));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const updateLocal = (id: string, patch: Partial<Sponsor>) => {
    onChange(sponsors.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  };
  const updateSponsor = (id: string, patch: Partial<Sponsor>) => {
    commit(sponsors.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  };

  const removeSponsor = (id: string) => {
    const target = sponsors.find((s) => s.id === id);
    commit(sponsors.filter((s) => s.id !== id));
    if (target?.logo_url) {
      const marker = "/tournament-documents/";
      const idx = target.logo_url.indexOf(marker);
      if (idx >= 0) {
        const path = target.logo_url.slice(idx + marker.length);
        supabase.storage.from("tournament-documents").remove([path]).catch(() => {});
      }
    }
  };

  const TIERS: SponsorTier[] = ["main", "gold", "silver", "partner"];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          {t("sponsorsEditor.hint")}
        </p>
        <div className="flex items-center gap-2">
          {persist.isPending && (
            <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/svg+xml"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleUpload(f);
            }}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Upload className="h-4 w-4" />
            )}
            {t("sponsorsEditor.addLogo")}
          </Button>
        </div>
      </div>

      {sponsors.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6 border border-dashed border-border rounded-lg">
          {t("sponsorsEditor.empty")}
        </p>
      ) : (
        <ul className="space-y-2">
          {sponsors.map((s) => (
            <li
              key={s.id}
              className="grid grid-cols-12 gap-2 items-center rounded-lg border border-border bg-card p-2"
            >
              <div className="col-span-2 h-14 rounded bg-muted flex items-center justify-center overflow-hidden">
                <img
                  src={s.logo_url}
                  alt={s.name}
                  className="max-h-full max-w-full object-contain"
                />
              </div>
              <Input
                className="col-span-3"
                placeholder={t("sponsorsEditor.namePlaceholder")}
                value={s.name}
                onChange={(e) => updateLocal(s.id, { name: e.target.value })}
                onBlur={() => persist.mutate(sponsors)}
                maxLength={80}
              />
              <Input
                className="col-span-4"
                placeholder={t("sponsorsEditor.websitePlaceholder")}
                value={s.website ?? ""}
                onChange={(e) => updateLocal(s.id, { website: e.target.value })}
                onBlur={() => persist.mutate(sponsors)}
                maxLength={255}
              />

              <Select
                value={s.tier}
                onValueChange={(v) =>
                  updateSponsor(s.id, { tier: v as SponsorTier })
                }
              >
                <SelectTrigger className="col-span-2">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIERS.map((tier) => (
                    <SelectItem key={tier} value={tier}>
                      {t(`sponsorsEditor.tier.${tier}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="col-span-1 flex justify-end gap-1">
                {s.website && (
                  <a
                    href={s.website}
                    target="_blank"
                    rel="noreferrer"
                    className="text-muted-foreground hover:text-foreground"
                    aria-label={t("sponsorsEditor.openSite")}
                  >
                    <ExternalLink className="h-4 w-4" />
                  </a>
                )}
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  onClick={() => removeSponsor(s.id)}
                  aria-label={t("sponsorsEditor.remove")}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
