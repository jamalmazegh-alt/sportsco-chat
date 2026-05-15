import { createFileRoute, Navigate, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import { useAuth, useActiveRole } from "@/lib/auth-context";
import { Loader2, Users, Mail } from "lucide-react";
import { listClubUsers } from "@/lib/admin.functions";

export const Route = createFileRoute("/_authenticated/admin/users")({
  component: AdminUsersPage,
  head: () => ({ meta: [{ title: "Users — Clubero" }] }),
});

function AdminUsersPage() {
  const { t } = useTranslation();
  const { activeClubId } = useAuth();
  const role = useActiveRole();
  const fetchUsers = useServerFn(listClubUsers);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-club-users", activeClubId],
    enabled: !!activeClubId && role === "admin",
    queryFn: async () => {
      const res = await fetchUsers({ data: { club_id: activeClubId! } });
      return res.users;
    },
  });

  if (role !== "admin") return <Navigate to="/profile" replace />;

  return (
    <div className="px-5 pt-4 pb-10 space-y-4">
      <header className="flex items-center gap-2">
        <Users className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold">{t("admin.usersTitle")}</h2>
      </header>
      <p className="text-xs text-muted-foreground">{t("admin.usersSubtitle")}</p>

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
          {(data ?? []).map((u: any) => {
            const name =
              u.profile?.full_name ??
              [u.profile?.first_name, u.profile?.last_name].filter(Boolean).join(" ") ??
              u.email ??
              "—";
            return (
              <li key={u.user_id}>
                <Link
                  to="/admin/users/$userId"
                  params={{ userId: u.user_id }}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-muted/40 transition-colors"
                >
                  <div className="h-9 w-9 rounded-full bg-muted flex items-center justify-center text-xs font-semibold text-muted-foreground overflow-hidden">
                    {u.profile?.avatar_url ? (
                      <img src={u.profile.avatar_url} alt="" className="h-full w-full object-cover" />
                    ) : (
                      (name?.[0] ?? "?").toUpperCase()
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{name || "—"}</p>
                    {u.email && (
                      <p className="text-xs text-muted-foreground truncate flex items-center gap-1 mt-0.5">
                        <Mail className="h-3 w-3" />
                        {u.email}
                      </p>
                    )}
                    <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                      {u.roles.map((r: string) => (
                        <span
                          key={r}
                          className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-primary/10 text-primary capitalize"
                        >
                          {t(`roles.${r}`, { defaultValue: r })}
                        </span>
                      ))}
                    </div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
