import { createFileRoute, Navigate, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useAuth, useActiveRole } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { ChevronLeft, Loader2, Users } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/admin/users")({
  component: AdminUsersPage,
  head: () => ({ meta: [{ title: "Users — Clubero" }] }),
});

function AdminUsersPage() {
  const { t } = useTranslation();
  const { activeClubId } = useAuth();
  const role = useActiveRole();

  const { data, isLoading } = useQuery({
    queryKey: ["admin-club-users", activeClubId],
    enabled: !!activeClubId && role === "admin",
    queryFn: async () => {
      const { data: members } = await supabase
        .from("club_members")
        .select("user_id, role, created_at")
        .eq("club_id", activeClubId!);
      const ids = Array.from(new Set((members ?? []).map((m) => m.user_id)));
      const { data: profiles } = ids.length
        ? await supabase
            .from("profiles")
            .select("id, full_name, first_name, last_name, phone, phone_verified_at")
            .in("id", ids)
        : { data: [] as any[] };
      const byId = new Map((profiles ?? []).map((p: any) => [p.id, p]));
      // group roles by user
      const grouped = new Map<string, { user_id: string; roles: string[]; profile: any }>();
      for (const m of members ?? []) {
        const g = grouped.get(m.user_id) ?? { user_id: m.user_id, roles: [], profile: byId.get(m.user_id) };
        if (!g.roles.includes(m.role)) g.roles.push(m.role);
        grouped.set(m.user_id, g);
      }
      return Array.from(grouped.values()).sort((a, b) =>
        (a.profile?.full_name ?? "").localeCompare(b.profile?.full_name ?? ""),
      );
    },
  });

  if (role !== "admin") return <Navigate to="/profile" replace />;

  return (
    <div className="px-5 pt-6 pb-10 space-y-5">
      <Link to="/profile" className="inline-flex items-center text-sm text-muted-foreground gap-1">
        <ChevronLeft className="h-4 w-4" /> {t("common.back")}
      </Link>

      <header className="flex items-center gap-2">
        <Users className="h-5 w-5 text-primary" />
        <h1 className="text-xl font-semibold">{t("admin.usersTitle")}</h1>
      </header>
      <p className="text-sm text-muted-foreground">{t("admin.usersSubtitle")}</p>

      {isLoading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        </div>
      ) : (data ?? []).length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
          {t("admin.usersEmpty")}
        </div>
      ) : (
        <ul className="rounded-2xl border border-border bg-card divide-y divide-border overflow-hidden">
          {(data ?? []).map((u) => {
            const verified = !!u.profile?.phone_verified_at;
            const name = u.profile?.full_name
              ?? [u.profile?.first_name, u.profile?.last_name].filter(Boolean).join(" ")
              ?? "—";
            return (
              <li key={u.user_id}>
                <Link
                  to="/admin/users/$userId"
                  params={{ userId: u.user_id }}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-muted/40 transition-colors"
                >
                  <div className="h-9 w-9 rounded-full bg-muted flex items-center justify-center text-xs font-semibold text-muted-foreground">
                    {(name?.[0] ?? "?").toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{name || "—"}</p>
                    <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                      {u.roles.map((r) => (
                        <span key={r} className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-primary/10 text-primary capitalize">
                          {t(`roles.${r}`, { defaultValue: r })}
                        </span>
                      ))}
                    </div>
                  </div>
                  <span className={cn(
                    "text-[10px] font-medium px-2 py-0.5 rounded-full shrink-0",
                    verified ? "bg-present/15 text-present" : "bg-muted text-muted-foreground",
                  )}>
                    {verified ? t("admin.statusActive") : t("admin.statusPending")}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
