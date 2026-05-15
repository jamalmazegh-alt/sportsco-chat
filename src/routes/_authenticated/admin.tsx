import { createFileRoute, Outlet, Link, useRouterState } from "@tanstack/react-router";
import { Navigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useActiveRole } from "@/lib/auth-context";
import { ShieldCheck, Settings2, Users } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/admin")({
  component: AdminLayout,
});

function AdminLayout() {
  const { t } = useTranslation();
  const role = useActiveRole();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  if (role !== "admin") return <Navigate to="/profile" replace />;

  const tabs = [
    { to: "/admin", icon: Settings2, label: t("admin.openSettings"), exact: true },
    { to: "/admin/users", icon: Users, label: t("admin.openUsers"), exact: false },
  ];

  return (
    <div className="pb-2">
      <header className="px-5 pt-6 pb-4 flex items-center gap-2">
        <ShieldCheck className="h-5 w-5 text-primary" />
        <h1 className="text-xl font-semibold">{t("nav.admin", { defaultValue: "Admin" })}</h1>
      </header>
      <nav className="px-5 pb-3 sticky top-0 bg-background/95 backdrop-blur z-10 border-b border-border">
        <div className="flex gap-1">
          {tabs.map((tab) => {
            const active = tab.exact ? pathname === tab.to : pathname.startsWith(tab.to);
            const Icon = tab.icon;
            return (
              <Link
                key={tab.to}
                to={tab.to}
                className={cn(
                  "flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                  active
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted/40"
                )}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
              </Link>
            );
          })}
        </div>
      </nav>
      <Outlet />
    </div>
  );
}
