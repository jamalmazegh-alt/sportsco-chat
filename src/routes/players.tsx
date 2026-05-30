import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Search, Users, ChevronLeft, ChevronRight, Trophy } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { MarketingHeader } from "@/components/marketing/MarketingHeader";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { avatarGradient, initialsFrom } from "@/lib/avatar-color";
import { cn } from "@/lib/utils";

const SITE_URL = "https://www.clubero.app";
const PAGE_SIZE = 24;

type PlayerItem = {
  id: string;
  first_name: string;
  last_name: string;
  photo_url: string | null;
  preferred_position: string | null;
  position: string | null;
  jersey_number: number | null;
  public_slug: string;
  club: { id: string; name: string; logo_url: string | null; sport: string | null } | null;
};

type ListResponse = {
  items: PlayerItem[];
  total: number;
  limit: number;
  offset: number;
  sports: string[];
  clubs: { id: string; name: string }[];
};

export const Route = createFileRoute("/players")({
  head: () => ({
    meta: [
      { title: "Annuaire des joueurs publics — Clubero" },
      {
        name: "description",
        content:
          "Découvrez les profils publics des joueurs sur Clubero : palmarès, parcours, club. Recherchez par nom, sport ou club.",
      },
      { property: "og:title", content: "Annuaire des joueurs publics — Clubero" },
      {
        property: "og:description",
        content:
          "Profils publics de joueurs : palmarès, parcours, club. Recherche et filtres.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: `${SITE_URL}/players` },
      { name: "twitter:card", content: "summary_large_image" },
      { rel: "canonical", href: `${SITE_URL}/players` } as any,
    ],
  }),
  component: PublicPlayersDirectory,
});

function PublicPlayersDirectory() {
  const { t } = useTranslation("marketing");
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [sport, setSport] = useState<string>("all");
  const [clubId, setClubId] = useState<string>("all");
  const [page, setPage] = useState(0);

  const query = useQuery({
    queryKey: ["public-players", search, sport, clubId, page],
    queryFn: async (): Promise<ListResponse> => {
      const { data, error } = await supabase.rpc("list_public_players", {
        _search: search || null,
        _sport: sport === "all" ? null : sport,
        _club_id: clubId === "all" ? null : clubId,
        _limit: PAGE_SIZE,
        _offset: page * PAGE_SIZE,
      });
      if (error) throw error;
      return data as unknown as ListResponse;
    },
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });

  const total = query.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const items = query.data?.items ?? [];
  const sports = query.data?.sports ?? [];
  const clubs = query.data?.clubs ?? [];

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(0);
    setSearch(searchInput.trim());
  };

  const resetFilters = () => {
    setSearch("");
    setSearchInput("");
    setSport("all");
    setClubId("all");
    setPage(0);
  };

  return (
    <div className="min-h-screen bg-background">
      <MarketingHeader />

      <section className="border-b border-border/60 bg-gradient-to-b from-primary/10 to-background">
        <div className="mx-auto max-w-7xl px-5 py-14 lg:px-8 lg:py-20">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Users className="h-4 w-4" />
            <span>{t("publicPlayers.eyebrow", "Annuaire public")}</span>
          </div>
          <h1 className="mt-3 text-3xl font-bold tracking-tight md:text-5xl">
            {t("publicPlayers.title", "Les joueurs Clubero")}
          </h1>
          <p className="mt-3 max-w-2xl text-base text-muted-foreground md:text-lg">
            {t(
              "publicPlayers.subtitle",
              "Parcourez les profils publics partagés par les joueurs : palmarès, parcours sportif, club. Réservé aux joueurs majeurs ayant activé leur profil.",
            )}
          </p>

          <form onSubmit={submitSearch} className="mt-8 grid gap-3 md:grid-cols-[1fr_180px_220px_auto]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder={t("publicPlayers.searchPlaceholder", "Nom du joueur ou du club…")}
                className="pl-9"
              />
            </div>
            <Select value={sport} onValueChange={(v) => { setSport(v); setPage(0); }}>
              <SelectTrigger><SelectValue placeholder="Sport" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("publicPlayers.allSports", "Tous les sports")}</SelectItem>
                {sports.map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={clubId} onValueChange={(v) => { setClubId(v); setPage(0); }}>
              <SelectTrigger><SelectValue placeholder="Club" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("publicPlayers.allClubs", "Tous les clubs")}</SelectItem>
                {clubs.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex gap-2">
              <Button type="submit">{t("publicPlayers.search", "Rechercher")}</Button>
              <Button type="button" variant="ghost" onClick={resetFilters}>
                {t("publicPlayers.reset", "Réinitialiser")}
              </Button>
            </div>
          </form>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-10 lg:px-8">
        <div className="mb-6 flex items-center justify-between text-sm text-muted-foreground">
          <span>
            {query.isLoading
              ? t("publicPlayers.loading", "Chargement…")
              : t("publicPlayers.count", "{{count}} joueurs", { count: total })}
          </span>
          {totalPages > 1 && (
            <span>
              {t("publicPlayers.page", "Page {{page}} / {{total}}", {
                page: page + 1,
                total: totalPages,
              })}
            </span>
          )}
        </div>

        {query.isError && (
          <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-6 text-sm text-destructive">
            {t("publicPlayers.error", "Impossible de charger l'annuaire pour le moment.")}
          </div>
        )}

        {!query.isLoading && items.length === 0 && !query.isError && (
          <div className="rounded-xl border border-border/60 bg-card p-10 text-center">
            <Users className="mx-auto h-10 w-10 text-muted-foreground/60" />
            <h2 className="mt-4 text-lg font-semibold">
              {t("publicPlayers.emptyTitle", "Aucun profil ne correspond")}
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {t(
                "publicPlayers.emptyBody",
                "Affinez vos filtres ou revenez bientôt : de nouveaux joueurs partagent leur profil chaque semaine.",
              )}
            </p>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {items.map((p) => {
            const fullName = `${p.first_name} ${p.last_name}`;
            const initials = initialsFrom(fullName);
            const gradient = avatarGradient(p.id);
            const pos = p.preferred_position || p.position;
            return (
              <Link
                key={p.id}
                to="/p/$slug"
                params={{ slug: p.public_slug }}
                className="group relative overflow-hidden rounded-2xl border border-border/60 bg-card transition-all hover:-translate-y-1 hover:border-primary/40 hover:shadow-lg"
              >
                <div className="flex items-center gap-4 p-5">
                  <div
                    className={cn(
                      "flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full text-xl font-bold text-white",
                      gradient,
                    )}
                  >
                    {p.photo_url ? (
                      <img src={p.photo_url} alt={fullName} className="h-full w-full object-cover" />
                    ) : (
                      <span>{initials}</span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold group-hover:text-primary">
                      {fullName}
                    </div>
                    {p.club?.name && (
                      <div className="truncate text-xs text-muted-foreground">{p.club.name}</div>
                    )}
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                      {pos && (
                        <span className="rounded-full bg-muted px-2 py-0.5 font-medium">{pos}</span>
                      )}
                      {p.jersey_number != null && (
                        <span className="rounded-full bg-primary/10 px-2 py-0.5 font-semibold text-primary">
                          #{p.jersey_number}
                        </span>
                      )}
                      {p.club?.sport && (
                        <span className="inline-flex items-center gap-1">
                          <Trophy className="h-3 w-3" />
                          {p.club.sport}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>

        {totalPages > 1 && (
          <div className="mt-10 flex items-center justify-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page === 0 || query.isFetching}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
            >
              <ChevronLeft className="mr-1 h-4 w-4" />
              {t("publicPlayers.prev", "Précédent")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page + 1 >= totalPages || query.isFetching}
              onClick={() => setPage((p) => p + 1)}
            >
              {t("publicPlayers.next", "Suivant")}
              <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        )}
      </section>

      <section className="border-t border-border/60 bg-gradient-to-b from-background to-primary/5">
        <div className="mx-auto max-w-5xl px-5 py-16 text-center lg:px-8">
          <h2 className="text-2xl font-bold md:text-3xl">
            {t("publicPlayers.ctaTitle", "Vous êtes joueur ? Créez votre profil public.")}
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-muted-foreground">
            {t(
              "publicPlayers.ctaBody",
              "Partagez votre palmarès, vos saisons et votre parcours en un lien. Gratuit, opt-in, sous votre contrôle.",
            )}
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Button asChild size="lg">
              <Link to="/register">{t("publicPlayers.ctaJoin", "Créer mon compte")}</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link to="/features">{t("publicPlayers.ctaFeatures", "Voir les fonctionnalités")}</Link>
            </Button>
          </div>
        </div>
      </section>

      <MarketingFooter />
    </div>
  );
}
