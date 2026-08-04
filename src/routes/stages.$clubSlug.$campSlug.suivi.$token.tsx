import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { apiUrl } from "@/lib/native-platform";
import { openExternalUrl } from "@/lib/open-url";
import { queryOptions, useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowLeft, CheckCircle2, Clock, Download, Loader2, Upload, XCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

interface RequiredDoc {
  id: string;
  title: string;
  required: boolean;
  sort_order: number;
}
interface SubmittedDoc {
  id: string;
  required_document_id: string;
  review_status: "pending" | "approved" | "rejected" | string;
  rejection_reason: string | null;
  uploaded_at: string;
}
interface TrackingBundle {
  registration: {
    id: string;
    participant_first_name: string;
    participant_last_name: string;
    birth_date: string;
    guardian_first_name: string;
    guardian_last_name: string;
    guardian_email: string;
    registration_status: string;
    payment_status: string;
    rejection_reason: string | null;
    created_at: string;
  };
  camp: {
    id: string;
    slug: string;
    title: string;
    start_date: string;
    end_date: string;
    status: string;
    club_id: string;
  };
  club: { id: string; name: string; slug: string };
  required_documents: RequiredDoc[];
  submitted_documents: SubmittedDoc[];
}

const NotFoundBlock = () => {
  const { t } = useTranslation("camps");
  return (
    <div className="min-h-screen flex items-center justify-center px-6 text-center">
      <div>
        <h1 className="text-2xl font-bold">{t("public.tracking.invalidTitle")}</h1>
        <p className="mt-2 text-muted-foreground">{t("public.tracking.invalidBody")}</p>
      </div>
    </div>
  );
};

const trackingQuery = (token: string) =>
  queryOptions({
    queryKey: ["camp-tracking", token],
    queryFn: async (): Promise<TrackingBundle | null> => {
      const { data, error } = await supabase.rpc("get_camp_registration_by_token" as any, {
        _token: token,
      });
      if (error) throw error;
      return (data as TrackingBundle | null) ?? null;
    },
    staleTime: 15_000,
  });

export const Route = createFileRoute("/stages/$clubSlug/$campSlug/suivi/$token")({
  loader: async ({ context, params }) => {
    const data = await context.queryClient.ensureQueryData(trackingQuery(params.token));
    // 404 générique — token invalide OU stage inexistant, aucune distinction.
    if (!data) throw notFound();
    // Cohérence de l'URL (empêche un token valide utilisé sur un autre slug)
    if (data.club.slug !== params.clubSlug || data.camp.slug !== params.campSlug) {
      throw notFound();
    }
    return null;
  },
  head: () => ({
    meta: [
      { title: "Suivi d'inscription — Clubero" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  errorComponent: NotFoundBlock,
  notFoundComponent: NotFoundBlock,
  component: TrackingPage,
});

function TrackingPage() {
  const { clubSlug, campSlug, token } = Route.useParams();
  const { data } = useSuspenseQuery(trackingQuery(token));
  const qc = useQueryClient();
  const { t, i18n } = useTranslation("camps");

  if (!data) return <NotFoundBlock />;

  const { registration, camp, club, required_documents, submitted_documents } = data;

  const submittedByReq = new Map<string, SubmittedDoc>();
  for (const s of submitted_documents) {
    // most recent first (RPC sorts DESC), keep first per required id
    if (!submittedByReq.has(s.required_document_id)) submittedByReq.set(s.required_document_id, s);
  }

  const locale = i18n.language || "fr-FR";
  const dateRange = `${new Date(camp.start_date).toLocaleDateString(locale)} → ${new Date(
    camp.end_date,
  ).toLocaleDateString(locale)}`;

  return (
    <div className="min-h-screen bg-gradient-to-b from-primary/5 to-background">
      <div className="mx-auto max-w-2xl px-5 py-8 lg:px-8">
        <div className="mb-6">
          <Button asChild variant="ghost" size="sm">
            <Link to="/stages/$clubSlug/$campSlug" params={{ clubSlug, campSlug }}>
              <ArrowLeft className="mr-1 h-4 w-4" />
              {t("public.backToCamp")}
            </Link>
          </Button>
        </div>

        <h1 className="text-2xl font-bold md:text-3xl">{t("public.tracking.title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {camp.title} · {club.name}
        </p>

        <section className="mt-6 rounded-2xl border border-border/60 bg-card p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm text-muted-foreground">{t("public.tracking.participant")}</p>
              <p className="text-lg font-semibold">
                {registration.participant_first_name} {registration.participant_last_name}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {t("public.tracking.bornOn", {
                  date: new Date(registration.birth_date).toLocaleDateString(locale),
                })}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {t("public.tracking.campDates", { dates: dateRange })}
              </p>
            </div>
            <StatusBadge status={registration.registration_status} />
          </div>
          {registration.registration_status === "rejected" && registration.rejection_reason && (
            <div className="mt-4 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {t("public.tracking.reason", { reason: registration.rejection_reason })}
            </div>
          )}
        </section>

        <section className="mt-6 rounded-2xl border border-border/60 bg-card p-6">
          <h2 className="text-lg font-semibold">{t("public.requiredDocs")}</h2>
          {required_documents.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">{t("public.tracking.noDocs")}</p>
          ) : (
            <ul className="mt-4 space-y-3">
              {required_documents.map((rd) => {
                const submitted = submittedByReq.get(rd.id);
                return (
                  <DocRow
                    key={rd.id}
                    token={token}
                    required={rd}
                    submitted={submitted}
                    onDone={() => qc.invalidateQueries({ queryKey: ["camp-tracking", token] })}
                  />
                );
              })}
            </ul>
          )}
        </section>

        <p className="mt-6 text-xs text-muted-foreground">{t("public.tracking.personalLink")}</p>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const { t } = useTranslation("camps");
  const map: Record<string, { labelKey: string; cls: string }> = {
    pending: {
      labelKey: "public.tracking.status.pending",
      cls: "bg-amber-100 text-amber-800",
    },
    under_review: {
      labelKey: "public.tracking.status.under_review",
      cls: "bg-blue-100 text-blue-800",
    },
    approved: {
      labelKey: "public.tracking.status.approved",
      cls: "bg-emerald-100 text-emerald-800",
    },
    rejected: {
      labelKey: "public.tracking.status.rejected",
      cls: "bg-destructive/10 text-destructive",
    },
    cancelled: { labelKey: "public.tracking.status.cancelled", cls: "bg-slate-100 text-slate-700" },
    waitlisted: {
      labelKey: "public.tracking.status.waitlisted",
      cls: "bg-purple-100 text-purple-800",
    },
  };
  const meta = map[status];
  const label = meta ? t(meta.labelKey) : status;
  const cls = meta?.cls ?? "bg-slate-100 text-slate-700";
  return <span className={`rounded-full px-3 py-1 text-xs font-medium ${cls}`}>{label}</span>;
}

function DocRow({
  token,
  required,
  submitted,
  onDone,
}: {
  token: string;
  required: RequiredDoc;
  submitted?: SubmittedDoc;
  onDone: () => void;
}) {
  const { t } = useTranslation("camps");
  const [downloading, setDownloading] = useState(false);
  const [replacing, setReplacing] = useState(false);

  const status = submitted?.review_status ?? "missing";
  const isRejected = status === "rejected";
  const isMissing = !submitted;

  const download = async () => {
    if (!submitted) return;
    setDownloading(true);
    try {
      const res = await fetch(apiUrl("/api/public/camp-track-signed-url"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, documentId: submitted.id }),
      });
      const json = await res.json().catch(() => ({}) as any);
      if (!res.ok || !json.url) {
        toast.error(t("public.tracking.errors.downloadUnavailable"));
        return;
      }
      void openExternalUrl(json.url);
    } finally {
      setDownloading(false);
    }
  };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.currentTarget.files?.[0];
    if (!file) return;
    setReplacing(true);
    try {
      const fd = new FormData();
      fd.append("token", token);
      fd.append("required_document_id", required.id);
      fd.append("file", file);
      const res = await fetch(apiUrl("/api/public/camp-track-upload"), {
        method: "POST",
        body: fd,
      });
      const json = await res.json().catch(() => ({}) as any);
      if (!res.ok) {
        const code = json?.error ?? "unknown";
        if (code === "file_too_large") toast.error(t("public.tracking.errors.fileTooLarge"));
        else if (code === "invalid_mime") toast.error(t("public.tracking.errors.invalidMime"));
        else if (code === "rate_limited") toast.error(t("public.tracking.errors.rateLimited"));
        else toast.error(t("public.tracking.errors.uploadFailed"));
        return;
      }
      toast.success(t("public.tracking.uploadSuccess"));
      onDone();
    } finally {
      setReplacing(false);
      e.currentTarget.value = "";
    }
  };

  return (
    <li className="rounded-xl border border-border/60 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium">
            {required.title}
            {required.required && <span className="ml-1 text-destructive">*</span>}
          </p>
          <div className="mt-1 flex items-center gap-2 text-xs">
            {isMissing && (
              <span className="inline-flex items-center gap-1 text-amber-700">
                <Upload className="h-3.5 w-3.5" /> {t("public.tracking.docMissing")}
              </span>
            )}
            {status === "pending" && (
              <span className="inline-flex items-center gap-1 text-blue-700">
                <Clock className="h-3.5 w-3.5" /> {t("public.tracking.docPending")}
              </span>
            )}
            {status === "approved" && (
              <span className="inline-flex items-center gap-1 text-emerald-700">
                <CheckCircle2 className="h-3.5 w-3.5" /> {t("public.tracking.docApproved")}
              </span>
            )}
            {isRejected && (
              <span className="inline-flex items-center gap-1 text-destructive">
                <XCircle className="h-3.5 w-3.5" /> {t("public.tracking.docRejected")}
              </span>
            )}
          </div>
          {isRejected && submitted?.rejection_reason && (
            <p className="mt-2 text-xs text-destructive">
              {t("public.tracking.reason", { reason: submitted.rejection_reason })}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {submitted && (
            <Button variant="outline" size="sm" onClick={download} disabled={downloading}>
              {downloading ? (
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Download className="mr-1 h-3.5 w-3.5" />
              )}
              {t("public.tracking.download")}
            </Button>
          )}
          {status !== "approved" && (
            <label className="inline-flex">
              <input
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                className="hidden"
                onChange={onFile}
                disabled={replacing}
              />
              <span
                className={`inline-flex cursor-pointer items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground ${
                  replacing ? "opacity-60" : "hover:bg-primary/90"
                }`}
              >
                {replacing ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Upload className="h-3.5 w-3.5" />
                )}
                {isMissing ? t("public.tracking.upload") : t("public.tracking.replace")}
              </span>
            </label>
          )}
        </div>
      </div>
      {/* Hidden field kept to satisfy Input import in file-heavy shells; not used */}
      <Input type="hidden" value="" readOnly aria-hidden="true" className="hidden" />
    </li>
  );
}
