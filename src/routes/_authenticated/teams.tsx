import { createFileRoute, Link, Outlet, useRouterState, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useAuth, useActiveRole } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { SportSelect } from "@/components/sport-select";
import { Plus, Users, ChevronRight, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { EmptyState } from "@/components/empty-state";

export const Route = createFileRoute("/_authenticated/teams")({
  component: TeamsRoute,
  head: () => ({ meta: [{ title: "Teams — Clubero" }] }),
});

function TeamsRoute() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  if (pathname !== "/teams") return <Outlet />;
  return <TeamsPage />;
}

function TeamsPage() {
  const { t } = useTranslation();
  const { activeClubId } = useAuth();
  const role = useActiveRole();
  const isAdmin = role === "admin";
  const qc = useQueryClient();

  const { data: teams, isLoading } = useQuery({
    queryKey: ["teams-with-counts", activeClubId],
    enabled: !!activeClubId,
    queryFn: async () => {
      const { data: ts } = await supabase
        .from("teams")
        .select("id, name, season, sport, age_group, championship, competitions, image_url")
        .eq("club_id", activeClubId!)
        .order("name");
      if (!ts) return [];
      const { data: tm } = await supabase
        .from("team_members")
        .select("team_id, role")
        .in(
          "team_id",
          ts.map((t) => t.id),
        );
      const counts: Record<string, number> = {};
      (tm ?? []).forEach((m) => {
        counts[m.team_id] = (counts[m.team_id] ?? 0) + 1;
      });
      return ts.map((tm) => ({ ...tm, count: counts[tm.id] ?? 0 }));
    },
  });

  // Auto-redirect non-admin users with exactly 1 team straight to its detail page.
  const navigate = useNavigate();
  useEffect(() => {
    if (!isAdmin && teams && teams.length === 1) {
      navigate({ to: "/teams/$teamId", params: { teamId: teams[0].id }, replace: true });
    }
  }, [isAdmin, teams, navigate]);

  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [ageGroup, setAgeGroup] = useState("");
  const [championship, setChampionship] = useState("");
  const [sport, setSport] = useState("football");
  const [competitions, setCompetitions] = useState(["friendly", "championship", "cup"]);
  const [busy, setBusy] = useState(false);

  function toggleCompetition(value: string, checked: boolean) {
    setCompetitions((current) =>
      checked ? Array.from(new Set([...current, value])) : current.filter((c) => c !== value),
    );
  }

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    if (!activeClubId) return;
    setBusy(true);
    const { error } = await supabase.from("teams").insert({
      club_id: activeClubId,
      name,
      age_group: ageGroup || null,
      championship: championship || null,
      sport: sport || null,
      competitions,
    });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setOpen(false);
    setName("");
    setAgeGroup("");
    setChampionship("");
    setSport("football");
    setCompetitions(["friendly", "championship", "cup"]);
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
                <div className="space-y-1.5">
                  <Label>{t("teams.sport")}</Label>
                  <SportSelect value={sport} onValueChange={setSport} />
                </div>
                <div className="space-y-1.5">
                  <Label>{t("teams.ageGroup")}</Label>
                  <Input
                    value={ageGroup}
                    onChange={(e) => setAgeGroup(e.target.value)}
                    placeholder="U13"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>
                    {t("teams.championship")}{" "}
                    <span className="text-xs text-muted-foreground">({t("common.optional")})</span>
                  </Label>
                  <Input
                    value={championship}
                    onChange={(e) => setChampionship(e.target.value)}
                    placeholder="District D2"
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t("teams.competitions")}</Label>
                  <div className="grid grid-cols-3 gap-2">
                    {(["friendly", "championship", "cup"] as const).map((key) => (
                      <label
                        key={key}
                        className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-sm"
                      >
                        <Checkbox
                          checked={competitions.includes(key)}
                          onCheckedChange={(checked) => toggleCompetition(key, checked === true)}
                        />
                        {t(`events.competitionTypes.${key}`)}
                      </label>
                    ))}
                  </div>
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
        <EmptyState
          icon={<Users className="h-6 w-6" />}
          title={t("teams.noTeams")}
          description={
            isAdmin
              ? t("teams.emptyHintAdmin", { defaultValue: "Crée ta première équipe pour commencer à programmer entraînements et matchs." })
              : t("teams.emptyHintMember", { defaultValue: "Tu n'es membre d'aucune équipe pour le moment. Demande à un admin de t'ajouter." })
          }
          action={
            isAdmin ? (
              <Button size="sm" className="h-9" onClick={() => setOpen(true)}>
                <Plus className="h-4 w-4" />
                {t("teams.create")}
              </Button>
            ) : null
          }
        />
      ) : (
        <ul className="space-y-2">
          {teams.map((tm) => (
            <li key={tm.id}>
              <Link
                to="/teams/$teamId"
                params={{ teamId: tm.id }}
                className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3 active:scale-[0.99] transition-transform"
              >
                <div className="h-14 w-14 rounded-xl bg-muted shrink-0 overflow-hidden flex items-center justify-center">
                  {tm.image_url ? (
                    <img src={tm.image_url} alt={tm.name} className="h-full w-full object-cover" />
                  ) : (
                    <Users className="h-5 w-5 text-muted-foreground" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium truncate">{tm.name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {[tm.age_group, tm.championship, tm.sport].filter(Boolean).join(" · ")}
                    {tm.count > 0 && ` · ${tm.count} ${t("teams.members")}`}
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
