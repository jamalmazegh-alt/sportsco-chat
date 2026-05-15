import { Link, useRouterState } from "@tanstack/react-router";
import { Bot } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

export function AssistantFab() {
  const { t } = useTranslation();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  // Hide on the assistant page itself and on auth/onboarding flows
  if (pathname.startsWith("/assistant") || pathname.startsWith("/login") || pathname.startsWith("/onboarding")) {
    return null;
  }

  return (
    <Link
      to="/assistant"
      aria-label={t("assistant.open", { defaultValue: "Open assistant" })}
      className={cn(
        "fixed right-4 z-30 h-12 w-12 rounded-full bg-primary text-primary-foreground shadow-lg",
        "flex items-center justify-center hover:scale-105 active:scale-95 transition-transform",
        "bottom-[calc(env(safe-area-inset-bottom)+76px)]"
      )}
    >
      <Bot className="h-5 w-5" />
    </Link>
  );
}
