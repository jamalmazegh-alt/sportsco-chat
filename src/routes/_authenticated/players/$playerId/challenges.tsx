import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Loader2 } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getPlayerChallengeStats } from "@/lib/challenges/challenges.functions";
import i18n from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/players/$playerId/challenges")({
  component: PlayerChallengesTab,
  head: () => ({
    meta: [{ title: i18n.t("challenges:player_stats.title") }],
  }),
});

function PlayerChallengesTab() {
  const { playerId } = Route.useParams();
  const { t } = useTranslation("challenges");
  const load = useServerFn(getPlayerChallengeStats);
  const { data, isLoading } = useQuery({
    queryKey: ["player-challenge-stats", playerId],
    queryFn: () => load({ data: { playerId } }),
  });

  if (isLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }
  const items = data?.items ?? [];

  return (
    <div className="mx-auto max-w-2xl px-4 py-4">
      <div className="mb-4 flex items-center gap-2">
        <Button asChild variant="ghost" size="sm">
          <Link to="/players/$playerId" params={{ playerId }}>
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <h1 className="text-xl font-semibold">{t("player_stats.title")}</h1>
      </div>

      {items.length === 0 && (
        <Card>
          <CardContent className="p-6 text-center text-sm text-muted-foreground">
            {t("player_stats.no_data")}
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        {items.map(({ challenge, points, aggregate }) => (
          <Card key={challenge.id}>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <span>{challenge.icon}</span>
                <span className="flex-1 truncate">{challenge.name}</span>
                <span className="text-xs font-normal text-muted-foreground">
                  {t(`types.${challenge.kind}`)}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex items-baseline justify-between">
                <div>
                  <div className="text-xs uppercase text-muted-foreground">
                    {challenge.aggregate === "cumulative"
                      ? t("player_stats.aggregate_cumulative")
                      : t("player_stats.aggregate_record")}
                  </div>
                  <div className="text-2xl font-bold tabular-nums">{aggregate}</div>
                </div>
              </div>
              {points.length > 1 && (
                <div className="h-32 w-full">
                  <ResponsiveContainer>
                    <LineChart data={points}>
                      <XAxis dataKey="date" hide />
                      <YAxis hide domain={["auto", "auto"]} />
                      <Tooltip
                        contentStyle={{ fontSize: 12 }}
                        labelFormatter={(l) => String(l)}
                      />
                      <Line
                        type="monotone"
                        dataKey="value"
                        stroke="hsl(var(--primary))"
                        strokeWidth={2}
                        dot
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
