import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

type Reason =
  | "red_card"
  | "accumulated_yellow_cards"
  | "federation_sanction"
  | "club_sanction"
  | "other";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  clubId: string;
  /** Optional pre-selected player */
  playerId?: string;
  /** Optional pre-selected team */
  teamId?: string;
  onCreated?: () => void;
}

type PlayerRow = {
  id: string;
  first_name: string;
  last_name: string;
  team_id: string;
  team_name: string;
};

export function QuickSanctionDrawer({
  open,
  onOpenChange,
  clubId,
  playerId: initialPlayerId,
  teamId: initialTeamId,
  onCreated,
}: Props) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const qc = useQueryClient();

  const [playerId, setPlayerId] = useState<string>(initialPlayerId ?? "");
  const [teamId, setTeamId] = useState<string>(initialTeamId ?? "");
  const [reason, setReason] = useState<Reason>("red_card");
  const [matches, setMatches] = useState(1);
  const [startDate, setStartDate] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [notes, setNotes] = useState("");
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setPlayerId(initialPlayerId ?? "");
      setTeamId(initialTeamId ?? "");
      setReason("red_card");
      setMatches(1);
      setNotes("");
      setStartDate(new Date().toISOString().slice(0, 10));
      setSearch("");
    }
  }, [open, initialPlayerId, initialTeamId]);

  const { data: roster = [] } = useQuery({
    queryKey: ["club-players-with-teams", clubId],
    enabled: !!clubId && open,
    queryFn: async (): Promise<PlayerRow[]> => {
      const { data } = await supabase
        .from("team_members")
        .select(
          "team_id, teams:team_id(id, name, club_id, deleted_at), players:player_id(id, first_name, last_name, deleted_at)",
        )
        .order("team_id");
      const rows: PlayerRow[] = [];
      for (const r of (data ?? []) as any[]) {
        if (!r.teams || r.teams.club_id !== clubId || r.teams.deleted_at) continue;
        if (!r.players || r.players.deleted_at) continue;
        rows.push({
          id: r.players.id,
          first_name: r.players.first_name ?? "",
          last_name: r.players.last_name ?? "",
          team_id: r.teams.id,
          team_name: r.teams.name,
        });
      }
      return rows;
    },
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return roster;
    return roster.filter((r) =>
      `${r.first_name} ${r.last_name} ${r.team_name}`.toLowerCase().includes(q),
    );
  }, [roster, search]);

  // Auto-derive team from player when only one team
  useEffect(() => {
    if (!playerId) return;
    const teamsForPlayer = roster.filter((r) => r.id === playerId);
    if (teamsForPlayer.length === 1) setTeamId(teamsForPlayer[0].team_id);
  }, [playerId, roster]);

  const playerTeams = useMemo(
    () => roster.filter((r) => r.id === playerId),
    [roster, playerId],
  );

  async function onSubmit() {
    if (!playerId || !teamId) {
      toast.error(t("discipline.errors.missingSelection", { defaultValue: "Sélectionnez un joueur et une équipe." }));
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.from("player_suspensions").insert({
        player_id: playerId,
        team_id: teamId,
        club_id: clubId,
        suspension_reason: reason,
        matches_to_serve: matches,
        suspension_start_date: startDate,
        suspension_notes: notes || null,
        created_by: user?.id,
      });
      if (error) throw error;
      await supabase.from("audit_logs").insert({
        actor_user_id: user?.id,
        club_id: clubId,
        action: "suspension_created",
        entity_type: "player",
        entity_id: playerId,
      });
      const player = roster.find((r) => r.id === playerId);
      toast.success(
        t("notification.sanctionCreated", {
          defaultValue: "{{name}} a reçu une suspension de {{n}} match(s).",
          name: player ? `${player.first_name} ${player.last_name}` : "",
          n: matches,
        }),
      );
      qc.invalidateQueries({ queryKey: ["club-active-suspensions"] });
      qc.invalidateQueries({ queryKey: ["club-all-suspensions"] });
      qc.invalidateQueries({ queryKey: ["player-suspensions"] });
      qc.invalidateQueries({ queryKey: ["active-suspensions"] });
      qc.invalidateQueries({ queryKey: ["player-active-suspensions"] });
      onCreated?.();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message ?? "Error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{t("discipline.createSanction", { defaultValue: "Créer une sanction" })}</SheetTitle>
          <SheetDescription>
            {t("discipline.drawerHint", {
              defaultValue: "Renseigne le joueur et la sanction. La logique métier existante prend le relais.",
            })}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 space-y-4">
          <div className="space-y-1.5">
            <Label>{t("discipline.player", { defaultValue: "Joueur" })}</Label>
            <Input
              placeholder={t("discipline.searchPlayer", { defaultValue: "Rechercher…" })}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <Select value={playerId} onValueChange={setPlayerId}>
              <SelectTrigger>
                <SelectValue placeholder="—" />
              </SelectTrigger>
              <SelectContent className="max-h-64">
                {filtered.length === 0 && (
                  <div className="px-3 py-2 text-xs text-muted-foreground">
                    {t("discipline.noPlayer", { defaultValue: "Aucun joueur" })}
                  </div>
                )}
                {Array.from(new Map(filtered.map((r) => [r.id, r])).values()).map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.first_name} {r.last_name}{" "}
                    <span className="text-muted-foreground">· {r.team_name}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {playerTeams.length > 1 && (
            <div className="space-y-1.5">
              <Label>{t("teams.title", { defaultValue: "Équipe" })}</Label>
              <Select value={teamId} onValueChange={setTeamId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {playerTeams.map((r) => (
                    <SelectItem key={r.team_id} value={r.team_id}>
                      {r.team_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>{t("suspension.reason")}</Label>
            <Select value={reason} onValueChange={(v) => setReason(v as Reason)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(
                  [
                    "red_card",
                    "accumulated_yellow_cards",
                    "federation_sanction",
                    "club_sanction",
                    "other",
                  ] as Reason[]
                ).map((r) => (
                  <SelectItem key={r} value={r}>
                    {t(`suspension.reason_${r}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{t("suspension.matchesToServe")}</Label>
              <Input
                type="number"
                min={1}
                value={matches}
                onChange={(e) => setMatches(Math.max(1, Number(e.target.value) || 1))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t("suspension.startDate")}</Label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>{t("suspension.notes")}</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
          </div>
        </div>

        <SheetFooter className="mt-6 flex-row gap-2 sm:justify-end">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            {t("common.cancel", { defaultValue: "Annuler" })}
          </Button>
          <Button onClick={onSubmit} disabled={busy || !playerId || !teamId}>
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              t("discipline.createSanction", { defaultValue: "Créer une sanction" })
            )}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
