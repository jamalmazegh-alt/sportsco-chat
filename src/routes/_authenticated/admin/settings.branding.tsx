import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Check, Loader2, Palette } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, useMyRoles } from "@/lib/auth-context";
import { SettingsSubHeader } from "@/components/admin/settings-shared";
import { Button } from "@/components/ui/button";
import {
  CLUB_THEMES,
  CLUB_THEME_KEYS,
  DEFAULT_CLUB_THEME,
  applyClubTheme,
  isClubThemeKey,
  storeTheme,
  type ClubThemeKey,
} from "@/lib/club-themes";

export const Route = createFileRoute("/_authenticated/admin/settings/branding")({
  component: BrandingSettingsPage,
  head: () => ({ meta: [{ title: "Identité visuelle — Clubero" }] }),
});

function BrandingSettingsPage() {
  const { t } = useTranslation();
  const { activeClubId } = useAuth();
  const roles = useMyRoles();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["club-branding", activeClubId],
    enabled: !!activeClubId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clubs")
        .select("id, name, theme_color")
        .eq("id", activeClubId!)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const initial: ClubThemeKey = isClubThemeKey(data?.theme_color)
    ? (data!.theme_color as ClubThemeKey)
    : DEFAULT_CLUB_THEME;
  const [selected, setSelected] = useState<ClubThemeKey>(initial);

  useEffect(() => {
    setSelected(initial);
  }, [initial]);

  // Live preview while picking
  useEffect(() => {
    applyClubTheme(selected);
  }, [selected]);

  const saveMutation = useMutation({
    mutationFn: async (key: ClubThemeKey) => {
      const { error } = await supabase
        .from("clubs")
        .update({ theme_color: key })
        .eq("id", activeClubId!);
      if (error) throw error;
    },
    onSuccess: (_v, key) => {
      storeTheme(key);
      qc.invalidateQueries({ queryKey: ["club-theme", activeClubId] });
      qc.invalidateQueries({ queryKey: ["club-branding", activeClubId] });
      toast.success(
        t("admin.branding.saved", { defaultValue: "Couleur du club mise à jour" })
      );
    },
    onError: () => {
      // revert preview
      applyClubTheme(initial);
      setSelected(initial);
      toast.error(
        t("admin.branding.saveError", { defaultValue: "Impossible de sauvegarder" })
      );
    },
  });

  if (!roles.includes("admin")) return <Navigate to="/profile" replace />;

  if (isLoading || !data) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  const dirty = selected !== initial;

  return (
    <div className="px-5 py-4 space-y-6">
      <SettingsSubHeader
        title={t("admin.branding.title", { defaultValue: "Identité visuelle" })}
        description={t("admin.branding.subtitle", {
          defaultValue:
            "Choisis la couleur principale de l'app. Elle s'applique partout, y compris la page de connexion.",
        })}
      />

      {/* Preview card */}
      <div className="rounded-2xl border border-border bg-card p-5 space-y-4 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Palette className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-semibold">
              {t("admin.branding.previewTitle", { defaultValue: "Aperçu" })}
            </p>
            <p className="text-xs text-muted-foreground">
              {CLUB_THEMES[selected].label}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm">
            {t("admin.branding.previewPrimary", { defaultValue: "Bouton principal" })}
          </Button>
          <Button size="sm" variant="outline">
            {t("admin.branding.previewSecondary", { defaultValue: "Secondaire" })}
          </Button>
          <span className="text-xs font-medium text-primary px-2 py-1 rounded-md bg-primary/10">
            Accent
          </span>
        </div>
      </div>

      {/* Palette grid */}
      <div className="grid grid-cols-4 sm:grid-cols-5 gap-3">
        {CLUB_THEME_KEYS.map((key) => {
          const theme = CLUB_THEMES[key];
          const isSelected = selected === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setSelected(key)}
              aria-label={theme.label}
              aria-pressed={isSelected}
              className={`group relative flex flex-col items-center gap-2 rounded-2xl border p-3 transition-all active:scale-95 ${
                isSelected
                  ? "border-foreground/40 bg-muted/40 shadow-sm"
                  : "border-border bg-card hover:border-foreground/20"
              }`}
            >
              <span
                className="relative h-10 w-10 rounded-full shadow-inner ring-1 ring-black/5"
                style={{ background: theme.swatch }}
              >
                {isSelected && (
                  <span className="absolute inset-0 flex items-center justify-center">
                    <Check className="h-5 w-5 text-white drop-shadow" strokeWidth={3} />
                  </span>
                )}
              </span>
              <span className="text-[11px] font-medium text-center leading-tight">
                {theme.label}
              </span>
            </button>
          );
        })}
      </div>

      {/* Save / cancel */}
      <div className="sticky bottom-4 flex items-center justify-end gap-2">
        {dirty && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSelected(initial);
              applyClubTheme(initial);
            }}
            disabled={saveMutation.isPending}
          >
            {t("common.cancel", { defaultValue: "Annuler" })}
          </Button>
        )}
        <Button
          size="sm"
          disabled={!dirty || saveMutation.isPending}
          onClick={() => saveMutation.mutate(selected)}
        >
          {saveMutation.isPending && (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          )}
          {t("common.save", { defaultValue: "Enregistrer" })}
        </Button>
      </div>
    </div>
  );
}
