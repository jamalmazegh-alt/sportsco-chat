import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Loader2 } from "lucide-react";
import { AggregateBadge } from "@/components/challenge-badges";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PlayerAttendanceStats } from "@/components/player-attendance-stats";
import { AttendanceHeatmap } from "@/components/attendance-heatmap";
import { getPlayerChallengeStats } from "@/lib/challenges/challenges.functions";
import { challengeDisplayName } from "@/lib/challenges/display";
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

      <div className="mb-4 space-y-3">
        <PlayerAttendanceStats playerId={playerId} />
        <AttendanceHeatmap playerId={playerId} />
      </div>

      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
        {t("list.title")}
      </h2>

      {items.length === 0 && (
        <Card>
          <CardContent className="p-6 text-center text-sm text-muted-foreground">
            {t("player_stats.no_data")}
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        {items.map(({ challenge, points, aggregate }) => {
          return (
            <Card key={challenge.id}>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <span>{challenge.icon}</span>
                  <span className="flex-1 truncate">{challengeDisplayName(challenge, t)}</span>
                </CardTitle>
                <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                  <AggregateBadge
                    type={challenge.aggregate === "cumulative" ? "cumulative" : "record"}
                    value={aggregate}
                  />
                  <span>·</span>
                  <span>{t(`types.${challenge.kind}`)}</span>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {points.length > 0 && (
                  <div className="h-40 w-full">
                    <ResponsiveContainer>
                      <LineChart data={points} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
                        <CartesianGrid
                          strokeDasharray="3 3"
                          stroke="var(--border)"
                          vertical={false}
                        />
                        <XAxis
                          dataKey="date"
                          tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                          tickFormatter={(v: string) => {
                            if (!v) return "";
                            const [, m, d] = v.split("-");
                            return `${d}/${m}`;
                          }}
                          minTickGap={16}
                        />
                        <YAxis
                          width={28}
                          tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                          domain={["auto", "auto"]}
                        />
                        <Tooltip
                          contentStyle={{ fontSize: 12 }}
                          labelFormatter={(l) => String(l)}
                        />
                        <Line
                          type="monotone"
                          dataKey="value"
                          stroke="var(--primary)"
                          strokeWidth={2}
                          dot={{ r: 4 }}
                          activeDot={{ r: 6 }}
                          isAnimationActive={false}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
