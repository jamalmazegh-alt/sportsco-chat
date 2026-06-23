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
        "fixed left-4 z-30 h-10 w-10 rounded-full bg-secondary text-secondary-foreground shadow-lg",
        "flex items-center justify-center hover:scale-105 active:scale-95 transition-transform",
        // Mirrors the primary FAB bottom (104) on the opposite side; top = 104 + 40 = 144.
        "bottom-[calc(env(safe-area-inset-bottom)+104px)]"
      )}
    >
      <LifeBuoy className="h-4 w-4" />
    </Link>
  );
}
