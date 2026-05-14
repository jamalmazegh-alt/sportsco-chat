import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useAuth, useActiveRole } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger,
} from "@/components/ui/sheet";
import { Plus, Users, ChevronRight, Loader2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/teams")({
  component: TeamsPage,
  head: () => ({ meta: [{ title: "Teams — Squadly" }] }),
});

function TeamsPage() {
  const { t } = useTranslation();
  const { activeClubId } = useAuth();
  const role = useActiveRole();
  const isAdmin = role === "admin";
  const isCoach = role === "coach" || role === "admin";
  const qc = useQueryClient();

  const { data: teams, isLoading } = useQuery({
    queryKey: ["teams-with-counts", activeClubId],
    enabled: !!activeClubId,
    queryFn: async () => {
      const { data: ts } = await supabase
        .from("teams")
        .select("id, name, season, sport, age_group")
        .eq("club_id", activeClubId!)
        .order("name");
      if (!ts) return [];
      const { data: tm } = await supabase
        .from("team_members")
        .select("team_id, role")
        .in("team_id", ts.map((t) => t.id));
      const counts: Record<string, number> = {};
      (tm ?? []).forEach((m) => {
        counts[m.team_id] = (counts[m.team_id] ?? 0) + 1;
      });
      return ts.map((tm) => ({ ...tm, count: counts[tm.id] ?? 0 }));
    },
  });

  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [season, setSeason] = useState("");
  const [sport, setSport] = useState("");
  const [ageGroup, setAgeGroup] = useState("");
  const [busy, setBusy] = useState(false);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    if (!activeClubId) return;
    setBusy(true);
    const { error } = await supabase
      .from("teams")
      .insert({ club_id: activeClubId, name, season: season || null, sport: sport || null, age_group: ageGroup || null });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setOpen(false);
    setName(""); setSeason(""); setSport(""); setAgeGroup("");
    qc.invalidateQueries({ queryKey: ["teams-with-counts"] });
    qc.invalidateQueries({ queryKey: ["teams"] });
  }

  return (
    <div className="px-5 pt-8 space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{t("teams.title")}</h1>
        {isAdmin && (
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button size="sm" className="h-9">
                <Plus className="h-4 w-4" />
                {t("teams.create")}
              </Button>
            </SheetTrigger>
            <SheetContent side="bottom" className="rounded-t-3xl">
              <SheetHeader>
                <SheetTitle>{t("teams.create")}</SheetTitle>
              </SheetHeader>
              <form onSubmit={onCreate} className="space-y-4 mt-4 pb-6">
                <div className="space-y-1.5">
                  <Label>{t("teams.name")}</Label>
                  <Input required value={name} onChange={(e) => setName(e.target.value)} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>{t("teams.season")}</Label>
                    <Input value={season} onChange={(e) => setSeason(e.target.value)} placeholder="2025–26" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>{t("teams.ageGroup")}</Label>
                    <Input value={ageGroup} onChange={(e) => setAgeGroup(e.target.value)} placeholder="U13" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>{t("teams.sport")}</Label>
                  <Input value={sport} onChange={(e) => setSport(e.target.value)} placeholder="Football" />
                </div>
                <Button type="submit" className="w-full h-11" disabled={busy}>
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : t("common.create")}
                </Button>
              </form>
            </SheetContent>
          </Sheet>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[0, 1].map((i) => (
            <div key={i} className="h-20 rounded-2xl bg-muted animate-pulse" />
          ))}
        </div>
      ) : !teams || teams.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center">
          <Users className="mx-auto h-10 w-10 text-muted-foreground mb-3" />
          <p className="text-sm text-muted-foreground">{t("teams.noTeams")}</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {teams.map((tm) => (
            <li
              key={tm.id}
              className="flex items-center justify-between rounded-2xl border border-border bg-card p-4"
            >
              <div className="min-w-0">
                <p className="font-medium truncate">{tm.name}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {[tm.season, tm.age_group, tm.sport].filter(Boolean).join(" · ")}
                  {tm.count > 0 && ` · ${tm.count} ${t("teams.members")}`}
                </p>
              </div>
              {isCoach && <TeamQuickAdd teamId={tm.id} clubId={activeClubId!} />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function TeamQuickAdd({ teamId, clubId }: { teamId: string; clubId: string }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [jersey, setJersey] = useState("");
  const [busy, setBusy] = useState(false);

  async function onAdd(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { data: player, error } = await supabase
      .from("players")
      .insert({
        club_id: clubId,
        first_name: first,
        last_name: last,
        jersey_number: jersey ? Number(jersey) : null,
      })
      .select("id")
      .single();
    if (error || !player) {
      setBusy(false);
      toast.error(error?.message ?? "Failed");
      return;
    }
    const { error: tmErr } = await supabase
      .from("team_members")
      .insert({ team_id: teamId, player_id: player.id, role: "player" });
    setBusy(false);
    if (tmErr) {
      toast.error(tmErr.message);
      return;
    }
    setOpen(false);
    setFirst(""); setLast(""); setJersey("");
    qc.invalidateQueries({ queryKey: ["teams-with-counts"] });
    toast.success(t("teams.addPlayer"));
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button size="sm" variant="ghost" className="h-9">
          <Plus className="h-4 w-4" />
          <ChevronRight className="h-4 w-4" />
        </Button>
      </SheetTrigger>
      <SheetContent side="bottom" className="rounded-t-3xl">
        <SheetHeader>
          <SheetTitle>{t("teams.addPlayer")}</SheetTitle>
        </SheetHeader>
        <form onSubmit={onAdd} className="space-y-4 mt-4 pb-6">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{t("players.firstName")}</Label>
              <Input required value={first} onChange={(e) => setFirst(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("players.lastName")}</Label>
              <Input required value={last} onChange={(e) => setLast(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>{t("players.jerseyNumber")}</Label>
            <Input type="number" value={jersey} onChange={(e) => setJersey(e.target.value)} />
          </div>
          <Button type="submit" className="w-full h-11" disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : t("common.create")}
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}
