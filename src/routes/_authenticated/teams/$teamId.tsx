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
import { PhoneInput } from "@/components/phone-input";
import { SportSelect } from "@/components/sport-select";
import { sendTransactionalEmail } from "@/lib/email/send";
import { useServerFn } from "@tanstack/react-start";
import { sendSms } from "@/lib/sms.functions";
import { ChevronLeft, ChevronRight, Plus, UserCircle2, Loader2, Camera, Pencil, Send, X, CheckSquare } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/teams/$teamId")({
  component: TeamDetail,
  head: () => ({ meta: [{ title: "Team — Clubero" }] }),
});

type RespondBy = "player" | "parent" | "both";

function TeamDetail() {
  const { teamId } = Route.useParams();
  const { t } = useTranslation();
  const { activeClubId, user } = useAuth();
  const role = useActiveRole();
  const isCoach = role === "admin" || role === "coach";
  const qc = useQueryClient();
  const sendSmsFn = useServerFn(sendSms);

  const { data: team } = useQuery({
    queryKey: ["team", teamId],
    queryFn: async () => {
      const { data } = await supabase
        .from("teams")
        .select("id, name, age_group, championship, competitions, sport, season, image_url, club_id")
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
        .select("player_id, players:player_id(id, first_name, last_name, jersey_number, preferred_position, photo_url, user_id, email, phone)")
        .eq("team_id", teamId)
        .eq("role", "player");
      return (tm ?? [])
        .map((r: any) => r.players)
        .filter(Boolean)
        .sort((a: any, b: any) => (a.last_name ?? "").localeCompare(b.last_name ?? ""));
    },
  });

  // Selection state for bulk invitations
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [inviting, setInviting] = useState(false);

  function toggleSelected(id: string) {
    setSelectedIds((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Add player form state
  const [open, setOpen] = useState(false);
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [jersey, setJersey] = useState("");
  const [position, setPosition] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [parentFirst, setParentFirst] = useState("");
  const [parentLast, setParentLast] = useState("");
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
  const [editSport, setEditSport] = useState("");
  const [editBusy, setEditBusy] = useState(false);

  function openEdit() {
    setEditName(team?.name ?? "");
    setEditAge(team?.age_group ?? "");
    setEditChamp(team?.championship ?? "");
    setEditCompetitions((team as any)?.competitions ?? ["friendly", "championship", "cup"]);
    setEditSeason(team?.season ?? "");
    setEditSport(team?.sport ?? "");
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
        sport: editSport || null,
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
    setParentFirst(""); setParentLast(""); setParentPhone(""); setParentEmail("");
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

  type InviteTarget = {
    role: "player" | "parent";
    firstName?: string;
    email?: string;
    phone?: string;
    playerId: string;
  };

  // Send invitation(s) for a player (player + linked parents). Returns true if at least one invite was dispatched.
  async function sendInvitesForPlayer(playerId: string): Promise<{ sent: number; failed: number; skipped: number }> {
    if (!activeClubId || !user) return { sent: 0, failed: 0, skipped: 1 };

    // Load player + parents
    const [{ data: pl }, { data: parents }] = await Promise.all([
      supabase.from("players").select("id, first_name, email, phone, user_id").eq("id", playerId).maybeSingle(),
      supabase.from("player_parents").select("id, full_name, email, phone, parent_user_id").eq("player_id", playerId),
    ]);

    const targets: InviteTarget[] = [];
    if (pl && !pl.user_id && (pl.email || pl.phone)) {
      targets.push({ role: "player", firstName: pl.first_name ?? undefined, email: pl.email ?? undefined, phone: pl.phone ?? undefined, playerId });
    }
    for (const p of parents ?? []) {
      if (!p.parent_user_id && (p.email || p.phone)) {
        targets.push({ role: "parent", firstName: (p.full_name ?? "").split(" ")[0] || undefined, email: p.email ?? undefined, phone: p.phone ?? undefined, playerId });
      }
    }

    if (targets.length === 0) return { sent: 0, failed: 0, skipped: 1 };

    const { data: clubRow } = await supabase.from("clubs").select("name").eq("id", activeClubId).maybeSingle();
    const clubLabel = clubRow?.name ?? "Clubero";

    let sent = 0; let failed = 0;
    for (const target of targets) {
      const token = `${crypto.randomUUID()}-${crypto.randomUUID()}`.replace(/-/g, "");
      const { error: invErr } = await supabase.from("member_invites").insert({
        club_id: activeClubId,
        team_id: teamId,
        player_id: target.role === "player" ? target.playerId : null,
        parent_for_player_id: target.role === "parent" ? target.playerId : null,
        role: target.role === "player" ? "player" : "parent",
        email: target.email ?? null,
        phone: target.phone ?? null,
        token,
        created_by: user.id,
      });
      if (invErr) { failed += 1; continue; }
      const inviteUrl = `${window.location.origin}/register?invite=${encodeURIComponent(token)}`;
      let dispatched = false;
      if (target.email) {
        try {
          await sendTransactionalEmail({
            templateName: "player-invite",
            recipientEmail: target.email,
            idempotencyKey: `member-invite-${token}`,
            templateData: { firstName: target.firstName, teamName: team?.name, clubName: clubLabel, inviteUrl },
          });
          dispatched = true;
        } catch { /* fallthrough to sms */ }
      }
      if (target.phone) {
        try {
          const greet = target.firstName ? `${target.firstName}, ` : "";
          await sendSmsFn({ data: { to: target.phone, body: `${greet}${clubLabel} invites you to join ${team?.name ?? "the team"} on Clubero: ${inviteUrl}` } });
          dispatched = true;
        } catch { /* ignore */ }
      }
      if (dispatched) sent += 1; else failed += 1;
    }
    return { sent, failed, skipped: 0 };
  }

  async function inviteOne(playerId: string) {
    if (!user) return;
    // Verify inviter has a verified phone
    const { data: inviter } = await supabase.from("profiles").select("phone_verified_at").eq("id", user.id).maybeSingle();
    if (!inviter?.phone_verified_at) {
      toast.warning(t("players.inviterPhoneRequired"));
      return;
    }
    setInviting(true);
    const r = await sendInvitesForPlayer(playerId);
    setInviting(false);
    if (r.skipped) toast.warning(t("players.inviteNoContact"));
    else if (r.failed && !r.sent) toast.error(t("players.inviteFailed"));
    else if (r.failed) toast.warning(t("players.invitePartial", { sent: r.sent, failed: r.failed }));
    else toast.success(t("players.inviteSent"));
  }

  async function inviteSelected() {
    if (!user || selectedIds.size === 0) return;
    const { data: inviter } = await supabase.from("profiles").select("phone_verified_at").eq("id", user.id).maybeSingle();
    if (!inviter?.phone_verified_at) {
      toast.warning(t("players.inviterPhoneRequired"));
      return;
    }
    setInviting(true);
    let totalSent = 0; let totalFailed = 0; let totalSkipped = 0;
    for (const id of selectedIds) {
      const r = await sendInvitesForPlayer(id);
      totalSent += r.sent; totalFailed += r.failed; totalSkipped += r.skipped;
    }
    setInviting(false);
    setSelectMode(false);
    setSelectedIds(new Set());
    if (totalSent === 0 && totalFailed === 0) toast.warning(t("players.inviteNoContact"));
    else if (totalFailed) toast.warning(t("players.inviteBulkResult", { sent: totalSent, failed: totalFailed, skipped: totalSkipped }));
    else toast.success(t("players.inviteBulkSent", { count: totalSent }));
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

    const parentFullName = `${parentFirst.trim()} ${parentLast.trim()}`.trim();
    if (parentFullName || parentPhone || parentEmail) {
      await supabase.from("player_parents").insert({
        player_id: player.id,
        parent_user_id: null,
        full_name: parentFullName || null,
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

      <div className="flex items-start gap-4">
        <TeamImage
          team={team as any}
          isCoach={isCoach}
          onUploaded={() => qc.invalidateQueries({ queryKey: ["team", teamId] })}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h1 className="text-2xl font-semibold truncate">{team?.name ?? ""}</h1>
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
        </div>
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
                <Label>{t("teams.sport")}</Label>
                <SportSelect value={editSport || undefined} onValueChange={setEditSport} />
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

      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          {t("teams.players")}
        </h2>
        {isCoach && (
          <div className="flex items-center gap-2">
            {selectMode ? (
              <>
                <Button size="sm" variant="outline" className="h-9" onClick={() => { setSelectMode(false); setSelectedIds(new Set()); }}>
                  <X className="h-4 w-4" />
                </Button>
                <Button size="sm" className="h-9" disabled={inviting || selectedIds.size === 0} onClick={inviteSelected}>
                  {inviting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  {t("players.inviteSelected", { count: selectedIds.size })}
                </Button>
              </>
            ) : (
              <>
                {(players ?? []).some((p: any) => !p.user_id && (p.email || p.phone)) && (
                  <Button size="sm" variant="outline" className="h-9" onClick={() => setSelectMode(true)}>
                    <CheckSquare className="h-4 w-4" />
                    {t("players.invite")}
                  </Button>
                )}
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
                      <PhoneInput value={phone} onChange={setPhone} />
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
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label>{t("players.firstName")}</Label>
                        <Input value={parentFirst} onChange={(e) => setParentFirst(e.target.value)} />
                      </div>
                      <div className="space-y-1.5">
                        <Label>{t("players.lastName")}</Label>
                        <Input value={parentLast} onChange={(e) => setParentLast(e.target.value)} />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label>{t("players.phone")}</Label>
                        <PhoneInput value={parentPhone} onChange={setParentPhone} />
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
              </>
            )}
          </div>
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

function TeamImage({ team, isCoach, onUploaded }: { team: any; isCoach: boolean; onUploaded: () => void }) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);

  async function onPick(file: File) {
    if (!team?.club_id) return;
    setBusy(true);
    const ext = file.name.split(".").pop() || "jpg";
    const path = `${team.club_id}/${team.id}-${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from("team-images")
      .upload(path, file, { upsert: true, contentType: file.type });
    if (upErr) { setBusy(false); toast.error(upErr.message); return; }
    const { data: pub } = supabase.storage.from("team-images").getPublicUrl(path);
    const { error: updErr } = await supabase.from("teams").update({ image_url: pub.publicUrl }).eq("id", team.id);
    setBusy(false);
    if (updErr) { toast.error(updErr.message); return; }
    onUploaded();
    toast.success(t("common.saved"));
  }

  const inner = team?.image_url ? (
    <img src={team.image_url} alt={team?.name ?? ""} className="h-full w-full object-cover" />
  ) : busy ? (
    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
  ) : (
    <Camera className="h-5 w-5 text-muted-foreground" />
  );

  if (!isCoach) {
    return <div className="h-20 w-20 rounded-2xl bg-muted overflow-hidden flex items-center justify-center shrink-0">{inner}</div>;
  }

  return (
    <label className="h-20 w-20 rounded-2xl bg-muted overflow-hidden flex items-center justify-center shrink-0 cursor-pointer relative group" title={t("teams.uploadImage")}>
      {inner}
      <input type="file" accept="image/*" className="hidden" disabled={busy} onChange={(e) => { const f = e.target.files?.[0]; if (f) onPick(f); }} />
    </label>
  );
}

