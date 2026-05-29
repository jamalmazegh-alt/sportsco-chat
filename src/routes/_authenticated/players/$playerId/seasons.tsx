import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMyRoles } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { AchievementBadge } from "@/components/player-journey/achievement-badge";

export const Route = createFileRoute("/_authenticated/players/$playerId/seasons")({
  component: SeasonsTab,
});

type Stat = { player_id: string; club_id: string; team_id: string | null; season_label: string;
  matches_count: number; goals_count: number; assists_count: number; attendance_rate: number | null };

function SeasonsTab() {
  const { playerId } = Route.useParams();
  const { t } = useTranslation();
  const roles = useMyRoles();
  const canEdit = roles.includes("admin") || roles.includes("coach");

  const { data: stats = [] } = useQuery({
    queryKey: ["season-stats", playerId],
    queryFn: async () => (await supabase.from("player_season_stats").select("*").eq("player_id", playerId).order("season_label", { ascending: false })).data as Stat[] ?? [],
  });

  const { data: notes = [] } = useQuery({
    queryKey: ["season-notes", playerId],
    queryFn: async () => (await supabase.from("player_seasons").select("*").eq("player_id", playerId)).data ?? [],
  });

  const { data: achievements = [] } = useQuery({
    queryKey: ["achievements", playerId],
    queryFn: async () => (await supabase.from("player_achievements").select("id,title,season_label,achievement_type,status").eq("player_id", playerId).eq("status", "confirmed")).data ?? [],
  });

  const { data: teams = [] } = useQuery({
    queryKey: ["season-teams"],
    queryFn: async () => (await supabase.from("teams").select("id,name,sport")).data ?? [],
  });
  const teamById = new Map(teams.map((t) => [t.id, t]));

  if (stats.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <div className="text-4xl mb-2">📅</div>
        <p className="font-medium">{t("journey.season.noneTitle")}</p>
        <p className="text-sm">{t("journey.season.noneHint")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3 pt-3">
      {stats.map((s) => {
        const note = notes.find((n) => n.season_label === s.season_label && n.club_id === s.club_id);
        const team = s.team_id ? teamById.get(s.team_id) : null;
        const seasonAch = achievements.filter((a) => a.season_label === s.season_label);
        return (
          <div key={`${s.season_label}-${s.team_id}`} className="rounded-2xl border bg-card p-4 space-y-3">
            <div>
              <div className="text-xl font-bold">{s.season_label}</div>
              {team && <div className="text-sm text-muted-foreground">{team.name}</div>}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
              <span>⚽ {t("journey.season.matches", { n: s.matches_count })}</span>
              <span>🥅 {t("journey.season.goals", { n: s.goals_count })}</span>
              <span>🅿️ {t("journey.season.assists", { n: s.assists_count })}</span>
              {s.attendance_rate != null && <span>📊 {t("journey.season.attendance", { n: s.attendance_rate })}</span>}
            </div>
            {seasonAch.length > 0 && (
              <div className="grid grid-cols-3 gap-2">
                {seasonAch.map((a) => (
                  <AchievementBadge key={a.id} type={a.achievement_type} title={a.title} className="p-2 text-xs" />
                ))}
              </div>
            )}
            <CoachNote
              playerId={playerId} clubId={s.club_id} seasonLabel={s.season_label} teamId={s.team_id}
              initial={note?.coach_summary ?? ""} noteId={note?.id ?? null} canEdit={canEdit}
            />
          </div>
        );
      })}
    </div>
  );
}

function CoachNote({ playerId, clubId, seasonLabel, teamId, initial, noteId, canEdit }: {
  playerId: string; clubId: string; seasonLabel: string; teamId: string | null;
  initial: string; noteId: string | null; canEdit: boolean;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [val, setVal] = useState(initial);
  const [busy, setBusy] = useState(false);
  useEffect(() => setVal(initial), [initial]);

  async function save() {
    setBusy(true);
    let error;
    if (noteId) {
      ({ error } = await supabase.from("player_seasons").update({ coach_summary: val }).eq("id", noteId));
    } else {
      ({ error } = await supabase.from("player_seasons").insert({
        player_id: playerId, club_id: clubId, season_label: seasonLabel, team_id: teamId, coach_summary: val,
      }));
    }
    setBusy(false);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["season-notes", playerId] });
  }

  if (!canEdit && !val) return null;
  if (!canEdit) return <div className="text-sm italic text-muted-foreground border-l-2 border-primary/30 pl-3">{val}</div>;

  return (
    <div className="space-y-2">
      <Textarea value={val} onChange={(e) => setVal(e.target.value)} placeholder={t("journey.season.coachSummaryPlaceholder")} rows={2} />
      {val !== initial && (
        <Button size="sm" onClick={save} disabled={busy}>
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : t("journey.season.save")}
        </Button>
      )}
    </div>
  );
}
