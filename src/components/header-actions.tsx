import { Link, useRouterState } from "@tanstack/react-router";
import { Bot, LifeBuoy } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { NotificationsBell } from "@/components/notifications-bell";

const ASSISTANT_HIDE = [
  "/assistant",
  "/login",
  "/onboarding",
  "/tournaments/",
  "/tournament/",
  "/t/",
];
const SUPPORT_HIDE = ["/support", "/login", "/onboarding"];
const BELL_HIDE = ["/notifications", "/login", "/onboarding", "/t/"];

function hidden(pathname: string, list: string[]): boolean {
  return list.some((p) =>
    p.endsWith("/") ? pathname.startsWith(p) : pathname === p || pathname.startsWith(p + "/"),
  );
}

export function HeaderActions() {
  const { t } = useTranslation();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const showAssistant = !hidden(pathname, ASSISTANT_HIDE);
  const showSupport = !hidden(pathname, SUPPORT_HIDE);
  const showBell = !hidden(pathname, BELL_HIDE);

  if (!showAssistant && !showSupport && !showBell) return null;

  return (
    <div className="flex items-center gap-1.5">
      {showBell && <NotificationsBell />}
      {showSupport && (
        <Link
          to="/support"
          aria-label={t("support.fab")}
          className={cn(
            "h-9 w-9 rounded-full bg-secondary text-secondary-foreground shadow-sm",
            "flex items-center justify-center hover:scale-105 active:scale-95 transition-transform",
          )}
        >
          <LifeBuoy className="h-4 w-4" />
        </Link>
      )}
      {showAssistant && (
        <Link
          to="/assistant"
          aria-label={t("assistant.open")}
          className={cn(
            "h-9 w-9 rounded-full bg-primary text-primary-foreground shadow-sm",
            "flex items-center justify-center hover:scale-105 active:scale-95 transition-transform",
          )}
        >
          <Bot className="h-4 w-4" />
        </Link>
      )}
    </div>
  );
}
