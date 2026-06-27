import { Link, useRouterState } from "@tanstack/react-router";
import { Home, Calendar, Users, Megaphone, User, ShieldCheck, Trophy } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { useAuth, useMyRoles } from "@/lib/auth-context";
import { useWallUnread } from "@/lib/use-wall-unread";
import { useTournamentOnlyMode } from "@/modules/tournaments/hooks/useTournamentOnlyMode";
import { useClubSubscriptionActive } from "@/lib/use-club-subscription";

export function BottomNav() {
  const { t } = useTranslation();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { activeClubId } = useAuth();
  const isAdmin = useMyRoles().includes("admin");
  const { count: wallUnread } = useWallUnread(activeClubId);
  const { tournamentOnly } = useTournamentOnlyMode();
  const { isActive: subActive } = useClubSubscriptionActive(activeClubId);

  // Club with no active subscription: hide all club modules and keep only
  // Admin (for the admin to subscribe) and Profile. Non-admins just see Profile.
  const clubLocked = !tournamentOnly && !!activeClubId && !subActive;

  const items = tournamentOnly
    ? [
        { to: "/tournaments", icon: Trophy, label: t("nav.tournaments"), badge: 0 },
        { to: "/profile", icon: User, label: t("nav.profile"), badge: 0 },
      ]
    : clubLocked
      ? [
          ...(isAdmin
            ? [{ to: "/admin", icon: ShieldCheck, label: t("nav.admin"), badge: 0 }]
            : []),
          { to: "/profile", icon: User, label: t("nav.profile"), badge: 0 },
        ]
      : [
          { to: "/home", icon: Home, label: t("nav.home"), badge: 0 },
          { to: "/events", icon: Calendar, label: t("nav.events"), badge: 0 },
          { to: "/teams", icon: Users, label: t("nav.teams"), badge: 0 },
          { to: "/inbox", icon: Megaphone, label: t("nav.inbox"), badge: wallUnread },
          { to: "/profile", icon: User, label: t("nav.profile"), badge: 0 },
        ];

  return (
    <nav
      className="fixed bottom-0 inset-x-0 z-40 border-t-[1.5px] border-[#e2e8f0] bg-white/90 backdrop-blur-xl pb-[env(safe-area-inset-bottom)] shadow-[0_-2px_8px_rgba(15,40,24,0.04)]"
      aria-label={t("nav.primary")}
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
                  "group relative flex flex-col items-center gap-0.5 py-2 text-[10.5px] font-bold outline-none transition-colors duration-200",
                  active ? "text-[#0f4a26]" : "text-[#64748b] hover:text-[#0f2818]",
                )}
              >
                <span
                  className={cn(
                    "relative flex h-9 w-14 items-center justify-center rounded-full transition-all duration-300 ease-out",
                  )}
                  style={
                    active
                      ? {
                          background: "linear-gradient(135deg, #d4ead9 0%, #b8dcc4 100%)",
                          boxShadow: "0 2px 6px rgba(15,74,38,0.15)",
                        }
                      : undefined
                  }
                >
                  <Icon
                    className={cn(
                      "h-[18px] w-[18px] transition-transform duration-300",
                      active ? "scale-110" : "",
                    )}
                    strokeWidth={active ? 2.6 : 2.2}
                  />
                  {it.badge > 0 && (
                    <span className="absolute top-0 right-1.5 min-w-[16px] h-[16px] px-1 rounded-full bg-[#dc2626] text-white text-[9px] font-black flex items-center justify-center leading-none ring-2 ring-white animate-in zoom-in-50 duration-300">
                      {it.badge > 9 ? "9+" : it.badge}
                    </span>
                  )}
                </span>
                <span
                  className={cn(
                    "transition-all duration-200 tracking-tight",
                    active && "font-black",
                  )}
                >
                  {it.label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
