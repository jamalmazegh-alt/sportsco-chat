import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useState } from "react";
import { ArrowLeft, ArrowRight, Send, Plus, X, Loader2 } from "lucide-react";
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
import { createPublication } from "@/lib/publications/publications.functions";

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
  | { audience_type: "groupe_personnalise"; group_id: string };

function NewPublicationPage() {
  const { t } = useTranslation();
  const nav = useNavigate();
  const { activeClubId } = useAuth();
  const createFn = useServerFn(createPublication);

  const [step, setStep] = useState<1 | 2>(1);
  const [type, setType] = useState<"message" | "poll">("message");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [pollVisibility, setPollVisibility] = useState<"anonymous" | "staff_visible">("anonymous");
  const [pollOptions, setPollOptions] = useState<string[]>(["", ""]);
  const [publishToWall, setPublishToWall] = useState(true);
  const [sendEmail, setSendEmail] = useState(false);
  const [audiences, setAudiences] = useState<Audience[]>([]);

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
          manualMemberIds: [],
          pollOptions: type === "poll" ? pollOptions.map((s) => s.trim()).filter(Boolean) : [],
          documentIds: [],
          mediaPaths: [],
        },
      });
    },
    onSuccess: (res: any) => {
      toast.success(t("publications.new.published", "Publication publiée"));
      nav({ to: "/publications/$publicationId", params: { publicationId: res.publicationId } });
    },
    onError: (e: any) => {
      toast.error(e?.message || t("common.error", "Erreur"));
    },
  });

  const canStep1 = title.trim().length > 0 && (type === "message" || pollOptions.filter((s) => s.trim()).length >= 2);
  const canSubmit =
    audiences.length > 0 && (publishToWall || sendEmail) && !create.isPending;

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
  function removeAudience(idx: number) {
    setAudiences((a) => a.filter((_, i) => i !== idx));
  }
  function labelFor(a: Audience): string {
    if (a.audience_type === "educateurs") return t("publications.audiences.types.educateurs");
    if (a.audience_type === "dirigeants") return t("publications.audiences.types.dirigeants");
    if (a.audience_type === "groupe_personnalise") {
      const g = groups.find((x) => x.id === (a as any).group_id);
      return `${t("publications.audiences.types.groupe_personnalise")} — ${g?.name ?? ""}`;
    }
    const team = teams.find((x) => x.id === (a as any).team_id);
    return `${t(`publications.audiences.types.${a.audience_type}`)} — ${team?.name ?? ""}`;
  }

  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto space-y-4">
      <BackLink to="/publications" label={t("publications.list.title", "Publications")} />
      <h1 className="text-xl font-semibold">
        {t("publications.new.title", "Nouvelle publication")}
      </h1>
      <div className="text-xs text-muted-foreground">
        {t("publications.new.step", "Étape")} {step} / 2
      </div>

      {step === 1 && (
        <Card>
          <CardContent className="py-5 space-y-4">
            <div className="space-y-2">
              <Label>{t("publications.form.typeLabel")}</Label>
              <RadioGroup
                value={type}
                onValueChange={(v) => setType(v as any)}
                className="flex gap-4"
              >
                <label className="flex items-center gap-2 cursor-pointer">
                  <RadioGroupItem value="message" id="pt-msg" />
                  <span>{t("publications.new.typeMessage", "Message")}</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <RadioGroupItem value="poll" id="pt-poll" />
                  <span>{t("publications.new.typePoll", "Sondage")}</span>
                </label>
              </RadioGroup>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="pub-title">
                {type === "poll" ? t("publications.form.questionLabel") : t("publications.form.titleLabel")}
              </Label>
              <Input
                id="pub-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={
                  type === "poll"
                    ? t("publications.form.questionPlaceholder")
                    : t("publications.form.titlePlaceholder")
                }
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="pub-content">
                {type === "poll"
                  ? t("publications.form.descriptionLabel")
                  : t("publications.form.contentLabel")}
              </Label>
              <Textarea
                id="pub-content"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={type === "poll" ? 3 : 6}
                placeholder={type === "poll" ? "" : t("publications.form.contentPlaceholder")}
              />
            </div>

            {type === "poll" && (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label>{t("publications.new.pollOptions", "Options")}</Label>
                  {pollOptions.map((opt, i) => (
                    <div key={i} className="flex gap-2">
                      <Input
                        value={opt}
                        onChange={(e) => {
                          const next = [...pollOptions];
                          next[i] = e.target.value;
                          setPollOptions(next);
                        }}
                        placeholder={`${t("publications.new.option", "Option")} ${i + 1}`}
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
                    {t("publications.new.addOption", "Ajouter une option")}
                  </Button>
                </div>

                <div className="space-y-2">
                  <Label>{t("publications.new.visibility", "Visibilité des résultats")}</Label>
                  <RadioGroup
                    value={pollVisibility}
                    onValueChange={(v) => setPollVisibility(v as any)}
                    className="space-y-1.5"
                  >
                    <label className="flex items-start gap-2 cursor-pointer">
                      <RadioGroupItem value="anonymous" id="v-anon" className="mt-0.5" />
                      <div>
                        <div>{t("publications.new.visibilityAnon", "Anonyme")}</div>
                        <div className="text-xs text-muted-foreground">
                          {t(
                            "publications.new.visibilityAnonDesc",
                            "Personne, y compris le staff, ne voit qui a voté quoi. Résultats masqués tant que < 3 votes par option.",
                          )}
                        </div>
                      </div>
                    </label>
                    <label className="flex items-start gap-2 cursor-pointer">
                      <RadioGroupItem value="staff_visible" id="v-staff" className="mt-0.5" />
                      <div>
                        <div>{t("publications.new.visibilityStaff", "Visible par le staff")}</div>
                        <div className="text-xs text-muted-foreground">
                          {t(
                            "publications.new.visibilityStaffDesc",
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
            <div className="space-y-2">
              <Label>{t("publications.new.audienceLabel", "Destinataires")}</Label>

              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant={audiences.some((a) => a.audience_type === "educateurs") ? "default" : "outline"}
                  onClick={() => toggleScalar("educateurs")}
                >
                  {t("publications.audiences.types.educateurs")}
                </Button>
                <Button
                  size="sm"
                  variant={audiences.some((a) => a.audience_type === "dirigeants") ? "default" : "outline"}
                  onClick={() => toggleScalar("dirigeants")}
                >
                  {t("publications.audiences.types.dirigeants")}
                </Button>
              </div>

              {teams.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2">
                  <div>
                    <Label className="text-xs">
                      {t("publications.audiences.types.joueurs_equipe")}
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
                        {t("publications.new.chooseTeam", "Choisir une équipe…")}
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
                      {t("publications.audiences.types.parents_equipe")}
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
                        {t("publications.new.chooseTeam", "Choisir une équipe…")}
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

              {groups.length > 0 && (
                <div className="pt-2">
                  <Label className="text-xs">
                    {t("publications.audiences.types.groupe_personnalise")}
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
                      {t("publications.new.chooseGroup", "Choisir un groupe…")}
                    </option>
                    {groups.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="pt-3 min-h-[2.5rem] rounded-md border-2 border-dashed border-emerald-500/40 bg-emerald-500/5 p-2 flex flex-wrap gap-1.5">
                {audiences.length === 0 ? (
                  <div className="text-xs text-muted-foreground w-full text-center py-2">
                    {t("publications.new.audienceEmpty", "Aucun destinataire sélectionné")}
                  </div>
                ) : (
                  audiences.map((a, i) => (
                    <Badge key={i} variant="secondary" className="gap-1.5">
                      {labelFor(a)}
                      <button onClick={() => removeAudience(i)}>
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label>{t("publications.new.deliveryLabel", "Mode de diffusion")}</Label>
              <label className="flex items-start gap-2 cursor-pointer">
                <Checkbox
                  checked={publishToWall}
                  onCheckedChange={(v) => setPublishToWall(!!v)}
                  className="mt-0.5"
                />
                <div>
                  <div className="text-sm">{t("publications.new.wall", "Mur + notification push")}</div>
                  <div className="text-xs text-muted-foreground">
                    {t("publications.new.wallDesc", "Apparaît sur le fil du club et envoie une push aux destinataires.")}
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
                  <div className="text-sm">{t("publications.new.email", "E-mail")}</div>
                  <div className="text-xs text-muted-foreground">
                    {t("publications.new.emailDesc", "Envoie un e-mail à chaque destinataire.")}
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
                {t("publications.new.publish", "Publier")}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
