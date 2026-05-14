import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useAuth, useActiveRole } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ChevronLeft, Loader2, Camera, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/players/$playerId")({
  component: PlayerProfile,
  head: () => ({ meta: [{ title: "Player — Clubero" }] }),
});

function PlayerProfile() {
  const { playerId } = Route.useParams();
  const { t } = useTranslation();
  const { activeClubId } = useAuth();
  const role = useActiveRole();
  const isCoach = role === "admin" || role === "coach";
  const qc = useQueryClient();

  const { data: player } = useQuery({
    queryKey: ["player", playerId],
    queryFn: async () => {
      const { data } = await supabase
        .from("players")
        .select("id, first_name, last_name, jersey_number, preferred_position, phone, email, photo_url, user_id, can_respond, club_id")
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
    setCanRespond(player.can_respond ?? true);
  }, [player]);

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

  // Parent management
  const [pName, setPName] = useState("");
  const [pPhone, setPPhone] = useState("");
  const [pEmail, setPEmail] = useState("");
  const [pCanRespond, setPCanRespond] = useState(true);

  async function onAddParent(e: FormEvent) {
    e.preventDefault();
    if (!playerId) return;
    const { error } = await supabase.from("player_parents").insert({
      player_id: playerId,
      parent_user_id: null,
      full_name: pName || null,
      phone: pPhone || null,
      email: pEmail || null,
      can_respond: pCanRespond,
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    setPName(""); setPPhone(""); setPEmail(""); setPCanRespond(true);
    refetchParents();
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
          <p className="text-xs text-muted-foreground mt-0.5">
            {player.user_id ? t("players.accountActive") : t("players.accountInactive")}
          </p>
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
          <Label>{t("players.phone")}</Label>
          <Input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} disabled={!isCoach} />
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

      {/* Parents */}
      <div className="space-y-3 rounded-2xl border border-border bg-card p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          {t("players.parents")}
        </h2>

        <ul className="space-y-2">
          {(parents ?? []).map((pp: any) => (
            <li key={pp.id} className="flex items-center justify-between rounded-xl bg-muted/40 p-3">
              <div className="min-w-0 text-sm">
                <p className="font-medium truncate">{pp.full_name ?? pp.email ?? pp.phone ?? "—"}</p>
                <p className="text-xs text-muted-foreground truncate">
                  {[pp.phone, pp.email].filter(Boolean).join(" · ")}
                  {pp.can_respond ? ` · ${t("players.canRespond")}` : ""}
                </p>
              </div>
              {isCoach && (
                <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => onDeleteParent(pp.id)}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              )}
            </li>
          ))}
          {(parents ?? []).length === 0 && (
            <li className="text-xs text-muted-foreground">—</li>
          )}
        </ul>

        {isCoach && (
          <form onSubmit={onAddParent} className="space-y-3 pt-2 border-t border-border">
            <div className="space-y-1.5">
              <Label>{t("players.parentName")}</Label>
              <Input value={pName} onChange={(e) => setPName(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>{t("players.phone")}</Label>
                <Input type="tel" value={pPhone} onChange={(e) => setPPhone(e.target.value)} />
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
            <Button type="submit" variant="outline" className="w-full h-10">
              <Plus className="h-4 w-4" /> {t("players.addParent")}
            </Button>
          </form>
        )}
      </div>
      <span className="sr-only">{activeClubId}</span>
    </div>
  );
}
