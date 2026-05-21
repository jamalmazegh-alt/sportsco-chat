import { Link, useRouterState } from "@tanstack/react-router";
import { LifeBuoy } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

export function SupportFab() {
  const { t } = useTranslation("support");
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  // Hide on support pages and auth/onboarding flows
  if (pathname.startsWith("/support") || pathname.startsWith("/login") || pathname.startsWith("/onboarding")) {
    return null;
  }

  return (
    <Link
      to="/support"
      aria-label={t("fab", { defaultValue: "Support" })}
      className={cn(
        "fixed left-4 z-30 h-12 w-12 rounded-full bg-accent text-accent-foreground shadow-lg",
        "flex items-center justify-center hover:scale-105 active:scale-95 transition-transform",
        "bottom-[calc(env(safe-area-inset-bottom)+76px)]"
      )}
    >
      <LifeBuoy className="h-5 w-5" />
    </Link>
  );
}
