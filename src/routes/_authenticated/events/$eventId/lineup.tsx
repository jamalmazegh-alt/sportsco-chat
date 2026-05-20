import { createFileRoute, Link, Navigate, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import {
  DndContext,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { ChevronLeft, Save, Send, Eye, EyeOff, Loader2, Star, Hand, UserPlus, X as XIcon, Move } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { getLineup, upsertLineup, unpublishLineup } from "@/lib/lineup.functions";
import {
  formationSlots,
  FORMATIONS,
  type FormationKey,
  type FormationSlot,
} from "@/lib/football-formations";
import {
  DraggablePlayer,
  DroppableAvailable,
  DroppableBench,
  DroppableSlot,
  PlayerChip,
  type PlayerLite,
} from "@/components/lineup/pitch-pieces";
import { PitchSvg } from "@/components/lineup/pitch-svg";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/events/$eventId/lineup")({
  component: LineupPage,
  head: () => ({ meta: [{ title: "Composition — Clubero" }] }),
});

type LineupSlot = FormationSlot & { player_id: string | null };

function makeEmptySlots(formation: FormationKey): LineupSlot[] {
  return formationSlots(formation).map((s) => ({ ...s, player_id: null }));
}

function LineupPage() {
  const { eventId } = Route.useParams();
  const { t } = useTranslation();
  const { user } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const fetchLineup = useServerFn(getLineup);
  const saveLineup = useServerFn(upsertLineup);
  const unpublishFn = useServerFn(unpublishLineup);

  // Access / context check
  const { data: ctx, isLoading: ctxLoading } = useQuery({
    queryKey: ["lineup-ctx", eventId, user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data: event } = await supabase
        .from("events")
        .select("id, team_id, type, title, convocations_sent, teams:team_id(name, sport)")
        .eq("id", eventId)
        .maybeSingle();
      if (!event) return null;
      const { data: isCoach } = await supabase.rpc("is_team_coach", {
        _team_id: event.team_id,
        _user_id: user!.id,
      });
      return { event, isCoach: !!isCoach };
    },
  });

  const { data: lineupData, isLoading: lineupLoading } = useQuery({
    queryKey: ["lineup", eventId],
    enabled: !!ctx?.isCoach,
    queryFn: async () => fetchLineup({ data: { eventId } }),
  });

  const { data: roster } = useQuery({
    queryKey: ["lineup-roster", eventId, ctx?.event?.team_id],
    enabled: !!ctx?.event?.team_id,
    queryFn: async () => {
      const teamId = ctx!.event.team_id as string;
      const { data: tm } = await supabase
        .from("team_members")
        .select("player_id, players:player_id(id, first_name, last_name, jersey_number, photo_url, deleted_at)")
        .eq("team_id", teamId);
      const players = (tm ?? [])
        .map((r: any) => r.players)
        .filter((p: any) => p && !p.deleted_at) as Omit<PlayerLite, "convocated">[];
      const { data: convs } = await supabase
        .from("convocations")
        .select("player_id, status")
        .eq("event_id", eventId);
      const convocated = new Set(
        (convs ?? []).filter((c: any) => c.status !== "absent").map((c: any) => c.player_id),
      );
      return players.map((p) => ({ ...p, convocated: convocated.has(p.id) })) as PlayerLite[];
    },
  });

  // Local state
  const [formation, setFormation] = useState<FormationKey>("4-4-2");
  const [slots, setSlots] = useState<LineupSlot[]>(() => makeEmptySlots("4-4-2"));
  const [bench, setBench] = useState<string[]>([]);
  const [captain, setCaptain] = useState<string | null>(null);
  const [gk, setGk] = useState<string | null>(null);
  const [visibility, setVisibility] = useState<"draft" | "staff" | "selected_players" | "team">("draft");
  // include_in_convocation: always true now (config retiré côté UI)
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedPid, setSelectedPid] = useState<string | null>(null);
  const [actionPid, setActionPid] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
  );

  // Hydrate from server
  useEffect(() => {
    const l = lineupData?.lineup;
    if (!l) return;
    const f = ((l.formation as FormationKey) ?? "4-4-2") as FormationKey;
    setFormation(f);
    setSlots(
      Array.isArray(l.slots) && l.slots.length > 0
        ? (l.slots as unknown as LineupSlot[])
        : makeEmptySlots(f),
    );
    setBench(Array.isArray(l.bench) ? (l.bench as unknown as string[]) : []);
    setCaptain(l.captain_player_id ?? null);
    setGk(l.gk_player_id ?? null);
    setVisibility((l.visibility as any) ?? "draft");
    
  }, [lineupData?.lineup]);

  const placedIds = useMemo(() => {
    const s = new Set<string>();
    slots.forEach((sl) => sl.player_id && s.add(sl.player_id));
    bench.forEach((id) => s.add(id));
    return s;
  }, [slots, bench]);

  const placedCount = placedIds.size;
  const convocationsSent = !!ctx?.event?.convocations_sent;

  function createConvocationFromLineup() {
    const ids = Array.from(placedIds);
    if (ids.length === 0) {
      toast.error(t("lineup.noPlayersForConvoc", "Ajoutez d'abord des joueurs à la compo."));
      return;
    }
    navigate({
      to: "/events/$eventId",
      params: { eventId },
      search: { send: 1, preselect: ids.join(",") } as any,
    });
  }


  const available = useMemo(
    () => (roster ?? []).filter((p) => !placedIds.has(p.id)),
    [roster, placedIds],
  );

  const playerById = useMemo(() => {
    const m = new Map<string, PlayerLite>();
    (roster ?? []).forEach((p) => m.set(p.id, p));
    return m;
  }, [roster]);

  function changeFormation(next: FormationKey) {
    setFormation(next);
    setDirty(true);
    const nextSlots = makeEmptySlots(next);
    // Try to keep players: match by role + index in same role
    const groupedOld: Record<string, string[]> = { GK: [], DEF: [], MID: [], FWD: [] };
    slots.forEach((s) => {
      if (s.player_id) groupedOld[s.role].push(s.player_id);
    });
    const newBench = [...bench];
    nextSlots.forEach((s) => {
      const pool = groupedOld[s.role];
      if (pool && pool.length) {
        s.player_id = pool.shift()!;
      }
    });
    // Overflow → bench
    Object.values(groupedOld).forEach((rest) => rest.forEach((id) => newBench.push(id)));
    setSlots(nextSlots);
    setBench(newBench);
  }

  function removePlayer(playerId: string) {
    setSlots((prev) => prev.map((s) => (s.player_id === playerId ? { ...s, player_id: null } : s)));
    setBench((prev) => prev.filter((id) => id !== playerId));
    if (captain === playerId) setCaptain(null);
    if (gk === playerId) setGk(null);
  }

  function placePlayer(playerId: string, target: { kind: "slot"; slotId: string } | { kind: "bench" } | { kind: "available" }) {
    setDirty(true);

    // Compute next slots + displaced player synchronously from current state,
    // then commit slots and bench in independent setters (no nested updates).
    let displaced: string | null = null;
    let droppedOnGk = false;
    const nextSlots = slots.map((s) => {
      // First, clear the player from any slot it currently occupies
      const cleared = s.player_id === playerId ? { ...s, player_id: null } : s;
      if (target.kind === "slot" && cleared.id === target.slotId) {
        if (cleared.player_id && cleared.player_id !== playerId) {
          displaced = cleared.player_id;
        }
        if (cleared.role === "GK") droppedOnGk = true;
        return { ...cleared, player_id: playerId };
      }
      return cleared;
    });

    setSlots(nextSlots);
    setBench((prev) => {
      // Remove the moved player from bench first
      let next = prev.filter((id) => id !== playerId);
      if (target.kind === "bench") {
        if (!next.includes(playerId)) next = [...next, playerId];
      }
      if (displaced && !next.includes(displaced)) next = [...next, displaced];
      return next;
    });
    if (droppedOnGk) setGk(playerId);

    setSelectedPid(null);
    setActionPid(null);
  }

  function handleDragEnd(e: DragEndEvent) {
    const over = e.over;
    if (!over) return;
    const playerId = (e.active.data.current as any)?.playerId as string | undefined;
    if (!playerId) return;
    const kind = (over.data.current as any)?.kind as string | undefined;
    if (kind === "slot") placePlayer(playerId, { kind: "slot", slotId: String(over.id) });
    else if (kind === "bench") placePlayer(playerId, { kind: "bench" });
    else if (kind === "available") placePlayer(playerId, { kind: "available" });
  }

  function handleChipTap(playerId: string, location: "available" | "slot" | "bench") {
    // If a player is already selected and the user taps a different chip,
    // perform a swap/placement instead of opening the action panel.
    if (selectedPid && selectedPid !== playerId) {
      if (location === "slot") {
        // Find the slot occupied by the tapped chip and drop the selected player there
        const targetSlot = slots.find((s) => s.player_id === playerId);
        if (targetSlot) {
          placePlayer(selectedPid, { kind: "slot", slotId: targetSlot.id });
          return;
        }
      } else if (location === "bench") {
        placePlayer(selectedPid, { kind: "bench" });
        return;
      } else if (location === "available") {
        // Tapping another available player just switches selection
        setSelectedPid(playerId);
        return;
      }
    }
    if (selectedPid === playerId) {
      setSelectedPid(null);
      return;
    }
    if (location === "available") {
      setSelectedPid(playerId);
    } else {
      setActionPid(playerId);
    }
  }

  async function handleSave(publish: boolean) {
    if (saving) return;
    setSaving(true);
    try {
      await saveLineup({
        data: {
          eventId,
          formation,
          slots,
          bench,
          captain_player_id: captain,
          gk_player_id: gk,
          visibility: publish && visibility === "draft" ? "team" : visibility,
          include_in_convocation: true,
          publish,
        },
      });
      setDirty(false);
      toast.success(publish ? t("lineup.published", "Composition publiée") : t("lineup.saved", "Brouillon enregistré"));
      qc.invalidateQueries({ queryKey: ["lineup", eventId] });
    } catch (e: any) {
      toast.error(e?.message ?? "Erreur");
    } finally {
      setSaving(false);
    }
  }

  async function handleUnpublish() {
    try {
      await unpublishFn({ data: { eventId } });
      toast.success(t("lineup.unpublished", "Composition retirée"));
      qc.invalidateQueries({ queryKey: ["lineup", eventId] });
    } catch (e: any) {
      toast.error(e?.message ?? "Erreur");
    }
  }

  if (ctxLoading) {
    return (
      <div className="grid place-content-center min-h-[60vh]">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!ctx?.event) return <Navigate to="/events" />;
  const _sportRaw = ((ctx.event as any).teams?.sport ?? "").toString().toLowerCase().trim();
  const _isFootball = _sportRaw === "football" || _sportRaw === "foot" || _sportRaw === "soccer";
  if (ctx.event.type !== "match" || !_isFootball) {
    return (
      <div className="p-6 space-y-4">
        <Link to="/events/$eventId" params={{ eventId }} className="inline-flex items-center gap-1 text-sm text-muted-foreground">
          <ChevronLeft className="h-4 w-4" /> {t("common.back", "Retour")}
        </Link>
        <p className="text-sm text-muted-foreground">
          {t("lineup.unavailable", "La composition est disponible uniquement pour les matchs de football.")}
        </p>
      </div>
    );
  }
  if (!ctx.isCoach) return <Navigate to="/events/$eventId" params={{ eventId }} />;

  const published = !!lineupData?.lineup?.published_at;

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <div className="px-4 md:px-6 pt-4 pb-24 space-y-4">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <Link
            to="/events/$eventId"
            params={{ eventId }}
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="h-4 w-4" /> {t("common.back", "Retour")}
          </Link>
          <div className="flex items-center gap-2">
            {published && (
              <span className="text-[10px] uppercase tracking-wider font-semibold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                {t("lineup.publishedBadge", "Publiée")}
              </span>
            )}
            {!published && (
              <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                {t("lineup.draft", "Brouillon")}
              </span>
            )}
          </div>
        </div>

        <div>
          <h1 className="text-xl font-bold tracking-tight">{t("lineup.title", "Composition")}</h1>
          <p className="text-sm text-muted-foreground">{ctx.event.title}</p>
        </div>

        {/* Tap-to-place hint */}
        <div
          className="rounded-xl border bg-muted/40 px-3 py-2 text-xs text-muted-foreground"
          dangerouslySetInnerHTML={{
            __html: t("lineup.tapHint", "💡 <b>Astuce mobile :</b> touche un joueur puis touche une case (ou le banc) pour le placer. Touche un joueur déjà placé pour le déplacer ou définir capitaine/gardien."),
          }}
        />


        {/* Controls */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Label className="text-xs text-muted-foreground">{t("lineup.formation", "Formation")}</Label>
            <Select value={formation} onValueChange={(v) => changeFormation(v as FormationKey)}>
              <SelectTrigger className="h-9 w-[110px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FORMATIONS.map((f) => (
                  <SelectItem key={f.key} value={f.key}>
                    {f.key === "custom" ? t("lineup.customLabel", "Personnalisée") : f.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <Label className="text-xs text-muted-foreground">{t("lineup.visibility", "Visibilité")}</Label>
            <Select value={visibility} onValueChange={(v) => { setVisibility(v as any); setDirty(true); }}>
              <SelectTrigger className="h-9 w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="draft">{t("lineup.vis.draft", "Brouillon privé")}</SelectItem>
                <SelectItem value="staff">{t("lineup.vis.staff", "Staff uniquement")}</SelectItem>
                <SelectItem value="selected_players">{t("lineup.vis.selected", "Joueurs convoqués")}</SelectItem>
                <SelectItem value="team">{t("lineup.vis.team", "Toute l'équipe")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Create convocation from lineup */}
        {!convocationsSent && (
          <div className="flex items-center justify-between gap-3 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold leading-tight">
                {t("lineup.convocFromLineup.title", "Créer la convocation depuis cette compo")}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {placedCount > 0
                  ? t("lineup.convocFromLineup.desc", "{{count}} joueur(s) placés seront pré-sélectionnés.", { count: placedCount })
                  : t("lineup.convocFromLineup.empty", "Placez des joueurs sur le terrain ou le banc d'abord.")}
              </p>
            </div>
            <Button
              onClick={createConvocationFromLineup}
              disabled={placedCount === 0}
              size="sm"
              className="shrink-0"
            >
              <UserPlus className="h-4 w-4" />
              {t("lineup.convocFromLineup.cta", "Créer la convoc")}
            </Button>
          </div>
        )}

        {/* Pitch + Players layout */}
        <div className="grid md:grid-cols-[1fr_minmax(0,280px)] gap-4">
          {/* Pitch */}
          <div className="relative aspect-[2/3] max-h-[80vh] rounded-2xl overflow-hidden ring-1 ring-border shadow-sm bg-emerald-900">
            <PitchSvg />
            {slots.map((s) => {
              const player = s.player_id ? playerById.get(s.player_id) : null;
              const slotClickable = !!selectedPid && !player;
              return (
                <DroppableSlot
                  key={s.id}
                  id={s.id}
                  x={s.x}
                  y={s.y}
                  role={s.role}
                  empty={!player}
                  highlight={slotClickable}
                  onClick={
                    selectedPid && !player
                      ? () => placePlayer(selectedPid, { kind: "slot", slotId: s.id })
                      : undefined
                  }
                >
                  {player && (
                    <DraggablePlayer
                      id={`slot:${s.id}`}
                      player={player}
                      isCaptain={captain === player.id}
                      isGK={gk === player.id}
                      selected={actionPid === player.id}
                      onSelect={() => {
                        if (selectedPid && selectedPid !== player.id) {
                          placePlayer(selectedPid, { kind: "slot", slotId: s.id });
                        } else {
                          handleChipTap(player.id, "slot");
                        }
                      }}
                    />
                  )}
                </DroppableSlot>
              );
            })}
          </div>

          {/* Available roster */}
          <div className="space-y-3">
            <div>
              <h2 className="text-sm font-semibold mb-2">{t("lineup.available", "Joueurs disponibles")}</h2>
              <DroppableAvailable
                highlight={!!selectedPid && placedIds.has(selectedPid)}
                onClick={
                  selectedPid && placedIds.has(selectedPid)
                    ? () => placePlayer(selectedPid, { kind: "available" })
                    : undefined
                }
              >
                {available.length === 0 && (
                  <p className="text-xs text-muted-foreground">{t("lineup.allPlaced", "Tous les joueurs sont placés.")}</p>
                )}
                {available.map((p) => (
                  <div key={p.id} className={cn(!p.convocated && "opacity-60")}>
                    <DraggablePlayer
                      id={`avail:${p.id}`}
                      player={p}
                      size="sm"
                      selected={selectedPid === p.id}
                      onSelect={() => handleChipTap(p.id, "available")}
                    />
                    {!p.convocated && (
                      <p className="text-[9px] text-center text-muted-foreground mt-0.5">{t("lineup.notCalled", "Non convoqué")}</p>
                    )}
                  </div>
                ))}
              </DroppableAvailable>
            </div>
          </div>
        </div>

        {/* Bench */}
        <div>
          <h2 className="text-sm font-semibold mb-2">{t("lineup.bench", "Remplaçants")} ({bench.length})</h2>
          <DroppableBench
            highlight={!!selectedPid}
            onClick={selectedPid ? () => placePlayer(selectedPid, { kind: "bench" }) : undefined}
          >
            {bench.length === 0 && (
              <p className="text-xs text-muted-foreground">{t("lineup.benchEmpty", "Touche un joueur puis le banc, ou glisse-le ici.")}</p>
            )}
            {bench.map((id) => {
              const p = playerById.get(id);
              if (!p) return null;
              return (
                <DraggablePlayer
                  key={id}
                  id={`bench:${id}`}
                  player={p}
                  size="sm"
                  selected={actionPid === p.id}
                  onSelect={() => handleChipTap(p.id, "bench")}
                />
              );
            })}
          </DroppableBench>
        </div>

        {/* Sticky action bar */}
        <div className="sticky bottom-4 md:bottom-6 flex flex-wrap gap-2 justify-end bg-background/90 backdrop-blur rounded-xl border p-3 shadow-md">
          {dirty && (
            <span className="text-xs text-amber-700 self-center mr-auto">{t("lineup.unsaved", "Modifications non enregistrées")}</span>
          )}
          {published && (
            <Button variant="ghost" onClick={handleUnpublish}>
              <EyeOff className="h-4 w-4" /> {t("lineup.unpublish", "Retirer")}
            </Button>
          )}
          <Button variant="outline" onClick={() => handleSave(false)} disabled={saving || lineupLoading}>
            <Save className="h-4 w-4" /> {t("lineup.saveDraft", "Enregistrer")}
          </Button>
          <Button onClick={() => handleSave(true)} disabled={saving || lineupLoading}>
            {published ? <Eye className="h-4 w-4" /> : <Send className="h-4 w-4" />}
            {published ? t("lineup.update", "Mettre à jour") : t("lineup.publish", "Publier")}
          </Button>
        </div>

        {/* Floating selection banner */}
        {selectedPid && (
          <div className="fixed left-1/2 -translate-x-1/2 bottom-24 z-40 flex items-center gap-2 rounded-full bg-amber-500 text-white shadow-lg px-4 py-2 text-sm font-medium animate-in fade-in slide-in-from-bottom-2">
            <Move className="h-4 w-4" />
            <span className="truncate max-w-[180px]">
              {playerById.get(selectedPid)?.first_name} {playerById.get(selectedPid)?.last_name}
            </span>
            <span className="opacity-90 hidden xs:inline">— touche une case</span>
            <button onClick={() => setSelectedPid(null)} className="ml-1 rounded-full hover:bg-white/20 p-0.5">
              <XIcon className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Action sheet for a placed/bench player */}
        {actionPid && playerById.get(actionPid) && (
          <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center" onClick={() => setActionPid(null)}>
            <div onClick={(e) => e.stopPropagation()} className="w-full sm:max-w-sm bg-background rounded-t-2xl sm:rounded-2xl p-4 space-y-2 shadow-2xl">
              <div className="flex items-center justify-between">
                <p className="font-semibold text-sm">
                  {playerById.get(actionPid)!.first_name} {playerById.get(actionPid)!.last_name}
                </p>
                <button onClick={() => setActionPid(null)} className="text-muted-foreground"><XIcon className="h-4 w-4" /></button>
              </div>
              <div className="grid grid-cols-2 gap-2 pt-1">
                <Button variant="outline" onClick={() => { setSelectedPid(actionPid); setActionPid(null); }}>
                  <Move className="h-4 w-4" /> {t("lineup.move", "Déplacer")}
                </Button>
                <Button
                  variant={captain === actionPid ? "default" : "outline"}
                  onClick={() => { setCaptain(captain === actionPid ? null : actionPid); setDirty(true); setActionPid(null); }}
                >
                  <Star className="h-4 w-4" /> {t("lineup.captain", "Capitaine")}
                </Button>
                <Button
                  variant={gk === actionPid ? "default" : "outline"}
                  onClick={() => { setGk(gk === actionPid ? null : actionPid); setDirty(true); setActionPid(null); }}
                >
                  <Hand className="h-4 w-4" /> {t("lineup.gk", "Gardien")}
                </Button>
                <Button variant="destructive" onClick={() => { removePlayer(actionPid); setDirty(true); setActionPid(null); }}>
                  <XIcon className="h-4 w-4" /> {t("lineup.remove", "Retirer")}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </DndContext>
  );
}
