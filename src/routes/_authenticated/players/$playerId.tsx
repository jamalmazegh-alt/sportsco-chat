import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useAuth, useActiveRole } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { PhoneInput } from "@/components/phone-input";
import { ChevronLeft, Loader2, Camera, Plus, Trash2, UserCircle2, ShieldCheck, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/players/$playerId")({
  component: PlayerProfile,
  head: () => ({ meta: [{ title: "Player — Clubero" }] }),
});

function isMinorFromBirthDate(birth: string | null | undefined): boolean {
  if (!birth) return false;
  const d = new Date(birth);
  const now = new Date();
  const age = (now.getTime() - d.getTime()) / (365.25 * 24 * 3600 * 1000);
  return age < 18;
}

function PlayerProfile() {
  const { playerId } = Route.useParams();
  const { t } = useTranslation();
  const { user, activeClubId } = useAuth();
  const role = useActiveRole();
  const isCoach = role === "admin" || role === "coach";
  const qc = useQueryClient();

  const { data: player, refetch: refetchPlayer } = useQuery({
    queryKey: ["player", playerId],
    queryFn: async () => {
      const { data } = await supabase
        .from("players")
        .select("id, first_name, last_name, jersey_number, preferred_position, phone, email, photo_url, user_id, can_respond, club_id, birth_date, child_platform_access")
        .eq("id", playerId)
        .single();
      return data;
    },
  });

  const { data: parents, refetch: refetchParents } = useQuery({
    queryKey: ["player-parents", playerId],
    queryFn: async () => {
      const { data } = await supabase
        .from("player_parents")
        .select("id, full_name, phone, email, parent_user_id, can_respond")
        .eq("player_id", playerId);
      return data ?? [];
    },
  });

  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [jersey, setJersey] = useState("");
  const [position, setPosition] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [canRespond, setCanRespond] = useState(true);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!player) return;
    setFirst(player.first_name ?? "");
    setLast(player.last_name ?? "");
    setJersey(player.jersey_number?.toString() ?? "");
    setPosition(player.preferred_position ?? "");
    setPhone(player.phone ?? "");
    setEmail(player.email ?? "");
    setBirthDate(player.birth_date ?? "");
    setCanRespond(player.can_respond ?? true);
  }, [player]);

  const minor = isMinorFromBirthDate(player?.birth_date);
  const isParentOfThisPlayer = !!parents?.some((p) => p.parent_user_id === user?.id);

  async function onSave(e: FormEvent) {
    e.preventDefault();
    if (!player) return;
    setBusy(true);

    let photo_url = player.photo_url;
    if (photoFile) {
      const ext = photoFile.name.split(".").pop() || "jpg";
      const path = `${player.club_id}/${player.id}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("player-photos")
        .upload(path, photoFile, { upsert: true, contentType: photoFile.type });
      if (!upErr) {
        const { data } = supabase.storage.from("player-photos").getPublicUrl(path);
        photo_url = data.publicUrl;
      }
    }

    const { error } = await supabase
      .from("players")
      .update({
        first_name: first,
        last_name: last,
        jersey_number: jersey ? Number(jersey) : null,
        preferred_position: position || null,
        phone: phone || null,
        email: email || null,
        birth_date: birthDate || null,
        can_respond: canRespond,
        photo_url,
      })
      .eq("id", player.id);
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    qc.invalidateQueries({ queryKey: ["player", playerId] });
    qc.invalidateQueries({ queryKey: ["team-players"] });
    toast.success(t("common.saved"));
  }

  async function toggleChildAccess(value: boolean) {
    if (!player) return;
    const { error } = await supabase
      .from("players")
      .update({ child_platform_access: value })
      .eq("id", player.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    refetchPlayer();
    toast.success(t("common.saved"));
  }

  // ---- Parent form (collapsed) ----
  const [showParentForm, setShowParentForm] = useState(false);
  const [pFirstName, setPFirstName] = useState("");
  const [pLastName, setPLastName] = useState("");
  const [pPhone, setPPhone] = useState("");
  const [pEmail, setPEmail] = useState("");
  const [pCanRespond, setPCanRespond] = useState(true);
  const [pBusy, setPBusy] = useState(false);

  function resetParentForm() {
    setPFirstName(""); setPLastName(""); setPPhone(""); setPEmail(""); setPCanRespond(true);
  }

  async function onAddParent(e: FormEvent) {
    e.preventDefault();
    if (!playerId) return;
    setPBusy(true);
    const fullName = [pFirstName, pLastName].map((s) => s.trim()).filter(Boolean).join(" ");
    const { error } = await supabase.from("player_parents").insert({
      player_id: playerId,
      parent_user_id: null,
      full_name: fullName || null,
      phone: pPhone || null,
      email: pEmail || null,
      can_respond: pCanRespond,
    });
    setPBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    resetParentForm();
    setShowParentForm(false);
    refetchParents();
    toast.success(t("common.saved"));
  }

  async function onDeleteParent(id: string) {
    await supabase.from("player_parents").delete().eq("id", id);
    refetchParents();
  }

  if (!player) {
    return (
      <div className="flex justify-center pt-20">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="px-5 pt-6 pb-10 space-y-5">
      <Link to="/teams" className="inline-flex items-center text-sm text-muted-foreground gap-1">
        <ChevronLeft className="h-4 w-4" /> {t("common.back")}
      </Link>

      {/* PLAYER (main) */}
      <div className="flex items-center gap-4">
        <div className="relative h-16 w-16 rounded-full bg-muted overflow-hidden shrink-0">
          {player.photo_url ? (
            <img src={player.photo_url} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="h-full w-full flex items-center justify-center text-base font-semibold text-muted-foreground">
              {(player.first_name?.[0] ?? "") + (player.last_name?.[0] ?? "")}
            </div>
          )}
          <span
            className={cn(
              "absolute bottom-0 right-0 h-4 w-4 rounded-full border-2 border-background",
              player.user_id ? "bg-present" : "bg-muted-foreground/40"
            )}
          />
        </div>
        <div className="min-w-0">
          <h1 className="text-xl font-semibold truncate">
            {player.first_name} {player.last_name}
          </h1>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            <span className={cn(
              "inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full",
              player.user_id ? "bg-present/15 text-present" : "bg-muted text-muted-foreground",
            )}>
              {player.user_id ? t("players.accountActive") : t("players.accountInactive")}
            </span>
            {minor && (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-accent text-accent-foreground">
                {t("players.minor")}
              </span>
            )}
          </div>
        </div>
      </div>

      <form onSubmit={onSave} className="space-y-4 rounded-2xl border border-border bg-card p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          {t("players.details")}
        </h2>

        <div className="space-y-1.5">
          <Label>{t("players.photo")}</Label>
          <label className="flex items-center gap-3 rounded-xl border border-dashed border-border bg-muted/30 p-3 cursor-pointer">
            <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center overflow-hidden">
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
              disabled={!isCoach}
            />
          </label>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>{t("players.firstName")}</Label>
            <Input required value={first} onChange={(e) => setFirst(e.target.value)} disabled={!isCoach} />
          </div>
          <div className="space-y-1.5">
            <Label>{t("players.lastName")}</Label>
            <Input required value={last} onChange={(e) => setLast(e.target.value)} disabled={!isCoach} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>{t("players.jerseyNumber")}</Label>
            <Input type="number" value={jersey} onChange={(e) => setJersey(e.target.value)} disabled={!isCoach} />
          </div>
          <div className="space-y-1.5">
            <Label>{t("players.preferredPosition")}</Label>
            <Input value={position} onChange={(e) => setPosition(e.target.value)} disabled={!isCoach} />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>{t("players.birthDate")}</Label>
          <Input type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} disabled={!isCoach} />
        </div>
        <div className="space-y-1.5">
          <Label>{t("players.phone")}</Label>
          {isCoach ? (
            <PhoneInput value={phone} onChange={setPhone} />
          ) : (
            <Input value={phone} disabled />
          )}
        </div>
        <div className="space-y-1.5">
          <Label>{t("players.email")}</Label>
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={!isCoach} />
        </div>
        <div className="flex items-center justify-between rounded-xl bg-muted/40 p-3">
          <span className="text-sm">{t("players.canRespond")} ({t("players.respondPlayer")})</span>
          <input
            type="checkbox"
            className="h-5 w-5 accent-primary"
            checked={canRespond}
            onChange={(e) => setCanRespond(e.target.checked)}
            disabled={!isCoach}
          />
        </div>

        {isCoach && (
          <Button type="submit" className="w-full h-11" disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : t("common.save")}
          </Button>
        )}
      </form>

      {/* CHILD PLATFORM ACCESS — only meaningful for minors, controlled by their parent */}
      {minor && (isParentOfThisPlayer || isCoach) && (
        <div className="rounded-2xl border border-border bg-card p-5 space-y-3">
          <div className="flex items-start gap-3">
            <ShieldCheck className="h-5 w-5 text-primary mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">{t("players.childAccessTitle")}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{t("players.childAccessHint")}</p>
            </div>
            <Switch
              checked={!!player.child_platform_access}
              onCheckedChange={toggleChildAccess}
              disabled={!isParentOfThisPlayer && !isCoach}
            />
          </div>
        </div>
      )}

      {/* PARENTS — separate card */}
      <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            {t("players.parents")}
          </h2>
          {isCoach && !showParentForm && (
            <Button size="sm" variant="outline" className="h-8" onClick={() => setShowParentForm(true)}>
              <Plus className="h-4 w-4" /> {t("players.addParent")}
            </Button>
          )}
        </div>

        {(parents ?? []).length === 0 && !showParentForm && (
          <div className="rounded-xl border border-dashed border-border p-6 text-center">
            <UserCircle2 className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
            <p className="text-xs text-muted-foreground">
              {minor ? t("players.parentRequiredForMinor") : t("players.noParents")}
            </p>
          </div>
        )}

        <ul className="space-y-2">
          {(parents ?? []).map((pp: any) => {
            const linked = !!pp.parent_user_id;
            return (
              <li key={pp.id} className="flex items-center gap-3 rounded-xl border border-border bg-muted/30 p-3">
                <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center shrink-0">
                  <UserCircle2 className="h-5 w-5 text-muted-foreground" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-medium truncate text-sm">{pp.full_name ?? pp.email ?? pp.phone ?? "—"}</p>
                    <span className={cn(
                      "inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 rounded-full",
                      linked ? "bg-present/15 text-present" : "bg-muted text-muted-foreground",
                    )}>
                      {linked ? t("players.accountActive") : t("players.accountInactive")}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground truncate mt-0.5">
                    {[pp.phone, pp.email].filter(Boolean).join(" · ") || "—"}
                    {pp.can_respond ? ` · ${t("players.canRespond")}` : ""}
                  </p>
                </div>
                {isCoach && (
                  <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" onClick={() => onDeleteParent(pp.id)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                )}
              </li>
            );
          })}
        </ul>

        {isCoach && showParentForm && (
          <form onSubmit={onAddParent} className="space-y-3 pt-3 border-t border-border">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">{t("players.addParent")}</p>
              <Button type="button" size="icon" variant="ghost" className="h-7 w-7" onClick={() => { resetParentForm(); setShowParentForm(false); }}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>{t("players.parentFirstName")}</Label>
                <Input value={pFirstName} onChange={(e) => setPFirstName(e.target.value)} required />
              </div>
              <div className="space-y-1.5">
                <Label>{t("players.parentLastName")}</Label>
                <Input value={pLastName} onChange={(e) => setPLastName(e.target.value)} required />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>{t("players.phone")}</Label>
                <PhoneInput value={pPhone} onChange={setPPhone} />
              </div>
              <div className="space-y-1.5">
                <Label>{t("players.email")}</Label>
                <Input type="email" value={pEmail} onChange={(e) => setPEmail(e.target.value)} />
              </div>
            </div>
            <div className="flex items-center justify-between rounded-xl bg-muted/40 p-3">
              <span className="text-sm">{t("players.canRespond")}</span>
              <input
                type="checkbox"
                className="h-5 w-5 accent-primary"
                checked={pCanRespond}
                onChange={(e) => setPCanRespond(e.target.checked)}
              />
            </div>
            <Button type="submit" className="w-full h-10" disabled={pBusy}>
              {pBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : t("players.addParent")}
            </Button>
          </form>
        )}
      </div>

      <span className="sr-only">{activeClubId}</span>
    </div>
  );
}
