import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type ChampionshipRow = {
  id: string;
  name: string;
  season_label: string | null;
  is_active: boolean;
};

interface Props {
  teamId: string;
  value: string | null;
  onChange: (championshipId: string | null) => void;
  /** Snapshot on the event being edited: id + name of the linked championship,
   *  used to show the historical value even if archived / no longer active. */
  historical?: { id: string; name: string | null } | null;
  /** Called when the user hits the "add a championship" CTA on the empty state.
   *  Consumer typically persists a draft then navigates to the team page. */
  onNavigateToTeamSettings?: () => void;
  labelClassName?: string;
}

/**
 * Championship dropdown shared by the wizard and EventFormSheet.
 * Fetches active championships for the given team. Adds the historical
 * championship (if any) as a disabled entry when it's archived, so users
 * see the value linked to the event they're editing without accidentally
 * reusing an archived championship as a fresh selection.
 */
export function ChampionshipPicker({
  teamId,
  value,
  onChange,
  historical,
  onNavigateToTeamSettings,
  labelClassName,
}: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const { data: championships = [], isLoading } = useQuery({
    queryKey: ["team-championships", teamId, "active-plus-historical", historical?.id ?? null],
    enabled: Boolean(teamId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("team_championships" as never)
        .select("id, name, season_label, is_active")
        .eq("team_id", teamId)
        .order("is_active", { ascending: false })
        .order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as ChampionshipRow[];
    },
  });

  const activeChampionships = championships.filter((c) => c.is_active);
  const historicalArchived =
    historical?.id && championships.find((c) => c.id === historical.id && !c.is_active);

  // If the current value refers to a championship that no longer exists for
  // this team (team changed, championship deleted), clear it.
  useEffect(() => {
    if (!value) return;
    if (championships.length === 0) return;
    if (!championships.some((c) => c.id === value)) {
      onChange(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamId, championships.length]);

  if (isLoading) {
    return (
      <div className="space-y-1.5">
        <Label className={labelClassName}>{t("championships.championship")}</Label>
        <div className="text-xs text-muted-foreground">{t("common.loading")}</div>
      </div>
    );
  }

  if (activeChampionships.length === 0 && !historicalArchived) {
    return (
      <div className="space-y-1.5">
        <Label className={labelClassName}>{t("championships.championship")}</Label>
        <div className="rounded-lg border border-dashed border-border p-3 space-y-2">
          <p className="text-xs text-muted-foreground">{t("championships.noneActive")}</p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="w-full"
            onClick={() => {
              if (onNavigateToTeamSettings) {
                onNavigateToTeamSettings();
                return;
              }
              if (teamId) {
                navigate({ to: "/teams/$teamId", params: { teamId } });
              }
            }}
          >
            {t("championships.ctaAddToTeam")}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <Label className={labelClassName}>{t("championships.championship")}</Label>
      <Select value={value ?? ""} onValueChange={(v) => onChange(v || null)}>
        <SelectTrigger>
          <SelectValue placeholder={t("championships.select")} />
        </SelectTrigger>
        <SelectContent>
          {activeChampionships.map((c) => (
            <SelectItem key={c.id} value={c.id}>
              {c.name}
              {c.season_label ? ` · ${c.season_label}` : ""}
            </SelectItem>
          ))}
          {historicalArchived && (
            <SelectItem key={historicalArchived.id} value={historicalArchived.id} disabled>
              {historicalArchived.name}
              {historicalArchived.season_label ? ` · ${historicalArchived.season_label}` : ""}
              {" — "}
              {t("championships.archived")}
            </SelectItem>
          )}
        </SelectContent>
      </Select>
      {historical && !historical.id && historical.name && (
        <p className="text-[11px] text-muted-foreground">
          {t("championships.historical")}: {historical.name}
        </p>
      )}
    </div>
  );
}
