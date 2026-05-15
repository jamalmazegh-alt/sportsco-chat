import { createFileRoute, Outlet, Navigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { BottomNav } from "@/components/bottom-nav";
import { AssistantFab } from "@/components/assistant-fab";
import { ConsentGate } from "@/components/consent-gate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import logo from "@/assets/clubero-logo.png";

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
    return <NoMembershipScreen
      clubName={clubName}
      setClubName={setClubName}
      busy={busy}
      setBusy={setBusy}
      userId={user?.id ?? ""}
      onDone={refreshMemberships}
      t={t}
    />;
  }

  return (
    <ConsentGate>
      <div className="min-h-screen bg-background pb-24">
        <div className="mx-auto max-w-xl">
          <div className="flex items-center justify-center gap-2 pt-3 pb-1">
            <img src={logo} alt="Clubero" width={28} height={28} className="h-7 w-7 object-contain" />
            <span className="text-sm font-semibold tracking-tight text-foreground/80">Clubero</span>
          </div>
          <Outlet />
        </div>
        <AssistantFab />
        <BottomNav />
      </div>
    </ConsentGate>
  );
}

function NoMembershipScreen({
  clubName, setClubName, busy, setBusy, userId, onDone, t,
}: {
  clubName: string;
  setClubName: (v: string) => void;
  busy: boolean;
  setBusy: (v: boolean) => void;
  userId: string;
  onDone: () => Promise<void>;
  t: (k: string) => string;
}) {
  const [mode, setMode] = useState<"create" | "join">("create");
  const [token, setToken] = useState("");

  async function createClub(e: FormEvent) {
    e.preventDefault();
    if (!clubName.trim() || !userId) return;
    setBusy(true);
    const { data: club, error } = await supabase
      .from("clubs")
      .insert({ name: clubName.trim(), created_by: userId })
      .select("id")
      .single();
    if (error || !club) {
      setBusy(false);
      toast.error(error?.message ?? "Could not create club");
      return;
    }
    const { error: mErr } = await supabase
      .from("club_members")
      .insert({ club_id: club.id, user_id: userId, role: "admin" });
    if (mErr) {
      setBusy(false);
      toast.error(mErr.message);
      return;
    }
    await onDone();
    setBusy(false);
  }

  async function joinClub(e: FormEvent) {
    e.preventDefault();
    if (!token.trim()) return;
    setBusy(true);
    const { error } = await supabase.rpc("redeem_club_invite", { _token: token.trim() });
    if (error) {
      setBusy(false);
      toast.error(error.message || t("auth.inviteInvalid"));
      return;
    }
    await onDone();
    setBusy(false);
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-5 py-10">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-semibold mb-2">{t("onboarding.title")}</h1>
        <p className="text-sm text-muted-foreground mb-4">{t("onboarding.subtitle")}</p>

        <div className="grid grid-cols-2 gap-2 mb-4">
          <Button type="button" variant={mode === "create" ? "default" : "outline"} onClick={() => setMode("create")}>
            {t("onboarding.createClub")}
          </Button>
          <Button type="button" variant={mode === "join" ? "default" : "outline"} onClick={() => setMode("join")}>
            {t("onboarding.joinClub")}
          </Button>
        </div>

        {mode === "create" ? (
          <form onSubmit={createClub} className="space-y-4 rounded-2xl border border-border bg-card p-6 shadow-sm">
            <div className="space-y-1.5">
              <Label htmlFor="club">{t("onboarding.clubName")}</Label>
              <Input id="club" required value={clubName} onChange={(e) => setClubName(e.target.value)} placeholder="FC United" />
            </div>
            <Button type="submit" className="w-full h-11" disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : t("onboarding.createClub")}
            </Button>
          </form>
        ) : (
          <form onSubmit={joinClub} className="space-y-4 rounded-2xl border border-border bg-card p-6 shadow-sm">
            <div className="space-y-1.5">
              <Label htmlFor="invite">{t("auth.inviteCode")}</Label>
              <Input id="invite" required value={token} onChange={(e) => setToken(e.target.value)} placeholder="abcd-1234" />
              <p className="text-xs text-muted-foreground">{t("auth.inviteHint")}</p>
            </div>
            <Button type="submit" className="w-full h-11" disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : t("onboarding.joinClub")}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
