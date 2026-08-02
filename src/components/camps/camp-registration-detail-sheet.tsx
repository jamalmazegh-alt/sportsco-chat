/**
 * Étape 2 — Fiche d'inscription (side panel).
 *
 * - Ouvert depuis le tableau (Étape 1).
 * - Rôles autorisés (serveur) : admin | dirigeant | coach.
 * - Fichiers `is_sensitive` : URL signée réservée admin | dirigeant.
 * - `under_review` pose `reserved_until = now + 72h` (serveur).
 * - `approved` bloqué si stage plein → proposition liste d'attente.
 * - Refus statut OU document : motif obligatoire.
 */

import { useEffect, useMemo, useState } from "react";
import { getPublicOrigin } from "@/lib/native-platform";
import { copyText } from "@/lib/clipboard";
import { openExternalUrl } from "@/lib/open-url";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  Loader2,
  Copy,
  Download,
  Lock,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  ShieldAlert,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  getCampRegistrationDetail,
  setCampRegistrationStatus,
  setCampRegistrationPayment,
  reviewCampRegistrationDocument,
  getRegistrationDocumentSignedUrl,
  type RegistrationDetail,
  type RegistrationDocumentDetail,
  type RegistrationStatus,
  type PaymentStatus,
} from "@/lib/camp-registrations.functions";

interface Props {
  campId: string;
  registrationId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CampRegistrationDetailSheet({ campId, registrationId, open, onOpenChange }: Props) {
  const { t } = useTranslation("camps");
  const qc = useQueryClient();

  const detailFn = useServerFn(getCampRegistrationDetail);
  const setStatusFn = useServerFn(setCampRegistrationStatus);
  const setPaymentFn = useServerFn(setCampRegistrationPayment);
  const reviewDocFn = useServerFn(reviewCampRegistrationDocument);
  const signedUrlFn = useServerFn(getRegistrationDocumentSignedUrl);

  const detailQ = useQuery({
    queryKey: ["camp-registration-detail", registrationId],
    queryFn: () => detailFn({ data: { registrationId: registrationId! } }),
    enabled: !!registrationId && open,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["camp-registration-detail", registrationId] });
    qc.invalidateQueries({ queryKey: ["camp-registrations", campId] });
    qc.invalidateQueries({ queryKey: ["camp-registration-stats", campId] });
  };

  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [waitlistOpen, setWaitlistOpen] = useState(false);
  const [docReject, setDocReject] = useState<{
    doc: RegistrationDocumentDetail | null;
    reason: string;
  }>({ doc: null, reason: "" });

  useEffect(() => {
    if (!open) {
      setRejectOpen(false);
      setRejectReason("");
      setWaitlistOpen(false);
      setDocReject({ doc: null, reason: "" });
    }
  }, [open]);

  const statusMut = useMutation({
    mutationFn: (input: { status: RegistrationStatus; reason?: string }) =>
      setStatusFn({
        data: { registrationId: registrationId!, status: input.status, reason: input.reason },
      }),
    onSuccess: (_, vars) => {
      toast.success(
        t("registrations.detail.statusChanged", {
          defaultValue: "Statut mis à jour",
        }),
      );
      if (vars.status === "rejected") setRejectOpen(false);
      if (vars.status === "waitlist") setWaitlistOpen(false);
      setRejectReason("");
      invalidate();
    },
    onError: (e: Error) => {
      if (e.message === "CAPACITY_FULL") {
        setWaitlistOpen(true);
        return;
      }
      if (e.message === "REASON_REQUIRED") {
        toast.error(
          t("registrations.detail.reasonRequired", {
            defaultValue: "Un motif est obligatoire pour refuser.",
          }),
        );
        return;
      }
      toast.error(e.message);
    },
  });

