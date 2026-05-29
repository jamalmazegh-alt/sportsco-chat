import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, useMyRoles } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Check, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { AchievementBadge, ACHIEVEMENT_TYPES } from "@/components/player-journey/achievement-badge";

export const Route = createFileRoute("/_authenticated/players/$playerId/achievements")({
  component: AchievementsTab,
});

function AchievementsTab() {
  const { playerId } = Route.useParams();
  const { t } = useTranslation();
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
    queryKey: ["achievements", playerId],
    queryFn: async () => (await supabase.from("player_achievements").select("*").eq("player_id", playerId).order("achievement_date", { ascending: false, nullsFirst: false })).data ?? [],
  });

  const confirmed = items.filter((i) => i.status === "confirmed");
  const pending = items.filter((i) => i.status === "suggested");

  const setStatus = useMutation({
    mutationFn: async (p: { id: string; status: "confirmed" | "rejected" }) => {
      const { error } = await supabase.from("player_achievements").update({ status: p.status }).eq("id", p.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["achievements", playerId] }),
    onError: (e) => toast.error(e instanceof Error ? e.message : "error"),
  });

  return (
    <div className="space-y-5 pt-3">
      {canEdit && (
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button size="sm" className="gap-1.5"><Plus className="h-4 w-4" />{t("journey.achievement.addBtn")}</Button>
          </SheetTrigger>
          <SheetContent side="bottom" className="max-h-[90vh] overflow-y-auto">
            <SheetHeader><SheetTitle>{t("journey.achievement.addBtn")}</SheetTitle></SheetHeader>
            {player?.club_id && (
              <AchievementForm playerId={playerId} clubId={player.club_id} userId={user?.id ?? null}
                onDone={() => { setOpen(false); qc.invalidateQueries({ queryKey: ["achievements", playerId] }); }} />
            )}
          </SheetContent>
        </Sheet>
      )}

      {canEdit && pending.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">{t("journey.achievement.pendingTitle")}</h3>
          <div className="grid grid-cols-2 gap-3">
            {pending.map((it) => (
              <div key={it.id} className="relative">
                <AchievementBadge type={it.achievement_type} title={it.title} subtitle={it.season_label} dim />
                <div className="mt-2 flex gap-1.5">
                  <Button size="sm" variant="outline" className="flex-1" onClick={() => setStatus.mutate({ id: it.id, status: "confirmed" })}>
                    <Check className="h-3.5 w-3.5" />{t("journey.achievement.confirm")}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setStatus.mutate({ id: it.id, status: "rejected" })}>
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {confirmed.length > 0 ? (
        <div className="grid grid-cols-2 gap-3">
          {confirmed.map((it) => (
            <AchievementBadge key={it.id} type={it.achievement_type} title={it.title} subtitle={it.season_label} />
          ))}
        </div>
      ) : (
        pending.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <div className="text-4xl mb-2">🏆</div>
            <p className="font-medium">{t("journey.achievement.noneTitle")}</p>
            <p className="text-sm">{t("journey.achievement.noneHint")}</p>
          </div>
        )
      )}
    </div>
  );
}

function AchievementForm({ playerId, clubId, userId, onDone }: { playerId: string; clubId: string; userId: string | null; onDone: () => void }) {
  const { t } = useTranslation();
  const [type, setType] = useState("champion");
  const [title, setTitle] = useState("");
  const [season, setSeason] = useState("");
  const [date, setDate] = useState("");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState("private");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!title.trim()) return;
    setBusy(true);
    const { error } = await supabase.from("player_achievements").insert({
      player_id: playerId, club_id: clubId, achievement_type: type, title: title.trim(),
      season_label: season || null, achievement_date: date || null,
      description: description || null, visibility, status: "confirmed",
      source: "manual", created_by: userId,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    onDone();
  }

  return (
    <div className="space-y-3 pt-4">
      <div><Label>{t("journey.achievement.fields.type")}</Label>
        <Select value={type} onValueChange={setType}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>{ACHIEVEMENT_TYPES.map((tp) => (
            <SelectItem key={tp} value={tp}>{t(`journey.achievement.type.${tp}`)}</SelectItem>
          ))}</SelectContent>
        </Select>
      </div>
      <div><Label>{t("journey.achievement.fields.title")}</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} /></div>
      <div className="grid grid-cols-2 gap-2">
        <div><Label>{t("journey.achievement.fields.season")}</Label><Input placeholder="2025-2026" value={season} onChange={(e) => setSeason(e.target.value)} /></div>
        <div><Label>{t("journey.achievement.fields.date")}</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
      </div>
      <div><Label>{t("journey.achievement.fields.description")}</Label><Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} /></div>
      <div><Label>{t("journey.achievement.fields.visibility")}</Label>
        <Select value={visibility} onValueChange={setVisibility}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="private">{t("journey.achievement.visibility.private")}</SelectItem>
            <SelectItem value="club">{t("journey.achievement.visibility.club")}</SelectItem>
            <SelectItem value="public">{t("journey.achievement.visibility.public")}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <Button onClick={submit} disabled={busy || !title.trim()} className="w-full">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : t("journey.achievement.addBtn")}
      </Button>
    </div>
  );
}
