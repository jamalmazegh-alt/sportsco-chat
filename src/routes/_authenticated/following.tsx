import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Loader2, UserCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { avatarGradient, initialsFrom } from "@/lib/avatar-color";
import { cn } from "@/lib/utils";
import i18n from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/following")({
  component: FollowingPage,
  head: () => ({
    meta: [
      { title: i18n.t("following.title", { defaultValue: "Mes abonnements", ns: "common" }) },
    ],
  }),
});

type FollowRow = {
  id: string;
  target_type: "player" | "coach" | "club";
  followed_player_id: string | null;
  followed_coach_id: string | null;
  followed_club_id: string | null;
};

type Player = { id: string; first_name: string | null; last_name: string | null; photo_url: string | null; club: { name: string } | null };
type Coach = { id: string; sport: string | null; profile: { first_name: string | null; last_name: string | null; avatar_url: string | null } | null; club: { name: string } | null };
type Club = { id: string; name: string; logo_url: string | null; sport: string | null };

function FollowingPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const qc = useQueryClient();
  const queryKey = ["following-list", user?.id];

  const { data, isLoading } = useQuery({
    queryKey,
    enabled: !!user,
    queryFn: async () => {
      const { data: rows } = await supabase
        .from("follows")
        .select("id, target_type, followed_player_id, followed_coach_id, followed_club_id")
        .eq("follower_id", user!.id);
      const list = (rows ?? []) as FollowRow[];
      const playerIds = list.filter((r) => r.followed_player_id).map((r) => r.followed_player_id!) as string[];
      const coachIds = list.filter((r) => r.followed_coach_id).map((r) => r.followed_coach_id!) as string[];
      const clubIds = list.filter((r) => r.followed_club_id).map((r) => r.followed_club_id!) as string[];

      const [playersRes, coachesRes, clubsRes] = await Promise.all([
        playerIds.length
          ? supabase.from("players").select("id, first_name, last_name, photo_url, club:clubs(name)").in("id", playerIds)
          : Promise.resolve({ data: [] as any[] }),
        coachIds.length
          ? supabase
              .from("coach_profiles")
              .select("id, sport, user_id, current_club_id, club:clubs!coach_profiles_current_club_id_fkey(name)")
              .in("id", coachIds)
          : Promise.resolve({ data: [] as any[] }),
        clubIds.length
          ? supabase.from("clubs").select("id, name, logo_url, sport").in("id", clubIds)
          : Promise.resolve({ data: [] as any[] }),
      ]);

      const coachUserIds = ((coachesRes.data ?? []) as any[]).map((c) => c.user_id).filter(Boolean);
      const profilesRes = coachUserIds.length
        ? await supabase.from("profiles").select("id, first_name, last_name, avatar_url").in("id", coachUserIds)
        : { data: [] as any[] };
      const profilesById = new Map(((profilesRes.data ?? []) as any[]).map((p) => [p.id, p]));

      const players = (playersRes.data ?? []) as Player[];
      const coaches = ((coachesRes.data ?? []) as any[]).map((c) => ({
        id: c.id,
        sport: c.sport,
        profile: profilesById.get(c.user_id) ?? null,
        club: c.club ?? null,
      })) as Coach[];
      const clubs = (clubsRes.data ?? []) as Club[];

      return { rows: list, players, coaches, clubs };
    },
  });

  const unfollow = useMutation({
    mutationFn: async ({ rowId }: { rowId: string }) => {
      const { error } = await supabase.from("follows").delete().eq("id", rowId);
      if (error) throw error;
    },
    onMutate: async ({ rowId }) => {
      await qc.cancelQueries({ queryKey });
      const prev = qc.getQueryData<any>(queryKey);
      if (prev) {
        const removed = prev.rows.find((r: FollowRow) => r.id === rowId);
        qc.setQueryData(queryKey, {
          rows: prev.rows.filter((r: FollowRow) => r.id !== rowId),
          players: removed?.followed_player_id ? prev.players.filter((p: Player) => p.id !== removed.followed_player_id) : prev.players,
          coaches: removed?.followed_coach_id ? prev.coaches.filter((c: Coach) => c.id !== removed.followed_coach_id) : prev.coaches,
          clubs: removed?.followed_club_id ? prev.clubs.filter((c: Club) => c.id !== removed.followed_club_id) : prev.clubs,
        });
      }
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(queryKey, ctx.prev);
      toast.error(t("follow.error", { defaultValue: "Something went wrong, try again" }));
    },
  });

  if (isLoading || !data) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const { rows, players, coaches, clubs } = data;
  const findRowId = (type: "player" | "coach" | "club", id: string) =>
    rows.find((r) =>
      type === "player" ? r.followed_player_id === id : type === "coach" ? r.followed_coach_id === id : r.followed_club_id === id,
    )?.id;

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 space-y-6 pb-24">
      <header>
        <h1 className="text-2xl font-bold">{t("following.title", { defaultValue: "Mes abonnements" })}</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {t("following.summary", {
            p: players.length,
            c: coaches.length,
            cl: clubs.length,
            defaultValue: "Tu suis {{p}} joueur(s), {{c}} coach(s), {{cl}} club(s)",
          })}
        </p>
      </header>

      {/* Players */}
      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-2">
          {t("following.players", { defaultValue: "Joueurs" })}
        </h2>
        {players.length === 0 ? (
          <div className="rounded-2xl border border-border bg-card p-5 text-center space-y-3">
            <p className="text-sm text-muted-foreground">
              {t("following.emptyPlayers", { defaultValue: "Tu ne suis aucun joueur." })}
            </p>
            <Button asChild variant="outline" size="sm">
              <Link to="/players">{t("following.discoverPlayers", { defaultValue: "Découvrir des joueurs" })}</Link>
            </Button>
          </div>
        ) : (
          <ul className="space-y-2">
            {players.map((p) => {
              const name = `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() || "—";
              const rowId = findRowId("player", p.id);
              return (
                <li key={p.id} className="flex items-center gap-3 rounded-xl border border-border bg-card p-3">
                  <div className={cn("h-10 w-10 rounded-full overflow-hidden flex items-center justify-center text-white text-sm font-bold shrink-0", !p.photo_url && avatarGradient(name))}>
                    {p.photo_url ? <img src={p.photo_url} alt={name} className="h-full w-full object-cover" /> : initialsFrom(p.first_name ?? "", p.last_name ?? "")}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{name}</div>
                    {p.club?.name && <div className="text-xs text-muted-foreground truncate">{p.club.name}</div>}
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => rowId && unfollow.mutate({ rowId })}>
                    <UserCheck className="h-4 w-4" />
                    {t("follow.unfollow", { defaultValue: "Ne plus suivre" })}
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Coaches */}
      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-2">
          {t("following.coaches", { defaultValue: "Coachs" })}
        </h2>
        {coaches.length === 0 ? (
          <p className="rounded-2xl border border-border bg-card p-5 text-center text-sm text-muted-foreground">
            {t("following.emptyCoaches", { defaultValue: "Tu ne suis aucun coach." })}
          </p>
        ) : (
          <ul className="space-y-2">
            {coaches.map((c) => {
              const name = `${c.profile?.first_name ?? ""} ${c.profile?.last_name ?? ""}`.trim() || "Coach";
              const rowId = findRowId("coach", c.id);
              return (
                <li key={c.id} className="flex items-center gap-3 rounded-xl border border-border bg-card p-3">
                  <div className={cn("h-10 w-10 rounded-full overflow-hidden flex items-center justify-center text-white text-sm font-bold shrink-0", !c.profile?.avatar_url && avatarGradient(c.id))}>
                    {c.profile?.avatar_url ? <img src={c.profile.avatar_url} alt={name} className="h-full w-full object-cover" /> : initialsFrom(name)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{name}</div>
                    {c.club?.name && <div className="text-xs text-muted-foreground truncate">{c.club.name}</div>}
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => rowId && unfollow.mutate({ rowId })}>
                    <UserCheck className="h-4 w-4" />
                    {t("follow.unfollow", { defaultValue: "Ne plus suivre" })}
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Clubs */}
      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-2">
          {t("following.clubs", { defaultValue: "Clubs" })}
        </h2>
        {clubs.length === 0 ? (
          <p className="rounded-2xl border border-border bg-card p-5 text-center text-sm text-muted-foreground">
            {t("following.emptyClubs", { defaultValue: "Tu ne suis aucun club." })}
          </p>
        ) : (
          <ul className="space-y-2">
            {clubs.map((c) => {
              const rowId = findRowId("club", c.id);
              return (
                <li key={c.id} className="flex items-center gap-3 rounded-xl border border-border bg-card p-3">
                  <div className="h-10 w-10 rounded-lg overflow-hidden bg-muted flex items-center justify-center shrink-0">
                    {c.logo_url ? <img src={c.logo_url} alt={c.name} className="h-full w-full object-cover" /> : <span className="font-semibold text-muted-foreground">{c.name.charAt(0)}</span>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{c.name}</div>
                    {c.sport && <div className="text-xs text-muted-foreground capitalize">{c.sport}</div>}
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => rowId && unfollow.mutate({ rowId })}>
                    <UserCheck className="h-4 w-4" />
                    {t("follow.unfollow", { defaultValue: "Ne plus suivre" })}
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
