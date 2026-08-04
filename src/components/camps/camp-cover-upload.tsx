import { useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { ImagePlus, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import {
  createSignedCampCoverUpload,
  setCampCoverFromUpload,
  updateClubCamp,
} from "@/lib/camps.functions";

const ACCEPT = "image/jpeg,image/png,image/webp";
const MAX_BYTES = 5 * 1024 * 1024;

export function CampCoverUpload({
  campId,
  coverUrl,
  onChange,
  disabled = false,
}: {
  campId: string;
  coverUrl: string | null;
  onChange: (nextUrl: string | null) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation("camps");
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const signFn = useServerFn(createSignedCampCoverUpload);
  const setCoverFn = useServerFn(setCampCoverFromUpload);
  const updateFn = useServerFn(updateClubCamp);

  async function upload(file: File) {
    if (file.size > MAX_BYTES) {
      toast.error(t("cover.tooLarge"));
      return;
    }
    setBusy(true);
    try {
      const { path, token } = await signFn({
        data: {
          campId,
          fileName: file.name,
          contentType: file.type,
          size: file.size,
        },
      });
      const { error } = await supabase.storage
        .from("camp-covers")
        .uploadToSignedUrl(path, token, file, { contentType: file.type });
      if (error) throw error;
      const { coverUrl: nextUrl } = await setCoverFn({ data: { campId, path } });
      onChange(nextUrl);
      toast.success(t("cover.uploaded"));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function clear() {
    setBusy(true);
    try {
      await updateFn({ data: { campId, patch: { cover_image_url: null } } });
      onChange(null);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      {coverUrl ? (
        <div className="relative w-full max-w-md aspect-video overflow-hidden rounded-lg border border-border">
          <img src={coverUrl} alt="cover" className="h-full w-full object-cover" />
          {!disabled && (
            <button
              type="button"
              onClick={clear}
              disabled={busy}
              className="absolute top-2 right-2 h-8 w-8 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center shadow"
              aria-label="remove cover"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      ) : (
        <div className="flex h-40 w-full max-w-md items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground">
          {t("cover.empty")}
        </div>
      )}
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) upload(file);
        }}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => inputRef.current?.click()}
        disabled={disabled || busy}
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
        <span className="ml-1.5">{coverUrl ? t("cover.replace") : t("cover.add")}</span>
      </Button>
    </div>
  );
}
