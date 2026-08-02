import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { apiUrl } from "@/lib/native-platform";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowLeft, CheckCircle2, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import {
  CAMP_UPLOAD_ALLOWED_MIME,
  CAMP_UPLOAD_MAX_BYTES,
  type PublicCampBundle,
} from "@/lib/public-camps.types";

const publicCampQuery = (clubSlug: string, campSlug: string) =>
  queryOptions({
    queryKey: ["public-camp", clubSlug, campSlug],
    queryFn: async (): Promise<PublicCampBundle | null> => {
      const { data, error } = await supabase.rpc("get_public_camp_by_slug" as any, {
        _club_slug: clubSlug,
        _camp_slug: campSlug,
      });
      if (error) throw error;
      return (data as PublicCampBundle | null) ?? null;
    },
    staleTime: 60_000,
  });

export const Route = createFileRoute("/stages/$clubSlug/$campSlug/inscription")({
  loader: async ({ context, params }) => {
    const data = await context.queryClient.ensureQueryData(
      publicCampQuery(params.clubSlug, params.campSlug),
    );
    if (!data) throw notFound();
    return null;
  },
  head: () => ({
    meta: [
      { title: "Inscription au stage — Clubero" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  errorComponent: () => (
    <div className="min-h-screen flex items-center justify-center px-6 text-center">
      <div>
        <h1 className="text-2xl font-bold">Erreur</h1>
        <p className="mt-2 text-muted-foreground">Impossible de charger le formulaire.</p>
      </div>
    </div>
  ),
  notFoundComponent: () => (
    <div className="min-h-screen flex items-center justify-center px-6 text-center">
      <div>
        <h1 className="text-2xl font-bold">Stage introuvable</h1>
      </div>
    </div>
  ),
  component: RegistrationFormPage,
});

interface RegistrationSuccess {
  registrationId: string;
  registrationNumber?: string;
}

function RegistrationFormPage() {
  const { clubSlug, campSlug } = Route.useParams();
  const { data } = useSuspenseQuery(publicCampQuery(clubSlug, campSlug));
  const { t } = useTranslation("camps");

  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<RegistrationSuccess | null>(null);

  if (!data) return null;
  const { camp, club, required_documents, age_groups } = data;

  const deadlinePassed = camp.registration_deadline
    ? new Date(camp.registration_deadline).getTime() < Date.now()
    : false;

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-primary/5 to-background px-6">
        <div className="max-w-md text-center rounded-2xl border border-border/60 bg-card p-8 shadow-sm">
          <CheckCircle2 className="mx-auto h-14 w-14 text-emerald-500" />
          <h1 className="mt-4 text-2xl font-bold">
            {t("public.confirmTitle", "Inscription envoyée !")}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {t(
              "public.confirmBody",
              "Nous avons bien reçu votre dossier. Le club vous contactera pour la suite.",
            )}
          </p>
          <p className="mt-4 text-xs text-muted-foreground">
            {t("public.confirmRef", "Référence : {{id}}", {
              id: success.registrationId.slice(0, 8).toUpperCase(),
            })}
          </p>
          <Button asChild variant="outline" className="mt-6">
            <Link to="/stages/$clubSlug/$campSlug" params={{ clubSlug, campSlug }}>
              {t("public.backToCamp", "Retour au stage")}
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (submitting) return;
    const form = e.currentTarget;
    const formData = new FormData(form);

    // Client-side validation of uploads (required + size + mime)
    for (const doc of required_documents.filter((d) => d.required)) {
      const file = formData.get(`doc_${doc.id}`);
      if (!(file instanceof File) || file.size === 0) {
        toast.error(
          t("public.errors.missingDoc", "Pièce manquante : {{title}}", { title: doc.title }),
        );
        return;
      }
      if (file.size > CAMP_UPLOAD_MAX_BYTES) {
        toast.error(
          t("public.errors.tooLarge", "Fichier trop volumineux : {{title}}", { title: doc.title }),
        );
        return;
      }
      if (!(CAMP_UPLOAD_ALLOWED_MIME as readonly string[]).includes(file.type)) {
        toast.error(
          t(
            "public.errors.badMime",
            "Format non supporté ({{title}}). PDF, JPG ou PNG uniquement.",
            {
              title: doc.title,
            },
          ),
        );
        return;
      }
    }

    // Consent
    if (!formData.get("consent")) {
      toast.error(t("public.errors.consent", "Vous devez accepter les conditions."));
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(apiUrl("/api/public/submit-camp-registration"), {
        method: "POST",
        body: formData,
      });
      const json = (await res.json().catch(() => ({}))) as any;
      if (!res.ok) {
        const code = json?.error ?? "unknown";
        if (code === "rate_limited") {
          toast.error(t("public.errors.rateLimited", "Trop de tentatives, réessayez plus tard."));
        } else if (code === "registration_closed") {
          toast.error(t("public.errors.closed", "Les inscriptions sont fermées."));
        } else if (code === "age_mismatch") {
          toast.error(
            t(
              "public.errors.ageMismatch",
              "L'âge de l'enfant ne correspond pas à la catégorie choisie.",
            ),
          );
        } else if (code === "duplicate") {
          toast.error(
            t(
              "public.errors.duplicate",
              "Cet enfant est déjà inscrit à ce stage. Consultez l'email reçu pour suivre le dossier.",
            ),
          );
        } else {
          toast.error(t("public.errors.generic", "Une erreur est survenue. Réessayez."));
        }
        return;
      }
      setSuccess({ registrationId: json.registrationId });
    } catch (err) {
      toast.error(t("public.errors.network", "Erreur réseau. Vérifiez votre connexion."));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-primary/5 to-background">
      <div className="mx-auto max-w-2xl px-5 py-8 lg:px-8">
        <div className="mb-6">
          <Button asChild variant="ghost" size="sm">
            <Link to="/stages/$clubSlug/$campSlug" params={{ clubSlug, campSlug }}>
              <ArrowLeft className="mr-1 h-4 w-4" />
              {t("public.backToCamp", "Retour au stage")}
            </Link>
          </Button>
        </div>

        <h1 className="text-2xl font-bold md:text-3xl">
          {t("public.formTitle", "Inscription — {{title}}", { title: camp.title })}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{club.name}</p>

        {deadlinePassed && (
          <div className="mt-6 rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {t("public.deadlinePassed", "Les inscriptions sont fermées.")}
          </div>
        )}

        <form onSubmit={onSubmit} className="mt-8 space-y-8" encType="multipart/form-data">
          <input type="hidden" name="club_slug" value={clubSlug} />
          <input type="hidden" name="camp_slug" value={campSlug} />
          {/* Honeypot */}
          <input
            type="text"
            name="website"
            tabIndex={-1}
            autoComplete="off"
            className="absolute -left-[10000px] h-0 w-0 opacity-0"
            aria-hidden="true"
          />

          <fieldset disabled={submitting || deadlinePassed} className="space-y-5">
            <Section title={t("public.section.child", "Enfant participant")}>
              <TwoCol>
                <Field label={t("public.field.firstName", "Prénom")} required>
                  <Input name="participant_first_name" required maxLength={120} />
                </Field>
                <Field label={t("public.field.lastName", "Nom")} required>
                  <Input name="participant_last_name" required maxLength={120} />
                </Field>
              </TwoCol>
              <TwoCol>
                <Field label={t("public.field.birthDate", "Date de naissance")} required>
                  <Input type="date" name="birth_date" required />
                </Field>
                <Field label={t("public.field.gender", "Sexe")}>
                  <select
                    name="gender"
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    defaultValue=""
                  >
                    <option value="">—</option>
                    <option value="female">{t("public.gender.female", "Fille")}</option>
                    <option value="male">{t("public.gender.male", "Garçon")}</option>
                    <option value="other">{t("public.gender.other", "Autre")}</option>
                  </select>
                </Field>
              </TwoCol>
              <Field label={t("public.field.clubName", "Club d'origine (facultatif)")}>
                <Input name="club_name" maxLength={200} />
              </Field>
            </Section>

            {age_groups.length > 0 && (
              <Section title={t("public.section.category", "Catégorie d'âge")}>
                <Field label={t("public.field.ageGroup", "Catégorie")} required>
                  <select
                    name="age_group_id"
                    required
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    defaultValue=""
                  >
                    <option value="" disabled>
                      —
                    </option>
                    {age_groups.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.label}
                        {g.birth_year_min && g.birth_year_max
                          ? ` (${g.birth_year_min}-${g.birth_year_max})`
                          : ""}
                      </option>
                    ))}
                  </select>
                </Field>
              </Section>
            )}

            <Section title={t("public.section.guardian", "Parent référent")}>
              <TwoCol>
                <Field label={t("public.field.firstName", "Prénom")} required>
                  <Input name="guardian_first_name" required maxLength={120} />
                </Field>
                <Field label={t("public.field.lastName", "Nom")} required>
                  <Input name="guardian_last_name" required maxLength={120} />
                </Field>
              </TwoCol>
              <TwoCol>
                <Field label={t("public.field.email", "Email")} required>
                  <Input type="email" name="guardian_email" required maxLength={255} />
                </Field>
                <Field label={t("public.field.phone", "Téléphone")}>
                  <Input type="tel" name="guardian_phone" maxLength={40} />
                </Field>
              </TwoCol>
            </Section>

            {required_documents.length > 0 && (
              <Section title={t("public.section.docs", "Pièces à fournir")}>
                <p className="text-xs text-muted-foreground">
                  {t("public.docsHint", "PDF, JPG ou PNG — 15 Mo max par fichier.")}
                </p>
                {required_documents.map((doc) => (
                  <Field
                    key={doc.id}
                    label={
                      <>
                        {doc.title}
                        {doc.required && <span className="ml-1 text-destructive">*</span>}
                      </>
                    }
                    required={doc.required}
                  >
                    <Input
                      type="file"
                      name={`doc_${doc.id}`}
                      accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                      required={doc.required}
                    />
                  </Field>
                ))}
              </Section>
            )}

            <Section title={t("public.section.notes", "Informations complémentaires")}>
              <Field label={t("public.field.notes", "Notes (facultatif)")}>
                <Textarea name="notes" rows={3} maxLength={2000} />
              </Field>
            </Section>

            <div className="flex items-start gap-3 rounded-md bg-muted/40 p-4">
              <Checkbox id="consent" name="consent" value="true" />
              <Label htmlFor="consent" className="text-sm leading-snug">
                {t(
                  "public.consent",
                  "J'autorise le club à utiliser les données transmises (identité de l'enfant, coordonnées du parent, pièces jointes) pour gérer cette inscription au stage, conformément au RGPD. Ces données sont conservées jusqu'à {{months}} mois après la fin du stage, puis supprimées automatiquement.",
                  { months: camp.document_retention_months ?? 6 },
                )}
              </Label>
            </div>

            <div className="flex justify-end">
              <Button type="submit" size="lg" disabled={submitting || deadlinePassed}>
                {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t("public.submit", "Envoyer l'inscription")}
              </Button>
            </div>
          </fieldset>
        </form>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-border/60 bg-card p-6 space-y-4">
      <h2 className="text-lg font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function TwoCol({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-4 md:grid-cols-2">{children}</div>;
}

function Field({
  label,
  required,
  children,
}: {
  label: React.ReactNode;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm">
        {label}
        {required && !String(label).includes("*") && (
          <span className="ml-0.5 text-destructive">*</span>
        )}
      </Label>
      {children}
    </div>
  );
}
