import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Send, Plus, X, Loader2, Search } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { BackLink } from "@/components/back-link";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import {
  createPublication,
  previewPublicationAudience,
} from "@/lib/publications/publications.functions";
import { listSeasons } from "@/lib/seasons.functions";

export const Route = createFileRoute("/_authenticated/publications/new")({
  head: () => ({
    meta: [
      { title: "Nouvelle publication · Clubero" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: NewPublicationPage,
});

type ScalarKey = "educateurs" | "dirigeants";
type Audience =
  | { audience_type: "educateurs" }
  | { audience_type: "dirigeants" }
  | { audience_type: "joueurs_equipe"; team_id: string }
  | { audience_type: "parents_equipe"; team_id: string }
  | { audience_type: "joueurs_categorie"; category_label: string; season_id: string }
  | { audience_type: "parents_categorie"; category_label: string; season_id: string }
  | { audience_type: "joueurs_convoques"; event_id: string }
  | { audience_type: "parents_convoques"; event_id: string }
  | { audience_type: "groupe_personnalise"; group_id: string };

type ManualPlayer = { id: string; first_name: string | null; last_name: string | null };

function NewPublicationPage() {
  const { t } = useTranslation();
  const nav = useNavigate();
  const { activeClubId } = useAuth();
  const createFn = useServerFn(createPublication);
  const previewFn = useServerFn(previewPublicationAudience);
  const listSeasonsFn = useServerFn(listSeasons);

  const [step, setStep] = useState<1 | 2>(1);
  const [type, setType] = useState<"message" | "poll">("message");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [pollVisibility, setPollVisibility] = useState<"anonymous" | "staff_visible">("anonymous");
  const [pollOptions, setPollOptions] = useState<string[]>(["", ""]);
  const [publishToWall, setPublishToWall] = useState(true);
  const [sendEmail, setSendEmail] = useState(false);
  const [audiences, setAudiences] = useState<Audience[]>([]);
  const [manualPlayers, setManualPlayers] = useState<ManualPlayer[]>([]);
  const [manualQuery, setManualQuery] = useState("");
  const manualMemberIds = useMemo(() => manualPlayers.map((p) => p.id), [manualPlayers]);

  // Teams
  const { data: teams = [] } = useQuery({
    queryKey: ["pub-teams", activeClubId],
    queryFn: async () => {
      const { data } = await supabase
        .from("teams")
        .select("id, name")
        .eq("club_id", activeClubId!)
        .order("name");
      return data ?? [];
    },
    enabled: !!activeClubId,
  });

  // Groups
  const { data: groups = [] } = useQuery({
    queryKey: ["pub-groups", activeClubId],
    queryFn: async () => {
      const { data } = await supabase
        .from("club_groups")
        .select("id, name")
        .eq("club_id", activeClubId!)
        .eq("is_active", true)
        .order("name");
      return data ?? [];
    },
    enabled: !!activeClubId,
  });

  // Seasons — pick current, or most recent by start_date.
  const { data: seasonsData } = useQuery({
    queryKey: ["pub-seasons", activeClubId],
    queryFn: () => listSeasonsFn({ data: { clubId: activeClubId! } }),
    enabled: !!activeClubId,
  });
  const activeSeason = useMemo(() => {
    const list = seasonsData?.seasons ?? [];
    if (list.length === 0) return null;
    const current = list.find((s: any) => s.is_current);
    return (current ?? list[0]) as { id: string; label: string };
  }, [seasonsData]);

  // Categories for active season
  const { data: categories = [] } = useQuery({
    queryKey: ["pub-cats", activeClubId, activeSeason?.label],
    queryFn: async () => {
      if (!activeSeason) return [];
      const { data } = await supabase
        .from("player_seasons")
        .select("category")
        .eq("club_id", activeClubId!)
        .eq("season_label", activeSeason.label)
        .not("category", "is", null);
      const set = new Set<string>();
      (data ?? []).forEach((r: any) => r.category && set.add(r.category));
      return Array.from(set).sort();
    },
    enabled: !!activeClubId && !!activeSeason,
  });

  // Events with convocations (team-scoped)
  const { data: events = [] } = useQuery({
    queryKey: ["pub-events", activeClubId],
    queryFn: async () => {
      const teamIds = teams.map((t) => t.id);
      if (teamIds.length === 0) return [];
      const { data: evs } = await supabase
        .from("events")
        .select("id, title, starts_at")
        .in("team_id", teamIds)
        .is("deleted_at", null)
        .order("starts_at", { ascending: false })
        .limit(200);
      const list = evs ?? [];
      if (list.length === 0) return [];
      const { data: convos } = await supabase
        .from("convocations")
        .select("event_id")
        .in("event_id", list.map((e: any) => e.id));
      const withConv = new Set((convos ?? []).map((c: any) => c.event_id));
      return list.filter((e: any) => withConv.has(e.id));
    },
    enabled: !!activeClubId && teams.length > 0,
  });

  // Player search (manual selection)
  const { data: playerResults = [] } = useQuery({
    queryKey: ["pub-players", activeClubId, manualQuery],
    queryFn: async () => {
      const q = manualQuery.trim();
      let sel = supabase
        .from("players")
        .select("id, first_name, last_name")
        .eq("club_id", activeClubId!)
        .is("deleted_at", null)
        .order("last_name")
        .limit(20);
      if (q.length >= 2) {
        sel = sel.or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%`);
      }
      const { data } = await sel;
      return (data ?? []) as ManualPlayer[];
    },
    enabled: !!activeClubId && step === 2,
  });

  const create = useMutation({
    mutationFn: async () => {
      return createFn({
        data: {
          clubId: activeClubId!,
          publicationType: type,
          title: title.trim(),
          content: content.trim(),
          pollVisibility: type === "poll" ? pollVisibility : null,
          publishToWall,
          sendEmail,
          emailBody: null,
          closesAt: null,
          eventId: null,
          audiences: audiences as any,
          manualMemberIds,
          pollOptions: type === "poll" ? pollOptions.map((s) => s.trim()).filter(Boolean) : [],
          documentIds: [],
          mediaPaths: [],
        },
      });
    },
    onSuccess: (res: any) => {
      toast.success(t("publications:new.published", "Publication publiée"));
      nav({ to: "/publications/$publicationId", params: { publicationId: res.publicationId } });
    },
    onError: (e: any) => {
      toast.error(e?.message || t("common.error", "Erreur"));
    },
  });

  // -------- Preview (debounced) --------
  const [preview, setPreview] = useState<{
    count: number;
    playerCount: number;
    userCount: number;
    loading: boolean;
    error: boolean;
  }>({ count: 0, playerCount: 0, userCount: 0, loading: false, error: false });

  // Build a stable key to trigger the debounced fetch
  const previewKey = useMemo(
    () => JSON.stringify({ audiences, manualMemberIds }),
    [audiences, manualMemberIds],
  );

  useEffect(() => {
    if (!activeClubId) return;
    if (audiences.length === 0 && manualMemberIds.length === 0) {
      setPreview({ count: 0, playerCount: 0, userCount: 0, loading: false, error: false });
      return;
    }
    setPreview((p) => ({ ...p, loading: true, error: false }));
    const timer = setTimeout(async () => {
      // Filter out manual audience (dedicated field) if it accidentally landed in the list
      const cleanAudiences = audiences.filter(
        (a) => a.audience_type !== ("selection_manuelle" as unknown as string),
      );
      // If manual players are set, add the selection_manuelle audience marker for the resolver
      const withManual =
        manualMemberIds.length > 0
          ? [...cleanAudiences, { audience_type: "selection_manuelle" as const }]
          : cleanAudiences;
      try {
        const r = await previewFn({
          data: {
            clubId: activeClubId,
            eventId: null,
            audiences: withManual as any,
            manualMemberIds,
          },
        });
        setPreview({
          count: r.count,
          playerCount: r.playerCount,
          userCount: r.userCount,
          loading: false,
          error: false,
        });
      } catch {
        setPreview({ count: 0, playerCount: 0, userCount: 0, loading: false, error: true });
      }
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewKey, activeClubId]);

  const canStep1 =
    title.trim().length > 0 && (type === "message" || pollOptions.filter((s) => s.trim()).length >= 2);
  const canSubmit =
    (audiences.length > 0 || manualMemberIds.length > 0) &&
    (publishToWall || sendEmail) &&
    !create.isPending;

  function toggleScalar(k: ScalarKey) {
    setAudiences((a) => {
      const has = a.some((x) => x.audience_type === k);
      return has ? a.filter((x) => x.audience_type !== k) : [...a, { audience_type: k } as Audience];
    });
  }
  function addTeam(kind: "joueurs_equipe" | "parents_equipe", team_id: string) {
    if (!team_id) return;
    if (audiences.some((x: any) => x.audience_type === kind && x.team_id === team_id)) return;
    setAudiences((a) => [...a, { audience_type: kind, team_id } as Audience]);
  }
  function addGroup(group_id: string) {
    if (!group_id) return;
    if (audiences.some((x: any) => x.audience_type === "groupe_personnalise" && x.group_id === group_id)) return;
    setAudiences((a) => [...a, { audience_type: "groupe_personnalise", group_id }]);
  }
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  function addCategory(kind: "joueurs_categorie" | "parents_categorie") {
    if (!selectedCategory || !activeSeason) return;
    if (
      audiences.some(
        (x: any) =>
          x.audience_type === kind &&
          x.category_label === selectedCategory &&
          x.season_id === activeSeason.id,
      )
    )
      return;
    setAudiences((a) => [
      ...a,
      { audience_type: kind, category_label: selectedCategory, season_id: activeSeason.id } as Audience,
    ]);
  }
  const [selectedEvent, setSelectedEvent] = useState<string>("");
  function addEvent(kind: "joueurs_convoques" | "parents_convoques") {
    if (!selectedEvent) return;
    if (audiences.some((x: any) => x.audience_type === kind && x.event_id === selectedEvent)) return;
    setAudiences((a) => [...a, { audience_type: kind, event_id: selectedEvent } as Audience]);
  }
  function addManualPlayer(p: ManualPlayer) {
    if (manualPlayers.some((x) => x.id === p.id)) return;
    setManualPlayers((list) => [...list, p]);
  }
  function removeManualPlayer(id: string) {
    setManualPlayers((list) => list.filter((x) => x.id !== id));
  }
  function removeAudience(idx: number) {
    setAudiences((a) => a.filter((_, i) => i !== idx));
  }

  function labelFor(a: Audience): string {
    if (a.audience_type === "educateurs") return t("publications:audience.types.educateurs");
    if (a.audience_type === "dirigeants") return t("publications:audience.types.dirigeants");
    if (a.audience_type === "groupe_personnalise") {
      const g = groups.find((x) => x.id === (a as any).group_id);
      return `${t("publications:audience.types.groupe_personnalise")} — ${g?.name ?? ""}`;
    }
    if (a.audience_type === "joueurs_categorie" || a.audience_type === "parents_categorie") {
      return `${t(`publications:audience.types.${a.audience_type}`)} — ${a.category_label}`;
    }
    if (a.audience_type === "joueurs_convoques" || a.audience_type === "parents_convoques") {
      const ev = events.find((x: any) => x.id === (a as any).event_id);
      return `${t(`publications:audience.types.${a.audience_type}`)} — ${ev?.title ?? ""}`;
    }
    const team = teams.find((x) => x.id === (a as any).team_id);
    return `${t(`publications:audience.types.${a.audience_type}`)} — ${team?.name ?? ""}`;
  }

  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto space-y-4">
      <BackLink to="/publications" label={t("publications:list.title", "Publications")} />
      <h1 className="text-xl font-semibold">
        {t("publications:new.title", "Nouvelle publication")}
      </h1>
      <div className="text-xs text-muted-foreground">
        {t("publications:new.step", "Étape")} {step} / 2
      </div>

      {step === 1 && (
        <Card>
          <CardContent className="py-5 space-y-4">
            <div className="space-y-2">
              <Label>{t("publications:form.typeLabel")}</Label>
              <RadioGroup
                value={type}
                onValueChange={(v) => setType(v as any)}
                className="flex gap-4"
              >
                <label className="flex items-center gap-2 cursor-pointer">
                  <RadioGroupItem value="message" id="pt-msg" />
                  <span>{t("publications:new.typeMessage", "Message")}</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <RadioGroupItem value="poll" id="pt-poll" />
                  <span>{t("publications:new.typePoll", "Sondage")}</span>
                </label>
              </RadioGroup>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="pub-title">
                {type === "poll" ? t("publications:form.questionLabel") : t("publications:form.titleLabel")}
              </Label>
              <Input
                id="pub-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={
                  type === "poll"
                    ? t("publications:form.questionPlaceholder")
                    : t("publications:form.titlePlaceholder")
                }
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="pub-content">
                {type === "poll"
                  ? t("publications:form.descriptionLabel")
                  : t("publications:form.contentLabel")}
              </Label>
              <Textarea
                id="pub-content"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={type === "poll" ? 3 : 6}
                placeholder={type === "poll" ? "" : t("publications:form.contentPlaceholder")}
              />
            </div>

            {type === "poll" && (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label>{t("publications:new.pollOptions", "Options")}</Label>
                  {pollOptions.map((opt, i) => (
                    <div key={i} className="flex gap-2">
                      <Input
                        value={opt}
                        onChange={(e) => {
                          const next = [...pollOptions];
                          next[i] = e.target.value;
                          setPollOptions(next);
                        }}
                        placeholder={`${t("publications:new.option", "Option")} ${i + 1}`}
                      />
                      {pollOptions.length > 2 && (
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => setPollOptions(pollOptions.filter((_, k) => k !== i))}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  ))}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPollOptions([...pollOptions, ""])}
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    {t("publications:new.addOption", "Ajouter une option")}
                  </Button>
                </div>

                <div className="space-y-2">
                  <Label>{t("publications:new.visibility", "Visibilité des résultats")}</Label>
                  <RadioGroup
                    value={pollVisibility}
                    onValueChange={(v) => setPollVisibility(v as any)}
                    className="space-y-1.5"
                  >
                    <label className="flex items-start gap-2 cursor-pointer">
                      <RadioGroupItem value="anonymous" id="v-anon" className="mt-0.5" />
                      <div>
                        <div>{t("publications:new.visibilityAnon", "Anonyme")}</div>
                        <div className="text-xs text-muted-foreground">
                          {t(
                            "publications:new.visibilityAnonDesc",
                            "Personne, y compris le staff, ne voit qui a voté quoi. Résultats masqués tant que < 3 votes par option.",
                          )}
                        </div>
                      </div>
                    </label>
                    <label className="flex items-start gap-2 cursor-pointer">
                      <RadioGroupItem value="staff_visible" id="v-staff" className="mt-0.5" />
                      <div>
                        <div>{t("publications:new.visibilityStaff", "Visible par le staff")}</div>
                        <div className="text-xs text-muted-foreground">
                          {t(
                            "publications:new.visibilityStaffDesc",
                            "Le staff voit qui a voté quoi. Les votants voient uniquement les totaux.",
                          )}
                        </div>
                      </div>
                    </label>
                  </RadioGroup>
                </div>
              </div>
            )}

            <div className="flex justify-end">
              <Button disabled={!canStep1} onClick={() => setStep(2)}>
                {t("common.next", "Suivant")}
                <ArrowRight className="h-4 w-4 ml-1.5" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 2 && (
        <Card>
          <CardContent className="py-5 space-y-5">
            <div className="space-y-3">
              <Label>{t("publications:new.audienceLabel", "Destinataires")}</Label>

              {/* Scalar (staff) */}
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant={audiences.some((a) => a.audience_type === "educateurs") ? "default" : "outline"}
                  onClick={() => toggleScalar("educateurs")}
                >
                  {t("publications:audience.types.educateurs")}
                </Button>
                <Button
                  size="sm"
                  variant={audiences.some((a) => a.audience_type === "dirigeants") ? "default" : "outline"}
                  onClick={() => toggleScalar("dirigeants")}
                >
                  {t("publications:audience.types.dirigeants")}
                </Button>
              </div>

              {/* Team */}
              {teams.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                  <div>
                    <Label className="text-xs">
                      {t("publications:audience.types.joueurs_equipe")}
                    </Label>
                    <select
                      className="w-full mt-1 rounded-md border bg-background px-2 py-1.5 text-sm"
                      defaultValue=""
                      onChange={(e) => {
                        addTeam("joueurs_equipe", e.target.value);
                        e.target.value = "";
                      }}
                    >
                      <option value="" disabled>
                        {t("publications:new.chooseTeam", "Choisir une équipe…")}
                      </option>
                      {teams.map((tm) => (
                        <option key={tm.id} value={tm.id}>
                          {tm.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <Label className="text-xs">
                      {t("publications:audience.types.parents_equipe")}
                    </Label>
                    <select
                      className="w-full mt-1 rounded-md border bg-background px-2 py-1.5 text-sm"
                      defaultValue=""
                      onChange={(e) => {
                        addTeam("parents_equipe", e.target.value);
                        e.target.value = "";
                      }}
                    >
                      <option value="" disabled>
                        {t("publications:new.chooseTeam", "Choisir une équipe…")}
                      </option>
                      {teams.map((tm) => (
                        <option key={tm.id} value={tm.id}>
                          {tm.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {/* Category (season-scoped) */}
              {activeSeason && categories.length > 0 && (
                <div className="pt-1 space-y-1">
                  <Label className="text-xs">
                    {t("publications:audience.categoryLabel", "Catégorie")}
                    {" · "}
                    <span className="text-muted-foreground">{activeSeason.label}</span>
                  </Label>
                  <div className="flex gap-2 flex-wrap">
                    <select
                      className="flex-1 min-w-[10rem] rounded-md border bg-background px-2 py-1.5 text-sm"
                      value={selectedCategory}
                      onChange={(e) => setSelectedCategory(e.target.value)}
                    >
                      <option value="" disabled>
                        {t("publications:new.pickCategory", "Choisir une catégorie…")}
                      </option>
                      {categories.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!selectedCategory}
                      onClick={() => addCategory("joueurs_categorie")}
                    >
                      {t("publications:new.addPlayersBtn", "+ Joueurs")}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!selectedCategory}
                      onClick={() => addCategory("parents_categorie")}
                    >
                      {t("publications:new.addParentsBtn", "+ Parents")}
                    </Button>
                  </div>
                </div>
              )}

              {/* Convoqués */}
              {events.length > 0 && (
                <div className="pt-1 space-y-1">
                  <Label className="text-xs">
                    {t("publications:new.pickEvent", "Convoqués d'un événement")}
                  </Label>
                  <div className="flex gap-2 flex-wrap">
                    <select
                      className="flex-1 min-w-[12rem] rounded-md border bg-background px-2 py-1.5 text-sm"
                      value={selectedEvent}
                      onChange={(e) => setSelectedEvent(e.target.value)}
                    >
                      <option value="" disabled>
                        {t("publications:new.pickEvent", "Choisir un événement…")}
                      </option>
                      {events.map((ev: any) => (
                        <option key={ev.id} value={ev.id}>
                          {ev.title}
                          {ev.starts_at
                            ? ` — ${new Date(ev.starts_at).toLocaleDateString()}`
                            : ""}
                        </option>
                      ))}
                    </select>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!selectedEvent}
                      onClick={() => addEvent("joueurs_convoques")}
                    >
                      {t("publications:new.addPlayersBtn", "+ Joueurs")}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!selectedEvent}
                      onClick={() => addEvent("parents_convoques")}
                    >
                      {t("publications:new.addParentsBtn", "+ Parents")}
                    </Button>
                  </div>
                </div>
              )}

              {/* Groups */}
              {groups.length > 0 && (
                <div className="pt-1">
                  <Label className="text-xs">
                    {t("publications:audience.types.groupe_personnalise")}
                  </Label>
                  <select
                    className="w-full mt-1 rounded-md border bg-background px-2 py-1.5 text-sm"
                    defaultValue=""
                    onChange={(e) => {
                      addGroup(e.target.value);
                      e.target.value = "";
                    }}
                  >
                    <option value="" disabled>
                      {t("publications:new.chooseGroup", "Choisir un groupe…")}
                    </option>
                    {groups.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Manual player selection */}
              <div className="pt-1 space-y-1.5">
                <Label className="text-xs">
                  {t("publications:new.pickMembers", "Sélection manuelle (joueurs)")}
                </Label>
                <div className="relative">
                  <Search className="h-3.5 w-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={manualQuery}
                    onChange={(e) => setManualQuery(e.target.value)}
                    placeholder={t("publications:new.searchPlaceholder", "Rechercher un joueur…")}
                    className="pl-7"
                  />
                </div>
                {manualQuery.trim().length >= 2 && (
                  <div className="max-h-40 overflow-y-auto rounded-md border bg-background text-sm">
                    {playerResults.length === 0 ? (
                      <div className="p-2 text-xs text-muted-foreground">
                        {t("common.noResults", "Aucun résultat")}
                      </div>
                    ) : (
                      playerResults.map((p) => {
                        const already = manualPlayers.some((x) => x.id === p.id);
                        return (
                          <button
                            key={p.id}
                            type="button"
                            className="w-full text-left px-2 py-1.5 hover:bg-muted disabled:opacity-50 disabled:pointer-events-none"
                            disabled={already}
                            onClick={() => addManualPlayer(p)}
                          >
                            {p.first_name} {p.last_name}
                            {already ? (
                              <span className="ml-2 text-xs text-muted-foreground">
                                {t("common.added", "ajouté")}
                              </span>
                            ) : null}
                          </button>
                        );
                      })
                    )}
                  </div>
                )}
                {manualPlayers.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {manualPlayers.map((p) => (
                      <Badge key={p.id} variant="secondary" className="gap-1.5">
                        {p.first_name} {p.last_name}
                        <button onClick={() => removeManualPlayer(p.id)}>
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
              </div>

              {/* Recap zone */}
              <div className="pt-2 min-h-[2.5rem] rounded-md border-2 border-dashed border-emerald-500/40 bg-emerald-500/5 p-2 flex flex-wrap gap-1.5">
                {audiences.length === 0 && manualPlayers.length === 0 ? (
                  <div className="text-xs text-muted-foreground w-full text-center py-2">
                    {t("publications:new.audienceEmpty", "Aucun destinataire sélectionné")}
                  </div>
                ) : (
                  <>
                    {audiences.map((a, i) => (
                      <Badge key={`a-${i}`} variant="secondary" className="gap-1.5">
                        {labelFor(a)}
                        <button onClick={() => removeAudience(i)}>
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                    {manualPlayers.length > 0 && (
                      <Badge variant="secondary" className="gap-1.5">
                        {t("publications:audience.types.selection_manuelle")} · {manualPlayers.length}
                      </Badge>
                    )}
                  </>
                )}
              </div>

              {/* Live recipients counter */}
              <div
                className="rounded-md border bg-muted/40 px-3 py-2 text-sm flex items-center gap-2"
                aria-live="polite"
              >
                {preview.loading ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                    <span className="text-muted-foreground">
                      {t("common.loading", "Chargement…")}
                    </span>
                  </>
                ) : preview.error ? (
                  <span className="text-xs text-muted-foreground">
                    {t("publications:audience.previewError", "Aperçu indisponible")}
                  </span>
                ) : audiences.length === 0 && manualMemberIds.length === 0 ? (
                  <span className="text-muted-foreground">
                    {t("publications:audience.none", "0 destinataire")}
                  </span>
                ) : (
                  <>
                    <span className="font-medium">
                      {t("publications:audience.recipientsCount", {
                        count: preview.count,
                        defaultValue: "{{count}} destinataires",
                      })}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {t("publications:audience.recipientsBreakdown", {
                        players: preview.playerCount,
                        users: preview.userCount,
                        defaultValue: "({{players}} joueurs · {{users}} utilisateurs)",
                      })}
                    </span>
                  </>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label>{t("publications:new.deliveryLabel", "Mode de diffusion")}</Label>
              <label className="flex items-start gap-2 cursor-pointer">
                <Checkbox
                  checked={publishToWall}
                  onCheckedChange={(v) => setPublishToWall(!!v)}
                  className="mt-0.5"
                />
                <div>
                  <div className="text-sm">{t("publications:new.wall", "Mur + notification push")}</div>
                  <div className="text-xs text-muted-foreground">
                    {t("publications:new.wallDesc", "Apparaît sur le fil du club et envoie une push aux destinataires.")}
                  </div>
                </div>
              </label>
              <label className="flex items-start gap-2 cursor-pointer">
                <Checkbox
                  checked={sendEmail}
                  onCheckedChange={(v) => setSendEmail(!!v)}
                  className="mt-0.5"
                />
                <div>
                  <div className="text-sm">{t("publications:new.email", "E-mail")}</div>
                  <div className="text-xs text-muted-foreground">
                    {t("publications:new.emailDesc", "Envoie un e-mail à chaque destinataire.")}
                  </div>
                </div>
              </label>
            </div>

            <div className="flex justify-between items-center">
              <Button variant="ghost" onClick={() => setStep(1)}>
                <ArrowLeft className="h-4 w-4 mr-1.5" />
                {t("common.back", "Retour")}
              </Button>
              <Button disabled={!canSubmit} onClick={() => create.mutate()}>
                {create.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                ) : (
                  <Send className="h-4 w-4 mr-1.5" />
                )}
                {t("publications:new.publish", "Publier")}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
