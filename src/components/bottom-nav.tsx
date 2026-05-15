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
      className="fixed bottom-0 inset-x-0 z-40 border-t border-border/60 bg-background/80 backdrop-blur-xl pb-[env(safe-area-inset-bottom)] shadow-[0_-1px_0_0_rgba(0,0,0,0.02)]"
      aria-label="Primary"
    >
      <ul className="mx-auto flex max-w-xl items-stretch justify-around px-1">
        {items.map((it) => {
          const active = pathname === it.to || pathname.startsWith(it.to + "/");
          const Icon = it.icon;
          return (
            <li key={it.to} className="flex-1">
              <Link
                to={it.to}
                className={cn(
                  "group relative flex flex-col items-center gap-0.5 py-2 text-[10.5px] font-medium outline-none",
                  "transition-colors duration-200",
                  active ? "text-primary" : "text-muted-foreground hover:text-foreground"
                )}
              >
                <span
                  className={cn(
                    "relative flex h-8 w-12 items-center justify-center rounded-full transition-all duration-300 ease-out",
                    active ? "bg-primary/12 scale-100" : "scale-95 group-hover:bg-muted/60"
                  )}
                >
                  <Icon
                    className={cn(
                      "h-[18px] w-[18px] transition-transform duration-300",
                      active ? "stroke-[2.4] scale-110" : "stroke-2"
                    )}
                  />
                  {it.badge > 0 && (
                    <span className="absolute top-0.5 right-1.5 min-w-[15px] h-[15px] px-1 rounded-full bg-destructive text-destructive-foreground text-[9px] font-bold flex items-center justify-center leading-none shadow-sm ring-2 ring-background animate-in zoom-in-50 duration-300">
                      {it.badge > 9 ? "9+" : it.badge}
                    </span>
                  )}
                </span>
                <span className={cn("transition-all duration-200", active ? "font-semibold" : "")}>
                  {it.label}
                </span>
                <span
                  aria-hidden
                  className={cn(
                    "absolute -bottom-0.5 h-0.5 w-6 rounded-full bg-primary transition-all duration-300",
                    active ? "opacity-100 scale-100" : "opacity-0 scale-50"
                  )}
                />
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