  const reviewDocMut = useMutation({
    mutationFn: (input: {
      documentId: string;
      status: "approved" | "rejected" | "pending";
      reason?: string;
    }) => reviewDocFn({ data: input }),
    onSuccess: (_, vars) => {
      toast.success(
        vars.status === "approved"
          ? t("registrations.detail.docApproved", { defaultValue: "Pièce validée" })
          : vars.status === "rejected"
            ? t("registrations.detail.docRejected", { defaultValue: "Pièce refusée" })
            : t("registrations.detail.docReset", { defaultValue: "Décision réinitialisée" }),
      );
      setDocReject({ doc: null, reason: "" });
      invalidate();
    },
    onError: (e: Error) => {
      if (e.message === "REASON_REQUIRED") {
        toast.error(
          t("registrations.detail.reasonRequired", {
            defaultValue: "Un motif est obligatoire pour refuser.",
          }),
        );
        return;
      }
      toast.error(e.message);
    },
  });

  const paymentMut = useMutation({
    mutationFn: (input: { status: PaymentStatus; amount?: number }) =>
      setPaymentFn({ data: { registrationId: registrationId!, ...input } }),
    onSuccess: () => {
      toast.success(
        t("registrations.detail.paymentUpdated", { defaultValue: "Paiement mis à jour" }),
      );
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  async function openDoc(doc: RegistrationDocumentDetail) {
    if (!doc.viewer_can_view) return;
    try {
      const res = await signedUrlFn({ data: { documentId: doc.id } });
      await openExternalUrl(res.url);
    } catch (e: any) {
      toast.error(e.message ?? "error");
    }
  }

  const detail = detailQ.data;

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle>
              {t("registrations.detail.title", { defaultValue: "Fiche d'inscription" })}
            </SheetTitle>
            <SheetDescription>
              {t("registrations.detail.subtitle", {
                defaultValue:
                  "Vérifiez les informations, examinez les pièces et changez le statut.",
              })}
            </SheetDescription>
          </SheetHeader>

          {detailQ.isLoading || !detail ? (
            <div className="flex justify-center py-14">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : (
            <div className="mt-4 space-y-6">
              <Header detail={detail} t={t} />

              <ParticipantSection detail={detail} t={t} />

              <Separator />

              <GuardianSection detail={detail} t={t} />

              {detail.notes && (
                <>
                  <Separator />
                  <div className="space-y-1">
                    <div className="text-xs font-semibold uppercase text-muted-foreground">
                      {t("registrations.detail.notes", { defaultValue: "Notes de la famille" })}
                    </div>
                    <p className="text-sm whitespace-pre-wrap">{detail.notes}</p>
                  </div>
                </>
              )}

              <Separator />

              <DocumentsSection
                detail={detail}
                t={t}
                onOpen={openDoc}
                onApprove={(doc) => reviewDocMut.mutate({ documentId: doc.id, status: "approved" })}
                onReset={(doc) => reviewDocMut.mutate({ documentId: doc.id, status: "pending" })}
                onAskReject={(doc) => setDocReject({ doc, reason: "" })}
                pendingId={
                  reviewDocMut.isPending ? (reviewDocMut.variables?.documentId ?? null) : null
                }
              />

              <Separator />

              <PaymentSection
                detail={detail}
                t={t}
                pending={paymentMut.isPending}
                onSet={(status, amount) => paymentMut.mutate({ status, amount })}
              />

              <Separator />

              <StatusActions
                detail={detail}
                t={t}
                pending={statusMut.isPending ? (statusMut.variables?.status ?? null) : null}
                onSet={(status) => statusMut.mutate({ status })}
                onAskReject={() => {
                  setRejectReason("");
                  setRejectOpen(true);
                }}
              />
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Reject registration dialog */}
      <AlertDialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("registrations.detail.rejectTitle", {
                defaultValue: "Refuser cette inscription ?",
              })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("registrations.detail.rejectHelp", {
                defaultValue:
                  "Le motif sera envoyé à la famille dans l'e-mail de refus. Soyez clair et bienveillant.",
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            rows={4}
            placeholder={t("registrations.detail.rejectPlaceholder", {
              defaultValue: "Ex. Le stage est complet pour cette tranche d'âge.",
            })}
          />
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel", { defaultValue: "Annuler" })}</AlertDialogCancel>
            <AlertDialogAction
              disabled={statusMut.isPending || rejectReason.trim().length === 0}
              onClick={() => statusMut.mutate({ status: "rejected", reason: rejectReason.trim() })}
            >
              {statusMut.isPending && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              {t("registrations.detail.confirmReject", { defaultValue: "Refuser" })}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Capacity full → propose waitlist */}
      <AlertDialog open={waitlistOpen} onOpenChange={setWaitlistOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("registrations.detail.capacityFullTitle", { defaultValue: "Stage complet" })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("registrations.detail.capacityFullHelp", {
                defaultValue:
                  "La capacité du stage est atteinte. Voulez-vous placer cette famille sur la liste d'attente ?",
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel", { defaultValue: "Annuler" })}</AlertDialogCancel>
            <AlertDialogAction
              disabled={statusMut.isPending}
              onClick={() => statusMut.mutate({ status: "waitlist" })}
            >
              {statusMut.isPending && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              {t("registrations.detail.placeOnWaitlist", {
                defaultValue: "Placer en liste d'attente",
              })}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reject document dialog */}
      <AlertDialog
        open={!!docReject.doc}
        onOpenChange={(o) => !o && setDocReject({ doc: null, reason: "" })}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("registrations.detail.docRejectTitle", {
                defaultValue: "Refuser cette pièce ?",
              })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("registrations.detail.docRejectHelp", {
                defaultValue:
                  "La famille recevra le motif et pourra déposer une nouvelle version depuis sa page de suivi.",
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea
            value={docReject.reason}
            onChange={(e) => setDocReject((s) => ({ ...s, reason: e.target.value }))}
            rows={3}
            placeholder={t("registrations.detail.docRejectPlaceholder", {
              defaultValue: "Ex. Document illisible, merci de renvoyer un scan net.",
            })}
          />
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel", { defaultValue: "Annuler" })}</AlertDialogCancel>
            <AlertDialogAction
              disabled={reviewDocMut.isPending || docReject.reason.trim().length === 0}
              onClick={() =>
                docReject.doc &&
                reviewDocMut.mutate({
                  documentId: docReject.doc.id,
                  status: "rejected",
                  reason: docReject.reason.trim(),
                })
              }
            >
              {reviewDocMut.isPending && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              {t("registrations.detail.confirmDocReject", { defaultValue: "Refuser la pièce" })}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function Header({ detail, t }: { detail: RegistrationDetail; t: any }) {
  const trackingUrl = useMemo(() => {
    if (typeof window === "undefined") return "";
    return `${getPublicOrigin()}/suivi/${detail.access_token}`;
  }, [detail.access_token]);

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <StatusPill status={detail.registration_status} t={t} />
        <span className="text-xs text-muted-foreground">
          {t("registrations.detail.createdAt", {
            defaultValue: "Reçue le {{date}}",
            date: new Date(detail.created_at).toLocaleString(),
          })}
        </span>
      </div>
      {detail.registration_status === "under_review" && detail.reserved_until && (
        <div className="text-xs text-blue-800">
          <Clock className="inline h-3 w-3 mr-1" />
          {t("registrations.detail.reservedUntil", {
            defaultValue: "Place réservée jusqu'au {{date}}",
            date: new Date(detail.reserved_until).toLocaleString(),
          })}
        </div>
      )}
      {detail.registration_status === "rejected" && detail.rejection_reason && (
        <div className="rounded-md border border-red-500/30 bg-red-500/5 p-2 text-xs text-red-800">
          <div className="font-semibold">
            {t("registrations.detail.currentReason", { defaultValue: "Motif du refus" })}
          </div>
          <p className="whitespace-pre-wrap">{detail.rejection_reason}</p>
        </div>
      )}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span>{t("registrations.detail.trackingLink", { defaultValue: "Lien famille" })}</span>
        <code className="truncate text-[11px] bg-muted px-1.5 py-0.5 rounded">{trackingUrl}</code>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            void copyText(trackingUrl);
            toast.success(t("common.copied", { defaultValue: "Copié" }));
          }}
        >
          <Copy className="h-3 w-3" />
        </Button>
      </div>
      <div className="text-[11px] text-muted-foreground">
        {t("registrations.detail.capacityLine", {
          defaultValue:
            "Capacité : {{approved}}/{{capacity}} confirmées · {{remaining}} places restantes",
          approved: detail.stats.approved,
          capacity: detail.stats.capacity,
          remaining: detail.stats.remaining,
        })}
      </div>
    </div>
  );
}

function ParticipantSection({ detail, t }: { detail: RegistrationDetail; t: any }) {
  const age = (() => {
    const d = new Date(detail.birth_date);
    if (Number.isNaN(d.getTime())) return null;
    const now = new Date();
    let a = now.getFullYear() - d.getFullYear();
    const m = now.getMonth() - d.getMonth();
    if (m < 0 || (m === 0 && now.getDate() < d.getDate())) a--;
    return a;
  })();

  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold uppercase text-muted-foreground">
        {t("registrations.detail.participant", { defaultValue: "Participant" })}
      </h3>
      <div className="grid grid-cols-2 gap-3 text-sm">
        <Field label={t("registrations.detail.firstName", { defaultValue: "Prénom" })}>
          {detail.participant_first_name}
        </Field>
        <Field label={t("registrations.detail.lastName", { defaultValue: "Nom" })}>
          {detail.participant_last_name}
        </Field>
        <Field label={t("registrations.detail.birthDate", { defaultValue: "Naissance" })}>
          {new Date(detail.birth_date).toLocaleDateString()}
          {age != null && (
            <span className="ml-2 text-xs text-muted-foreground">
              ({t("registrations.age", { defaultValue: "{{age}} ans", age })})
            </span>
          )}
        </Field>
        <Field label={t("registrations.detail.gender", { defaultValue: "Genre" })}>
          {detail.gender ?? "—"}
        </Field>
        <Field label={t("registrations.detail.clubName", { defaultValue: "Club d'origine" })}>
          {detail.club_name ?? "—"}
        </Field>
      </div>
    </section>
  );
}

function GuardianSection({ detail, t }: { detail: RegistrationDetail; t: any }) {
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold uppercase text-muted-foreground">
        {t("registrations.detail.guardian", { defaultValue: "Responsable légal" })}
      </h3>
      <div className="grid grid-cols-2 gap-3 text-sm">
        <Field label={t("registrations.detail.firstName", { defaultValue: "Prénom" })}>
          {detail.guardian_first_name}
        </Field>
        <Field label={t("registrations.detail.lastName", { defaultValue: "Nom" })}>
          {detail.guardian_last_name}
        </Field>
        <Field label={t("registrations.detail.email", { defaultValue: "E-mail" })}>
          <a className="text-primary underline" href={`mailto:${detail.guardian_email}`}>
            {detail.guardian_email}
          </a>
        </Field>
        <Field label={t("registrations.detail.phone", { defaultValue: "Téléphone" })}>
          {detail.guardian_phone ?? "—"}
        </Field>
      </div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div>{children}</div>
    </div>
  );
}

function DocumentsSection({
  detail,
  t,
  onOpen,
  onApprove,
  onReset,
  onAskReject,
  pendingId,
}: {
  detail: RegistrationDetail;
  t: any;
  onOpen: (d: RegistrationDocumentDetail) => void;
  onApprove: (d: RegistrationDocumentDetail) => void;
  onReset: (d: RegistrationDocumentDetail) => void;
  onAskReject: (d: RegistrationDocumentDetail) => void;
  pendingId: string | null;
}) {
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold uppercase text-muted-foreground">
          {t("registrations.detail.documents", { defaultValue: "Pièces déposées" })}
        </h3>
        {detail.viewer_role === "coach" && (
          <span className="text-[11px] text-muted-foreground flex items-center gap-1">
            <ShieldAlert className="h-3 w-3" />
            {t("registrations.detail.coachSensitiveNote", {
              defaultValue: "Les pièces sensibles sont réservées aux dirigeants.",
            })}
          </span>
        )}
      </div>
      {detail.documents.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {t("registrations.detail.noDocs", { defaultValue: "Aucune pièce déposée." })}
        </p>
      ) : (
        <ul className="space-y-2">
          {detail.documents.map((d) => (
            <li key={d.id} className="rounded-lg border border-border bg-card p-3 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 font-medium text-sm">
                    {d.title}
                    {d.is_sensitive && (
                      <Badge
                        variant="outline"
                        className="text-[10px] bg-amber-500/10 text-amber-800 border-amber-500/30"
                      >
                        <Lock className="h-3 w-3 mr-1" />
                        {t("registrations.detail.sensitive", { defaultValue: "Sensible" })}
                      </Badge>
                    )}
                    <DocStatusBadge status={d.review_status} t={t} />
                  </div>
                  <div className="text-xs text-muted-foreground truncate">
                    {d.file_name} · {new Date(d.uploaded_at).toLocaleString()}
                  </div>
                  {d.review_status === "rejected" && d.rejection_reason && (
                    <div className="mt-1 text-xs text-red-800">
                      <span className="font-semibold">
                        {t("registrations.detail.reasonLabel", { defaultValue: "Motif" })} :
                      </span>{" "}
                      {d.rejection_reason}
                    </div>
                  )}
                </div>
                <div className="flex flex-col items-end gap-1">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!d.viewer_can_view}
                    onClick={() => onOpen(d)}
                    title={
                      d.viewer_can_view
                        ? undefined
                        : t("registrations.detail.notAllowed", {
                            defaultValue: "Pièce sensible — accès réservé aux dirigeants.",
                          })
                    }
                  >
                    <Download className="h-3 w-3 mr-1" />
                    {t("registrations.detail.openDoc", { defaultValue: "Ouvrir" })}
                  </Button>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant={d.review_status === "approved" ? "default" : "outline"}
                  disabled={pendingId === d.id}
                  onClick={() => onApprove(d)}
                >
                  <CheckCircle2 className="h-3 w-3 mr-1" />
                  {t("registrations.detail.approve", { defaultValue: "Valider" })}
                </Button>
                <Button
                  size="sm"
                  variant={d.review_status === "rejected" ? "destructive" : "outline"}
                  disabled={pendingId === d.id}
                  onClick={() => onAskReject(d)}
                >
                  <XCircle className="h-3 w-3 mr-1" />
                  {t("registrations.detail.reject", { defaultValue: "Refuser" })}
                </Button>
                {d.review_status !== "pending" && (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={pendingId === d.id}
                    onClick={() => onReset(d)}
                  >
                    {t("registrations.detail.reset", { defaultValue: "Réinitialiser" })}
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function StatusActions({
  detail,
  t,
  pending,
  onSet,
  onAskReject,
}: {
  detail: RegistrationDetail;
  t: any;
  pending: RegistrationStatus | null;
  onSet: (s: RegistrationStatus) => void;
  onAskReject: () => void;
}) {
  const current = detail.registration_status;
  const full = detail.stats.remaining <= 0 && current !== "approved";

  const btn = (
    target: RegistrationStatus,
    label: string,
    variant: "default" | "outline" | "destructive" | "ghost" = "outline",
    extra?: React.ReactNode,
    disabled?: boolean,
  ) => (
    <Button
      key={target}
      variant={variant}
      size="sm"
      disabled={pending !== null || current === target || disabled}
      onClick={() => onSet(target)}
    >
      {pending === target ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : extra}
      {label}
    </Button>
  );

  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold uppercase text-muted-foreground">
        {t("registrations.detail.decision", { defaultValue: "Décision" })}
      </h3>
      {full && (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-2 text-xs text-amber-900 flex items-center gap-2">
          <AlertTriangle className="h-3 w-3" />
          {t("registrations.detail.capacityWarn", {
            defaultValue:
              "Le stage est complet. Une validation basculera l'inscription en liste d'attente.",
          })}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {btn(
          "under_review",
          t("registrations.detail.markUnderReview", {
            defaultValue: "Réserver 72 h (en examen)",
          }),
          "outline",
          <Clock className="h-3 w-3 mr-1" />,
        )}
        {btn(
          "approved",
          t("registrations.detail.approve", { defaultValue: "Valider" }),
          "default",
          <CheckCircle2 className="h-3 w-3 mr-1" />,
        )}
        {btn(
          "waitlist",
          t("registrations.detail.waitlist", { defaultValue: "Liste d'attente" }),
          "outline",
        )}
        <Button
          variant="destructive"
          size="sm"
          disabled={pending !== null || current === "rejected"}
          onClick={onAskReject}
        >
          <XCircle className="h-3 w-3 mr-1" />
          {t("registrations.detail.reject", { defaultValue: "Refuser" })}
        </Button>
        {btn(
          "cancelled",
          t("registrations.detail.cancel", { defaultValue: "Annuler l'inscription" }),
          "ghost",
        )}
      </div>
      <p className="text-[11px] text-muted-foreground">
        {t("registrations.detail.emailsHint", {
          defaultValue:
            "Les e-mails automatiques aux familles seront ajoutés à l'étape suivante (Phase 3, étape 3).",
        })}
      </p>
    </section>
  );
}

function StatusPill({ status, t }: { status: RegistrationStatus; t: any }) {
  const map: Record<RegistrationStatus, string> = {
    pending: "bg-slate-500/10 text-slate-700 border-slate-500/30",
    under_review: "bg-blue-500/10 text-blue-700 border-blue-500/30",
    approved: "bg-emerald-500/10 text-emerald-700 border-emerald-500/30",
    waitlist: "bg-purple-500/10 text-purple-700 border-purple-500/30",
    rejected: "bg-red-500/10 text-red-700 border-red-500/30",
    cancelled: "bg-muted text-muted-foreground border-border",
  };
  return (
    <Badge variant="outline" className={map[status]}>
      {t(`registrations.status.${status}`, { defaultValue: status })}
    </Badge>
  );
}

function DocStatusBadge({
  status,
  t,
}: {
  status: RegistrationDocumentDetail["review_status"];
  t: any;
}) {
  const map: Record<string, string> = {
    pending: "bg-slate-500/10 text-slate-700 border-slate-500/30",
    approved: "bg-emerald-500/10 text-emerald-700 border-emerald-500/30",
    rejected: "bg-red-500/10 text-red-700 border-red-500/30",
  };
  return (
    <Badge variant="outline" className={`text-[10px] ${map[status]}`}>
      {t(`registrations.detail.docStatus.${status}`, { defaultValue: status })}
    </Badge>
  );
}

function PaymentSection({
  detail,
  t,
  pending,
  onSet,
}: {
  detail: RegistrationDetail;
  t: any;
  pending: boolean;
  onSet: (status: PaymentStatus, amount?: number) => void;
}) {
  const price = detail.camp_price ?? 0;
  const currency = detail.camp_currency ?? "EUR";
  const status = detail.payment_status;
  const isPaid = status === "paid";
  const notRequired = status === "not_required" || price <= 0;

  const [partialAmount, setPartialAmount] = useState<string>(
    detail.amount_paid > 0 && detail.amount_paid < price ? String(detail.amount_paid) : "",
  );
  const partialValue = Number(partialAmount.replace(",", "."));
  const partialValid = Number.isFinite(partialValue) && partialValue > 0 && partialValue < price;
  const remaining = Math.max(0, price - (detail.amount_paid ?? 0));

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold uppercase text-muted-foreground">
          {t("registrations.detail.paymentSection", { defaultValue: "Paiement" })}
        </h3>
        <PaymentPill status={status} t={t} />
      </div>
      <div className="text-sm text-muted-foreground">
        {notRequired ? (
          t("registrations.detail.paymentNotRequired", {
            defaultValue: "Aucun paiement requis pour ce stage.",
          })
        ) : (
          <>
            {t("registrations.detail.paymentPrice", {
              defaultValue: "Prix du stage : {{price}} {{currency}}",
              price: price.toFixed(2),
              currency,
            })}
            {detail.amount_paid > 0 && (
              <span className="ml-2">
                ·{" "}
                {t("registrations.detail.paymentReceived", {
                  defaultValue: "Reçu : {{amount}} {{currency}}",
                  amount: detail.amount_paid.toFixed(2),
                  currency,
                })}
              </span>
            )}
            {status === "partial" && remaining > 0 && (
              <span className="ml-2 text-amber-700">
                ·{" "}
                {t("registrations.detail.paymentRemaining", {
                  defaultValue: "Reste dû : {{amount}} {{currency}}",
                  amount: remaining.toFixed(2),
                  currency,
                })}
              </span>
            )}
          </>
        )}
      </div>
      {!notRequired && (
        <>
          <div className="flex flex-wrap gap-2">
            {!isPaid && (
              <Button size="sm" disabled={pending} onClick={() => onSet("paid", price)}>
                {pending && <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />}
                <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                {t("registrations.detail.markPaid", { defaultValue: "Marquer comme payé" })}
              </Button>
            )}
            {isPaid && (
              <Button
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={() => onSet("pending", 0)}
              >
                {pending && <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />}
                {t("registrations.detail.markUnpaid", { defaultValue: "Marquer non payé" })}
              </Button>
            )}
            {isPaid && (
              <Button
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={() => onSet("refunded")}
              >
                {t("registrations.detail.markRefunded", { defaultValue: "Marquer remboursé" })}
              </Button>
            )}
          </div>

          <div className="rounded-md border border-border bg-muted/30 p-3 space-y-2">
            <div className="text-xs font-semibold text-foreground">
              {t("registrations.detail.markPartialTitle", {
                defaultValue: "Enregistrer un paiement partiel",
              })}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  max={price}
                  value={partialAmount}
                  onChange={(e) => setPartialAmount(e.target.value)}
                  placeholder="0.00"
                  className="h-8 w-28 rounded-md border border-input bg-background px-2 pr-8 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                />
                <span className="pointer-events-none absolute right-2 top-1.5 text-xs text-muted-foreground">
                  {currency}
                </span>
              </div>
              <Button
                size="sm"
                variant="outline"
                disabled={pending || !partialValid}
                onClick={() => onSet("partial", partialValue)}
              >
                {pending && <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />}
                {t("registrations.detail.markPartial", {
                  defaultValue: "Marquer comme partiel",
                })}
              </Button>
              {partialValid && (
                <span className="text-xs text-muted-foreground">
                  {t("registrations.detail.partialRemainingPreview", {
                    defaultValue: "Reste dû : {{amount}} {{currency}}",
                    amount: (price - partialValue).toFixed(2),
                    currency,
                  })}
                </span>
              )}
            </div>
          </div>
        </>
      )}
    </section>
  );
}

function PaymentPill({ status, t }: { status: PaymentStatus; t: any }) {
  const map: Record<PaymentStatus, string> = {
    not_required: "bg-slate-500/10 text-slate-700 border-slate-500/30",
    pending: "bg-amber-500/10 text-amber-800 border-amber-500/30",
    declared: "bg-blue-500/10 text-blue-700 border-blue-500/30",
    paid: "bg-emerald-500/10 text-emerald-700 border-emerald-500/30",
    partial: "bg-amber-500/10 text-amber-800 border-amber-500/30",
    refunded: "bg-purple-500/10 text-purple-700 border-purple-500/30",
  };
  return (
    <Badge variant="outline" className={map[status]}>
      {t(`registrations.payment.${status}`, { defaultValue: status })}
    </Badge>
  );
}
