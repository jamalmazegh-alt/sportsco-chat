import {
  createFileRoute,
  Outlet,
  Link,
  notFound,
  useLocation,
  useNavigate,
  isRedirect,
} from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { checkSuperAdmin } from "@/lib/superadmin.functions";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import {
  LayoutDashboard,
  Building2,
  Users,
  CreditCard,
  ScrollText,
  Settings,
  LifeBuoy,
  LogOut,
  Loader2,
  ShieldCheck,
  Upload,
  MessageCircleHeart,
  Mail,
  Bell,
} from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/superadmin")({
  loader: async () => {
    try {
      const res = await checkSuperAdmin();
      if (!res.isSuperAdmin) throw notFound();
      return { verified: true as const };
    } catch (err) {
      if (isRedirect(err)) throw err;
      if (err && typeof err === "object" && "isNotFound" in (err as object)) {
        throw err;
      }
      return { verified: false as const };
    }
  },
  component: SuperAdminLayout,
});

type NavItem = { to: string; labelKey: string; icon: typeof LayoutDashboard; exact?: boolean };
const NAV: NavItem[] = [
  { to: "/superadmin", labelKey: "superadmin.nav.dashboard", icon: LayoutDashboard, exact: true },
  { to: "/superadmin/clubs", labelKey: "superadmin.nav.clubs", icon: Building2 },
  { to: "/superadmin/users", labelKey: "superadmin.nav.users", icon: Users },
  { to: "/superadmin/onboarding/import", labelKey: "superadmin.nav.importData", icon: Upload },
  { to: "/superadmin/billing", labelKey: "superadmin.nav.billing", icon: CreditCard },
  { to: "/superadmin/logs", labelKey: "superadmin.nav.activityLogs", icon: ScrollText },
  { to: "/superadmin/email-dispatches", labelKey: "superadmin.nav.emailSending", icon: Mail },
  { to: "/superadmin/invite-batches", labelKey: "superadmin.nav.inviteBatches", icon: Mail },
  { to: "/superadmin/notifications", labelKey: "superadmin.nav.notifications", icon: Bell },
  { to: "/superadmin/support", labelKey: "superadmin.nav.supportHub", icon: LifeBuoy },
  { to: "/superadmin/support-tickets", labelKey: "superadmin.nav.tickets", icon: LifeBuoy },
  {
    to: "/superadmin/build-clubero",
    labelKey: "superadmin.nav.marketingCampaign",
    icon: MessageCircleHeart,
  },
  { to: "/superadmin/settings", labelKey: "superadmin.nav.settings", icon: Settings },
];

function SuperAdminLayout() {
  const { t } = useTranslation();
  const { session, loading } = useAuth();
  const { verified } = Route.useLoaderData();
  // If the server loader verified, we skip the client re-check (no spinner flash).
  const [state, setState] = useState<"checking" | "ok" | "denied">(verified ? "ok" : "checking");
  const location = useLocation();
  const navigate = useNavigate();
  useEffect(() => {
    // Already verified server-side — skip the client roundtrip.
    if (verified) return;
    let cancelled = false;
    if (loading) return;
    if (!session) {
      navigate({ to: "/login", search: { redirect: location.href } as never });
      return;
    }
    (async () => {
      try {
        const res = await checkSuperAdmin();
        if (cancelled) return;
        setState(res.isSuperAdmin ? "ok" : "denied");
      } catch {
        if (!cancelled) setState("denied");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [verified, session, loading, location.href, navigate]);

  if (loading || state === "checking") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Hide the area entirely from non-super-admins (no redirect, just 404)
  if (state === "denied") {
    throw notFound();
  }

  return (
    <div className="flex min-h-screen bg-[hsl(var(--background))] text-foreground">
      <aside className="hidden md:flex w-60 flex-col border-r border-border bg-muted/30">
        <div className="px-5 py-5 border-b border-border">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5" />
            <span>{t("superadmin.brandInternal")}</span>
          </div>
          <div className="mt-1 text-sm font-semibold">{t("superadmin.brand")}</div>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {NAV.map((item) => {
            const Icon = item.icon;
            const active = item.exact
              ? location.pathname === item.to
              : location.pathname.startsWith(item.to);
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors",
                  active
                    ? "bg-foreground/5 text-foreground font-medium"
                    : "text-muted-foreground hover:bg-foreground/[0.03] hover:text-foreground",
                )}
              >
                <Icon className="h-4 w-4" />
                {t(item.labelKey)}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-border p-3">
          <button
            onClick={async () => {
              await supabase.auth.signOut();
              navigate({ to: "/login" });
            }}
            className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-foreground/[0.03] hover:text-foreground"
          >
            <LogOut className="h-4 w-4" />
            {t("superadmin.signOut")}
          </button>
          <Link
            to="/home"
            className="mt-1 block px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            {t("superadmin.backToApp")}
          </Link>
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="md:hidden fixed top-0 inset-x-0 z-40 flex items-center justify-between border-b border-border bg-background/95 backdrop-blur px-4 h-12">
        <div className="flex items-center gap-2 text-xs">
          <ShieldCheck className="h-3.5 w-3.5" />
          <span className="font-medium">{t("superadmin.brand")}</span>
        </div>
        <Link to="/home" className="text-xs text-muted-foreground">
          {t("superadmin.backToAppShort")}
        </Link>
      </header>

      <main className="flex-1 md:ml-0 mt-12 md:mt-0 overflow-x-hidden">
        <div className="md:hidden border-b border-border bg-muted/30 overflow-x-auto">
          <nav className="flex gap-1 px-2 py-2 min-w-max">
            {NAV.map((item) => {
              const Icon = item.icon;
              const active = item.exact
                ? location.pathname === item.to
                : location.pathname.startsWith(item.to);
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={cn(
                    "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs whitespace-nowrap",
                    active
                      ? "bg-foreground/10 text-foreground font-medium"
                      : "text-muted-foreground",
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {t(item.labelKey)}
                </Link>
              );
            })}
          </nav>
        </div>
        <Outlet />
      </main>
    </div>
  );
}
