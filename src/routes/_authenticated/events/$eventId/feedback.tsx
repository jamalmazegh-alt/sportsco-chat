import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronLeft, Loader2, ChevronDown, ChevronRight, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import {
  listEventPlayersForFeedback,
  createPlayerFeedback,
  updatePlayerFeedback,
} from "@/lib/player-feedback.functions";
import {
  PlayerFeedbackForm,
  EMPTY_FEEDBACK,
  type FeedbackFormValue,
} from "@/components/player-feedback-form";
import { useActiveRole, useAuth } from "@/lib/auth-context";
import { Navigate } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/events/$eventId/feedback")({
  component: PostMatchFeedback,
  head: () => ({ meta: [{ title: "Retours coach — Clubero" }] }),
});

function PostMatchFeedback() {
  const { eventId } = Route.useParams();
  const { t, i18n } = useTranslation();
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

  const [values, setValues] = useState<Record<string, FeedbackFormValue>>({});
  const [ids, setIds] = useState<Record<string, string | null>>({});
  const [openId, setOpenId] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!data) return;
    const v: Record<string, FeedbackFormValue> = {};
    const ix: Record<string, string | null> = {};
    for (const row of data.players) {
      const ex = data.existing[row.player.id];
      ix[row.player.id] = ex?.id ?? null;
      v[row.player.id] = ex
        ? {
            rating: ex.rating ?? null,
            comment: ex.comment ?? "",
            devNotes: ex.dev_notes ?? "",
            strengths: ex.strengths ?? "",
            improvements: ex.improvements ?? "",
            tags: ex.tags ?? [],
            visibility: ex.visibility ?? "coach_only",
            sharedSummary: ex.shared_summary ?? "",
          }
        : { ...EMPTY_FEEDBACK };
    }
    setValues(v);
    setIds(ix);
    const filled = new Set<string>();
    for (const row of data.players) if (data.existing[row.player.id]) filled.add(row.player.id);
    setSavedIds(filled);
  }, [data]);

  if (!isAccessLoading && !isCoach && canAccessFeedback === false) return <Navigate to="/home" replace />;

  async function saveOne(playerId: string) {
    const v = values[playerId];
    if (!v) return;
    setSavingId(playerId);
    try {
      const existingId = ids[playerId];
      if (existingId) {
        await updateFn({
          data: {
            id: existingId,
            rating: v.rating,
            comment: v.comment || null,
            devNotes: v.devNotes || null,
            strengths: v.strengths || null,
            improvements: v.improvements || null,
            tags: v.tags,
            visibility: v.visibility,
            sharedSummary: v.sharedSummary || null,
          },
        });
      } else {
        const res = await createFn({
          data: {
            playerId,
            eventId,
            rating: v.rating,
            comment: v.comment || null,
            devNotes: v.devNotes || null,
            strengths: v.strengths || null,
            improvements: v.improvements || null,
            tags: v.tags,
            visibility: v.visibility,
            sharedSummary: v.sharedSummary || null,
          },
        });
        setIds((p) => ({ ...p, [playerId]: res.id }));
      }
      setSavedIds((p) => new Set(p).add(playerId));
      qc.invalidateQueries({ queryKey: ["event-feedback", eventId] });
      qc.invalidateQueries({ queryKey: ["player-feedback", playerId] });
      toast.success(t("common.saved"));
    } catch (e: any) {
      toast.error(e?.message ?? "Error");
    } finally {
      setSavingId(null);
    }
  }

  const locale = i18n.language?.startsWith("fr") ? fr : undefined;
  const event = data?.event;

  return (
    <div className="px-5 pt-6 pb-10 space-y-5">
      <Link to="/events/$eventId" params={{ eventId }} className="inline-flex items-center text-sm text-muted-foreground gap-1">
        <ChevronLeft className="h-4 w-4" /> {t("common.back")}
      </Link>

      <div>
        <h1 className="text-xl font-semibold">
          {t("feedback.postMatchTitle", { defaultValue: "Retours coach" })}
        </h1>
        {event && (
          <p className="text-sm text-muted-foreground mt-0.5 truncate">
            {event.title}
            {event.starts_at &&
              ` · ${format(new Date(event.starts_at), "EEE d MMM", { locale })}`}
          </p>
        )}
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
        <ul className="space-y-2">
          {data.players.map((row: any) => {
            const p = row.player;
            const open = openId === p.id;
            const saved = savedIds.has(p.id);
            return (
              <li
                key={p.id}
                className={cn(
                  "rounded-2xl border bg-card transition-colors",
                  saved ? "border-primary/40" : "border-border"
                )}
              >
                <button
                  type="button"
                  onClick={() => setOpenId(open ? null : p.id)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 text-left"
                >
                  <div className="h-9 w-9 rounded-full bg-muted overflow-hidden flex items-center justify-center shrink-0">
                    {p.photo_url ? (
                      <img src={p.photo_url} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <span className="text-xs font-semibold text-muted-foreground">
                        {(p.first_name?.[0] ?? "") + (p.last_name?.[0] ?? "")}
                      </span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">
                      {p.first_name} {p.last_name}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {t(`attendance.${row.attendance}`, { defaultValue: row.attendance })}
                    </p>
                  </div>
                  {saved && <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />}
                  {open ? (
                    <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                  )}
                </button>
                {open && values[p.id] && (
                  <div className="px-3 pb-3">
                    <PlayerFeedbackForm
                      value={values[p.id]}
                      onChange={(next) =>
                        setValues((prev) => ({ ...prev, [p.id]: next }))
                      }
                      onSubmit={() => saveOne(p.id)}
                      busy={savingId === p.id}
                      compact
                    />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
