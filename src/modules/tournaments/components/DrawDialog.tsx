import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DestructiveConfirmSheet } from "@/components/destructive-confirm-sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dices, Loader2, Shuffle, Hand, Sparkles, RotateCcw, Trophy, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { applyTeamDraw } from "../tournaments.functions";

interface TeamLite {
  id: string;
  name: string;
  short_name?: string | null;
  logo_url?: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tournamentId: string;
  format: "group" | "knockout" | "mixed";
  status: string;
  teams: TeamLite[];
  hasExistingDraw: boolean;
}

type DrawMode = "auto" | "progressive" | "manual";

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function nextPow2(n: number) {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

export function DrawDialog({
  open,
  onOpenChange,
  tournamentId,
  format,
  status,
  teams,
  hasExistingDraw,
}: Props) {
  const { t } = useTranslation("tournaments");
  const qc = useQueryClient();
  const applyFn = useServerFn(applyTeamDraw);


  const supportsGroups = format !== "knockout";
  const drawMode: "groups" | "knockout" = supportsGroups ? "groups" : "knockout";

  const [mode, setMode] = useState<DrawMode>("auto");
  const [numGroups, setNumGroups] = useState(Math.max(2, Math.min(4, Math.floor(teams.length / 2) || 2)));
  // B-03 — keep raw string buffers so users can clear the input freely.
  const [numGroupsRaw, setNumGroupsRaw] = useState(String(Math.max(2, Math.min(4, Math.floor(teams.length / 2) || 2))));
  const [qualifiers, setQualifiers] = useState(2);
  const [qualifiersRaw, setQualifiersRaw] = useState("2");
  const [thirdPlace, setThirdPlace] = useState(false);

  // Animation state
  const [drawing, setDrawing] = useState(false);
  const [revealed, setRevealed] = useState<Array<{ teamId: string; slotIndex: number }>>([]);
  const [pool, setPool] = useState<TeamLite[]>([]); // remaining teams to draw
  const [rouletteIdx, setRouletteIdx] = useState(0);
  const [finished, setFinished] = useState(false);
  const rouletteRef = useRef<number | null>(null);

  // Manual mode state: teamId -> slotIndex
  const [manualAssign, setManualAssign] = useState<Record<string, number | null>>({});

  // Confirm reset
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<null | (() => void)>(null);

  const numSlots = drawMode === "groups" ? numGroups : nextPow2(Math.max(2, teams.length));

  useEffect(() => {
    if (!open) return;
    // Reset state on open
    setMode("auto");
    setRevealed([]);
    setPool([]);
    setFinished(false);
    setDrawing(false);
    const init: Record<string, number | null> = {};
    teams.forEach((t) => (init[t.id] = null));
    setManualAssign(init);
  }, [open, teams]);

  useEffect(() => {
    return () => {
      if (rouletteRef.current) window.clearInterval(rouletteRef.current);
    };
  }, []);

  // ---------- Apply mutation
  const applyMut = useMutation({
    mutationFn: async (
      payload:
        | {
            mode: "groups";
            assignments: { team_id: string; group_index: number }[];
          }
        | { mode: "knockout"; bracket_order: string[] },
    ) => {
      if (payload.mode === "groups") {
        return applyFn({
          data: {
            tournament_id: tournamentId,
            mode: "groups",
            num_groups: numGroups,
            qualifiers_per_group: qualifiers,
            assignments: payload.assignments,
          },
        });
      }
      return applyFn({
        data: {
          tournament_id: tournamentId,
          mode: "knockout",
          bracket_order: payload.bracket_order,
          third_place: thirdPlace,
        },
      });
    },
    onSuccess: () => {
      toast.success(t("draw.doneToast"));
      qc.invalidateQueries({ queryKey: ["tournament", tournamentId] });
      setFinished(true);
    },
    onError: (e: any) => toast.error(e?.message ?? t("draw.errorToast")),
  });


  // ---------- Build a randomized auto-distribution
  function buildRandomAssignments(): { team_id: string; group_index: number }[] {
    const shuffled = shuffle(teams);
    if (drawMode === "groups") {
      // Snake distribution to balance group sizes
      return shuffled.map((t, idx) => {
        const cycle = Math.floor(idx / numGroups);
        const pos = idx % numGroups;
        const groupIndex = cycle % 2 === 0 ? pos : numGroups - 1 - pos;
        return { team_id: t.id, group_index: groupIndex };
      });
    }
    return shuffled.map((t, idx) => ({ team_id: t.id, group_index: idx }));
  }

  function maybeConfirm(action: () => void) {
    if (hasExistingDraw) {
      setPendingAction(() => action);
      setConfirmOpen(true);
    } else {
      action();
    }
  }

  // ---------- AUTO
  function runAuto() {
    const assignments = buildRandomAssignments();
    if (drawMode === "groups") {
      applyMut.mutate({ mode: "groups", assignments });
    } else {
      applyMut.mutate({
        mode: "knockout",
        bracket_order: assignments.map((a) => a.team_id),
      });
    }
  }

  // ---------- PROGRESSIVE
  function startProgressive() {
    setRevealed([]);
    setFinished(false);
    setPool(shuffle(teams));
    setDrawing(true);
  }

  function drawNext() {
    if (pool.length === 0) return;
    if (rouletteRef.current) window.clearInterval(rouletteRef.current);
    // Spin animation
    let ticks = 0;
    const totalTicks = 18 + Math.floor(Math.random() * 8);
    rouletteRef.current = window.setInterval(() => {
      setRouletteIdx((i) => (i + 1) % Math.max(1, pool.length));
      ticks++;
      if (ticks >= totalTicks) {
        if (rouletteRef.current) window.clearInterval(rouletteRef.current);
        rouletteRef.current = null;
        // Pick first team in current (shuffled) pool
        const picked = pool[0];
        const idx = revealed.length;
        const slotIndex =
          drawMode === "groups"
            ? (() => {
                // snake
                const cycle = Math.floor(idx / numGroups);
                const pos = idx % numGroups;
                return cycle % 2 === 0 ? pos : numGroups - 1 - pos;
              })()
            : idx;
        const next = [...revealed, { teamId: picked.id, slotIndex }];
        setRevealed(next);
        const newPool = pool.slice(1);
        setPool(newPool);
        if (newPool.length === 0) {
          // Apply
          if (drawMode === "groups") {
            applyMut.mutate({
              mode: "groups",
              assignments: next.map((r) => ({ team_id: r.teamId, group_index: r.slotIndex })),
            });
          } else {
            applyMut.mutate({
              mode: "knockout",
              bracket_order: next.map((r) => r.teamId),
            });
          }
          setDrawing(false);
        }
      }
    }, 70);
  }

  // ---------- MANUAL
  function runManual() {
    if (drawMode === "groups") {
      const assignments: { team_id: string; group_index: number }[] = [];
      for (const team of teams) {
        const g = manualAssign[team.id];
        if (g === null || g === undefined) {
          toast.error(t("draw.missingTeamError", { name: team.name }));
          return;
        }
        assignments.push({ team_id: team.id, group_index: g });
      }
      applyMut.mutate({ mode: "groups", assignments });
    } else {
      // Use slotIndex as bracket position (0..numSlots-1)
      const ordered: (string | null)[] = Array.from({ length: teams.length }, () => null);
      const used = new Set<number>();
      for (const team of teams) {
        const slot = manualAssign[team.id];
        if (slot === null || slot === undefined) {
          toast.error(t("draw.missingTeamError", { name: team.name }));
          return;
        }
        if (used.has(slot)) {
          toast.error(t("draw.duplicatePositionError"));
          return;
        }
        used.add(slot);
        ordered[slot] = team.id;
      }
      const order = ordered.filter((x): x is string => x !== null);
      applyMut.mutate({ mode: "knockout", bracket_order: order });
    }
  }


  // ---------- Render
  const slotsArray = Array.from({ length: numSlots }, (_, i) => i);
  const slotLabel = (i: number) =>
    drawMode === "groups"
      ? t("draw.groupLabel", { letter: String.fromCharCode(65 + i) })
      : t("draw.positionLabel", { n: i + 1 });


  const canDraw = teams.length >= 2;
  const tournamentStarted = ["in_progress", "completed"].includes(status);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Dices className="h-5 w-5 text-primary" />
              {t("draw.title")}
            </DialogTitle>
            <DialogDescription>
              {drawMode === "groups" ? t("draw.descGroups") : t("draw.descKnockout")}
            </DialogDescription>
          </DialogHeader>

          {!canDraw && (
            <div className="rounded-lg border border-dashed border-border bg-muted/30 p-6 text-center">
              <Dices className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                {t("draw.emptyHint")}
              </p>
            </div>
          )}

          {canDraw && tournamentStarted && (
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300">
              {t("draw.startedWarn")}
            </div>
          )}


          {canDraw && (
            <>
              {/* Format settings */}
              <div className="space-y-2">
                {drawMode === "groups" ? (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label>{t("draw.numGroups")}</Label>
                      <Input
                        type="number"
                        inputMode="numeric"
                        min={1}
                        max={Math.min(16, Math.floor(teams.length / 2))}
                        value={numGroupsRaw}
                        onChange={(e) => {
                          const v = e.target.value;
                          setNumGroupsRaw(v);
                          const n = parseInt(v, 10);
                          if (Number.isFinite(n) && n >= 1) setNumGroups(n);
                        }}
                        onBlur={() => {
                          const n = parseInt(numGroupsRaw, 10);
                          const maxN = Math.min(16, Math.max(1, Math.floor(teams.length / 2)));
                          const clamped = Number.isFinite(n) ? Math.min(maxN, Math.max(1, n)) : 1;
                          setNumGroups(clamped);
                          setNumGroupsRaw(String(clamped));
                        }}
                        disabled={drawing}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>{t("draw.qualifiersPerGroup")}</Label>
                      <Input
                        type="number"
                        inputMode="numeric"
                        min={1}
                        max={8}
                        value={qualifiersRaw}
                        onChange={(e) => {
                          const v = e.target.value;
                          setQualifiersRaw(v);
                          const n = parseInt(v, 10);
                          if (Number.isFinite(n) && n >= 1) setQualifiers(n);
                        }}
                        onBlur={() => {
                          const n = parseInt(qualifiersRaw, 10);
                          const clamped = Number.isFinite(n) ? Math.min(8, Math.max(1, n)) : 1;
                          setQualifiers(clamped);
                          setQualifiersRaw(String(clamped));
                        }}
                        disabled={drawing}
                      />
                    </div>
                  </div>
                ) : (
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={thirdPlace}
                      onChange={(e) => setThirdPlace(e.target.checked)}
                      className="h-4 w-4 rounded border-input"
                      disabled={drawing}
                    />
                    {t("draw.thirdPlaceMatch")}
                  </label>
                )}
                <p className="text-[11px] text-muted-foreground">
                  {t("draw.summary", { count: teams.length })} ·{" "}
                  {drawMode === "groups"
                    ? t("draw.slotsGroups", { count: numSlots })
                    : t("draw.slotsKnockout", { count: numSlots })}
                  {drawMode === "knockout" && numSlots > teams.length
                    ? ` · ${t("draw.byes", { count: numSlots - teams.length })}`
                    : ""}
                </p>
              </div>


              <Tabs value={mode} onValueChange={(v) => setMode(v as DrawMode)} className="w-full">
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="auto" disabled={drawing}>
                    <Sparkles className="mr-1 h-3.5 w-3.5" />
                    <span className="hidden sm:inline">{t("draw.tabAuto")}</span>
                  </TabsTrigger>
                  <TabsTrigger value="progressive" disabled={drawing && pool.length === 0}>
                    <Shuffle className="mr-1 h-3.5 w-3.5" />
                    <span className="hidden sm:inline">{t("draw.tabProgressive")}</span>
                  </TabsTrigger>
                  <TabsTrigger value="manual" disabled={drawing}>
                    <Hand className="mr-1 h-3.5 w-3.5" />
                    <span className="hidden sm:inline">{t("draw.tabManual")}</span>
                  </TabsTrigger>
                </TabsList>

                {/* AUTO */}
                <TabsContent value="auto" className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    {t("draw.autoDesc")}
                  </p>
                  {/* B-04 — once the draw is done, hide the green CTA. The
                      footer "Relancer" (outline + confirm sheet) is the only
                      way to re-roll, with strong confirmation. */}
                  {!finished ? (
                    <Button
                      onClick={() => maybeConfirm(runAuto)}
                      disabled={applyMut.isPending || tournamentStarted}
                      className="w-full"
                      variant={hasExistingDraw ? "outline" : "default"}
                    >
                      {applyMut.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <>
                          <Sparkles className="h-4 w-4" />
                          {hasExistingDraw ? t("draw.relaunch") : t("draw.launch")}
                        </>
                      )}
                    </Button>
                  ) : (
                    <p className="text-xs text-muted-foreground italic">
                      {t("draw.relaunchFromFooterHint", {
                        defaultValue:
                          'Tirage effectué. Utilisez « Relancer » en bas du dialog pour en générer un nouveau (les résultats actuels seront perdus).',
                      })}
                    </p>
                  )}
                </TabsContent>


                {/* PROGRESSIVE */}
                <TabsContent value="progressive" className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    {t("draw.progressiveDesc")}
                  </p>

                  {!drawing && revealed.length === 0 && !finished && (
                    <Button
                      onClick={() => maybeConfirm(startProgressive)}
                      disabled={applyMut.isPending}
                      className="w-full"
                    >
                      <Shuffle className="h-4 w-4" />
                      {t("draw.launch")}
                    </Button>
                  )}


                  {drawing && (
                    <div className="space-y-3">
                      {/* Roulette */}
                      <div className="rounded-xl border border-border bg-gradient-to-br from-primary/10 via-card to-card p-6 text-center overflow-hidden">
                        <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
                          {t("draw.currentTeam")}
                        </p>

                        <div className="relative h-20 flex items-center justify-center">
                          <div
                            key={`${rouletteIdx}-${pool.length}`}
                            className="animate-fade-in text-2xl font-bold flex items-center gap-3"
                          >
                            {pool.length > 0 && (
                              <>
                                <div className="h-12 w-12 rounded-full bg-primary/20 flex items-center justify-center text-primary">
                                  {pool[rouletteIdx % pool.length]?.logo_url ? (
                                    <img
                                      src={pool[rouletteIdx % pool.length].logo_url ?? ""}
                                      alt=""
                                      className="h-12 w-12 rounded-full object-cover"
                                    />
                                  ) : (
                                    <span className="text-sm">
                                      {initials(pool[rouletteIdx % pool.length]?.name ?? "?")}
                                    </span>
                                  )}
                                </div>
                                <span className="truncate max-w-[200px]">
                                  {pool[rouletteIdx % pool.length]?.name}
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                        <Button
                          onClick={drawNext}
                          disabled={pool.length === 0 || rouletteRef.current !== null}
                          className="mt-4"
                          size="lg"
                        >
                          <Dices className="h-4 w-4" />
                          {t("draw.drawNextRemaining", { count: pool.length })}
                        </Button>

                      </div>
                    </div>
                  )}

                  {/* Slots view */}
                  {(drawing || revealed.length > 0) && (
                    <div className="grid gap-2 sm:grid-cols-2">
                      {slotsArray.map((i) => {
                        const items = revealed.filter((r) => r.slotIndex === i);
                        return (
                          <div
                            key={i}
                            className="rounded-lg border border-border bg-card/50 p-3 space-y-1.5"
                          >
                            <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                              {drawMode === "knockout" && <Trophy className="h-3 w-3" />}
                              {slotLabel(i)}
                            </div>
                            {items.length === 0 ? (
                              <p className="text-xs text-muted-foreground/60 italic">—</p>
                            ) : (
                              items.map((it) => {
                                const team = teams.find((tm) => tm.id === it.teamId);

                                return (
                                  <div
                                    key={it.teamId}
                                    className="flex items-center gap-2 text-sm animate-scale-in"
                                  >
                                    <Badge variant="secondary" className="gap-1.5">
                                      {team?.logo_url ? (
                                        <img
                                          src={team.logo_url}
                                          alt=""
                                          className="h-4 w-4 rounded-full object-cover"
                                        />
                                      ) : (
                                        <span className="text-[10px]">
                                          {initials(team?.name ?? "?")}
                                        </span>
                                      )}
                                      {team?.name}
                                    </Badge>
                                  </div>
                                );
                              })
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </TabsContent>

                {/* MANUAL */}
                <TabsContent value="manual" className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    {drawMode === "groups" ? t("draw.manualDescGroups") : t("draw.manualDescKnockout")}
                  </p>
                  <div className="space-y-2 max-h-[280px] overflow-y-auto pr-1">
                    {teams.map((team) => (
                      <div
                        key={team.id}
                        className="flex items-center gap-2 rounded-lg border border-border p-2"
                      >
                        <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center text-xs shrink-0">
                          {team.logo_url ? (
                            <img
                              src={team.logo_url}
                              alt=""
                              className="h-8 w-8 rounded-full object-cover"
                            />
                          ) : (
                            initials(team.name)
                          )}
                        </div>
                        <span className="flex-1 text-sm truncate">{team.name}</span>
                        <Select
                          value={
                            manualAssign[team.id] !== null && manualAssign[team.id] !== undefined
                              ? String(manualAssign[team.id])
                              : ""
                          }
                          onValueChange={(v) =>
                            setManualAssign((m) => ({ ...m, [team.id]: parseInt(v, 10) }))
                          }
                        >
                          <SelectTrigger className="w-[140px]">
                            <SelectValue placeholder="—" />
                          </SelectTrigger>
                          <SelectContent>
                            {slotsArray.map((i) => (
                              <SelectItem key={i} value={String(i)}>
                                {slotLabel(i)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    ))}
                  </div>
                  <Button
                    onClick={() => maybeConfirm(runManual)}
                    disabled={applyMut.isPending}
                    className="w-full"
                  >
                    {applyMut.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        <Hand className="h-4 w-4" />
                        {t("draw.validateManual")}
                      </>
                    )}
                  </Button>
                </TabsContent>

              </Tabs>

              {finished && (
                <div className="rounded-lg border border-green-500/40 bg-green-500/10 p-3 flex items-center gap-2 text-sm text-green-700 dark:text-green-300 animate-fade-in">
                  <CheckCircle2 className="h-4 w-4" />
                  {t("draw.doneBanner")}
                </div>
              )}
            </>
          )}

          <DialogFooter className="gap-2 sm:gap-2">
            {hasExistingDraw && !drawing && (
              <Button
                variant="outline"
                onClick={() => {
                  setRevealed([]);
                  setFinished(false);
                  setMode("progressive");
                  maybeConfirm(startProgressive);
                }}
                disabled={applyMut.isPending || !canDraw}
              >
                <RotateCcw className="h-4 w-4" />
                {t("draw.relaunch")}
              </Button>
            )}
            <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={drawing}>
              {t("draw.close")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DestructiveConfirmSheet
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        mode="delay"
        delaySeconds={3}
        title={t("draw.overwriteTitle")}
        description={tournamentStarted ? t("draw.overwriteDescStarted") : t("draw.overwriteDesc")}
        cancelLabel={t("draw.cancel")}
        confirmLabel={t("draw.confirmRelaunch")}
        onConfirm={() => {
          const action = pendingAction;
          setConfirmOpen(false);
          setPendingAction(null);
          if (action) action();
        }}
      />

    </>
  );
}
