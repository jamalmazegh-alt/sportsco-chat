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
        "fixed right-4 z-30 h-10 w-10 rounded-full bg-secondary text-secondary-foreground shadow-lg",
        "flex items-center justify-center hover:scale-105 active:scale-95 transition-transform",
        // Stacked above the primary assistant FAB: 104 + 48 (primary h-12) + 11 (gap) = 163px
        "bottom-[calc(env(safe-area-inset-bottom)+163px)]"
      )}
    >
      <LifeBuoy className="h-4 w-4" />
    </Link>
  );
}
