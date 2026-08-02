import { createFileRoute, Link, Outlet, useRouterState, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useAuth, useActiveRole, useMyRoles } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { ResponsiveFormDialog } from "@/components/responsive-form-dialog";
import { SportSelect } from "@/components/sport-select";
import { AgeGroupSelect } from "@/components/age-group-select";
import { isCanonicalTeamAgeCategory } from "@/lib/team-age-group";
import { Plus, Users, ChevronRight, Loader2, BarChart3 } from "lucide-react";
import { toast } from "sonner";
import { EmptyState } from "@/components/empty-state";
import { avatarGradient, initialsFrom } from "@/lib/avatar-color";
import { CallUpVisibilitySelector } from "@/components/call-up-visibility-selector";
import { useSetCallUpVisibility } from "@/hooks/use-call-up-visibility";

import i18n from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/teams")({
  component: TeamsRoute,
  head: () => ({
    meta: [
      { title: i18n.t("meta.teams.title") },
      { name: "description", content: i18n.t("meta.teams.description") },
    ],
  }),
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
  const roles = useMyRoles();
  const isAdmin = roles.includes("admin");
  const qc = useQueryClient();

  const [showArchived, setShowArchived] = useState(false);

  const { data: teams, isLoading } = useQuery({
    queryKey: ["teams-with-counts", activeClubId, isAdmin && showArchived],
    enabled: !!activeClubId,
    queryFn: async () => {
      let q = supabase
        .from("teams")
        .select(
          "id, name, season, sport, age_group, championship, competitions, image_url, archived_at",
        )
        .eq("club_id", activeClubId!)
        .eq("is_internal", false)
        .is("deleted_at", null)
        .order("name");
      if (!isAdmin || !showArchived) q = q.is("archived_at", null);
      const { data: ts } = await q;
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

  const [sport, setSport] = useState("football");
  const [competitions, setCompetitions] = useState(["friendly", "championship", "cup"]);
  const [callUpVisibility, setCallUpVisibility] = useState<"inherit" | "visible" | "masked">(
    "inherit",
  );
  const [busy, setBusy] = useState(false);
  const setVisibility = useSetCallUpVisibility();

  function toggleCompetition(value: string, checked: boolean) {
    setCompetitions((current) =>
      checked ? Array.from(new Set([...current, value])) : current.filter((c) => c !== value),
    );
  }

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    if (!activeClubId) return;
    if (!isCanonicalTeamAgeCategory(ageGroup)) {
      toast.error(
        t("teams.ageGroupRequired", {
          defaultValue: "Choisissez une catégorie d'âge dans la liste.",
        }),
      );
      return;
    }
    setBusy(true);
    const { data: created, error } = await supabase
      .from("teams")
      .insert({
        club_id: activeClubId,
        name,
        age_group: ageGroup,
        sport: sport || null,
        competitions,
      })
      .select("id")
      .single();
    if (error || !created) {
      setBusy(false);
      toast.error(error?.message ?? "Error");
      return;
    }
    if (callUpVisibility !== "inherit") {
      try {
        await setVisibility.mutateAsync({
          scope: "team",
          id: created.id,
          choice: callUpVisibility,
        });
      } catch (err) {
        toast.error((err as Error).message);
      }
    }
    setBusy(false);
    setOpen(false);
    setName("");
    setAgeGroup("");

    setSport("football");
    setCompetitions(["friendly", "championship", "cup"]);
    setCallUpVisibility("inherit");
    qc.invalidateQueries({ queryKey: ["teams-with-counts"] });
    qc.invalidateQueries({ queryKey: ["teams"] });
  }

  return (
    <div className="px-5 pt-8 space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{t("teams.title")}</h1>
        {isAdmin && (
          <ResponsiveFormDialog
            open={open}
            onOpenChange={setOpen}
            trigger={
              <Button size="sm" className="h-9">
                <Plus className="h-4 w-4" />
                {t("teams.create")}
              </Button>
            }
            title={t("teams.create")}
          >
            <form onSubmit={onCreate} className="space-y-4 mt-4 pb-6">
              <div className="space-y-1.5">
                <Label>{t("teams.name")}</Label>
                <Input
                  data-testid="team-name-input"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>{t("teams.sport")}</Label>
                <SportSelect value={sport} onValueChange={setSport} />
              </div>
              <div className="space-y-1.5">
                <Label>{t("teams.ageGroup")}</Label>
                <AgeGroupSelect value={ageGroup} onValueChange={setAgeGroup} allowEmpty={false} />
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
              <div className="rounded-xl border border-border bg-card px-3 py-3">
                <CallUpVisibilitySelector
                  level="team"
                  id=""
                  isStaff
                  value={callUpVisibility}
                  onChange={setCallUpVisibility}
                />
              </div>
              <Button type="submit" className="w-full h-11" disabled={busy}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : t("common.create")}
              </Button>
            </form>
          </ResponsiveFormDialog>
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
          description={isAdmin ? t("teams.emptyHintAdmin") : t("teams.emptyHintMember")}
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
        <>
          {isAdmin && (
            <label className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-3 py-2 text-sm">
              <span className="text-muted-foreground">{t("teams.showArchived")}</span>
              <Switch checked={showArchived} onCheckedChange={setShowArchived} />
            </label>
          )}

          {(() => {
            const grouped = new Map<string, typeof teams>();
            const showGroups = isAdmin && showArchived;
            if (showGroups) {
              for (const tm of teams) {
                const key = tm.season || "—";
                if (!grouped.has(key)) grouped.set(key, [] as typeof teams);
                grouped.get(key)!.push(tm);
              }
            } else {
              grouped.set("__", teams);
            }
            const entries = Array.from(grouped.entries()).sort((a, b) => {
              if (a[0] === "—") return 1;
              if (b[0] === "—") return -1;
              return b[0].localeCompare(a[0]);
            });
            return (
              <div className="space-y-4">
                {entries.map(([season, list]) => (
                  <div key={season} className="space-y-2">
                    {showGroups && (
                      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground px-1">
                        {season === "—" ? "—" : t("teams.seasonGroupLabel", { season })}
                      </h2>
                    )}
                    <ul className="space-y-2">
                      {list.map((tm) => (
                        <li key={tm.id}>
                          <Link
                            to="/teams/$teamId"
                            params={{ teamId: tm.id }}
                            className={`flex items-center gap-3 rounded-2xl border border-border bg-card p-3 active:scale-[0.99] transition-transform ${tm.archived_at ? "opacity-70" : ""}`}
                          >
                            <div className="h-14 w-14 rounded-xl shrink-0 overflow-hidden flex items-center justify-center shadow-sm">
                              {tm.image_url ? (
                                <img
                                  src={tm.image_url}
                                  alt={tm.name}
                                  className="h-full w-full object-cover"
                                />
                              ) : (
                                <div
                                  className={`h-full w-full flex items-center justify-center text-sm font-bold tracking-tight ${avatarGradient(tm.id)}`}
                                >
                                  {initialsFrom(tm.name)}
                                </div>
                              )}
                            </div>

                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <p className="font-medium truncate">{tm.name}</p>
                                {tm.archived_at && (
                                  <Badge variant="secondary" className="shrink-0 text-[10px]">
                                    {t("teams.badgeArchived")}
                                  </Badge>
                                )}
                              </div>
                              <p className="text-xs text-muted-foreground mt-0.5">
                                {[tm.age_group, tm.championship, tm.sport]
                                  .filter(Boolean)
                                  .join(" · ")}
                                {tm.count > 0 && ` · ${tm.count} ${t("teams.members")}`}
                              </p>
                            </div>
                            <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}

                {isAdmin && teams.length < 3 && !showArchived && (
                  <button
                    type="button"
                    onClick={() => setOpen(true)}
                    className="group w-full flex items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-border bg-muted/30 px-4 py-5 text-sm font-medium text-muted-foreground hover:text-primary hover:border-primary/40 hover:bg-primary/5 active:scale-[0.99] transition-all"
                  >
                    <Plus className="h-4 w-4 transition-transform group-hover:rotate-90" />
                    {t("teams.create")}
                  </button>
                )}
              </div>
            );
          })()}

          <Link
            to="/stats"
            className="mt-4 flex items-center gap-3 rounded-2xl border border-border bg-card p-4 active:scale-[0.99] transition-transform hover:bg-accent/40"
          >
            <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <BarChart3 className="h-5 w-5 text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">
                {t("nav.viewStats", { defaultValue: "Voir les statistiques" })}
              </p>
              <p className="text-xs text-muted-foreground">{t("nav.stats")}</p>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
          </Link>
        </>
      )}
    </div>
  );
}
