import { Link, useRouterState } from "@tanstack/react-router";
import { Home, Calendar, Users, Megaphone, User, ShieldCheck } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { useAuth, useActiveRole } from "@/lib/auth-context";
import { useWallUnread } from "@/lib/use-wall-unread";

export function BottomNav() {
  const { t } = useTranslation();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { activeClubId } = useAuth();
  const role = useActiveRole();
  const { count: wallUnread } = useWallUnread(activeClubId);

  const items = [
    { to: "/home", icon: Home, label: t("nav.home"), badge: 0 },
    { to: "/events", icon: Calendar, label: t("nav.events"), badge: 0 },
    { to: "/teams", icon: Users, label: t("nav.teams"), badge: 0 },
    { to: "/inbox", icon: Megaphone, label: t("nav.inbox"), badge: wallUnread },
    ...(role === "admin"
      ? [{ to: "/admin", icon: ShieldCheck, label: t("nav.admin", { defaultValue: "Admin" }), badge: 0 }]
      : []),
    { to: "/profile", icon: User, label: t("nav.profile"), badge: 0 },
  ];

  return (
    <nav
      className="fixed bottom-0 inset-x-0 z-40 border-t border-border bg-background/85 backdrop-blur-lg pb-[env(safe-area-inset-bottom)]"
      aria-label="Primary"
    >
      <ul className="mx-auto flex max-w-xl items-stretch justify-around">
        {items.map((it) => {
          const active = pathname === it.to || pathname.startsWith(it.to + "/");
          const Icon = it.icon;
          return (
            <li key={it.to} className="flex-1">
              <Link
                to={it.to}
                className={cn(
                  "flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-colors",
                  active ? "text-primary" : "text-muted-foreground hover:text-foreground"
                )}
              >
                <span className="relative">
                  <Icon className={cn("h-5 w-5", active && "stroke-[2.4]")} />
                  {it.badge > 0 && (
                    <span className="absolute -top-1.5 -right-2 min-w-[16px] h-[16px] px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-semibold flex items-center justify-center leading-none">
                      {it.badge > 9 ? "9+" : it.badge}
                    </span>
                  )}
                </span>
                <span>{it.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
