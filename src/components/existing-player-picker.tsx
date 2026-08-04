import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Plus, UserCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type ClubPlayer = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  jersey_number: number | null;
  photo_url: string | null;
  otherTeams: { id: string; name: string }[];
};

export function ExistingPlayerPicker({
  clubId,
  teamId,
  onDone,
}: {
  clubId: string;
  teamId: string;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["existing-player-picker", clubId, teamId],
    queryFn: async (): Promise<ClubPlayer[]> => {
      // Team members already in the CURRENT team → to exclude.
      const { data: currentTm } = await supabase
        .from("team_members")
        .select("player_id")
        .eq("team_id", teamId)
        .eq("role", "player");
      const excluded = new Set((currentTm ?? []).map((r: any) => r.player_id));

      // All players of the club.
      const { data: allPlayers } = await supabase
        .from("players")
        .select("id, first_name, last_name, jersey_number, photo_url")
        .eq("club_id", clubId)
        .is("deleted_at", null)
        .order("last_name", { ascending: true });
      const candidates = (allPlayers ?? []).filter((p: any) => !excluded.has(p.id));
      if (candidates.length === 0) return [];

      // Fetch the OTHER team memberships for these candidates to display badges.
      const ids = candidates.map((p: any) => p.id);
      const { data: memberships } = await supabase
        .from("team_members")
        .select("player_id, teams:team_id(id, name)")
        .in("player_id", ids)
        .eq("role", "player");
      const byPlayer = new Map<string, { id: string; name: string }[]>();
      for (const row of (memberships ?? []) as any[]) {
        const tm = row.teams;
        if (!tm || tm.id === teamId) continue;
        const arr = byPlayer.get(row.player_id) ?? [];
        arr.push({ id: tm.id, name: tm.name });
        byPlayer.set(row.player_id, arr);
      }
      return candidates.map((p: any) => ({
        ...p,
        otherTeams: byPlayer.get(p.id) ?? [],
      }));
    },
  });

  const filtered = useMemo(() => {
    const list = data ?? [];
    const needle = q.trim().toLowerCase();
    if (!needle) return list;
    return list.filter((p) =>
      `${p.first_name ?? ""} ${p.last_name ?? ""}`.toLowerCase().includes(needle),
    );
  }, [data, q]);

  function toggle(id: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function onAttach() {
    if (selected.size === 0) return;
    setBusy(true);
    const rows = Array.from(selected).map((player_id) => ({
      team_id: teamId,
      player_id,
      role: "player" as const,
    }));
    // Insert one by one to isolate 23505 duplicates from real errors.
    let attached = 0;
    let alreadyIn = 0;
    let failed = 0;
    for (const row of rows) {
      const { error } = await supabase.from("team_members").insert(row);
      if (!error) {
        attached += 1;
      } else if ((error as any).code === "23505") {
        alreadyIn += 1;
      } else {
        failed += 1;
      }
    }
    setBusy(false);
    if (attached > 0) {
      toast.success(t("players.existingAttached", { count: attached }));
    }
    if (alreadyIn > 0) {
      toast.warning(t("players.alreadyInTeam"));
    }
    if (failed > 0) {
      toast.error(t("common.error"));
    }
    qc.invalidateQueries({ queryKey: ["team-players", teamId] });
    qc.invalidateQueries({ queryKey: ["teams-with-counts"] });
    qc.invalidateQueries({ queryKey: ["existing-player-picker", clubId, teamId] });
    if (attached > 0) onDone();
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">{t("players.existingHint")}</p>
      <Input placeholder={t("common.search")} value={q} onChange={(e) => setQ(e.target.value)} />
      {isLoading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-14 rounded-2xl bg-muted animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center">
          <UserCircle2 className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">{t("players.existingEmpty")}</p>
        </div>
      ) : (
        <ul className="space-y-2 max-h-[50vh] overflow-y-auto pr-1">
          {filtered.map((p) => {
            const checked = selected.has(p.id);
            return (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => toggle(p.id)}
                  className={cn(
                    "w-full flex items-center gap-3 rounded-2xl border bg-card p-3 text-left transition-colors",
                    checked ? "border-primary ring-1 ring-primary/30" : "border-border",
                  )}
                >
                  <Checkbox checked={checked} className="shrink-0" />
                  <div className="h-10 w-10 shrink-0 rounded-full bg-muted overflow-hidden">
                    {p.photo_url ? (
                      <img src={p.photo_url} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="h-full w-full flex items-center justify-center text-xs font-semibold text-muted-foreground">
                        {(p.first_name?.[0] ?? "") + (p.last_name?.[0] ?? "")}
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium truncate">
                      {p.first_name} {p.last_name}
                      {p.jersey_number ? (
                        <span className="text-muted-foreground font-normal">
                          {" "}
                          · #{p.jersey_number}
                        </span>
                      ) : null}
                    </p>
                    {p.otherTeams.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                          {t("players.existingAlreadyIn")}
                        </span>
                        {p.otherTeams.map((tm) => (
                          <span
                            key={tm.id}
                            className="inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-accent text-accent-foreground"
                          >
                            {tm.name}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <Button
        type="button"
        className="w-full h-11"
        disabled={busy || selected.size === 0}
        onClick={onAttach}
      >
        {busy ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <>
            <Plus className="h-4 w-4" />
            {t("players.existingAttach")}
            {selected.size > 0 ? ` (${selected.size})` : ""}
          </>
        )}
      </Button>
    </div>
  );
}
