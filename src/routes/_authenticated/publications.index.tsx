import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import { Megaphone, Plus, BarChart3, MessageSquare, Lock, CheckCircle2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BackLink } from "@/components/back-link";
import { listPublications } from "@/lib/publications/publications.functions";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/_authenticated/publications/")({
  head: () => ({
    meta: [
      { title: "Publications · Clubero" },
      { name: "description", content: "Communications et sondages du club" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PublicationsListPage,
});

function PublicationsListPage() {
  const { t } = useTranslation();
  const { activeClubId } = useAuth();
  const listFn = useServerFn(listPublications);

  const { data, isLoading } = useQuery({
    queryKey: ["publications", activeClubId],
    queryFn: () => listFn({ data: { clubId: activeClubId!, limit: 50 } }),
    enabled: !!activeClubId,
  });

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-4">
      <BackLink to="/home" label={t("common.back", "Accueil")} />
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Megaphone className="h-5 w-5 text-primary" />
          <h1 className="text-xl font-semibold">{t("publications:list.title", "Publications")}</h1>
        </div>
        <Button asChild size="sm">
          <Link to="/publications/new">
            <Plus className="h-4 w-4 mr-1.5" />
            {t("publications:list.new", "Nouvelle publication")}
          </Link>
        </Button>
      </div>

      {isLoading ? (
        <div className="text-sm text-muted-foreground">{t("common.loading", "Chargement…")}</div>
      ) : !data?.publications?.length ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            {t("publications:list.empty", "Aucune publication pour le moment.")}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {data.publications.map((p: any) => (
            <Link
              key={p.id}
              to="/publications/$publicationId"
              params={{ publicationId: p.id }}
              className="block"
            >
              <Card className="hover:border-primary/40 transition-colors">
                <CardContent className="py-4 flex items-start gap-3">
                  <div className="mt-0.5 shrink-0">
                    {p.publication_type === "poll" ? (
                      <BarChart3 className="h-5 w-5 text-primary" />
                    ) : (
                      <MessageSquare className="h-5 w-5 text-muted-foreground" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="font-medium truncate">{p.title}</div>
                      {p.publication_type === "poll" && p.poll_visibility === "anonymous" && (
                        <Badge variant="outline" className="gap-1">
                          <Lock className="h-3 w-3" />
                          {t("publications:list.anonymous", "Anonyme")}
                        </Badge>
                      )}
                      {p.closed_at && (
                        <Badge variant="secondary" className="gap-1">
                          <CheckCircle2 className="h-3 w-3" />
                          {t("publications:list.closed", "Fermé")}
                        </Badge>
                      )}
                    </div>
                    {p.content && (
                      <div className="text-sm text-muted-foreground line-clamp-2 mt-1">
                        {p.content}
                      </div>
                    )}
                    <div className="text-xs text-muted-foreground mt-1.5">
                      {new Date(p.published_at).toLocaleString()}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
