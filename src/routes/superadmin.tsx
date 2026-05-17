import { createFileRoute, Outlet, Link, notFound, useLocation, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
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
} from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/superadmin")({
  component: SuperAdminLayout,
});

type NavItem = { to: string; label: string; icon: typeof LayoutDashboard; exact?: boolean };
const NAV: NavItem[] = [
  { to: "/superadmin", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { to: "/superadmin/clubs", label: "Clubs", icon: Building2 },
  { to: "/superadmin/users", label: "Users", icon: Users },
  { to: "/superadmin/billing", label: "Billing", icon: CreditCard },
  { to: "/superadmin/logs", label: "Activity logs", icon: ScrollText },
  { to: "/superadmin/support", label: "Support", icon: LifeBuoy },
  { to: "/superadmin/settings", label: "Settings", icon: Settings },
];

function SuperAdminLayout() {
  const { session, loading } = useAuth();
  const [state, setState] = useState<"checking" | "ok" | "denied">("checking");
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
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
  }, [session, loading, location.href, navigate]);

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
            <span>Clubero • Internal</span>
          </div>
          <div className="mt-1 text-sm font-semibold">Super Admin</div>
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
                {item.label}
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
            Sign out
          </button>
          <Link
            to="/home"
            className="mt-1 block px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            ← Back to club app
          </Link>
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="md:hidden fixed top-0 inset-x-0 z-40 flex items-center justify-between border-b border-border bg-background/95 backdrop-blur px-4 h-12">
        <div className="flex items-center gap-2 text-xs">
          <ShieldCheck className="h-3.5 w-3.5" />
          <span className="font-medium">Super Admin</span>
        </div>
        <Link to="/home" className="text-xs text-muted-foreground">
          ← App
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
                  {item.label}
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

