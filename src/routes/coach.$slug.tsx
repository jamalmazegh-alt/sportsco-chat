import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { Trophy, MapPin, GraduationCap, History, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { avatarGradient, initialsFrom } from "@/lib/avatar-color";
import { cn } from "@/lib/utils";
import { FollowButton } from "@/components/follow-button";

const SITE_URL = "https://www.clubero.app";
const DEFAULT_OG_IMAGE = `${SITE_URL}/og-default.jpg`;

type CoachProfile = {
  coach: {
    id: string;
    sport: string | null;
    speciality: string | null;
    philosophy: string | null;
    years_experience: number | null;
    looking_for_club: boolean;
    followers_count: number;
    public_slug: string;
  };
  profile: {
    full_name: string | null;
    first_name: string | null;
    last_name: string | null;
    avatar_url: string | null;
    city: string | null;
    region: string | null;
    country: string | null;
    bio: string | null;
  } | null;
  club: { id: string; name: string; logo_url: string | null; theme_color: string | null } | null;
  diplomas: Array<{ id: string; name: string; issuing_body: string | null; obtained_at: string | null; expiry_date: string | null }>;
  history: Array<{ id: string; club_name: string; role: string | null; sport: string | null; joined_at: string | null; left_at: string | null; is_current: boolean }>;
};

const coachQuery = (slug: string) =>
  queryOptions({
    queryKey: ["public-coach-profile", slug],
    queryFn: async (): Promise<CoachProfile | null> => {
      const { data, error } = await supabase.rpc("get_public_coach_profile", { _slug: slug });
      if (error) throw error;
      return (data as CoachProfile | null) ?? null;
    },
    staleTime: 60_000,
  });

export const Route = createFileRoute("/coach/$slug")({
  loader: async ({ context, params }) => {
    await context.queryClient.ensureQueryData(coachQuery(params.slug));
    return null;
  },
  head: ({ loaderData, params }) => {
    const slug = params.slug;
    const url = `${SITE_URL}/coach/${slug}`;
    // loaderData may be null; we always derive from cache instead in component.
    const title = "Coach — Clubero";
    const description = "Profil public d'un coach sur Clubero.";
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "profile" },
        { property: "og:url", content: url },
        { property: "og:image", content: DEFAULT_OG_IMAGE },
        { name: "twitter:card", content: "summary_large_image" },
        { rel: "canonical", href: url } as any,
      ],
    };
  },
  component: CoachPublicPage,
});

function CoachPublicPage() {
  const { slug } = Route.useParams();
  const { data } = useSuspenseQuery(coachQuery(slug));

  if (!data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <h1 className="text-2xl font-bold">Profil indisponible</h1>
          <p className="mt-2 text-muted-foreground">Ce profil coach est privé ou n'existe pas.</p>
        </div>
      </div>
    );
  }

  const { coach, profile, club, diplomas, history } = data;
  const fullName = profile?.full_name || `${profile?.first_name ?? ""} ${profile?.last_name ?? ""}`.trim() || "Coach";
  const initials = initialsFrom(fullName);
  const gradient = avatarGradient(coach.id);

  return (
    <div className="min-h-screen bg-gradient-to-b from-primary/5 to-background">
      <div className="mx-auto max-w-4xl px-5 py-10 lg:px-8">
        <header className="flex flex-col items-center gap-4 text-center md:flex-row md:items-end md:text-left">
          <div className={cn("flex h-28 w-28 items-center justify-center overflow-hidden rounded-full text-3xl font-bold text-white", gradient)}>
            {profile?.avatar_url ? <img src={profile.avatar_url} alt={fullName} className="h-full w-full object-cover" /> : <span>{initials}</span>}
          </div>
          <div className="flex-1">
            <h1 className="text-3xl font-bold md:text-4xl">{fullName}</h1>
            <div className="mt-2 flex flex-wrap items-center justify-center gap-2 text-sm text-muted-foreground md:justify-start">
              {club && (
                <span className="inline-flex items-center gap-1 rounded-full bg-muted px-3 py-1">
                  <Trophy className="h-3.5 w-3.5" /> {club.name}
                </span>
              )}
              {coach.sport && <span className="rounded-full bg-muted px-3 py-1">{coach.sport}</span>}
              {coach.speciality && <span className="rounded-full bg-primary/10 px-3 py-1 text-primary">{coach.speciality}</span>}
              {(profile?.city || profile?.region) && (
                <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> {[profile.city, profile.region].filter(Boolean).join(", ")}</span>
              )}
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-center gap-3 md:justify-start">
              {coach.looking_for_club && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-3 py-1 text-sm font-semibold text-emerald-700 dark:text-emerald-400">
                  <Sparkles className="h-3.5 w-3.5" /> Disponible — Open to opportunities
                </span>
              )}
              <span className="text-sm text-muted-foreground">{coach.followers_count} abonné(s)</span>
            </div>
          </div>
        </header>

        {profile?.bio && (
          <section className="mt-8 rounded-2xl border border-border/60 bg-card p-6">
            <p className="text-sm leading-relaxed text-foreground">{profile.bio}</p>
          </section>
        )}

        {coach.philosophy && (
          <section className="mt-6 rounded-2xl border border-border/60 bg-card p-6">
            <h2 className="text-lg font-semibold">Philosophie de jeu</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{coach.philosophy}</p>
            {coach.years_experience != null && (
              <p className="mt-3 text-xs text-muted-foreground">{coach.years_experience} an(s) d'expérience</p>
            )}
          </section>
        )}

        {diplomas.length > 0 && (
          <section className="mt-6 rounded-2xl border border-border/60 bg-card p-6">
            <h2 className="flex items-center gap-2 text-lg font-semibold"><GraduationCap className="h-5 w-5" /> Diplômes</h2>
            <ul className="mt-3 space-y-2">
              {diplomas.map((d) => (
                <li key={d.id} className="flex items-baseline justify-between gap-3 border-b border-border/40 pb-2 last:border-0">
                  <div>
                    <div className="font-medium">{d.name}</div>
                    {d.issuing_body && <div className="text-xs text-muted-foreground">{d.issuing_body}</div>}
                  </div>
                  {d.obtained_at && <span className="text-xs text-muted-foreground">{new Date(d.obtained_at).getFullYear()}</span>}
                </li>
              ))}
            </ul>
          </section>
        )}

        {history.length > 0 && (
          <section className="mt-6 rounded-2xl border border-border/60 bg-card p-6">
            <h2 className="flex items-center gap-2 text-lg font-semibold"><History className="h-5 w-5" /> Parcours</h2>
            <ul className="mt-3 space-y-2">
              {history.map((h) => (
                <li key={h.id} className="flex items-baseline justify-between gap-3 border-b border-border/40 pb-2 last:border-0">
                  <div>
                    <div className="font-medium">{h.club_name} {h.is_current && <span className="ml-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">Actuel</span>}</div>
                    {(h.role || h.sport) && <div className="text-xs text-muted-foreground">{[h.role, h.sport].filter(Boolean).join(" · ")}</div>}
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {h.joined_at ? new Date(h.joined_at).getFullYear() : ""}{h.left_at ? `–${new Date(h.left_at).getFullYear()}` : h.is_current ? "–" : ""}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}
