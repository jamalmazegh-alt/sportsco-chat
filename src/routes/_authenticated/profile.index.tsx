import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useAuth, useActiveRole } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { PhoneInput } from "@/components/phone-input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { LogOut, Camera, Loader2, ShieldCheck, ChevronRight, Sun, Moon, Monitor, ExternalLink, KeyRound } from "lucide-react";
import { toast } from "sonner";
import { useState, useEffect } from "react";
import { useTheme, type ThemeMode } from "@/lib/use-theme";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/profile/")({
  component: ProfilePage,
  head: () => ({ meta: [{ title: "Profile — Clubero" }] }),
});

function ProfilePage() {
  const { t, i18n } = useTranslation();
  const { user, signOut, memberships, activeClubId, setActiveClubId, refreshMemberships } = useAuth();
  const role = useActiveRole();
  const isAdmin = role === "admin";
  const navigate = useNavigate();
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const { mode: themeMode, setTheme } = useTheme();

  const club = memberships.find((m) => m.club_id === activeClubId)?.club;

  const { data: profile, refetch } = useQuery({
    queryKey: ["profile", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("full_name, preferred_language, phone")
        .eq("id", user!.id)
        .single();
      return data;
    },
  });

  const [phone, setPhone] = useState("");
  const [phoneBusy, setPhoneBusy] = useState(false);

  useEffect(() => {
    if (profile?.phone) setPhone(profile.phone);
  }, [profile?.phone]);

  async function onSavePhone() {
    if (!user) return;
    setPhoneBusy(true);
    const { error } = await supabase.from("profiles").update({ phone: phone || null }).eq("id", user.id);
    setPhoneBusy(false);
    if (error) { toast.error(error.message); return; }
    refetch();
    toast.success(t("profile.phoneSaved", { defaultValue: "Phone saved" }));
  }


  async function setLang(lang: string) {
    if (!user) return;
    await i18n.changeLanguage(lang);
    const { error } = await supabase
      .from("profiles")
      .update({ preferred_language: lang })
      .eq("id", user.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    refetch();
    toast.success(t("profile.languageSaved"));
  }

  async function onUploadClubLogo(file: File) {
    if (!activeClubId) return;
    setUploadingLogo(true);
    const ext = file.name.split(".").pop() || "png";
    const path = `${activeClubId}/logo-${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from("club-logos")
      .upload(path, file, { upsert: true, contentType: file.type });
    if (upErr) {
      setUploadingLogo(false);
      toast.error(upErr.message);
      return;
    }
    const { data: pub } = supabase.storage.from("club-logos").getPublicUrl(path);
    const { error: updErr } = await supabase
      .from("clubs")
      .update({ logo_url: pub.publicUrl })
      .eq("id", activeClubId);
    setUploadingLogo(false);
    if (updErr) { toast.error(updErr.message); return; }
    await refreshMemberships();
    toast.success(t("club.logoUpdated"));
  }

  return (
    <div className="px-5 pt-8 space-y-6 pb-6">
      <div className="flex items-start gap-4">
        <div className="h-14 w-14 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 ring-1 ring-primary/20 flex items-center justify-center shrink-0">
          <span className="text-lg font-semibold text-primary">
            {(profile?.full_name ?? user?.email ?? "?")
              .split(" ")
              .map((s) => s[0])
              .filter(Boolean)
              .slice(0, 2)
              .join("")
              .toUpperCase()}
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold leading-tight">{t("profile.title")}</h1>
          {profile?.full_name && (
            <p className="text-sm font-medium text-foreground mt-1 truncate">{profile.full_name}</p>
          )}
          {role && (
            <div className="mt-2">
              <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium capitalize">
                {t(`roles.${role}`, { defaultValue: role })}
              </span>
            </div>
          )}
        </div>
      </div>

      {user?.email && (
        <div className="rounded-2xl border border-border bg-card p-4 flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <Mail className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
              {t("profile.email", { defaultValue: "Adresse email" })}
            </p>
            <a
              href={`mailto:${user.email}`}
              className="text-sm font-medium text-foreground hover:text-primary transition-colors break-all"
            >
              {user.email}
            </a>
          </div>
        </div>
      )}

      {club && (
        <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
          <div className="flex items-center gap-4">
            <div className="h-20 w-20 rounded-2xl bg-muted flex items-center justify-center overflow-hidden ring-1 ring-border shrink-0">
              {club.logo_url ? (
                <img src={club.logo_url} alt={club.name} className="h-full w-full object-cover bg-white" />
              ) : (
                <Camera className="h-7 w-7 text-muted-foreground" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
                {t("club.logo")}
              </p>
              <p className="font-semibold truncate mt-0.5">{club.name}</p>
              {role && (
                <span className="inline-flex items-center mt-1.5 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-medium capitalize">
                  {t(`roles.${role}`, { defaultValue: role })}
                </span>
              )}
            </div>
          </div>
          {isAdmin && (
            <label className="flex items-center justify-center gap-2 w-full h-10 rounded-xl border border-dashed border-primary/40 bg-primary/5 text-sm text-primary font-medium cursor-pointer hover:bg-primary/10 transition-colors">
              {uploadingLogo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
              {uploadingLogo
                ? t("common.loading", { defaultValue: "Chargement..." })
                : club.logo_url
                  ? t("club.changeLogo")
                  : t("club.uploadLogo")}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                disabled={uploadingLogo}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onUploadClubLogo(f);
                }}
              />
            </label>
          )}
        </div>
      )}


      <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
        <div className="space-y-1.5">
          <Label>{t("profile.preferredLanguage")}</Label>
          <div role="radiogroup" className="grid grid-cols-2 gap-2">
            {([
              { value: "fr", label: "Français", flag: "🇫🇷" },
              { value: "en", label: "English", flag: "🇬🇧" },
            ] as const).map((opt) => {
              const current = i18n.language?.slice(0, 2) ?? "fr";
              const active = current === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setLang(opt.value)}
                  className={cn(
                    "flex items-center justify-center gap-2 rounded-xl border p-3 text-sm font-medium transition-colors",
                    active
                      ? "border-primary bg-primary/5 text-primary"
                      : "border-border bg-background text-muted-foreground hover:text-foreground",
                  )}
                >
                  <span className="text-base">{opt.flag}</span>
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>{t("profile.theme", { defaultValue: "Apparence" })}</Label>
          <div role="radiogroup" className="grid grid-cols-3 gap-2">
            {(
              [
                { value: "light", icon: Sun, label: t("profile.themeLight", { defaultValue: "Clair" }) },
                { value: "dark", icon: Moon, label: t("profile.themeDark", { defaultValue: "Sombre" }) },
                { value: "system", icon: Monitor, label: t("profile.themeSystem", { defaultValue: "Auto" }) },
              ] as { value: ThemeMode; icon: typeof Sun; label: string }[]
            ).map((opt) => {
              const Icon = opt.icon;
              const active = themeMode === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setTheme(opt.value)}
                  className={cn(
                    "flex flex-col items-center gap-1 rounded-xl border p-3 text-xs font-medium transition-colors",
                    active
                      ? "border-primary bg-primary/5 text-primary"
                      : "border-border bg-background text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>

        {memberships.length > 1 && (
          <div className="space-y-1.5">
            <Label>Club</Label>
            <Select value={activeClubId ?? undefined} onValueChange={setActiveClubId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {memberships.map((m) => (
                  <SelectItem key={m.club_id} value={m.club_id}>
                    {m.club.name} · {m.role}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-border bg-card p-5 space-y-3">
        <Label>{t("profile.phone")}</Label>
        <PhoneInput value={phone} onChange={setPhone} />
        <Button
          type="button"
          className="w-full h-11"
          disabled={phoneBusy || phone === (profile?.phone ?? "")}
          onClick={onSavePhone}
        >
          {phoneBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : t("common.save", { defaultValue: "Save" })}
        </Button>
      </div>

      <Link
        to="/profile/password"
        className="flex items-center justify-between rounded-2xl border border-border bg-card p-4 hover:bg-accent/30"
      >
        <div className="flex items-center gap-3">
          <KeyRound className="h-5 w-5 text-primary" />
          <div>
            <div className="text-sm font-medium">
              {t("profile.password.menu", { defaultValue: "Mot de passe" })}
            </div>
            <p className="text-xs text-muted-foreground">
              {t("profile.password.menuSubtitle", {
                defaultValue: "Modifier votre mot de passe",
              })}
            </p>
          </div>
        </div>
        <ChevronRight className="h-4 w-4 text-muted-foreground" />
      </Link>

      <Link
        to="/profile/privacy"
        className="flex items-center justify-between rounded-2xl border border-border bg-card p-4 hover:bg-accent/30"
      >
        <div className="flex items-center gap-3">
          <ShieldCheck className="h-5 w-5 text-primary" />
          <div>
            <div className="text-sm font-medium">{t("privacy.menu")}</div>
            <p className="text-xs text-muted-foreground">{t("privacy.subtitle")}</p>
          </div>
        </div>
        <ChevronRight className="h-4 w-4 text-muted-foreground" />
      </Link>

      <a
        href="https://clubero.app"
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center justify-between rounded-2xl border border-border bg-card p-4 hover:bg-accent/30 transition-colors"
      >
        <div className="flex items-center gap-3">
          <ExternalLink className="h-5 w-5 text-primary" />
          <div>
            <div className="text-sm font-medium">{t("profile.visitWebsite")}</div>
            <p className="text-xs text-muted-foreground">{t("profile.visitWebsiteSubtitle")}</p>
          </div>
        </div>
        <ChevronRight className="h-4 w-4 text-muted-foreground" />
      </a>

      <Button
        variant="outline"
        className="w-full h-11"
        onClick={async () => {
          await signOut();
          navigate({ to: "/login" });
        }}
      >
        <LogOut className="h-4 w-4" />
        {t("auth.logout")}
      </Button>
    </div>
  );
}
