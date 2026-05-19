import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
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
import { ChevronLeft, Save, Send, Eye, EyeOff, Loader2, Star, Hand } from "lucide-react";
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
import { Switch } from "@/components/ui/switch";
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
        .select("id, team_id, type, title, teams:team_id(name, sport)")
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
  const [includeInConv, setIncludeInConv] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 120, tolerance: 6 } }),
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
    setIncludeInConv(!!l.include_in_convocation);
  }, [lineupData?.lineup]);

  const placedIds = useMemo(() => {
    const s = new Set<string>();
    slots.forEach((sl) => sl.player_id && s.add(sl.player_id));
    bench.forEach((id) => s.add(id));
    return s;
  }, [slots, bench]);

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

  function handleDragEnd(e: DragEndEvent) {
    const over = e.over;
    if (!over) return;
    const playerId = (e.active.data.current as any)?.playerId as string | undefined;
    if (!playerId) return;
    const kind = (over.data.current as any)?.kind as string | undefined;

    // Remove from any current location first
    setDirty(true);
    setSlots((prev) => prev.map((s) => (s.player_id === playerId ? { ...s, player_id: null } : s)));
    setBench((prev) => prev.filter((id) => id !== playerId));

    if (kind === "slot") {
      const slotId = String(over.id);
      setSlots((prev) => {
        const target = prev.find((s) => s.id === slotId);
        const displaced = target?.player_id ?? null;
        const next = prev.map((s) =>
          s.id === slotId ? { ...s, player_id: playerId } : s,
        );
        if (displaced && displaced !== playerId) {
          // Send displaced player to bench
          setBench((b) => (b.includes(displaced) ? b : [...b, displaced]));
        }
        return next;
      });
      // Auto-set GK if dropped on GK slot
      const target = slots.find((s) => s.id === slotId);
      if (target?.role === "GK") setGk(playerId);
    } else if (kind === "bench") {
      setBench((prev) => (prev.includes(playerId) ? prev : [...prev, playerId]));
    } else if (kind === "available") {
      // already removed
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
          include_in_convocation: includeInConv,
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
  const _isFootball = _sportRaw === "" || _sportRaw === "football" || _sportRaw === "foot" || _sportRaw === "soccer";
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
                    {f.label}
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
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <Switch checked={includeInConv} onCheckedChange={(v) => { setIncludeInConv(v); setDirty(true); }} />
            <span>{t("lineup.includeInConv", "Inclure dans la convocation")}</span>
          </label>
        </div>

        {/* Pitch + Players layout */}
        <div className="grid md:grid-cols-[1fr_minmax(0,280px)] gap-4">
          {/* Pitch */}
          <div className="relative aspect-[2/3] max-h-[80vh] rounded-2xl overflow-hidden ring-1 ring-border shadow-sm bg-emerald-900">
            <PitchSvg />
            {slots.map((s) => {
              const player = s.player_id ? playerById.get(s.player_id) : null;
              return (
                <DroppableSlot key={s.id} id={s.id} x={s.x} y={s.y} role={s.role} empty={!player}>
                  {player && (
                    <div className="relative group">
                      <DraggablePlayer
                        id={`slot:${s.id}`}
                        player={player}
                        isCaptain={captain === player.id}
                        isGK={gk === player.id}
                      />
                      <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 translate-y-full mt-1 hidden group-hover:flex items-center gap-1 bg-background/95 backdrop-blur rounded-md shadow-md ring-1 ring-border p-1 z-10">
                        <Button
                          size="icon-sm"
                          variant={captain === player.id ? "default" : "ghost"}
                          onClick={() => { setCaptain(captain === player.id ? null : player.id); setDirty(true); }}
                          title={t("lineup.captain", "Capitaine")}
                        >
                          <Star className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="icon-sm"
                          variant={gk === player.id ? "default" : "ghost"}
                          onClick={() => { setGk(gk === player.id ? null : player.id); setDirty(true); }}
                          title={t("lineup.gk", "Gardien")}
                        >
                          <Hand className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          onClick={() => { removePlayer(player.id); setDirty(true); }}
                          title={t("common.remove", "Retirer")}
                        >
                          ×
                        </Button>
                      </div>
                    </div>
                  )}
                </DroppableSlot>
              );
            })}
          </div>

          {/* Available roster */}
          <div className="space-y-3">
            <div>
              <h2 className="text-sm font-semibold mb-2">{t("lineup.available", "Joueurs disponibles")}</h2>
              <DroppableAvailable>
                {available.length === 0 && (
                  <p className="text-xs text-muted-foreground">{t("lineup.allPlaced", "Tous les joueurs sont placés.")}</p>
                )}
                {available.map((p) => (
                  <div key={p.id} className={cn(!p.convocated && "opacity-60")}>
                    <DraggablePlayer id={`avail:${p.id}`} player={p} size="sm" />
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
          <DroppableBench>
            {bench.length === 0 && (
              <p className="text-xs text-muted-foreground">{t("lineup.benchEmpty", "Glissez des joueurs ici.")}</p>
            )}
            {bench.map((id) => {
              const p = playerById.get(id);
              if (!p) return null;
              return <DraggablePlayer key={id} id={`bench:${id}`} player={p} size="sm" />;
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
      </div>
    </DndContext>
  );
}
