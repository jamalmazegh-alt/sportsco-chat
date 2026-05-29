import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, useMyRoles } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Loader2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/players/$playerId/timeline")({
  component: TimelineTab,
});

const ICONS: Record<string, string> = {
  joined_club: "👋", joined_team: "🤝", first_match: "⚽", first_goal: "🥅",
  matches_milestone: "🔥", achievement: "🏆", tournament_participation: "🏟️",
  season_completed: "📅", transfer: "🔄", selection: "🎖️", other: "✨",
};

const TIMELINE_TYPES = ["other", "selection", "transfer", "tournament_participation", "season_completed"];

function TimelineTab() {
  const { playerId } = Route.useParams();
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const roles = useMyRoles();
  const canEdit = roles.includes("admin") || roles.includes("coach") || roles.includes("dirigeant") || roles.includes("parent");
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const { data: player } = useQuery({
    queryKey: ["player-club", playerId],
    queryFn: async () => (await supabase.from("players").select("club_id").eq("id", playerId).single()).data,
  });

  const { data: items = [] } = useQuery({
    queryKey: ["timeline", playerId],
    queryFn: async () => (await supabase.from("player_timeline_events").select("*").eq("player_id", playerId).order("event_date", { ascending: false })).data ?? [],
  });

  const fmt = (d: string) => new Date(d).toLocaleDateString(i18n.language, { year: "numeric", month: "short", day: "numeric" });

  return (
    <div className="space-y-4 pt-3">
      {canEdit && (
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button size="sm" className="gap-1.5"><Plus className="h-4 w-4" />{t("journey.timeline.addBtn")}</Button>
          </SheetTrigger>
          <SheetContent side="bottom" className="max-h-[90vh] overflow-y-auto">
            <SheetHeader><SheetTitle>{t("journey.timeline.addBtn")}</SheetTitle></SheetHeader>
            {player?.club_id && (
              <TimelineForm playerId={playerId} clubId={player.club_id} userId={user?.id ?? null}
                onDone={() => { setOpen(false); qc.invalidateQueries({ queryKey: ["timeline", playerId] }); }} />
            )}
          </SheetContent>
        </Sheet>
      )}

      {items.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <div className="text-4xl mb-2">🌱</div>
          <p className="font-medium">{t("journey.timeline.noneTitle")}</p>
          <p className="text-sm">{t("journey.timeline.noneHint")}</p>
        </div>
      ) : (
        <ol className="relative border-l-2 border-border ml-3 space-y-5 pl-5">
          {items.map((it) => (
            <li key={it.id} className="relative">
              <span className="absolute -left-[34px] top-0 grid place-content-center h-8 w-8 rounded-full bg-card border-2 border-border text-base">
                {ICONS[it.event_type] ?? "✨"}
              </span>
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{fmt(it.event_date)}</div>
              <div className="font-semibold text-sm">{it.title}</div>
              {it.description && <div className="text-sm text-muted-foreground mt-0.5">{it.description}</div>}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function TimelineForm({ playerId, clubId, userId, onDone }: { playerId: string; clubId: string; userId: string | null; onDone: () => void }) {
  const { t } = useTranslation();
  const [type, setType] = useState("other");
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!title.trim() || !date) return;
    setBusy(true);
    const { error } = await supabase.from("player_timeline_events").insert({
      player_id: playerId, club_id: clubId, event_type: type, title: title.trim(),
      description: description || null, event_date: date, source: "manual", created_by: userId,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    onDone();
  }

  return (
    <div className="space-y-3 pt-4">
      <div><Label>{t("journey.timeline.fields.type")}</Label>
        <Select value={type} onValueChange={setType}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>{TIMELINE_TYPES.map((tp) => (
            <SelectItem key={tp} value={tp}>{t(`journey.timeline.event.${tp}`)}</SelectItem>
          ))}</SelectContent>
        </Select>
      </div>
      <div><Label>{t("journey.timeline.fields.title")}</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} /></div>
      <div><Label>{t("journey.timeline.fields.date")}</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
      <div><Label>{t("journey.timeline.fields.description")}</Label><Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} /></div>
      <Button onClick={submit} disabled={busy || !title.trim()} className="w-full">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : t("journey.timeline.addBtn")}
      </Button>
    </div>
  );
}
