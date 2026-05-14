import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { format } from "date-fns";
import { useAuth, useActiveRole } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger,
} from "@/components/ui/sheet";
import { Calendar, MapPin, Plus, ChevronRight, Loader2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/events")({
  component: EventsPage,
  head: () => ({ meta: [{ title: "Events — Squadly" }] }),
});

type EventType = "training" | "match" | "tournament" | "meeting" | "other";
type CompetitionType = "friendly" | "championship" | "cup";

function EventsPage() {
  const { t } = useTranslation();
  const { user, activeClubId } = useAuth();
  const role = useActiveRole();
  const isCoach = role === "admin" || role === "coach";
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const { data: teams } = useQuery({
    queryKey: ["teams", activeClubId],
    enabled: !!activeClubId,
    queryFn: async () => {
      const { data } = await supabase
        .from("teams")
        .select("id, name")
        .eq("club_id", activeClubId!)
        .order("name");
      return data ?? [];
    },
  });

  const { data: events, isLoading } = useQuery({
    queryKey: ["events", activeClubId],
    enabled: !!activeClubId && !!teams,
    queryFn: async () => {
      const teamIds = (teams ?? []).map((t) => t.id);
      if (teamIds.length === 0) return [];
      const { data } = await supabase
        .from("events")
        .select("id, title, starts_at, location, type, status, team_id, opponent, competition_type")
        .in("team_id", teamIds)
        .order("starts_at", { ascending: true });
      return (data ?? []).map((e) => ({
        ...e,
        team_name: teams!.find((t) => t.id === e.team_id)?.name ?? "",
      }));
    },
  });

  // Form state
  const [teamId, setTeamId] = useState<string>("");
  const [type, setType] = useState<EventType>("training");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [locationUrl, setLocationUrl] = useState("");
  const [opponent, setOpponent] = useState("");
  const [competitionType, setCompetitionType] = useState<CompetitionType>("friendly");
  const [competitionName, setCompetitionName] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [convocationTime, setConvocationTime] = useState("");
  const [busy, setBusy] = useState(false);

  function reset() {
    setTitle(""); setDescription(""); setLocation(""); setLocationUrl("");
    setOpponent(""); setCompetitionName(""); setCompetitionType("friendly");
    setStartsAt(""); setEndsAt(""); setConvocationTime("");
    setType("training");
  }

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    if (!user || !teamId) return;
    setBusy(true);

    const finalTitle = type === "training"
      ? (title.trim() || t("events.types.training"))
      : type === "match"
        ? (title.trim() || (opponent ? `vs ${opponent}` : t("events.types.match")))
        : title.trim();

    const { data: ev, error } = await supabase
      .from("events")
      .insert({
        team_id: teamId,
        type,
        status: "published",
        title: finalTitle,
        description: description || null,
        location: location || null,
        location_url: locationUrl || null,
        opponent: type === "match" ? (opponent || null) : null,
        competition_type: type === "match" ? competitionType : null,
        competition_name: type === "match" ? (competitionName || null) : null,
        starts_at: new Date(startsAt).toISOString(),
        ends_at: endsAt ? new Date(endsAt).toISOString() : null,
        convocation_time: convocationTime ? new Date(convocationTime).toISOString() : null,
        created_by: user.id,
        convocations_sent: false,
      })
      .select("id")
      .single();
    if (error || !ev) {
      setBusy(false);
      toast.error(error?.message ?? "Failed");
      return;
    }
    setBusy(false);
    setOpen(false);
    reset();
    qc.invalidateQueries({ queryKey: ["events"] });
    qc.invalidateQueries({ queryKey: ["upcoming"] });
    toast.success(t("events.publish"));
  }

  return (
    <div className="px-5 pt-8 space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{t("events.title")}</h1>
        {isCoach && (
          <Sheet open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
            <SheetTrigger asChild>
              <Button size="sm" className="h-9">
                <Plus className="h-4 w-4" />
                {t("events.create")}
              </Button>
            </SheetTrigger>
            <SheetContent side="bottom" className="h-[92vh] rounded-t-3xl overflow-y-auto">
              <SheetHeader>
                <SheetTitle>{t("events.create")}</SheetTitle>
              </SheetHeader>
              <form onSubmit={onCreate} className="space-y-4 mt-4 pb-8">
                <div className="space-y-1.5">
                  <Label>{t("events.selectTeam")}</Label>
                  <Select value={teamId} onValueChange={setTeamId} required>
                    <SelectTrigger><SelectValue placeholder={t("events.selectTeam")} /></SelectTrigger>
                    <SelectContent>
                      {(teams ?? []).map((tm) => (
                        <SelectItem key={tm.id} value={tm.id}>{tm.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label>{t("events.type")}</Label>
                  <Select value={type} onValueChange={(v) => setType(v as EventType)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(["training", "match", "tournament", "meeting", "other"] as const).map((k) => (
                        <SelectItem key={k} value={k}>{t(`events.types.${k}`)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {type !== "match" && (
                  <div className="space-y-1.5">
                    <Label htmlFor="title">{t("events.name")}</Label>
                    <Input
                      id="title"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder={type === "training" ? t("events.types.training") : ""}
                      required={type !== "training"}
                    />
                  </div>
                )}

                {type === "match" && (
                  <>
                    <div className="space-y-1.5">
                      <Label>{t("events.competitionType")}</Label>
                      <Select value={competitionType} onValueChange={(v) => setCompetitionType(v as CompetitionType)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {(["friendly", "championship", "cup"] as const).map((k) => (
                            <SelectItem key={k} value={k}>{t(`events.competitionTypes.${k}`)}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    {competitionType !== "friendly" && (
                      <div className="space-y-1.5">
                        <Label>{t("events.competitionName")}</Label>
                        <Input value={competitionName} onChange={(e) => setCompetitionName(e.target.value)} />
                      </div>
                    )}
                    <div className="space-y-1.5">
                      <Label htmlFor="opp">{t("events.opponent")}</Label>
                      <Input id="opp" required value={opponent} onChange={(e) => setOpponent(e.target.value)} />
                    </div>
                  </>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="conv">{t("events.convocationTime")}</Label>
                    <Input id="conv" type="datetime-local" value={convocationTime} onChange={(e) => setConvocationTime(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="starts">{t("events.startsAt")}</Label>
                    <Input id="starts" type="datetime-local" required value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ends">{t("events.endsAt")}</Label>
                  <Input id="ends" type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="location">{t("events.location")}</Label>
                  <Input id="location" value={location} onChange={(e) => setLocation(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="locurl">
                    {t("events.locationUrl")}{" "}
                    <span className="text-xs text-muted-foreground">({t("common.optional")})</span>
                  </Label>
                  <Input id="locurl" type="url" value={locationUrl} onChange={(e) => setLocationUrl(e.target.value)} placeholder="https://maps.google.com/..." />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="desc">{t("events.details")}</Label>
                  <Textarea id="desc" value={description} onChange={(e) => setDescription(e.target.value)} />
                </div>
                <Button type="submit" className="w-full h-11" disabled={busy || !teamId}>
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : t("events.publish")}
                </Button>
              </form>
            </SheetContent>
          </Sheet>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-20 rounded-2xl bg-muted animate-pulse" />
          ))}
        </div>
      ) : !events || events.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center">
          <Calendar className="mx-auto h-10 w-10 text-muted-foreground mb-3" />
          <p className="text-sm text-muted-foreground">{t("events.noEvents")}</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {events.map((e) => (
            <li key={e.id}>
              <Link
                to="/events/$eventId"
                params={{ eventId: e.id }}
                className="flex items-center justify-between rounded-2xl border border-border bg-card p-4 active:scale-[0.99] transition-transform"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] uppercase tracking-wider font-semibold text-primary bg-primary/10 px-1.5 py-0.5 rounded">
                      {t(`events.types.${e.type}`)}
                    </span>
                    <p className="font-medium truncate">{e.title}</p>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1.5">
                    <Calendar className="h-3 w-3" />
                    {format(new Date(e.starts_at), "EEE d MMM · HH:mm")}
                    {e.location && (
                      <>
                        <span>·</span>
                        <MapPin className="h-3 w-3" />
                        <span className="truncate">{e.location}</span>
                      </>
                    )}
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
