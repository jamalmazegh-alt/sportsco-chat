import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Send,
  Plus,
  X,
  Loader2,
  Search,
  Users,
  UserRound,
  GraduationCap,
  Shield,
  Trophy,
  Tag,
  UsersRound,
  UserCheck,
  type LucideIcon,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
    meta: [{ title: "Nouvelle publication · Clubero" }, { name: "robots", content: "noindex" }],
  }),
  component: NewPublicationPage,
});

// Convocation-based audiences are supported in DB/RPC but no longer exposed
// via this wizard — the wall covers those flows.
type Audience =
  | { audience_type: "educateurs" }
  | { audience_type: "dirigeants" }
  | { audience_type: "joueurs_equipe"; team_id: string }
  | { audience_type: "parents_equipe"; team_id: string }
  | { audience_type: "staff_equipe"; team_id: string }
  | { audience_type: "joueurs_categorie"; category_label: string; season_id: string }
  | { audience_type: "parents_categorie"; category_label: string; season_id: string }
  | { audience_type: "groupe_personnalise"; group_id: string };

type KindKey = Audience["audience_type"];

type ManualPlayer = { id: string; first_name: string | null; last_name: string | null };

const UUID_RE =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/;

function extractPublicationId(res: unknown) {
  if (!res || typeof res !== "object") return null;
  const direct = "publicationId" in res ? (res as { publicationId?: unknown }).publicationId : null;
  const nested =
    "data" in res && res.data && typeof res.data === "object" && "publicationId" in res.data
      ? (res.data as { publicationId?: unknown }).publicationId
      : null;
  const publicationId =
    typeof direct === "string" ? direct : typeof nested === "string" ? nested : null;
  return publicationId && UUID_RE.test(publicationId) ? publicationId : null;
}

const KIND_META: Record<KindKey, { Icon: LucideIcon }> = {
  educateurs: { Icon: GraduationCap },
  dirigeants: { Icon: Shield },
  joueurs_equipe: { Icon: Trophy },
  parents_equipe: { Icon: UserRound },
  staff_equipe: { Icon: Shield },
  joueurs_categorie: { Icon: Tag },
  parents_categorie: { Icon: UserRound },
  groupe_personnalise: { Icon: UsersRound },
};

function needsTeam(k: KindKey) {
  return k === "joueurs_equipe" || k === "parents_equipe" || k === "staff_equipe";
}
function needsCategory(k: KindKey) {
  return k === "joueurs_categorie" || k === "parents_categorie";
}
function needsGroup(k: KindKey) {
  return k === "groupe_personnalise";
}

