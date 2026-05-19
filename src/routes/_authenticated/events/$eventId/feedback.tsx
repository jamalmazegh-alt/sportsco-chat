import { createFileRoute, Link, useNavigate, Navigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronLeft, Loader2, CheckCircle2, Star } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import {
  listEventPlayersForFeedback,
  createPlayerFeedback,
  updatePlayerFeedback,
} from "@/lib/player-feedback.functions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { getFeedbackTagsForSport } from "@/lib/feedback-tags";
import { useActiveRole, useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/events/$eventId/feedback")({
  component: PostMatchFeedback,
  head: () => ({ meta: [{ title: "Retours coach — Clubero" }] }),
});

type RowValue = {
  rating: number | null;
  note: string;
  tags: string[];
};

const EMPTY: RowValue = { rating: null, note: "", tags: [] };

function PostMatchFeedback() {
  const { eventId } = Route.useParams();
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const role = useActiveRole();
  const isActiveCoach = role === "admin" || role === "coach";
  const qc = useQueryClient();
  const fetchData = useServerFn(listEventPlayersForFeedback);
  const createFn = useServerFn(createPlayerFeedback);
  const updateFn = useServerFn(updatePlayerFeedback);

  const { data: canAccessFeedback, isLoading: isAccessLoading } = useQuery({
    queryKey: ["event-feedback-access", eventId, user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data: event } = await supabase
        .from("events")
        .select("team_id, type")
        .eq("id", eventId)
        .maybeSingle();
      if (!event?.team_id || event.type !== "match") return false;
      const { data, error } = await supabase.rpc("is_team_coach", {
        _team_id: event.team_id,
        _user_id: user!.id,
      });
      if (error) return false;
      return !!data;
    },
  });

  const isCoach = isActiveCoach || !!canAccessFeedback;

  const { data, isLoading } = useQuery({
    queryKey: ["event-feedback", eventId],
    queryFn: async () => fetchData({ data: { eventId } }),
    enabled: isCoach || !!canAccessFeedback,
  });

  const [values, setValues] = useState<Record<string, RowValue>>({});
  const [ids, setIds] = useState<Record<string, string | null>>({});
  const [dirty, setDirty] = useState<Set<string>>(new Set());
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!data) return;
    const v: Record<string, RowValue> = {};
    const ix: Record<string, string | null> = {};
    const filled = new Set<string>();
    for (const row of data.players) {
      const ex = (data as any).existing[row.player.id];
      if (ex) {
        const merged = [ex.strengths, ex.improvements, ex.comment]
          .filter(Boolean)
          .join("\n\n");
        v[row.player.id] = {
          rating: ex.rating ?? null,
          note: merged ?? "",
          tags: ex.tags ?? [],
        };
        ix[row.player.id] = ex.id;
        filled.add(row.player.id);
      } else {
        v[row.player.id] = { ...EMPTY };
        ix[row.player.id] = null;
      }
    }
    setValues(v);
    setIds(ix);
    setSavedIds(filled);
    setDirty(new Set());
  }, [data]);

  if (!isAccessLoading && !isCoach && canAccessFeedback === false)
    return <Navigate to="/home" replace />;

  const patch = useCallback((playerId: string, p: Partial<RowValue>) => {
    setValues((prev) => ({ ...prev, [playerId]: { ...(prev[playerId] ?? EMPTY), ...p } }));
    setDirty((prev) => {
      if (prev.has(playerId)) return prev;
      const n = new Set(prev);
      n.add(playerId);
      return n;
    });
  }, []);

  const toggleTag = useCallback((playerId: string, tag: string) => {
    setValues((prev) => {
      const cur = prev[playerId] ?? EMPTY;
      const tags = cur.tags.includes(tag)
        ? cur.tags.filter((x) => x !== tag)
        : [...cur.tags, tag];
      return { ...prev, [playerId]: { ...cur, tags } };
    });
    setDirty((prev) => {
      if (prev.has(playerId)) return prev;
      const n = new Set(prev);
      n.add(playerId);
      return n;
    });
  }, []);

  async function saveAll() {
    if (dirty.size === 0) return;
    setSaving(true);
    const newIds: Record<string, string> = {};
    let okCount = 0;
    const failed: string[] = [];
    await Promise.all(
      Array.from(dirty).map(async (playerId) => {
        const v = values[playerId];
        if (!v) return;
        const payload = {
          rating: v.rating,
          comment: v.note || null,
          devNotes: null,
          strengths: null,
          improvements: null,
          tags: v.tags,
          visibility: "coach_only" as const,
          sharedSummary: null,
        };
        try {
          const existingId = ids[playerId];
          if (existingId) {
            await updateFn({ data: { id: existingId, ...payload } });
          } else {
            const res = await createFn({
              data: { playerId, eventId, ...payload },
            });
            newIds[playerId] = res.id;
          }
          okCount++;
        } catch (e: any) {
          failed.push(playerId);
        }
      })
    );
    if (Object.keys(newIds).length) {
      setIds((prev) => ({ ...prev, ...newIds }));
    }
    setSavedIds((prev) => {
      const n = new Set(prev);
      for (const pid of dirty) if (!failed.includes(pid)) n.add(pid);
      return n;
    });
    setDirty(new Set(failed));
    qc.invalidateQueries({ queryKey: ["event-feedback", eventId] });
    setSaving(false);
    if (failed.length === 0) {
      toast.success(t("common.saved"), {
        description: t("feedback.bulkSaved", {
          defaultValue: "{{count}} retour(s) enregistré(s).",
          count: okCount,
        }),
      });
    } else {
      toast.error(
        t("feedback.bulkPartial", {
          defaultValue: "{{ok}} enregistré(s), {{ko}} en échec.",
          ok: okCount,
          ko: failed.length,
        })
      );
    }
  }

  const locale = i18n.language?.startsWith("fr") ? fr : undefined;
  const event = data?.event;
  const sport = (data as any)?.sport ?? null;
  const tags = useMemo(() => getFeedbackTagsForSport(sport), [sport]);

  return (
    <div className="px-5 pt-6 pb-28 space-y-5">
      <Link
        to="/events/$eventId"
        params={{ eventId }}
        className="inline-flex items-center text-sm text-muted-foreground gap-1"
      >
        <ChevronLeft className="h-4 w-4" /> {t("common.back")}
      </Link>

      <div>
        <h1 className="text-xl font-semibold">
          {t("feedback.postMatchTitle", { defaultValue: "Retours coach" })}
        </h1>
        {event && (
          <p className="text-sm text-muted-foreground mt-0.5 truncate">
            {(event as any).title}
            {(event as any).starts_at &&
              ` · ${format(new Date((event as any).starts_at), "EEE d MMM", { locale })}`}
          </p>
        )}
        <p className="text-xs text-muted-foreground mt-2">
          {t("feedback.bulkHint", {
            defaultValue:
              "Note rapide pour tous les joueurs. Tout est enregistré en une fois.",
          })}
        </p>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        </div>
      ) : !data || data.players.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
          {t("feedback.noPlayers", { defaultValue: "Aucun joueur convoqué." })}
        </div>
      ) : (
        <ul className="space-y-3">
          {data.players.map((row: any) => (
            <PlayerRow
              key={row.player.id}
              player={row.player}
              attendance={row.attendance}
              value={values[row.player.id] ?? EMPTY}
              saved={savedIds.has(row.player.id)}
              isDirty={dirty.has(row.player.id)}
              saving={saving}
              tags={tags}
              onPatch={patch}
              onToggleTag={toggleTag}
              onSaveOne={saveOne}
              onOpenPlayer={openPlayer}
            />
          ))}
        </ul>
      )}

      {/* Sticky save bar */}
      {data && data.players.length > 0 && (
        <div className="fixed bottom-16 left-0 right-0 z-50 border-t border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 px-5 py-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]">
          <div className="mx-auto max-w-3xl flex items-center gap-3">
            <p className="text-xs text-muted-foreground flex-1">
              {dirty.size > 0
                ? t("feedback.dirtyCount", {
                    defaultValue: "{{count}} modification(s) en attente",
                    count: dirty.size,
                  })
                : t("feedback.allSaved", { defaultValue: "Tout est à jour" })}
            </p>
            <Button
              type="button"
              onClick={saveAll}
              disabled={saving || dirty.size === 0}
              className="h-10 min-w-32"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                t("feedback.saveAll", { defaultValue: "Tout enregistrer" })
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
