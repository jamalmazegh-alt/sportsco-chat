import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useAuth, useActiveRole } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger,
} from "@/components/ui/sheet";
import { ChevronLeft, ChevronRight, Plus, UserCircle2, Loader2, Camera, Pencil } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/teams/$teamId")({
  component: TeamDetail,
  head: () => ({ meta: [{ title: "Team — Squadly" }] }),
});

type RespondBy = "player" | "parent" | "both";

function TeamDetail() {
  const { teamId } = Route.useParams();
  const { t } = useTranslation();
  const { activeClubId, user } = useAuth();
  const role = useActiveRole();
  const isCoach = role === "admin" || role === "coach";
  const qc = useQueryClient();

  const { data: team } = useQuery({
    queryKey: ["team", teamId],
    queryFn: async () => {
      const { data } = await supabase
        .from("teams")
        .select("id, name, age_group, championship, competitions, sport, season")
        .eq("id", teamId)
        .single();
      return data;
    },
  });

  const { data: players, isLoading } = useQuery({
    queryKey: ["team-players", teamId],
    queryFn: async () => {
      const { data: tm } = await supabase
        .from("team_members")
        .select("player_id, players:player_id(id, first_name, last_name, jersey_number, preferred_position, photo_url, user_id)")
        .eq("team_id", teamId)
        .eq("role", "player");
      return (tm ?? [])
        .map((r: any) => r.players)
        .filter(Boolean)
        .sort((a: any, b: any) => (a.last_name ?? "").localeCompare(b.last_name ?? ""));
    },
  });

  // Add player form state
  const [open, setOpen] = useState(false);
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [jersey, setJersey] = useState("");
  const [position, setPosition] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [parentName, setParentName] = useState("");
  const [parentPhone, setParentPhone] = useState("");
  const [parentEmail, setParentEmail] = useState("");
  const [respondBy, setRespondBy] = useState<RespondBy>("both");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  // Edit team form state
  const [editOpen, setEditOpen] = useState(false);
  const [editName, setEditName] = useState("");
  const [editAge, setEditAge] = useState("");
  const [editChamp, setEditChamp] = useState("");
  const [editCompetitions, setEditCompetitions] = useState(["friendly", "championship", "cup"]);
  const [editSeason, setEditSeason] = useState("");
  const [editBusy, setEditBusy] = useState(false);

  function openEdit() {
    setEditName(team?.name ?? "");
    setEditAge(team?.age_group ?? "");
    setEditChamp(team?.championship ?? "");
    setEditCompetitions((team as any)?.competitions ?? ["friendly", "championship", "cup"]);
    setEditSeason(team?.season ?? "");
    setEditOpen(true);
  }

  function toggleEditCompetition(value: string, checked: boolean) {
    setEditCompetitions((current) => checked ? Array.from(new Set([...current, value])) : current.filter((c) => c !== value));
  }

  async function onSaveTeam(e: FormEvent) {
    e.preventDefault();
    setEditBusy(true);
    const { error } = await supabase
      .from("teams")
      .update({
        name: editName,
        age_group: editAge || null,
        championship: editChamp || null,
        competitions: editCompetitions,
        season: editSeason || null,
      })
      .eq("id", teamId);
    setEditBusy(false);
    if (error) { toast.error(error.message); return; }
    setEditOpen(false);
    qc.invalidateQueries({ queryKey: ["team", teamId] });
    qc.invalidateQueries({ queryKey: ["teams-with-counts"] });
    toast.success(t("common.saved"));
  }

  function reset() {
    setFirst(""); setLast(""); setJersey(""); setPosition("");
    setPhone(""); setEmail("");
    setParentName(""); setParentPhone(""); setParentEmail("");
    setRespondBy("both"); setPhotoFile(null);
  }

  async function uploadPhoto(playerId: string, file: File): Promise<string | null> {
    const ext = file.name.split(".").pop() || "jpg";
    const path = `${activeClubId}/${playerId}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from("player-photos")
      .upload(path, file, { upsert: true, contentType: file.type });
    if (upErr) {
      toast.error(upErr.message);
      return null;
    }
    const { data } = supabase.storage.from("player-photos").getPublicUrl(path);
    return data.publicUrl;
  }

  async function onAdd(e: FormEvent) {
    e.preventDefault();
    if (!activeClubId || !user) return;
    setBusy(true);

    const playerCanRespond = respondBy === "player" || respondBy === "both";
    const parentCanRespond = respondBy === "parent" || respondBy === "both";

    const { data: player, error } = await supabase
      .from("players")
      .insert({
        club_id: activeClubId,
        first_name: first,
        last_name: last,
        jersey_number: jersey ? Number(jersey) : null,
        preferred_position: position || null,
        phone: phone || null,
        email: email || null,
        can_respond: playerCanRespond,
      })
      .select("id")
      .single();
    if (error || !player) {
      setBusy(false);
      toast.error(error?.message ?? "Failed");
      return;
    }

    if (photoFile) {
      const url = await uploadPhoto(player.id, photoFile);
      if (url) {
        await supabase.from("players").update({ photo_url: url }).eq("id", player.id);
      }
    }

    const { error: tmErr } = await supabase
      .from("team_members")
      .insert({ team_id: teamId, player_id: player.id, role: "player" });
    if (tmErr) {
      setBusy(false);
      toast.error(tmErr.message);
      return;
    }

    if (parentName || parentPhone || parentEmail) {
      await supabase.from("player_parents").insert({
        player_id: player.id,
        parent_user_id: null,
        full_name: parentName || null,
        phone: parentPhone || null,
        email: parentEmail || null,
        can_respond: parentCanRespond,
      });
    }

    setBusy(false);
    setOpen(false);
    reset();
    qc.invalidateQueries({ queryKey: ["team-players", teamId] });
    qc.invalidateQueries({ queryKey: ["teams-with-counts"] });
    toast.success(t("teams.addPlayer"));
  }

  return (
    <div className="px-5 pt-6 pb-6 space-y-5">
      <Link to="/teams" className="inline-flex items-center text-sm text-muted-foreground gap-1">
        <ChevronLeft className="h-4 w-4" /> {t("common.back")}
      </Link>

      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{team?.name ?? ""}</h1>
          {team && (
            <p className="text-xs text-muted-foreground mt-1">
              {[team.age_group, team.championship, team.sport, team.season].filter(Boolean).join(" · ")}
            </p>
          )}
        </div>
        {isCoach && team && (
          <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" onClick={openEdit}>
            <Pencil className="h-4 w-4" />
          </Button>
        )}
      </div>

      {isCoach && (
        <Sheet open={editOpen} onOpenChange={setEditOpen}>
          <SheetContent side="bottom" className="rounded-t-3xl">
            <SheetHeader>
              <SheetTitle>{t("common.edit")}</SheetTitle>
            </SheetHeader>
            <form onSubmit={onSaveTeam} className="space-y-4 mt-4 pb-6">
              <div className="space-y-1.5">
                <Label>{t("teams.name")}</Label>
                <Input required value={editName} onChange={(e) => setEditName(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>{t("teams.ageGroup")}</Label>
                <Input value={editAge} onChange={(e) => setEditAge(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>{t("teams.championship")}</Label>
                <Input value={editChamp} onChange={(e) => setEditChamp(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>{t("teams.competitions")}</Label>
                <div className="grid grid-cols-3 gap-2">
                  {(["friendly", "championship", "cup"] as const).map((key) => (
                    <label key={key} className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-sm">
                      <Checkbox checked={editCompetitions.includes(key)} onCheckedChange={(checked) => toggleEditCompetition(key, checked === true)} />
                      {t(`events.competitionTypes.${key}`)}
                    </label>
                  ))}
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>{t("teams.season")}</Label>
                <Input value={editSeason} onChange={(e) => setEditSeason(e.target.value)} />
              </div>
              <Button type="submit" className="w-full h-11" disabled={editBusy}>
                {editBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : t("common.save")}
              </Button>
            </form>
          </SheetContent>
        </Sheet>
      )}

      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          {t("teams.players")}
        </h2>
        {isCoach && (
          <Sheet open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
            <SheetTrigger asChild>
              <Button size="sm" className="h-9">
                <Plus className="h-4 w-4" />
                {t("teams.addPlayer")}
              </Button>
            </SheetTrigger>
            <SheetContent side="bottom" className="h-[92vh] rounded-t-3xl overflow-y-auto">
              <SheetHeader>
                <SheetTitle>{t("teams.addPlayer")}</SheetTitle>
              </SheetHeader>
              <form onSubmit={onAdd} className="space-y-4 mt-4 pb-8">
                {/* Photo */}
                <div className="space-y-1.5">
                  <Label>{t("players.photo")}</Label>
                  <label className="flex items-center gap-3 rounded-xl border border-dashed border-border bg-muted/30 p-3 cursor-pointer">
                    <div className="h-14 w-14 rounded-full bg-muted flex items-center justify-center overflow-hidden">
                      {photoFile ? (
                        <img src={URL.createObjectURL(photoFile)} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <Camera className="h-5 w-5 text-muted-foreground" />
                      )}
                    </div>
                    <span className="text-sm text-muted-foreground">{t("players.uploadPhoto")}</span>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => setPhotoFile(e.target.files?.[0] ?? null)}
                    />
                  </label>
                </div>

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

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>{t("players.jerseyNumber")}</Label>
                    <Input type="number" value={jersey} onChange={(e) => setJersey(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>{t("players.preferredPosition")}</Label>
                    <Input value={position} onChange={(e) => setPosition(e.target.value)} placeholder="GK / DF / MF / FW" />
                  </div>
                </div>

                <div className="pt-2">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                    {t("players.contact")}
                  </p>
                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <Label>{t("players.phone")}</Label>
                      <Input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>{t("players.email")}</Label>
                      <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                    </div>
                  </div>
                </div>

                <div className="pt-2">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                    {t("players.parents")}
                  </p>
                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <Label>{t("players.parentName")}</Label>
                      <Input value={parentName} onChange={(e) => setParentName(e.target.value)} />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label>{t("players.phone")}</Label>
                        <Input type="tel" value={parentPhone} onChange={(e) => setParentPhone(e.target.value)} />
                      </div>
                      <div className="space-y-1.5">
                        <Label>{t("players.email")}</Label>
                        <Input type="email" value={parentEmail} onChange={(e) => setParentEmail(e.target.value)} />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label>{t("players.canRespond")}</Label>
                  <Select value={respondBy} onValueChange={(v) => setRespondBy(v as RespondBy)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="player">{t("players.respondPlayer")}</SelectItem>
                      <SelectItem value="parent">{t("players.respondParent")}</SelectItem>
                      <SelectItem value="both">{t("players.respondBoth")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <Button type="submit" className="w-full h-11" disabled={busy}>
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : t("players.save")}
                </Button>
              </form>
            </SheetContent>
          </Sheet>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-16 rounded-2xl bg-muted animate-pulse" />
          ))}
        </div>
      ) : !players || players.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center">
          <UserCircle2 className="mx-auto h-10 w-10 text-muted-foreground mb-3" />
          <p className="text-sm text-muted-foreground">{t("players.noPlayers")}</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {players.map((p: any) => (
            <li key={p.id}>
              <Link
                to="/players/$playerId"
                params={{ playerId: p.id }}
                className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3 active:scale-[0.99] transition-transform"
              >
                <div className="relative h-12 w-12 shrink-0 rounded-full bg-muted overflow-hidden">
                  {p.photo_url ? (
                    <img src={p.photo_url} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="h-full w-full flex items-center justify-center text-sm font-semibold text-muted-foreground">
                      {(p.first_name?.[0] ?? "") + (p.last_name?.[0] ?? "")}
                    </div>
                  )}
                  <span
                    className={cn(
                      "absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-card",
                      p.user_id ? "bg-present" : "bg-muted-foreground/40"
                    )}
                    title={p.user_id ? t("players.accountActive") : t("players.accountInactive")}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium truncate">
                    {p.first_name} {p.last_name}
                    {p.jersey_number ? (
                      <span className="text-muted-foreground font-normal"> · #{p.jersey_number}</span>
                    ) : null}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {p.preferred_position ?? (p.user_id ? t("players.accountActive") : t("players.accountInactive"))}
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
