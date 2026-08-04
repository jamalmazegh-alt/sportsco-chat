import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Bell } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

export function NotificationsBell() {
  const { t } = useTranslation();
  const { user } = useAuth();

  const { data: unread = 0 } = useQuery({
    queryKey: ["notifications-unread-count", user?.id],
    enabled: !!user?.id,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { count, error } = await supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user!.id)
        .is("read_at", null);
      if (error) throw error;
      return count ?? 0;
    },
  });

  if (!user?.id) return null;

  return (
    <Link
      to="/notifications"
      aria-label={t("notificationsCenter.title")}
      className={cn(
        "relative h-9 w-9 rounded-full bg-secondary text-secondary-foreground shadow-sm",
        "flex items-center justify-center hover:scale-105 active:scale-95 transition-transform",
      )}
    >
      <Bell className="h-4 w-4" />
      {unread > 0 && (
        <span className="absolute -top-0.5 -right-0.5 min-w-4 h-4 px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-semibold leading-4 text-center">
          {unread > 99 ? "99+" : unread}
        </span>
      )}
    </Link>
  );
}
