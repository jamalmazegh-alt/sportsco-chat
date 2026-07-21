import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useEffect, useState } from "react";
import { z } from "zod";
import {
  BarChart3,
  MessageSquare,
  Lock,
  Users,
  CheckCircle2,
  MoreHorizontal,
  Trash2,
  Loader2,
  Info,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { BackLink } from "@/components/back-link";
import { toast } from "sonner";
import {
  getPublication,
  getPollResults,
  castPollVote,
  closePublication,
  deletePublication,
  listPublicationRecipients,
} from "@/lib/publications/publications.functions";


const SearchSchema = z.object({
  vote: z.string().uuid().optional(),
});

export const Route = createFileRoute("/_authenticated/publications/$publicationId")({
  validateSearch: (search) => SearchSchema.parse(search),
  head: () => ({
    meta: [
      { title: "Publication · Clubero" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PublicationDetailPage,
});

function PublicationDetailPage() {
  const { t } = useTranslation();
  const { publicationId } = Route.useParams();
  const search = Route.useSearch();
  const voteIntent = search.vote ?? null;
  const nav = useNavigate();
  const qc = useQueryClient();

  const getFn = useServerFn(getPublication);
  const resultsFn = useServerFn(getPollResults);
  const voteFn = useServerFn(castPollVote);
  const closeFn = useServerFn(closePublication);
  const deleteFn = useServerFn(deletePublication);
  const recipientsFn = useServerFn(listPublicationRecipients);

  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [selectedSubjectKey, setSelectedSubjectKey] = useState<string | null>(null);
  const [isChangingVote, setIsChangingVote] = useState(false);
  const [showRecipients, setShowRecipients] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["publication", publicationId],
    queryFn: () => getFn({ data: { publicationId } }),
  });

  const isPoll = data?.publication?.publication_type === "poll";
  const isClosed = !!data?.publication?.closed_at;
  const isStaff = !!data?.isStaff;
  const eligibleSubjects = data?.eligibleSubjects ?? [];
  const canVote = eligibleSubjects.length > 0 && !isClosed;

  // Pick the active subject: first by default, or the one selected via chip.
  const subjectKey = (s: { subjectKind: string; subjectId: string }) =>
    `${s.subjectKind}:${s.subjectId}`;
  const activeSubject =
    eligibleSubjects.find((s) => subjectKey(s) === selectedSubjectKey) ??
    eligibleSubjects[0] ??
    null;
  const myCurrentOption = activeSubject?.currentOptionId ?? null;

  // Deep-link intent (?vote=<optionId>) : pré-sélection uniquement.
  // Ne jamais auto-cast au chargement — l'utilisateur confirme explicitement.
  const options = data?.options ?? [];
  const voteIntentIsValid =
    !!voteIntent && options.some((o) => o.id === voteIntent);
  useEffect(() => {
    if (!data || !isPoll || isClosed) return;
    if (!voteIntent) return;
    if (!voteIntentIsValid) {
      toast.error(
        t("publications:errors.voteIntentInvalid", "Cette option n'existe pas ou plus."),
      );
      return;
    }
    if (!canVote) return;
    if (myCurrentOption) return;
    if (selectedOption == null) setSelectedOption(voteIntent);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.publication?.id, voteIntent, voteIntentIsValid]);


  const { data: results } = useQuery({
    queryKey: ["publication-results", publicationId],
    queryFn: () => resultsFn({ data: { publicationId } }),
    enabled: !!data && isPoll,
  });

  const { data: recipients } = useQuery({
    queryKey: ["publication-recipients", publicationId],
    queryFn: () => recipientsFn({ data: { publicationId } }),
    enabled: showRecipients && isStaff,
  });

  const vote = useMutation({
    mutationFn: async (optionId: string) => {
      if (!activeSubject) throw new Error("no_subject");
      return voteFn({
        data: {
          publicationId,
          optionId,
          subjectKind: activeSubject.subjectKind,
          subjectId: activeSubject.subjectId,
        },
      });
    },
    onSuccess: () => {
      toast.success(t("publications:detail.voted", "Vote enregistré"));
      qc.invalidateQueries({ queryKey: ["publication", publicationId] });
      qc.invalidateQueries({ queryKey: ["publication-results", publicationId] });
    },
    onError: (e: any) => {
      const msg = e?.message || "";
      if (msg.includes("poll_closed")) {
        toast.error(t("publications:errors.pollClosed"));
      } else if (msg.includes("Forbidden") || msg.includes("forbidden")) {
        toast.error(t("publications:errors.forbidden"));
      } else {
        toast.error(t("common.error", "Erreur"));
      }
    },
  });

  const closeMut = useMutation({
    mutationFn: async () => closeFn({ data: { publicationId } }),
    onSuccess: () => {
      toast.success(t("publications:detail.closed", "Publication fermée"));
      qc.invalidateQueries({ queryKey: ["publication", publicationId] });
    },
    onError: () => toast.error(t("common.error", "Erreur")),
  });

  const deleteMut = useMutation({
    mutationFn: async () => deleteFn({ data: { publicationId } }),
    onSuccess: () => {
      toast.success(t("publications:detail.deleted", "Publication supprimée"));
      nav({ to: "/publications" });
    },
    onError: () => toast.error(t("common.error", "Erreur")),
  });

  if (isLoading) {
    return (
      <div className="p-6 text-sm text-muted-foreground">{t("common.loading", "Chargement…")}</div>
    );
  }
  if (!data?.publication) {
    return <div className="p-6">{t("publications:detail.notFound", "Publication introuvable")}</div>;
  }

  const pub = data.publication;
  const totalVotes = results?.rows?.[0]?.total_voters ?? 0;
  const maxCount = Math.max(1, ...(results?.rows ?? []).map((r) => r.vote_count ?? 0));

  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto space-y-4">
      <BackLink to="/publications" label={t("publications:list.title", "Publications")} />

      <Card>
        <CardContent className="py-5 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-2 min-w-0">
              {isPoll ? (
                <BarChart3 className="h-5 w-5 text-primary shrink-0 mt-0.5" />
              ) : (
                <MessageSquare className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
              )}
              <div className="min-w-0">
                <h1 className="text-lg font-semibold">{pub.title}</h1>
                <div className="flex items-center gap-2 flex-wrap mt-1">
                  {isPoll && pub.poll_visibility === "anonymous" && (
                    <Badge variant="outline" className="gap-1">
                      <Lock className="h-3 w-3" />
                      {t("publications:list.anonymous", "Anonyme")}
                    </Badge>
                  )}
                  {isClosed && (
                    <Badge variant="secondary" className="gap-1">
                      <CheckCircle2 className="h-3 w-3" />
                      {t("publications:list.closed", "Fermé")}
                    </Badge>
                  )}
                  <span className="text-xs text-muted-foreground">
                    {new Date(pub.published_at).toLocaleString()}
                  </span>
                </div>
              </div>
            </div>
            {isStaff && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => setShowRecipients((s) => !s)}>
                    <Users className="h-4 w-4 mr-2" />
                    {t("publications:detail.recipients", "Voir les destinataires")}
                  </DropdownMenuItem>
                  {!isClosed && isPoll && (
                    <DropdownMenuItem onClick={() => closeMut.mutate()}>
                      <CheckCircle2 className="h-4 w-4 mr-2" />
                      {t("publications:detail.close", "Fermer le sondage")}
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem
                    className="text-destructive"
                    onClick={() => {
                      if (confirm(t("publications:detail.confirmDelete", "Supprimer cette publication ?"))) {
                        deleteMut.mutate();
                      }
                    }}
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    {t("publications:detail.delete", "Supprimer")}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>

          {pub.content && (
            <div className="text-sm whitespace-pre-wrap">{pub.content}</div>
          )}

          {isPoll && data.options.length > 0 && (
            <div className="space-y-3 pt-2">
              {/* Subject selector — only when multiple votable subjects */}
              {canVote && eligibleSubjects.length > 1 && (
                <div className="space-y-1.5">
                  <div className="text-xs text-muted-foreground">
                    {t("publications:detail.votingAs", "Je vote en tant que :")}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {eligibleSubjects.map((s) => {
                      const key = subjectKey(s);
                      const isActive = key === (selectedSubjectKey ?? subjectKey(eligibleSubjects[0]));
                      const label =
                        s.subjectKind === "user"
                          ? t("publications:detail.votingAsSelf", "Moi")
                          : s.label ?? t("publications:detail.player", "Joueur");
                      return (
                        <Button
                          key={key}
                          size="sm"
                          variant={isActive ? "default" : "outline"}
                          onClick={() => {
                            setSelectedSubjectKey(key);
                            setSelectedOption(null);
                          }}
                        >
                          {label}
                        </Button>
                      );
                    })}
                  </div>
                </div>
              )}
              {canVote && eligibleSubjects.length === 1 && activeSubject?.relation === "guardian" && activeSubject.label && (
                <div className="text-xs text-muted-foreground">
                  {t("publications:detail.votingForChild", "Vous votez pour {{name}}", {
                    name: activeSubject.label,
                  })}
                </div>
              )}

              {canVote && (!myCurrentOption || isChangingVote) ? (
                <>
                  <RadioGroup
                    value={selectedOption ?? myCurrentOption ?? ""}
                    onValueChange={(val) => {
                      setSelectedOption(val);
                      if (!isChangingVote) setIsChangingVote(true);
                    }}
                    className="space-y-2"
                  >
                    {data.options.map((opt) => (
                      <label
                        key={opt.id}
                        className="flex items-center gap-2 p-3 border rounded-md cursor-pointer hover:bg-accent"
                      >
                        <RadioGroupItem value={opt.id} />
                        <span className="text-sm">{opt.label}</span>
                      </label>
                    ))}
                  </RadioGroup>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      disabled={!selectedOption || vote.isPending}
                      onClick={() => selectedOption && vote.mutate(selectedOption)}
                    >
                      {vote.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
                      {(() => {
                        const selectedLabel = options.find((o) => o.id === selectedOption)?.label;
                        if (selectedLabel) {
                          return t("publications:detail.confirmVote", "Confirmer : {{option}}", {
                            option: selectedLabel,
                          });
                        }
                        return t("publications:detail.vote", "Voter");
                      })()}
                    </Button>
                    {isChangingVote && (
                      <Button
                        variant="outline"
                        onClick={() => {
                          setIsChangingVote(false);
                          setSelectedOption(null);
                        }}
                      >
                        {t("common.cancel", "Annuler")}
                      </Button>
                    )}
                  </div>
                </>
              ) : (
                <div className="space-y-3">
                  <div className="space-y-2">
                    {(results?.rows ?? data.options.map((o) => ({ ...o, vote_count: 0, below_threshold: false }))).map(
                      (r: any) => {
                        const isMine = myCurrentOption === r.option_id;
                        const count = r.vote_count;
                        const pct =
                          count == null
                            ? null
                            : totalVotes > 0
                              ? Math.round((count / totalVotes) * 100)
                              : 0;
                        return (
                          <div key={r.option_id} className="space-y-1">
                            <div className="flex justify-between text-sm">
                              <span className={isMine ? "font-medium" : ""}>
                                {r.label} {isMine && "✓"}
                              </span>
                              <span className="text-muted-foreground text-xs">
                                {count == null
                                  ? t("publications:detail.masked", "—")
                                  : `${count} · ${pct}%`}
                              </span>
                            </div>
                            <div className="h-2 bg-muted rounded-full overflow-hidden">
                              <div
                                className={`h-full ${isMine ? "bg-primary" : "bg-primary/40"}`}
                                style={{
                                  width:
                                    count == null
                                      ? "0%"
                                      : `${Math.round((count / maxCount) * 100)}%`,
                                }}
                              />
                            </div>
                          </div>
                        );
                      },
                    )}
                    {results?.rows?.some((r) => r.below_threshold) && (
                      <div className="text-xs text-muted-foreground flex items-start gap-1.5 pt-1">
                        <Info className="h-3.5 w-3.5 mt-0.5" />
                        <span>
                          {t(
                            "publications:detail.thresholdNotice",
                            "Résultats masqués pour préserver l'anonymat (< 3 votes par option).",
                          )}
                        </span>
                      </div>
                    )}
                  </div>
                  {canVote && (
                    <Button variant="outline" onClick={() => setIsChangingVote(true)}>
                      {t("publications:detail.changeVote", "Changer mon vote")}
                    </Button>
                  )}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {isStaff && showRecipients && (
        <Card>
          <CardContent className="py-4 space-y-2">
            <div className="font-medium text-sm flex items-center gap-2">
              <Users className="h-4 w-4" />
              {t("publications:detail.recipientsTitle", "Destinataires")} ({recipients?.recipients?.length ?? 0})
            </div>
            <div className="space-y-1 max-h-64 overflow-y-auto">
              {(recipients?.recipients ?? []).map((r: any, i: number) => (
                <div key={i} className="text-sm text-muted-foreground">
                  {r.players
                    ? `${r.players.first_name} ${r.players.last_name}`
                    : r.subject_kind === "user"
                      ? t("publications:detail.userSubject", "Utilisateur")
                      : t("publications:detail.unknown", "Inconnu")}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
