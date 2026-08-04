import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { CalendarDays, MapPin, Users, FileText, Download, ClipboardList } from "lucide-react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import type { PublicCampBundle } from "@/lib/public-camps.types";
import i18n from "@/lib/i18n";

const SITE_URL = "https://clubero.app";
const DEFAULT_OG_IMAGE = `${SITE_URL}/og-default.jpg`;

const publicCampQuery = (clubSlug: string, campSlug: string) =>
  queryOptions({
    queryKey: ["public-camp", clubSlug, campSlug],
    queryFn: async (): Promise<PublicCampBundle | null> => {
      const { data, error } = await supabase.rpc("get_public_camp_by_slug" as any, {
        _club_slug: clubSlug,
        _camp_slug: campSlug,
      });
      if (error) throw error;
      return (data as PublicCampBundle | null) ?? null;
    },
    staleTime: 60_000,
  });

export const Route = createFileRoute("/stages/$clubSlug/$campSlug/")({
  loader: async ({ context, params }) => {
    const data = await context.queryClient.ensureQueryData(
      publicCampQuery(params.clubSlug, params.campSlug),
    );
    if (!data) throw notFound();
    return data;
  },
  head: ({ loaderData, params }) => {
    const url = `${SITE_URL}/stages/${params.clubSlug}/${params.campSlug}`;
    const camp = loaderData?.camp;
    const club = loaderData?.club;
    const title = camp && club ? `${camp.title} — ${club.name}` : "Stage — Clubero";
    const rawDesc =
      camp?.description?.trim() || "Découvrez ce stage sportif et inscrivez votre enfant en ligne.";
    const description = rawDesc.length > 160 ? rawDesc.slice(0, 157) + "…" : rawDesc;
    const ogImage = camp?.cover_image_url || DEFAULT_OG_IMAGE;
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "website" },
        { property: "og:url", content: url },
        { property: "og:image", content: ogImage },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:title", content: title },
        { name: "twitter:description", content: description },
        { name: "twitter:image", content: ogImage },
        { rel: "canonical", href: url } as any,
      ],
    };
  },
  errorComponent: () => (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center px-6">
        <h1 className="text-2xl font-bold">{i18n.t("common.error")}</h1>
        <p className="mt-2 text-muted-foreground">
          {i18n.t("public.errors.loadFailed", { ns: "camps" })}
        </p>
      </div>
    </div>
  ),
  notFoundComponent: () => (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center px-6">
        <h1 className="text-2xl font-bold">{i18n.t("public.errors.notFound", { ns: "camps" })}</h1>
        <p className="mt-2 text-muted-foreground">
          {i18n.t("public.errors.notFoundBody", { ns: "camps" })}
        </p>
      </div>
    </div>
  ),
  component: PublicCampPage,
});

function formatDateRange(startISO: string, endISO: string, lang: string) {
  const start = new Date(startISO);
  const end = new Date(endISO);
  const sameDay = start.toDateString() === end.toDateString();
  const dateFmt: Intl.DateTimeFormatOptions = {
    day: "numeric",
    month: "long",
    year: "numeric",
  };
  if (sameDay) return start.toLocaleDateString(lang, dateFmt);
  return `${start.toLocaleDateString(lang, { day: "numeric", month: "long" })} – ${end.toLocaleDateString(
    lang,
    dateFmt,
  )}`;
}

