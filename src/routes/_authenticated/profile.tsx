import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { LogOut } from "lucide-react";

export const Route = createFileRoute("/_authenticated/profile")({
  component: ProfilePage,
  head: () => ({ meta: [{ title: "Profile — Squadly" }] }),
});

function ProfilePage() {
  const { t, i18n } = useTranslation();
  const { user, signOut, memberships, activeClubId, setActiveClubId } = useAuth();
  const navigate = useNavigate();

  const { data: profile, refetch } = useQuery({
    queryKey: ["profile", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("full_name, preferred_language")
        .eq("id", user!.id)
        .single();
      return data;
    },
  });

  async function setLang(lang: string) {
    if (!user) return;
    i18n.changeLanguage(lang);
    await supabase.from("profiles").update({ preferred_language: lang }).eq("id", user.id);
    refetch();
  }

  return (
    <div className="px-5 pt-8 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{t("profile.title")}</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {profile?.full_name ?? user?.email}
        </p>
      </div>

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
