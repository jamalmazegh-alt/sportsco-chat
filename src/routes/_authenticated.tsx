import { createFileRoute, Outlet, Navigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { BottomNav } from "@/components/bottom-nav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated")({
  component: AuthLayout,
});

function AuthLayout() {
  const { session, loading, memberships, refreshMemberships, user } = useAuth();
  const { t } = useTranslation();
  const [clubName, setClubName] = useState("");
  const [busy, setBusy] = useState(false);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }
  if (!session) return <Navigate to="/login" replace />;

  if (memberships.length === 0) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-5 py-10">
        <div className="w-full max-w-sm">
          <h1 className="text-2xl font-semibold mb-2">{t("onboarding.title")}</h1>
          <p className="text-sm text-muted-foreground mb-6">
            {t("onboarding.subtitle")}
          </p>
          <form
            onSubmit={async (e: FormEvent) => {
              e.preventDefault();
              if (!clubName.trim() || !user) return;
              setBusy(true);
              const { data: club, error } = await supabase
                .from("clubs")
                .insert({ name: clubName.trim(), created_by: user.id })
                .select("id")
                .single();
              if (error || !club) {
                setBusy(false);
                toast.error(error?.message ?? "Could not create club");
                return;
              }
              const { error: mErr } = await supabase
                .from("club_members")
                .insert({ club_id: club.id, user_id: user.id, role: "admin" });
              if (mErr) {
                setBusy(false);
                toast.error(mErr.message);
                return;
              }
              await refreshMemberships();
              setBusy(false);
            }}
            className="space-y-4 rounded-2xl border border-border bg-card p-6 shadow-sm"
          >
            <div className="space-y-1.5">
              <Label htmlFor="club">{t("onboarding.clubName")}</Label>
              <Input
                id="club"
                required
                value={clubName}
                onChange={(e) => setClubName(e.target.value)}
                placeholder="FC United"
              />
            </div>
            <Button type="submit" className="w-full h-11" disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : t("onboarding.createClub")}
            </Button>
            <p className="text-xs text-muted-foreground text-center">
              {t("onboarding.joinHint")}
            </p>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="mx-auto max-w-xl">
        <Outlet />
      </div>
      <BottomNav />
    </div>
  );
}