function NewPublicationPage() {
  const { t } = useTranslation();
  const nav = useNavigate();
  const { activeClubId } = useAuth();
  const createFn = useServerFn(createPublication);
  const previewFn = useServerFn(previewPublicationAudience);
  const listSeasonsFn = useServerFn(listSeasons);

  const [step, setStep] = useState<1 | 2>(1);
  // Wizard is polls-only — messages live on the wall. Any ?type=message is ignored.
  const type: "message" | "poll" = "poll";
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [pollVisibility, setPollVisibility] = useState<"anonymous" | "staff_visible">("anonymous");
  const [pollOptions, setPollOptions] = useState<string[]>(["", ""]);
  const [pollAllowMultiple, setPollAllowMultiple] = useState(false);
  const [publishToWall, setPublishToWall] = useState(true);
  const [sendEmail, setSendEmail] = useState(false);
  const [audiences, setAudiences] = useState<Audience[]>([]);
  const [manualPlayers, setManualPlayers] = useState<ManualPlayer[]>([]);
  const [manualQuery, setManualQuery] = useState("");
  const manualMemberIds = useMemo(() => manualPlayers.map((p) => p.id), [manualPlayers]);

  // Add-row state (kind + parameter)
  const [addKind, setAddKind] = useState<KindKey | "">("");
  const [addParam, setAddParam] = useState<string>("");

  // Teams
  const { data: teams = [] } = useQuery({
    queryKey: ["pub-teams", activeClubId],
    queryFn: async () => {
      const { data } = await supabase
        .from("teams")
        .select("id, name")
        .eq("club_id", activeClubId!)
        .eq("is_internal", false)
        .is("deleted_at", null)
        .is("archived_at", null)
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
          pollAllowMultiple: type === "poll" ? pollAllowMultiple : false,
          documentIds: [],
          mediaPaths: [],
        },
      });
    },
    onSuccess: (res: unknown) => {
      const publicationId = extractPublicationId(res);
      if (!publicationId) {
        toast.error(
          t("publications:new.publishError", "Publication créée, mais ouverture impossible"),
        );
        return;
      }
      toast.success(t("publications:new.published", "Publication publiée"));
      nav({ to: "/publications/$publicationId", params: { publicationId } });
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
      const cleanAudiences = audiences.filter(
        (a) => a.audience_type !== ("selection_manuelle" as unknown as string),
      );
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

  const canStep1 = title.trim().length > 0 && pollOptions.filter((s) => s.trim()).length >= 2;
  const canSubmit =
    (audiences.length > 0 || manualMemberIds.length > 0) &&
    (publishToWall || sendEmail) &&
    !create.isPending;

  // ---- Audience helpers ----
  function hasAudience(next: Audience): boolean {
    return audiences.some((a) => {
      if (a.audience_type !== next.audience_type) return false;
      if ("team_id" in next && "team_id" in a) return a.team_id === next.team_id;
      if ("group_id" in next && "group_id" in a) return a.group_id === next.group_id;
      if ("category_label" in next && "category_label" in a)
        return a.category_label === next.category_label && a.season_id === next.season_id;
      return true;
    });
  }
  function addAudience(a: Audience) {
    if (hasAudience(a)) return;
    setAudiences((prev) => [...prev, a]);
  }
  function removeAudienceAt(idx: number) {
    setAudiences((prev) => prev.filter((_, i) => i !== idx));
  }
  function toggleScalar(k: "educateurs" | "dirigeants") {
    if (hasAudience({ audience_type: k })) {
      setAudiences((prev) => prev.filter((a) => a.audience_type !== k));
    } else {
      addAudience({ audience_type: k });
    }
  }
  function toggleGroup(id: string) {
    const existing = audiences.findIndex(
      (a) => a.audience_type === "groupe_personnalise" && a.group_id === id,
    );
    if (existing >= 0) removeAudienceAt(existing);
    else addAudience({ audience_type: "groupe_personnalise", group_id: id });
  }
  function addManualPlayer(p: ManualPlayer) {
    if (manualPlayers.some((x) => x.id === p.id)) return;
    setManualPlayers((list) => [...list, p]);
  }
  function removeManualPlayer(id: string) {
    setManualPlayers((list) => list.filter((x) => x.id !== id));
  }

  function submitAdd() {
    if (!addKind) return;
    if (needsTeam(addKind)) {
      if (!addParam) return;
      addAudience({ audience_type: addKind, team_id: addParam } as Audience);
    } else if (needsCategory(addKind)) {
      if (!addParam || !activeSeason) return;
      addAudience({
        audience_type: addKind,
        category_label: addParam,
        season_id: activeSeason.id,
      } as Audience);
    } else if (needsGroup(addKind)) {
      if (!addParam) return;
      addAudience({ audience_type: "groupe_personnalise", group_id: addParam });
    } else {
      addAudience({ audience_type: addKind } as Audience);
    }
    setAddKind("");
    setAddParam("");
  }
  const canAdd =
    !!addKind &&
    (needsTeam(addKind) || needsCategory(addKind) || needsGroup(addKind) ? !!addParam : true);

  // Available kinds in the "add" select — filter out already-picked scalars.
  const availableKinds: KindKey[] = useMemo(() => {
    const list: KindKey[] = [];
    if (!hasAudience({ audience_type: "educateurs" })) list.push("educateurs");
    if (!hasAudience({ audience_type: "dirigeants" })) list.push("dirigeants");
    if (teams.length > 0) list.push("joueurs_equipe", "parents_equipe");
    if (activeSeason && categories.length > 0) list.push("joueurs_categorie", "parents_categorie");
    if (groups.length > 0) list.push("groupe_personnalise");
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audiences, teams, categories, groups, activeSeason]);

  // Recap chips
  type Chip = { id: string; kind: KindKey; label: string; onRemove: () => void };
  const chips: Chip[] = useMemo(() => {
    return audiences.map((a, i) => {
      const base = t(`publications:audience.types.${a.audience_type}`);
      let label = base;
      if ("team_id" in a) {
        const tm = teams.find((x) => x.id === a.team_id);
        label = `${base} · ${tm?.name ?? ""}`;
      } else if ("group_id" in a) {
        const g = groups.find((x) => x.id === a.group_id);
        label = `${base} · ${g?.name ?? ""}`;
      } else if ("category_label" in a) {
        label = `${base} · ${a.category_label}`;
      }
      return {
        id: `a-${i}-${a.audience_type}`,
        kind: a.audience_type,
        label,
        onRemove: () => removeAudienceAt(i),
      };
    });
  }, [audiences, teams, groups, t]);

  const scalarSuggestions = [
    {
      key: "educateurs" as const,
      Icon: GraduationCap,
      label: t("publications:audience.types.educateurs"),
    },
    {
      key: "dirigeants" as const,
      Icon: Shield,
      label: t("publications:audience.types.dirigeants"),
    },
  ];

  function kindLabel(k: KindKey) {
    return t(`publications:audience.types.${k}`);
  }

  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto space-y-4">
      <BackLink to="/publications" label={t("publications:list.title", "Publications")} />
      <h1 className="text-xl font-semibold">
        {t("publications:new.pollTitle", "Nouveau sondage")}
      </h1>
      <div className="text-xs text-muted-foreground">
        {t("publications:new.step", "Étape")} {step} / 2
      </div>

      {step === 1 && (
        <Card>
          <CardContent className="py-5 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="pub-title">{t("publications:form.questionLabel")}</Label>
              <Input
                id="pub-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={t("publications:form.questionPlaceholder")}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="pub-content">{t("publications:form.descriptionLabel")}</Label>
              <Textarea
                id="pub-content"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={3}
              />
            </div>

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
                <Label>{t("publications:new.answerMode", "Réponses")}</Label>
                <RadioGroup
                  value={pollAllowMultiple ? "multiple" : "single"}
                  onValueChange={(v) => setPollAllowMultiple(v === "multiple")}
                  className="space-y-1.5"
                >
                  <label className="flex items-start gap-2 cursor-pointer">
                    <RadioGroupItem value="single" id="am-single" className="mt-0.5" />
                    <div>
                      <div>{t("publications:new.answerSingle", "Réponse unique")}</div>
                      <div className="text-xs text-muted-foreground">
                        {t(
                          "publications:new.answerSingleDesc",
                          "Chaque votant choisit une seule option.",
                        )}
                      </div>
                    </div>
                  </label>
                  <label className="flex items-start gap-2 cursor-pointer">
                    <RadioGroupItem value="multiple" id="am-multi" className="mt-0.5" />
                    <div>
                      <div>{t("publications:new.answerMultiple", "Réponses multiples")}</div>
                      <div className="text-xs text-muted-foreground">
                        {t(
                          "publications:new.answerMultipleDesc",
                          "Chaque votant peut sélectionner plusieurs options.",
                        )}
                      </div>
                    </div>
                  </label>
                </RadioGroup>
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
          <CardContent className="py-5 space-y-4">
            <div className="space-y-3">
              <Label>{t("publications:new.audienceLabel", "Destinataires")}</Label>

              {/* Sticky recap of picked audiences */}
              <div className="sticky top-0 z-10 -mx-1 px-1 pt-1 pb-2 bg-background">
                {chips.length === 0 && manualPlayers.length === 0 ? (
                  <div
                    className="rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground text-center"
                    role="status"
                  >
                    {t("publications:new.audienceEmpty", "Aucun destinataire sélectionné")}
                  </div>
                ) : (
                  <div className="rounded-lg border-[2.5px] border-emerald-500 bg-background p-3 shadow-[0_4px_18px_-6px_rgba(16,163,74,0.35)]">
                    <Label className="text-[11px] uppercase tracking-wide text-emerald-700 dark:text-emerald-300 flex items-center gap-1.5 font-semibold">
                      <UserCheck className="h-3.5 w-3.5" />
                      {t("publications:audience.selectedTitle")}
                      <span className="ml-1 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-200 px-1.5 py-0.5 text-[10px] font-bold">
                        {chips.length + (manualPlayers.length > 0 ? 1 : 0)}
                      </span>
                    </Label>
                    <div className="mt-2 flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
                      {chips.map((c) => {
                        const { Icon } = KIND_META[c.kind];
                        return (
                          <span
                            key={c.id}
                            className="inline-flex items-center gap-1.5 rounded-full bg-emerald-600 text-white pl-2.5 pr-1 py-1 text-xs font-medium shadow-sm"
                          >
                            <Icon className="h-3 w-3" />
                            <span>{c.label}</span>
                            <button
                              type="button"
                              className="ml-0.5 rounded-full hover:bg-emerald-700/60 p-0.5"
                              onClick={c.onRemove}
                              aria-label={t("common.remove", "Retirer")}
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </span>
                        );
                      })}
                      {manualPlayers.length > 0 && (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-600 text-white pl-2.5 pr-2.5 py-1 text-xs font-medium shadow-sm">
                          <Users className="h-3 w-3" />
                          {t("publications:audience.types.selection_manuelle")} ·{" "}
                          {manualPlayers.length}
                        </span>
                      )}
                    </div>

                    {/* Live counter */}
                    <div className="mt-2.5" aria-live="polite">
                      {preview.loading ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-muted text-muted-foreground px-2.5 py-1 text-[11px]">
                          <Loader2 className="h-3 w-3 animate-spin" />
                          {t("common.loading", "Chargement…")}
                        </span>
                      ) : preview.error ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200 px-2.5 py-1 text-[11px]">
                          {t("publications:audience.previewError", "Aperçu indisponible")}
                        </span>
                      ) : preview.count === 0 ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200 px-2.5 py-1 text-[11px] font-medium">
                          {t("publications:audience.none", "0 destinataire")}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-200 px-2.5 py-1 text-[11px] font-semibold">
                          {t("publications:audience.recipientsCount", {
                            count: preview.count,
                          })}
                          <span className="opacity-80 font-normal">
                            {" · "}
                            {t("publications:audience.recipientsBreakdown", {
                              players: preview.playerCount,
                              users: preview.userCount,
                            })}
                          </span>
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Teams quick chips — clearly separated block */}
              {teams.length > 0 && (
                <div className="rounded-lg border-2 border-sky-500/40 bg-sky-500/5 p-3">
                  <Label className="text-[11px] uppercase tracking-wide font-semibold text-sky-700 dark:text-sky-300 flex items-center gap-1.5">
                    <Trophy className="h-3.5 w-3.5" />
                    {t("publications:audience.teamsBlock")}
                  </Label>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {t("publications:audience.teamsHint")}
                  </p>
                  <div className="mt-2 space-y-1.5">
                    {teams.map((tm) => {
                      const playersActive = audiences.some(
                        (a) => a.audience_type === "joueurs_equipe" && a.team_id === tm.id,
                      );
                      const parentsActive = audiences.some(
                        (a) => a.audience_type === "parents_equipe" && a.team_id === tm.id,
                      );
                      const staffActive = audiences.some(
                        (a) => a.audience_type === "staff_equipe" && a.team_id === tm.id,
                      );
                      const togglePlayers = () => {
                        if (playersActive) {
                          setAudiences((prev) =>
                            prev.filter(
                              (a) => !(a.audience_type === "joueurs_equipe" && a.team_id === tm.id),
                            ),
                          );
                        } else {
                          addAudience({ audience_type: "joueurs_equipe", team_id: tm.id });
                        }
                      };
                      const toggleParents = () => {
                        if (parentsActive) {
                          setAudiences((prev) =>
                            prev.filter(
                              (a) => !(a.audience_type === "parents_equipe" && a.team_id === tm.id),
                            ),
                          );
                        } else {
                          addAudience({ audience_type: "parents_equipe", team_id: tm.id });
                        }
                      };
                      const toggleStaff = () => {
                        if (staffActive) {
                          setAudiences((prev) =>
                            prev.filter(
                              (a) => !(a.audience_type === "staff_equipe" && a.team_id === tm.id),
                            ),
                          );
                        } else {
                          addAudience({ audience_type: "staff_equipe", team_id: tm.id });
                        }
                      };
                      return (
                        <div
                          key={tm.id}
                          className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 rounded-md bg-background/60 border border-sky-500/20 px-2 py-1.5"
                        >
                          <span className="inline-flex items-center gap-1.5 text-sm font-medium min-w-0">
                            <Trophy className="h-3.5 w-3.5 text-sky-600 dark:text-sky-400 shrink-0" />
                            <span className="truncate">{tm.name}</span>
                          </span>
                          <div className="flex flex-wrap gap-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={togglePlayers}
                              aria-pressed={playersActive}
                              className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] motion-safe:transition-colors ${
                                playersActive
                                  ? "bg-emerald-100 dark:bg-emerald-900/30 border-emerald-500 text-emerald-800 dark:text-emerald-200"
                                  : "border-border bg-background hover:bg-muted text-foreground"
                              }`}
                            >
                              <Users className="h-3 w-3" />
                              {t("publications:audience.types.joueurs_equipe")}
                            </button>
                            <button
                              type="button"
                              onClick={toggleParents}
                              aria-pressed={parentsActive}
                              className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] motion-safe:transition-colors ${
                                parentsActive
                                  ? "bg-emerald-100 dark:bg-emerald-900/30 border-emerald-500 text-emerald-800 dark:text-emerald-200"
                                  : "border-border bg-background hover:bg-muted text-foreground"
                              }`}
                            >
                              <UserRound className="h-3 w-3" />
                              {t("publications:audience.types.parents_equipe")}
                            </button>
                            <button
                              type="button"
                              onClick={toggleStaff}
                              aria-pressed={staffActive}
                              className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] motion-safe:transition-colors ${
                                staffActive
                                  ? "bg-violet-100 dark:bg-violet-900/30 border-violet-500 text-violet-800 dark:text-violet-200"
                                  : "border-border bg-background hover:bg-muted text-foreground"
                              }`}
                            >
                              <Shield className="h-3 w-3" />
                              {t("publications:audience.types.staff_equipe")}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Custom groups quick chips — clearly separated block */}
              {groups.length > 0 && (
                <div className="rounded-lg border-2 border-fuchsia-500/40 bg-fuchsia-500/5 p-3">
                  <Label className="text-[11px] uppercase tracking-wide font-semibold text-fuchsia-700 dark:text-fuchsia-300 flex items-center gap-1.5">
                    <UsersRound className="h-3.5 w-3.5" />
                    {t("publications:audience.groupsBlock")}
                  </Label>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {t("publications:audience.groupsHint")}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {groups.map((g) => {
                      const active = audiences.some(
                        (a) => a.audience_type === "groupe_personnalise" && a.group_id === g.id,
                      );
                      return (
                        <button
                          key={g.id}
                          type="button"
                          onClick={() => toggleGroup(g.id)}
                          aria-pressed={active}
                          className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-xs motion-safe:transition-colors ${
                            active
                              ? "bg-emerald-100 dark:bg-emerald-900/30 border-emerald-500 text-emerald-800 dark:text-emerald-200"
                              : "border-border bg-background hover:bg-muted text-foreground"
                          }`}
                        >
                          <UsersRound className="h-3 w-3" />
                          <span>{g.name}</span>
                          <Plus className="h-3 w-3 opacity-70" />
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Staff quick chips */}
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-2.5">
                <Label className="text-[11px] uppercase tracking-wide text-amber-700 dark:text-amber-300 flex items-center gap-1.5">
                  <Shield className="h-3.5 w-3.5" />
                  {t("publications:audience.staff", { defaultValue: "Staff" })}
                </Label>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {scalarSuggestions.map((s) => {
                    const active = hasAudience({ audience_type: s.key });
                    return (
                      <button
                        key={s.key}
                        type="button"
                        onClick={() => toggleScalar(s.key)}
                        aria-pressed={active}
                        className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-xs motion-safe:transition-colors ${
                          active
                            ? "bg-emerald-100 dark:bg-emerald-900/30 border-emerald-500 text-emerald-800 dark:text-emerald-200"
                            : "border-border bg-background hover:bg-muted text-foreground"
                        }`}
                      >
                        <s.Icon className="h-3 w-3" />
                        <span>{s.label}</span>
                        <Plus className="h-3 w-3 opacity-70" />
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Manual player selection */}
              <div className="rounded-lg border border-indigo-500/30 bg-indigo-500/5 p-2.5 space-y-1.5">
                <Label className="text-[11px] uppercase tracking-wide text-indigo-700 dark:text-indigo-300 flex items-center gap-1.5">
                  <Users className="h-3.5 w-3.5" />
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
                      <span
                        key={p.id}
                        className="inline-flex items-center gap-1.5 rounded-full bg-indigo-600 text-white pl-2.5 pr-1 py-1 text-xs font-medium shadow-sm"
                      >
                        <UserRound className="h-3 w-3" />
                        {p.first_name} {p.last_name}
                        <button
                          type="button"
                          className="ml-0.5 rounded-full hover:bg-indigo-700/60 p-0.5"
                          onClick={() => removeManualPlayer(p.id)}
                          aria-label={t("common.remove", "Retirer")}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
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
                  <div className="text-sm">
                    {t("publications:new.wall", "Mur + notification push")}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {t(
                      "publications:new.wallDesc",
                      "Apparaît sur le fil du club et envoie une push aux destinataires.",
                    )}
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
