import { createFileRoute, Outlet, Navigate, useRouterState, Link } from "@tanstack/react-router";
import { requireAuthBeforeLoad } from "@/lib/route-guards";
import { useState, type FormEvent, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { BottomNav } from "@/components/bottom-nav";
import { useTournamentOnlyMode } from "@/modules/tournaments/hooks/useTournamentOnlyMode";
import { useClubSubscriptionActive } from "@/lib/use-club-subscription";

// Routes accessible to tournament-only users (no club). Everything else
// under /_authenticated is redirected to /tournaments.
const TOURNAMENT_ONLY_ALLOWED = [
  "/tournaments",
  "/profile",
  "/admin",
  "/support",
  "/assistant",
];
// When a club has no active subscription, only these prefixes remain
// accessible (so the admin can subscribe; everyone can still see profile).
const CLUB_LOCKED_ALLOWED = [
  "/admin",
  "/profile",
  "/support",
];
function isPathAllowed(pathname: string, list: string[]): boolean {
  return list.some((p) => pathname === p || pathname.startsWith(p + "/"));
}
import { AssistantFab } from "@/components/assistant-fab";
import { SupportFab } from "@/components/support-fab";
import { ConsentGate } from "@/components/consent-gate";
import { GlobalSearch } from "@/components/global-search";
import { TrialBanner } from "@/components/trial-banner";
import { OnboardingWizard } from "@/components/onboarding-wizard";
import { ClubSelector } from "@/components/club-selector";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertTriangle, CreditCard, Loader2, MessageCircle, UserCircle } from "lucide-react";
import { toast } from "sonner";
import logo from "@/assets/clubero-logo.png";

export const Route = createFileRoute("/_authenticated")({
  beforeLoad: requireAuthBeforeLoad,
  component: AuthLayout,
});

function AuthLayout() {
  const { session, loading, memberships, refreshMemberships, user, activeClubId } = useAuth();
  const { t } = useTranslation();
  const [clubName, setClubName] = useState("");
  const [busy, setBusy] = useState(false);
  const { tournamentOnly } = useTournamentOnlyMode();
  const { isActive: clubSubActive, isLoading: subLoading } =
    useClubSubscriptionActive(activeClubId);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const activeMembership = memberships.find((m) => m.club_id === activeClubId);
  const activeRoles = activeMembership?.roles ?? (activeMembership ? [activeMembership.role] : []);
  const isAdmin = activeRoles.includes("admin");

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }
  if (!session) return <Navigate to="/login" replace />;

  const signupRole = (user?.user_metadata as { signup_role?: string } | undefined)?.signup_role;
  const isTournamentOrganizer = signupRole === "tournament_organizer";

  // Guard: tournament-only accounts can only reach tournament + profile pages.
  if (tournamentOnly && !isPathAllowed(pathname, TOURNAMENT_ONLY_ALLOWED)) {
    return <Navigate to="/tournaments" replace />;
  }

  // Guard: clubs without an active subscription only see Admin + Profile.
  if (
    !tournamentOnly &&
    activeClubId &&
    !subLoading &&
    !clubSubActive &&
    !isPathAllowed(pathname, CLUB_LOCKED_ALLOWED)
  ) {
    if (!isAdmin) {
      return (
        <LockedClubShell>
          <ClubSubscriptionExpiredScreen clubName={activeMembership?.club?.name} />
        </LockedClubShell>
      );
    }
    return <Navigate to="/admin/billing" replace />;
  }



  if (memberships.length === 0) {
    // Tournament organizers don't need a club — render the route with just
    // the bottom nav, no club onboarding screen, consent gate, or wizard.
    if (isTournamentOrganizer) {
      return (
        <div className="min-h-screen bg-background pb-24">
          <div className="mx-auto max-w-xl">
            <div className="animate-in fade-in-0 slide-in-from-bottom-2 duration-300">
              <Outlet />
            </div>
          </div>
          <SupportFab />
          <AssistantFab />
          <BottomNav />
        </div>
      );
    }
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
          <div className="sticky top-0 z-30 -mx-px border-b border-border/40 bg-background/75 backdrop-blur-xl">
            <div className="relative flex items-center justify-center px-3 py-3">
              <div className="absolute left-2 top-1/2 -translate-y-1/2">
                <ClubSelector />
              </div>
              <img src={logo} alt="Clubero" className="h-10 w-auto object-contain drop-shadow-sm dark:bg-white dark:rounded-md dark:px-1.5 dark:py-0.5" />
              <div className="absolute right-2 top-1/2 -translate-y-1/2">
                <GlobalSearch />
              </div>
            </div>
            <TrialBanner />
          </div>
          <div className="animate-in fade-in-0 slide-in-from-bottom-2 duration-300">
            <Outlet />
          </div>
        </div>
        <OnboardingWizard />
        <SupportFab />
        <AssistantFab />
        <BottomNav />
      </div>
    </ConsentGate>
  );
}

function LockedClubShell({ children }: { children: ReactNode }) {
  return (
    <ConsentGate>
      <div className="min-h-screen bg-background pb-24">
        <div className="mx-auto max-w-xl">{children}</div>
        <SupportFab />
        <AssistantFab />
        <BottomNav />
      </div>
    </ConsentGate>
  );
}

function ClubSubscriptionExpiredScreen({ clubName }: { clubName?: string }) {
  const { t } = useTranslation();
  return (
    <main className="px-5 py-8">
      <div className="overflow-hidden rounded-3xl border border-amber-500/30 bg-card shadow-sm">
        <div className="bg-amber-500/10 px-5 py-5">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-amber-500/15 text-amber-700 dark:text-amber-300">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-amber-700 dark:text-amber-300">
                {t("billing.memberLocked.eyebrow")}
              </p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight">
                {t("billing.memberLocked.title")}
              </h1>
              <p className="mt-2 text-sm text-muted-foreground">
                {t("billing.memberLocked.body", {
                  club: clubName ?? t("billing.memberLocked.fallbackClub"),
                })}
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-4 px-5 py-5">
          <div className="rounded-2xl border border-border bg-muted/30 p-4">
            <h2 className="text-sm font-semibold">
              {t("billing.memberLocked.whatYouCanDo")}
            </h2>
            <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
              <li className="flex gap-2">
                <UserCircle className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <span>{t("billing.memberLocked.profileHint")}</span>
              </li>
              <li className="flex gap-2">
                <CreditCard className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <span>{t("billing.memberLocked.adminHint")}</span>
              </li>
              <li className="flex gap-2">
                <MessageCircle className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <span>{t("billing.memberLocked.supportHint")}</span>
              </li>
            </ul>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <Button asChild>
              <Link to="/profile">
                <UserCircle className="h-4 w-4" />
                {t("billing.memberLocked.profileCta")}
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link to="/support">
                <MessageCircle className="h-4 w-4" />
                {t("billing.memberLocked.supportCta")}
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </main>
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
      toast.error(error?.message ?? t("errors.clubCreateFailed"));
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
    // Conversion funnel tracking — best effort, non blocking
    try {
      const { trackConversion } = await import("@/lib/conversion-tracking");
      trackConversion("trial_started", { club_id: club.id, plan: "trial_30d" });
    } catch {
      /* ignore */
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
