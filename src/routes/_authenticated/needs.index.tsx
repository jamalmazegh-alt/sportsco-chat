import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import { HandHelping, ChevronRight, Users } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { listMyOpenNeeds } from "@/lib/needs/needs.functions";
import { fmt } from "@/lib/date-locale";

export const Route = createFileRoute("/_authenticated/needs/")({
  head: () => ({
    meta: [
      { title: "Coups de main · Clubero" },
      { name: "description", content: "Besoins en volontaires du club" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: NeedsFeedPage,
});

function NeedsFeedPage() {
  const { t } = useTranslation();
  const listFn = useServerFn(listMyOpenNeeds);
  const { data, isLoading } = useQuery({
    queryKey: ["my-open-needs"],
    queryFn: () => listFn({ data: {} }),
  });

  const needs = (data?.needs ?? []) as any[];

  return (
    <div className="max-w-3xl mx-auto p-4 space-y-4">
      <div className="flex items-center gap-2">
        <HandHelping className="h-5 w-5 text-primary" />
        <h1 className="text-xl font-extrabold tracking-tight">
          {t("needs:feed.title", { defaultValue: "Coups de main" })}
        </h1>
      </div>
      <p className="text-sm text-muted-foreground">
        {t("needs:feed.desc", {
          defaultValue:
            "Besoins ouverts qui vous sont adressés. Cliquez pour candidater depuis la page de l'évènement.",
        })}
      </p>

      {isLoading && <p className="text-sm text-muted-foreground">…</p>}

      {!isLoading && needs.length === 0 && (
        <Card>
          <CardContent className="p-6 text-center text-sm text-muted-foreground">
            {t("needs:feed.empty", { defaultValue: "Aucun besoin ouvert pour vous en ce moment." })}
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        {needs.map((n) => (
          <Link key={n.id} to="/events/$eventId" params={{ eventId: n.event_id }} className="block">
            <Card className="hover:bg-muted/30 transition-colors">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <CardTitle className="text-sm font-semibold">{n.label}</CardTitle>
                    <p className="text-xs text-muted-foreground mt-1 truncate">
                      {n.events?.title}
                      {n.events?.starts_at && (
                        <span className="ml-2">· {fmt(n.events.starts_at, "PPP p")}</span>
                      )}
                    </p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                </div>
              </CardHeader>
              <CardContent className="pt-0 flex items-center gap-2 flex-wrap text-xs">
                <span className="inline-flex items-center gap-1 text-muted-foreground">
                  <Users className="h-3.5 w-3.5" />
                  {n.remaining_seats === 0
                    ? t("needs:seats.full")
                    : t("needs:seats.remaining", { count: n.remaining_seats })}
                </span>
                {n.my_signup && (
                  <Badge variant="outline" className="text-[10px]">
                    {t(`needs:signup.${n.my_signup.status}`)}
                  </Badge>
                )}
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
