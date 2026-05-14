import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useServerFn } from "@tanstack/react-start";
import { useAuth, useActiveRole } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { PhoneInput } from "@/components/phone-input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { LogOut, Camera, Loader2, ShieldCheck, Settings2, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";
import { requestPhoneCode, verifyPhoneCode } from "@/lib/phone-verify.functions";

export const Route = createFileRoute("/_authenticated/profile")({
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

  const club = memberships.find((m) => m.club_id === activeClubId)?.club;

  const { data: profile, refetch } = useQuery({
    queryKey: ["profile", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("full_name, preferred_language, phone, phone_verified_at")
        .eq("id", user!.id)
        .single();
      return data;
    },
  });

  const requestCode = useServerFn(requestPhoneCode);
  const verifyCode = useServerFn(verifyPhoneCode);
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [phoneBusy, setPhoneBusy] = useState(false);

  const isVerified = !!profile?.phone_verified_at;
  const phoneToUse = phone || profile?.phone || "";

  async function onSendCode() {
    if (!phoneToUse) return;
    setPhoneBusy(true);
    try {
      await requestCode({ data: { phone: phoneToUse } });
      setCodeSent(true);
      toast.success(t("profile.codeSent"));
    } catch (e: any) {
      toast.error(e?.message ?? "Failed");
    } finally {
      setPhoneBusy(false);
    }
  }

  async function onVerifyCode() {
    if (!phoneToUse || code.length !== 6) return;
    setPhoneBusy(true);
    try {
      await verifyCode({ data: { phone: phoneToUse, code } });
      toast.success(t("profile.phoneVerified"));
      setCode("");
      setCodeSent(false);
      refetch();
    } catch (e: any) {
      toast.error(e?.message ?? "Invalid code");
    } finally {
      setPhoneBusy(false);
    }
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
      <div>
        <h1 className="text-2xl font-semibold">{t("profile.title")}</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {profile?.full_name ?? user?.email}
        </p>
        {role && (
          <span className="inline-flex items-center mt-2 px-2.5 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium capitalize">
            {t(`roles.${role}`, { defaultValue: role })}
          </span>
        )}
      </div>

      {club && (
        <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
          <Label>{t("club.logo")}</Label>
          <div className="flex items-center gap-4">
            <div className="h-20 w-20 rounded-2xl bg-muted flex items-center justify-center overflow-hidden">
              {club.logo_url ? (
                <img src={club.logo_url} alt={club.name} className="h-full w-full object-cover" />
              ) : (
                <Camera className="h-6 w-6 text-muted-foreground" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-medium truncate">{club.name}</p>
              {role && (
                <span className="inline-flex items-center mt-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-medium capitalize">
                  {t(`roles.${role}`, { defaultValue: role })}
                </span>
              )}
              {isAdmin && (
                <label className="mt-2 inline-flex items-center gap-2 text-sm text-primary font-medium cursor-pointer">
                  {uploadingLogo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
                  {t("club.uploadLogo")}
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
          </div>
        </div>
      )}

      {isAdmin && (
        <div className="space-y-2">
          <Link
            to="/admin"
            className="flex items-center justify-between rounded-2xl border border-border bg-card p-4 hover:bg-muted/40 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <Settings2 className="h-5 w-5 text-primary" />
              </div>
              <span className="font-medium">{t("admin.openSettings")}</span>
            </div>
            <ChevronRight className="h-5 w-5 text-muted-foreground" />
          </Link>
          <Link
            to="/admin/users"
            className="flex items-center justify-between rounded-2xl border border-border bg-card p-4 hover:bg-muted/40 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <Settings2 className="h-5 w-5 text-primary" />
              </div>
              <span className="font-medium">{t("admin.openUsers")}</span>
            </div>
            <ChevronRight className="h-5 w-5 text-muted-foreground" />
          </Link>
        </div>
      )}

      <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
        <div className="space-y-1.5">
          <Label>{t("profile.preferredLanguage")}</Label>
          <Select value={i18n.language?.slice(0, 2) ?? "en"} onValueChange={setLang}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="en">{t("profile.english")}</SelectItem>
              <SelectItem value="fr">{t("profile.french")}</SelectItem>
            </SelectContent>
          </Select>
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

      <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <Label>{t("profile.phone")}</Label>
          {isVerified && (
            <span className="inline-flex items-center gap-1 text-xs text-present font-medium">
              <ShieldCheck className="h-3.5 w-3.5" />
              {t("profile.verified")}
            </span>
          )}
        </div>
        <PhoneInput
          value={phoneToUse}
          onChange={(v) => { setPhone(v); setCodeSent(false); }}
        />
        {!isVerified && !codeSent && (
          <Button type="button" className="w-full h-11" disabled={phoneBusy || !phoneToUse} onClick={onSendCode}>
            {phoneBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : t("profile.sendCode")}
          </Button>
        )}
        {!isVerified && codeSent && (
          <div className="space-y-2">
            <Label>{t("profile.enterCode")}</Label>
            <Input
              inputMode="numeric"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="123456"
            />
            <div className="flex gap-2">
              <Button type="button" variant="outline" className="h-11 flex-1" onClick={onSendCode} disabled={phoneBusy}>
                {t("profile.resendCode")}
              </Button>
              <Button type="button" className="h-11 flex-1" onClick={onVerifyCode} disabled={phoneBusy || code.length !== 6}>
                {phoneBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : t("profile.verify")}
              </Button>
            </div>
          </div>
        )}
        {isVerified && phone && phone !== profile?.phone && (
          <Button type="button" variant="outline" className="w-full h-11" onClick={onSendCode} disabled={phoneBusy}>
            {t("profile.verifyNewNumber")}
          </Button>
        )}
      </div>

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
