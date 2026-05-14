import { createFileRoute, Navigate, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useAuth, useActiveRole } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { ChevronLeft, Loader2, UserCircle2 } from "lucide-react";
import { fmt } from "@/lib/date-locale";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/admin/users/$userId")({
  component: AdminUserDetailPage,
  head: () => ({ meta: [{ title: "User — Clubero" }] }),
});

function AdminUserDetailPage() {
  const { userId } = Route.useParams();
  const { t } = useTranslation();
  const { activeClubId } = useAuth();
  const role = useActiveRole();

  const { data, isLoading } = useQuery({
    queryKey: ["admin-user-detail", userId, activeClubId],
    enabled: !!activeClubId && role === "admin",
    queryFn: async () => {
      const [{ data: profile }, { data: memberships }, { data: linkedPlayers }, { data: parentLinks }] = await Promise.all([
        supabase.from("profiles").select("id, full_name, first_name, last_name, phone, created_at, avatar_url").eq("id", userId).maybeSingle(),
        supabase.from("club_members").select("club_id, role, created_at, clubs:club_id(name)").eq("user_id", userId),
        supabase.from("players").select("id, first_name, last_name, club_id").eq("user_id", userId),
        supabase.from("player_parents").select("id, player_id, players:player_id(id, first_name, last_name, club_id)").eq("parent_user_id", userId),
      ]);
      return { profile, memberships: memberships ?? [], linkedPlayers: linkedPlayers ?? [], parentLinks: parentLinks ?? [] };
    },
  });

  if (role !== "admin") return <Navigate to="/profile" replace />;
  if (isLoading || !data) {
    return <div className="flex justify-center pt-20"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>;
  }

  const p = data.profile;
  const name = p?.full_name ?? [p?.first_name, p?.last_name].filter(Boolean).join(" ") ?? "—";
  const verified = !!p?.phone_verified_at;

  return (
    <div className="px-5 pt-6 pb-10 space-y-5">
      <Link to="/admin/users" className="inline-flex items-center text-sm text-muted-foreground gap-1">
        <ChevronLeft className="h-4 w-4" /> {t("common.back")}
      </Link>

      <header className="flex items-center gap-4">
        <div className="h-16 w-16 rounded-full bg-muted overflow-hidden flex items-center justify-center">
          {p?.avatar_url ? (
            <img src={p.avatar_url} alt="" className="h-full w-full object-cover" />
          ) : (
            <UserCircle2 className="h-8 w-8 text-muted-foreground" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold truncate">{name || "—"}</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {p?.phone ?? "—"} · {verified ? t("admin.phoneVerified") : t("admin.phoneNotVerified")}
          </p>
          {p?.created_at && (
            <p className="text-[11px] text-muted-foreground mt-0.5">{t("admin.joined")}: {fmt(new Date(p.created_at), "PP")}</p>
          )}
        </div>
        <span className={cn(
          "text-[10px] font-medium px-2 py-0.5 rounded-full shrink-0",
          verified ? "bg-present/15 text-present" : "bg-muted text-muted-foreground",
        )}>
          {verified ? t("admin.statusActive") : t("admin.statusPending")}
        </span>
      </header>

      <section className="rounded-2xl border border-border bg-card p-5 space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">{t("admin.memberships")}</h2>
        {data.memberships.length === 0 ? (
          <p className="text-sm text-muted-foreground">—</p>
        ) : (
          <ul className="space-y-1.5">
            {data.memberships.map((m: any) => (
              <li key={`${m.club_id}-${m.role}`} className="flex items-center justify-between gap-2 text-sm">
                <span className="truncate">{m.clubs?.name ?? m.club_id}</span>
                <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-primary/10 text-primary capitalize">
                  {t(`roles.${m.role}`, { defaultValue: m.role })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-2xl border border-border bg-card p-5 space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">{t("admin.linkedPlayers")}</h2>
        {data.linkedPlayers.length === 0 && data.parentLinks.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("admin.noLinkedPlayers")}</p>
        ) : (
          <ul className="space-y-1.5">
            {data.linkedPlayers.map((pl: any) => (
              <li key={pl.id}>
                <Link to="/players/$playerId" params={{ playerId: pl.id }} className="text-sm text-primary hover:underline">
                  {pl.first_name} {pl.last_name} <span className="text-xs text-muted-foreground">({t("roles.player")})</span>
                </Link>
              </li>
            ))}
            {data.parentLinks.map((pp: any) => pp.players && (
              <li key={pp.id}>
                <Link to="/players/$playerId" params={{ playerId: pp.players.id }} className="text-sm text-primary hover:underline">
                  {pp.players.first_name} {pp.players.last_name} <span className="text-xs text-muted-foreground">({t("roles.parent")})</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
