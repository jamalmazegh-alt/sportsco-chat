import { createFileRoute, Outlet, Link, useRouterState } from "@tanstack/react-router";
import { Navigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useActiveRole, useMyRoles } from "@/lib/auth-context";
import { ShieldCheck, Settings2, Users, CreditCard, UsersRound, Flag } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/admin")({
  component: AdminLayout,
});

function AdminLayout() {
  const { t } = useTranslation();
  const role = useActiveRole();
  const roles = useMyRoles();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const isAdmin = roles.includes("admin");
  const isModerator = isAdmin || roles.includes("dirigeant");

  if (!isModerator) return <Navigate to="/profile" replace />;
  // Les dirigeants n'ont accès qu'à la modération du mur.
  if (!isAdmin && !pathname.startsWith("/admin/moderation"))
    return <Navigate to="/admin/moderation" replace />;

  const allTabs = [
    { to: "/admin", icon: Settings2, label: t("admin.openSettings"), exact: true },
    { to: "/admin/users", icon: Users, label: t("admin.openUsers"), exact: false },
    { to: "/admin/groups", icon: UsersRound, label: t("groups.openGroups"), exact: false },
    {
      to: "/admin/moderation",
      icon: Flag,
      label: t("wall.moderation.tab", { defaultValue: "Modération" }),
      exact: false,
    },
    {
      to: "/admin/billing",
      icon: CreditCard,
      label: t("billing.title", { defaultValue: "Abonnement" }),
      exact: false,
    },
  ];
  const tabs = isAdmin ? allTabs : allTabs.filter((tb) => tb.to === "/admin/moderation");

  return (
    <div className="pb-2">
      <header className="px-5 pt-6 pb-4 flex items-center gap-2">
        <ShieldCheck className="h-5 w-5 text-primary" />
        <h1 className="text-xl font-semibold">{t("nav.admin", { defaultValue: "Admin" })}</h1>
      </header>
      <nav className="pb-3 sticky top-0 bg-background/95 backdrop-blur z-10 border-b border-border">
        <div className="flex gap-1 overflow-x-auto px-5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {tabs.map((tab) => {
            const active = tab.exact ? pathname === tab.to : pathname.startsWith(tab.to);
            const Icon = tab.icon;
            return (
              <Link
                key={tab.to}
                to={tab.to}
                className={cn(
                  "shrink-0 flex items-center justify-center gap-1.5 whitespace-nowrap px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                  active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted/40",
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
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
