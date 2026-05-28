import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Car, Users, Plus, Trash2, Loader2, HandHelping } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Convocation = {
  id: string;
  status: "present" | "absent" | "uncertain" | "pending";
  player_id: string;
  players?: { id: string; first_name: string; last_name: string; user_id: string | null } | null;
};

type Carpool = {
  id: string;
  event_id: string;
  driver_user_id: string;
  driver_name: string;
  vehicle_type: "car" | "van";
  total_seats: number;
  departure_note: string | null;
};

type Passenger = {
  id: string;
  carpool_id: string;
  passenger_user_id: string;
  player_ids: string[];
};

type Need = {
  id: string;
  event_id: string;
  parent_user_id: string;
  player_ids: string[];
  note: string | null;
};

interface Props {
  eventId: string;
  teamId: string;
  isCoach: boolean;
  convocations: Convocation[];
  childrenLinks: string[]; // player_ids the current user is parent of
}

export function CarpoolSection({ eventId, isCoach, convocations, childrenLinks }: Props) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const qc = useQueryClient();

  const { data: carpools = [] } = useQuery({
    queryKey: ["carpools", eventId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("carpools").select("*").eq("event_id", eventId).order("created_at");
      if (error) throw error;
      return (data ?? []) as Carpool[];
    },
  });

  const { data: passengers = [] } = useQuery({
    queryKey: ["carpool-passengers", eventId],
    enabled: carpools.length >= 0,
    queryFn: async () => {
      const ids = carpools.map((c) => c.id);
      if (ids.length === 0) return [] as Passenger[];
      const { data, error } = await supabase
        .from("carpool_passengers").select("*").in("carpool_id", ids);
      if (error) throw error;
      return (data ?? []) as Passenger[];
    },
  });

  const { data: needs = [] } = useQuery({
    queryKey: ["carpool-needs", eventId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("carpool_needs").select("*").eq("event_id", eventId);
      if (error) throw error;
      return (data ?? []) as Need[];
    },
  });

  useEffect(() => {
    const channel = supabase
      .channel(`carpool:${eventId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "carpools", filter: `event_id=eq.${eventId}` },
        () => qc.invalidateQueries({ queryKey: ["carpools", eventId] }))
      .on("postgres_changes", { event: "*", schema: "public", table: "carpool_passengers" },
        () => qc.invalidateQueries({ queryKey: ["carpool-passengers", eventId] }))
      .on("postgres_changes", { event: "*", schema: "public", table: "carpool_needs", filter: `event_id=eq.${eventId}` },
        () => qc.invalidateQueries({ queryKey: ["carpool-needs", eventId] }))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [eventId, qc]);

  // Players convoked (present/uncertain/pending) — denominator
  const convokedPlayers = useMemo(
    () => convocations.filter((c) => c.status !== "absent"),
    [convocations],
  );
  const playerById = useMemo(() => {
    const m = new Map<string, Convocation["players"]>();
    for (const c of convocations) if (c.players) m.set(c.player_id, c.players);
    return m;
  }, [convocations]);

  const coveredPlayerIds = useMemo(() => {
    const s = new Set<string>();
    for (const p of passengers) for (const pid of p.player_ids ?? []) s.add(pid);
    // drivers themselves: any of their own children convoked
    for (const cp of carpools) {
      for (const c of convokedPlayers) {
        if (c.players?.user_id === cp.driver_user_id) s.add(c.player_id);
      }
    }
    return s;
  }, [passengers, carpools, convokedPlayers]);

  const withoutTransport = convokedPlayers.filter((c) => !coveredPlayerIds.has(c.player_id));
  const total = convokedPlayers.length;
  const covered = total - withoutTransport.length;
  const pct = total > 0 ? Math.round((covered / total) * 100) : 0;
  const coverageColor = pct >= 100 ? "bg-emerald-500" : pct >= 50 ? "bg-orange-500" : "bg-red-500";

  const myCarpool = carpools.find((c) => c.driver_user_id === user?.id);
  const myBooking = passengers.find((p) => p.passenger_user_id === user?.id);
  const myBookingCarpool = myBooking ? carpools.find((c) => c.id === myBooking.carpool_id) : null;
  const myNeed = needs.find((n) => n.parent_user_id === user?.id);

  // My children convoked (present/uncertain)
  const myConvokedChildren = useMemo(
    () => convokedPlayers.filter((c) => childrenLinks.includes(c.player_id)),
    [convokedPlayers, childrenLinks],
  );

  const [offerOpen, setOfferOpen] = useState(false);
  const [reserveCarpool, setReserveCarpool] = useState<Carpool | null>(null);
  const [needOpen, setNeedOpen] = useState(false);

  const canParticipate = myConvokedChildren.length > 0 || isCoach;

  return (
    <div className="relative px-5 pt-4 space-y-3">
      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center gap-2">
          <Car className="h-4 w-4 text-primary" />
          <h3 className="font-semibold text-sm">{t("carpool.tab")}</h3>
        </div>

        <div className="p-4 space-y-3">
          <p className="text-[11px] text-muted-foreground bg-muted/50 rounded-lg p-2.5 leading-relaxed">
            {t("carpool.disclaimer")}
          </p>

          {isCoach && total > 0 && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">{t("carpool.coverage", { n: covered, total })}</span>
                <span className="font-semibold tabular-nums">{pct}%</span>
              </div>
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div className={cn("h-full transition-all", coverageColor)} style={{ width: `${pct}%` }} />
              </div>
              {withoutTransport.length > 0 && (
                <p className="text-xs text-muted-foreground pt-1">
                  <span className="font-medium text-foreground">{t("carpool.noTransport")} :</span>{" "}
                  {withoutTransport.map((c) => `${c.players?.first_name ?? ""} ${c.players?.last_name?.[0] ?? ""}.`).join(", ")}
                </p>
              )}
            </div>
          )}

          {/* Drivers list */}
          <div className="space-y-2">
            {carpools.length === 0 && (
              <p className="text-xs text-muted-foreground italic">{t("carpool.noDriversYet")}</p>
            )}
            {carpools.map((cp) => {
              const ridersForThisCarpool = passengers.filter((p) => p.carpool_id === cp.id);
              const takenSeats = ridersForThisCarpool.length;
              const seatsLeft = Math.max(0, cp.total_seats - takenSeats);
              const isMine = cp.driver_user_id === user?.id;
              const iAmBookedHere = myBooking?.carpool_id === cp.id;
              const passengerPlayerNames = ridersForThisCarpool
                .flatMap((p) => p.player_ids ?? [])
                .map((pid) => playerById.get(pid))
                .filter(Boolean)
                .map((pl) => pl!.first_name)
                .join(", ");

              return (
                <div key={cp.id} className="rounded-xl border border-border p-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 text-sm font-semibold">
                        <Car className="h-3.5 w-3.5" /> {cp.driver_name}
                        <span className="text-muted-foreground font-normal">· {t(`carpool.vehicleType.${cp.vehicle_type}`)}</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {seatsLeft === 0 ? t("carpool.full") : t("carpool.seatsLeft", { count: seatsLeft })}
                      </p>
                      {cp.departure_note && (
                        <p className="text-xs text-foreground/80 italic mt-1">"{cp.departure_note}"</p>
                      )}
                      {passengerPlayerNames && (
                        <p className="text-xs text-muted-foreground mt-1">
                          <span className="font-medium text-foreground">{t("carpool.takes")} :</span> {passengerPlayerNames}
                        </p>
                      )}
                    </div>
                    {(isMine || isCoach) && (
                      <Button
                        size="icon" variant="ghost" className="h-7 w-7 shrink-0"
                        onClick={async () => {
                          if (!confirm(t("carpool.remove") + " ?")) return;
                          const { error } = await supabase.from("carpools").delete().eq("id", cp.id);
                          if (error) toast.error(error.message);
                          else qc.invalidateQueries({ queryKey: ["carpools", eventId] });
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    )}
                  </div>
                  {iAmBookedHere ? (
                    <Button
                      size="sm" variant="outline" className="w-full"
                      onClick={async () => {
                        const { error } = await supabase.from("carpool_passengers").delete().eq("id", myBooking!.id);
                        if (error) toast.error(error.message);
                        else qc.invalidateQueries({ queryKey: ["carpool-passengers", eventId] });
                      }}
                    >
                      {t("carpool.cancel")}
                    </Button>
                  ) : !isMine && canParticipate && (
                    <Button
                      size="sm" className="w-full"
                      disabled={seatsLeft === 0 || !!myBooking}
                      onClick={() => setReserveCarpool(cp)}
                    >
                      {seatsLeft === 0 ? t("carpool.full") : t("carpool.reserve")}
                    </Button>
                  )}
                </div>
              );
            })}
          </div>

          {myBookingCarpool && (
            <div className="rounded-lg bg-primary/10 border border-primary/30 p-2.5 text-xs">
              ✅ {t("carpool.youTravelWith", { name: myBookingCarpool.driver_name })}
            </div>
          )}

          {/* Actions */}
          <div className="flex flex-wrap gap-2 pt-1">
            {!myCarpool && (
              <Button size="sm" variant={isCoach ? "default" : "ghost"} onClick={() => setOfferOpen(true)}>
                <Plus className="h-3.5 w-3.5" />
                {isCoach ? t("carpool.offerSeats") : t("carpool.iCanDrive")}
              </Button>
            )}
            {!isCoach && !myBooking && !myCarpool && myConvokedChildren.length > 0 && !myNeed && (
              <Button size="sm" variant="outline" onClick={() => setNeedOpen(true)}>
                <HandHelping className="h-3.5 w-3.5" />
                {t("carpool.iNeedRide")}
              </Button>
            )}
            {myNeed && (
              <span className="text-xs text-muted-foreground italic self-center">
                ✓ {t("carpool.needRideRegistered")}
              </span>
            )}
          </div>
        </div>
      </div>

      {offerOpen && (
        <OfferDialog
          eventId={eventId}
          open={offerOpen}
          onClose={() => setOfferOpen(false)}
        />
      )}
      {reserveCarpool && (
        <ReserveDialog
          carpool={reserveCarpool}
          selectablePlayers={isCoach ? convokedPlayers : myConvokedChildren}
          onClose={() => setReserveCarpool(null)}
          onDone={() => { qc.invalidateQueries({ queryKey: ["carpool-passengers", eventId] }); setReserveCarpool(null); }}
        />
      )}
      {needOpen && (
        <NeedDialog
          eventId={eventId}
          myConvokedChildren={myConvokedChildren}
          onClose={() => setNeedOpen(false)}
          onDone={() => { qc.invalidateQueries({ queryKey: ["carpool-needs", eventId] }); setNeedOpen(false); }}
        />
      )}
    </div>
  );
}

function OfferDialog({ eventId, open, onClose }: { eventId: string; open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [vehicle, setVehicle] = useState<"car" | "van">("car");
  const [seats, setSeats] = useState(3);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!user) return;
    setBusy(true);
    const { data: prof } = await supabase.from("profiles").select("full_name, first_name").eq("id", user.id).maybeSingle();
    const name = prof?.full_name?.trim() || prof?.first_name || user.email || "Conducteur";
    const { error } = await supabase.from("carpools").insert({
      event_id: eventId,
      driver_user_id: user.id,
      driver_name: name,
      vehicle_type: vehicle,
      total_seats: seats,
      departure_note: note.trim() || null,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["carpools", eventId] });
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{t("carpool.offerSeats")}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="flex gap-2">
            {(["car", "van"] as const).map((v) => (
              <button
                key={v} type="button" onClick={() => setVehicle(v)}
                className={cn("flex-1 rounded-lg border px-3 py-2 text-sm",
                  vehicle === v ? "border-primary bg-primary/10 font-medium" : "border-border")}
              >{t(`carpool.vehicleType.${v}`)}</button>
            ))}
          </div>
          <div>
            <label className="text-xs font-medium">{t("carpool.seats")}</label>
            <input type="number" min={1} max={8} value={seats}
              onChange={(e) => setSeats(Math.min(8, Math.max(1, Number(e.target.value) || 1)))}
              className="mt-1 w-full rounded-lg border border-border px-3 py-2" />
          </div>
          <Textarea placeholder={t("carpool.note")} value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={200} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Annuler</Button>
          <Button onClick={submit} disabled={busy}>{busy && <Loader2 className="h-4 w-4 animate-spin" />}{t("carpool.confirm")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReserveDialog({ carpool, myConvokedChildren, onClose, onDone }: {
  carpool: Carpool;
  myConvokedChildren: Convocation[];
  onClose: () => void;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [selected, setSelected] = useState<string[]>(myConvokedChildren.map((c) => c.player_id));
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!user || selected.length === 0) return;
    setBusy(true);
    const { error } = await supabase.from("carpool_passengers").insert({
      carpool_id: carpool.id,
      passenger_user_id: user.id,
      player_ids: selected,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    onDone();
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{t("carpool.selectPlayers")}</DialogTitle></DialogHeader>
        <div className="space-y-2">
          {myConvokedChildren.map((c) => (
            <label key={c.player_id} className="flex items-center gap-2 cursor-pointer rounded-lg border border-border p-2">
              <Checkbox
                checked={selected.includes(c.player_id)}
                onCheckedChange={(v) => setSelected((s) => v ? [...s, c.player_id] : s.filter((x) => x !== c.player_id))}
              />
              <span className="text-sm">{c.players?.first_name} {c.players?.last_name}</span>
            </label>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Annuler</Button>
          <Button onClick={submit} disabled={busy || selected.length === 0}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}{t("carpool.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NeedDialog({ eventId, myConvokedChildren, onClose, onDone }: {
  eventId: string;
  myConvokedChildren: Convocation[];
  onClose: () => void;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [selected, setSelected] = useState<string[]>(myConvokedChildren.map((c) => c.player_id));
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!user || selected.length === 0) return;
    setBusy(true);
    const { error } = await supabase.from("carpool_needs").insert({
      event_id: eventId,
      parent_user_id: user.id,
      player_ids: selected,
      note: note.trim() || null,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    onDone();
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{t("carpool.iNeedRide")}</DialogTitle></DialogHeader>
        <div className="space-y-2">
          {myConvokedChildren.map((c) => (
            <label key={c.player_id} className="flex items-center gap-2 cursor-pointer rounded-lg border border-border p-2">
              <Checkbox
                checked={selected.includes(c.player_id)}
                onCheckedChange={(v) => setSelected((s) => v ? [...s, c.player_id] : s.filter((x) => x !== c.player_id))}
              />
              <span className="text-sm">{c.players?.first_name} {c.players?.last_name}</span>
            </label>
          ))}
          <Textarea placeholder={t("carpool.note")} value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={200} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Annuler</Button>
          <Button onClick={submit} disabled={busy || selected.length === 0}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}{t("carpool.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