function PublicCampPage() {
  const { clubSlug, campSlug } = Route.useParams();
  const { t, i18n } = useTranslation("camps");
  const { data } = useSuspenseQuery(publicCampQuery(clubSlug, campSlug));

  // notFound() in loader guarantees data is not null here, but be defensive.
  if (!data) return null;
  const { camp, club, venue, facility, age_groups, program_items, documents, required_documents } =
    data;

  const location =
    camp.external_location ||
    [venue?.name, facility?.name].filter(Boolean).join(" — ") ||
    [venue?.city, venue?.country].filter(Boolean).join(", ");

  const deadlinePassed = camp.registration_deadline
    ? new Date(camp.registration_deadline).getTime() < Date.now()
    : false;

  const priceLabel =
    camp.price != null && camp.price > 0
      ? new Intl.NumberFormat(i18n.language, {
          style: "currency",
          currency: camp.currency || "EUR",
        }).format(camp.price)
      : t("public.free", "Gratuit");

  return (
    <div className="min-h-screen bg-gradient-to-b from-primary/5 to-background">
      {camp.cover_image_url && (
        <div className="relative h-64 md:h-96 w-full overflow-hidden">
          <img src={camp.cover_image_url} alt={camp.title} className="h-full w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-background/95 via-background/40 to-transparent" />
        </div>
      )}

      <div className="mx-auto max-w-4xl px-5 py-8 lg:px-8">
        <header className="flex items-start gap-4">
          {club.logo_url && (
            <img
              src={club.logo_url}
              alt={club.name}
              className="h-14 w-14 rounded-full object-cover ring-2 ring-background shadow-sm"
            />
          )}
          <div className="flex-1">
            <p className="text-sm font-medium text-muted-foreground">{club.name}</p>
            <h1 className="mt-1 text-3xl font-bold md:text-4xl">{camp.title}</h1>
          </div>
        </header>

        <section className="mt-6 grid gap-3 md:grid-cols-2">
          <InfoRow icon={<CalendarDays className="h-4 w-4" />}>
            {formatDateRange(camp.start_date, camp.end_date, i18n.language)}
          </InfoRow>
          {location && <InfoRow icon={<MapPin className="h-4 w-4" />}>{location}</InfoRow>}
          <InfoRow icon={<Users className="h-4 w-4" />}>
            {t("public.capacity", "{{count}} places", { count: camp.capacity })}
          </InfoRow>
          <InfoRow icon={<ClipboardList className="h-4 w-4" />}>{priceLabel}</InfoRow>
        </section>

        {camp.description && (
          <section className="mt-8 rounded-2xl border border-border/60 bg-card p-6">
            <p className="whitespace-pre-line text-sm leading-relaxed text-foreground">
              {camp.description}
            </p>
          </section>
        )}

        {age_groups.length > 0 && (
          <section className="mt-6 rounded-2xl border border-border/60 bg-card p-6">
            <h2 className="text-lg font-semibold">{t("public.ageGroups", "Catégories d'âge")}</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {age_groups.map((g) => (
                <span
                  key={g.id}
                  className="rounded-full bg-primary/10 px-3 py-1 text-sm font-medium text-primary"
                >
                  {g.label}
                  {g.birth_year_min && g.birth_year_max && (
                    <span className="ml-1 text-xs text-primary/70">
                      ({g.birth_year_min}-{g.birth_year_max})
                    </span>
                  )}
                </span>
              ))}
            </div>
          </section>
        )}

        {program_items.length > 0 && (
          <section className="mt-6 rounded-2xl border border-border/60 bg-card p-6">
            <h2 className="text-lg font-semibold">{t("public.program", "Programme")}</h2>
            <ul className="mt-3 space-y-3">
              {program_items.map((p) => (
                <li key={p.id} className="border-l-2 border-primary/40 pl-4">
                  <div className="flex items-baseline justify-between gap-3">
                    <div className="font-medium">{p.title}</div>
                    {p.starts_at && (
                      <span className="text-xs text-muted-foreground">
                        {new Date(p.starts_at).toLocaleString(i18n.language, {
                          day: "numeric",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    )}
                  </div>
                  {p.description && (
                    <p className="mt-1 text-sm text-muted-foreground">{p.description}</p>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        {documents.length > 0 && (
          <section className="mt-6 rounded-2xl border border-border/60 bg-card p-6">
            <h2 className="text-lg font-semibold">
              {t("public.providedDocs", "Documents fournis")}
            </h2>
            <ul className="mt-3 space-y-2">
              {documents.map((d) => (
                <li key={d.id}>
                  <a
                    href={d.file_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 text-sm text-primary hover:underline"
                  >
                    <Download className="h-4 w-4" />
                    {d.title}
                  </a>
                </li>
              ))}
            </ul>
          </section>
        )}

        {required_documents.length > 0 && (
          <section className="mt-6 rounded-2xl border border-border/60 bg-card p-6">
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <FileText className="h-5 w-5" />
              {t("public.requiredDocs", "Pièces à fournir")}
            </h2>
            <ul className="mt-3 space-y-2">
              {required_documents.map((d) => (
                <li key={d.id} className="flex items-center gap-2 text-sm">
                  <span
                    className={`h-2 w-2 rounded-full ${d.required ? "bg-primary" : "bg-muted-foreground/40"}`}
                  />
                  {d.title}
                  {d.required && (
                    <span className="text-xs text-muted-foreground">
                      · {t("public.requiredTag", "obligatoire")}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        <div className="mt-10 flex flex-col items-center gap-3">
          {(() => {
            const remaining = (camp as any).remaining as number | undefined;
            const isFull = (camp as any).is_full as boolean | undefined;
            if (deadlinePassed) {
              return (
                <div className="rounded-lg bg-muted px-4 py-3 text-sm text-muted-foreground">
                  {t("public.deadlinePassed", "Les inscriptions sont fermées.")}
                </div>
              );
            }
            return (
              <>
                {isFull && (
                  <div className="rounded-lg bg-amber-100 px-4 py-2 text-sm font-medium text-amber-800">
                    {t("public.full", "Complet — inscription possible en liste d'attente")}
                  </div>
                )}
                {!isFull && typeof remaining === "number" && remaining > 0 && remaining <= 5 && (
                  <div className="rounded-lg bg-primary/10 px-4 py-2 text-sm font-medium text-primary">
                    {t("public.lastSpots", "Dernières places ({{count}} restantes)", {
                      count: remaining,
                    })}
                  </div>
                )}
                <Button asChild size="lg">
                  <Link
                    to="/stages/$clubSlug/$campSlug/inscription"
                    params={{ clubSlug, campSlug }}
                  >
                    {isFull
                      ? t("public.registerWaitlistCta", "Rejoindre la liste d'attente")
                      : t("public.registerCta", "S'inscrire à ce stage")}
                  </Link>
                </Button>
              </>
            );
          })()}
          {camp.registration_deadline && !deadlinePassed && (
            <p className="text-xs text-muted-foreground">
              {t("public.deadlineHint", "Date limite d'inscription : {{date}}", {
                date: new Date(camp.registration_deadline).toLocaleDateString(i18n.language, {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                }),
              })}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function InfoRow({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 text-sm text-foreground">
      <span className="text-muted-foreground">{icon}</span>
      <span>{children}</span>
    </div>
  );
}
