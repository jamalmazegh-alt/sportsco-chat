import { createFileRoute, notFound } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Trophy, History, CalendarDays, MapPin } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { avatarGradient, initialsFrom } from "@/lib/avatar-color";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/p/$slug")({
  component: PublicPlayerProfile,
  head: ({ params }) => ({
    meta: [
      { title: `Clubero — ${params.slug}` },
      { name: "description", content: "Public player profile on Clubero." },
      { property: "og:title", content: `Clubero — Player profile` },
      { property: "og:description", content: "Public player profile on Clubero." },
    ],
  }),
});

type PublicProfile = {
  player: {
    id: string;
    first_name: string;
    last_name: string;
    photo_url: string | null;
    preferred_position: string | null;
    position: string | null;
    jersey_number: number | null;
  };
  club: {
    id: string;
    name: string;
    logo_url: string | null;
    sport: string | null;
    theme_color: string | null;
  } | null;
  achievements: Array<{
    id: string;
    title: string;
    achievement_type: string;
    achievement_date: string | null;
    season_label: string | null;
    description: string | null;
  }>;
  timeline: Array<{
    id: string;
    event_type: string;
    title: string;
    description: string | null;
    event_date: string;
  }>;
  seasons: Array<{
    id: string;
    season_label: string;
    sport: string | null;
    category: string | null;
    primary_position: string | null;
  }>;
};

function PublicPlayerProfile() {
  const { slug } = Route.useParams();
  const { t } = useTranslation();

  const { data, isLoading, error } = useQuery({
    queryKey: ["public-player-profile", slug],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_public_player_profile", { _slug: slug });
      if (error) throw error;
      return data as PublicProfile | null;
    },
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-muted-foreground text-sm">Loading…</div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-5">
        <div className="text-center max-w-md">
          <h1 className="text-2xl font-semibold mb-2">Profile not found</h1>
          <p className="text-muted-foreground text-sm">
            This player profile is either private or no longer available.
          </p>
          <a href="/" className="inline-block mt-6 text-sm text-primary underline">
            Go to Clubero
          </a>
        </div>
      </div>
    );
  }

  const { player, club, achievements, timeline, seasons } = data;
  const fullName = `${player.first_name} ${player.last_name}`;

  return (
    <div className="min-h-screen bg-background">
      {/* Top bar */}
      <header className="border-b border-border/60 bg-background/80 backdrop-blur sticky top-0 z-10">
        <div className="mx-auto max-w-3xl px-5 py-3 flex items-center justify-between">
          <a href="/" className="text-sm font-semibold tracking-tight">Clubero</a>
          <a
            href="/register"
            className="text-xs font-medium px-3 py-1.5 rounded-full bg-primary text-primary-foreground hover:opacity-90"
          >
            {t("nav.signup", { defaultValue: "Sign up" })}
          </a>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-5 py-8 space-y-8">
        {/* Hero */}
        <section className="flex items-center gap-4">
          <div
            className={cn(
              "h-20 w-20 rounded-full ring-4 ring-background shadow-md flex items-center justify-center text-white text-2xl font-bold shrink-0",
              !player.photo_url && avatarGradient(fullName)
            )}
          >
            {player.photo_url ? (
              <img
                src={player.photo_url}
                alt={fullName}
                className="h-full w-full rounded-full object-cover"
              />
            ) : (
              initialsFrom(player.first_name, player.last_name)
            )}
          </div>
          <div className="min-w-0">
            <h1 className="text-2xl font-bold truncate">{fullName}</h1>
            <div className="flex items-center gap-2 text-sm text-muted-foreground flex-wrap mt-1">
              {player.jersey_number != null && (
                <span className="inline-flex items-center justify-center min-w-[1.75rem] px-1.5 h-6 rounded bg-muted font-semibold text-foreground">
                  #{player.jersey_number}
                </span>
              )}
              {player.preferred_position && <span>{player.preferred_position}</span>}
              {club && (
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5" />
                  {club.name}
                </span>
              )}
            </div>
          </div>
        </section>

        {/* Club card */}
        {club && (
          <section className="flex items-center gap-3 rounded-2xl border border-border/60 bg-card p-4">
            {club.logo_url ? (
              <img src={club.logo_url} alt={club.name} className="h-12 w-12 rounded-lg object-cover" />
            ) : (
              <div className="h-12 w-12 rounded-lg bg-muted flex items-center justify-center text-muted-foreground font-semibold">
                {club.name.charAt(0)}
              </div>
            )}
            <div>
              <div className="font-semibold">{club.name}</div>
              {club.sport && <div className="text-xs text-muted-foreground capitalize">{club.sport}</div>}
            </div>
          </section>
        )}

        {/* Achievements */}
        {achievements.length > 0 && (
          <section>
            <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
              <Trophy className="h-5 w-5 text-primary" />
              {t("journey.tab.achievements", { defaultValue: "Achievements" })}
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {achievements.map((a) => (
                <div key={a.id} className="rounded-xl border border-border/60 bg-card p-4">
                  <div className="font-semibold">{a.title}</div>
                  {a.season_label && (
                    <div className="text-xs text-muted-foreground mt-0.5">{a.season_label}</div>
                  )}
                  {a.description && (
                    <p className="text-sm text-muted-foreground mt-2">{a.description}</p>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Seasons */}
        {seasons.length > 0 && (
          <section>
            <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
              <CalendarDays className="h-5 w-5 text-primary" />
              {t("journey.tab.season", { defaultValue: "Seasons" })}
            </h2>
            <div className="space-y-2">
              {seasons.map((s) => (
                <div
                  key={s.id}
                  className="flex items-center justify-between rounded-xl border border-border/60 bg-card px-4 py-3 text-sm"
                >
                  <div className="font-semibold">{s.season_label}</div>
                  <div className="text-xs text-muted-foreground">
                    {[s.category, s.primary_position].filter(Boolean).join(" · ")}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Timeline */}
        {timeline.length > 0 && (
          <section>
            <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
              <History className="h-5 w-5 text-primary" />
              {t("journey.tab.timeline", { defaultValue: "Timeline" })}
            </h2>
            <ol className="relative border-l-2 border-border/60 pl-5 space-y-4">
              {timeline.map((e) => (
                <li key={e.id} className="relative">
                  <span className="absolute -left-[27px] top-1.5 h-3 w-3 rounded-full bg-primary ring-4 ring-background" />
                  <div className="text-xs text-muted-foreground">
                    {new Date(e.event_date).toLocaleDateString()}
                  </div>
                  <div className="font-medium mt-0.5">{e.title}</div>
                  {e.description && (
                    <p className="text-sm text-muted-foreground mt-1">{e.description}</p>
                  )}
                </li>
              ))}
            </ol>
          </section>
        )}

        {achievements.length === 0 && seasons.length === 0 && timeline.length === 0 && (
          <p className="text-center text-sm text-muted-foreground py-8">
            This player hasn't shared any public content yet.
          </p>
        )}

        <footer className="border-t border-border/60 pt-6 text-center text-xs text-muted-foreground">
          <a href="/" className="underline">Clubero</a> — the mobile-first platform for sports clubs.
        </footer>
      </main>
    </div>
  );
}
