import { useRef, useState } from "react";
import { Loader2, Plus, Trash2, Upload, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import type { Sponsor, SponsorTier } from "../lib/rules";

interface Props {
  tournamentId: string;
  sponsors: Sponsor[];
  onChange: (sponsors: Sponsor[]) => void;
}

const TIER_LABEL: Record<SponsorTier, string> = {
  main: "Principal",
  gold: "Or",
  silver: "Argent",
  partner: "Partenaire",
};

export function SponsorsEditor({ tournamentId, sponsors, onChange }: Props) {
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleUpload = async (file: File) => {
    if (file.size > 2 * 1024 * 1024) {
      toast.error("Logo trop lourd (max 2 Mo)");
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
        website: "",
        tier: "partner",
      };
      onChange([...sponsors, newSponsor]);
      toast.success("Logo ajouté");
    } catch (e: any) {
      toast.error(e?.message ?? "Erreur upload");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const updateSponsor = (id: string, patch: Partial<Sponsor>) => {
    onChange(sponsors.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  };
  const removeSponsor = (id: string) => {
    onChange(sponsors.filter((s) => s.id !== id));
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          Ajoute les logos de tes sponsors. Ils apparaîtront sur la page publique
          du tournoi et dans le diaporama TV.
        </p>
        <div>
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
            Ajouter un logo
          </Button>
        </div>
      </div>

      {sponsors.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6 border border-dashed border-border rounded-lg">
          Aucun sponsor pour le moment.
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
                placeholder="Nom"
                value={s.name}
                onChange={(e) => updateSponsor(s.id, { name: e.target.value })}
                maxLength={80}
              />
              <Input
                className="col-span-4"
                placeholder="https://site.com"
                value={s.website ?? ""}
                onChange={(e) => updateSponsor(s.id, { website: e.target.value })}
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
                  {(Object.keys(TIER_LABEL) as SponsorTier[]).map((t) => (
                    <SelectItem key={t} value={t}>
                      {TIER_LABEL[t]}
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
                    aria-label="Ouvrir le site"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </a>
                )}
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  onClick={() => removeSponsor(s.id)}
                  aria-label="Supprimer"
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
