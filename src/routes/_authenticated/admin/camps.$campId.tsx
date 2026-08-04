import { createFileRoute, Navigate, useNavigate } from "@tanstack/react-router";
import { getPublicOrigin } from "@/lib/native-platform";
import { copyText } from "@/lib/clipboard";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import { useEffect, useState } from "react";
import i18nInstance from "@/lib/i18n";
import { toast } from "sonner";
import {
  Loader2,
  ArrowLeft,
  Save,
  Rocket,
  Lock,
  Archive,
  XCircle,
  Trash2,
  Copy,
  ExternalLink,
} from "lucide-react";
import { useAuth, useMyRoles } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  getClubCamp,
  updateClubCamp,
  publishClubCamp,
  closeClubCamp,
  archiveClubCamp,
  deleteClubCamp,
  duplicateClubCamp,
} from "@/lib/camps.functions";
import { slugifyCampTitle, isValidCampSlug } from "@/lib/camps.slug";
import { VenueFacilityPicker } from "@/components/camps/venue-facility-picker";
import { CampAgeGroupsEditor } from "@/components/camps/camp-age-groups-editor";
import { CampCoverUpload } from "@/components/camps/camp-cover-upload";
import { CampProgramEditor } from "@/components/camps/camp-program-editor";
import { CampDocumentsEditor } from "@/components/camps/camp-documents-editor";
import { CampRequiredDocumentsEditor } from "@/components/camps/camp-required-documents-editor";
import { CampRegistrationsPanel } from "@/components/camps/camp-registrations-panel";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/_authenticated/admin/camps/$campId")({
  component: CampEditPage,
  head: () => ({
    meta: [
      {
        title: i18nInstance.t("camps:meta.edit.title"),
      },
    ],
  }),
});

const MANAGER_ROLES = new Set(["admin", "dirigeant", "coach"]);

function toDateInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

function fromDateInput(v: string): string | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function CampEditPage() {
  const { t } = useTranslation("camps");
  const { campId } = Route.useParams();
  const roles = useMyRoles();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const canManage = roles.some((r) => MANAGER_ROLES.has(r));

  const getFn = useServerFn(getClubCamp);
  const updateFn = useServerFn(updateClubCamp);
  const publishFn = useServerFn(publishClubCamp);
  const closeFn = useServerFn(closeClubCamp);
  const archiveFn = useServerFn(archiveClubCamp);
  const deleteFn = useServerFn(deleteClubCamp);
  const duplicateFn = useServerFn(duplicateClubCamp);

  const { data: camp, isLoading } = useQuery({
    queryKey: ["club-camp", campId],
    queryFn: () => getFn({ data: { campId } }),
    enabled: canManage,
  });

  // Form state (draft that we persist on "Save").
  const [form, setForm] = useState({
    title: "",
    slug: "",
    description: "",
    venue_id: null as string | null,
    facility_id: null as string | null,
    external_location: "" as string,
    start_date: "",
    end_date: "",
    registration_deadline: "",
    price: "",
    currency: "EUR",
    capacity: 20,
    payment_instructions: "",
    document_retention_months: 6,
  });
  const [slugTouched, setSlugTouched] = useState(false);

  useEffect(() => {
    if (!camp) return;
    setForm({
      title: camp.title,
      slug: camp.slug,
      description: camp.description ?? "",
      venue_id: camp.venue_id,
      facility_id: camp.facility_id,
      external_location: camp.external_location ?? "",
      start_date: toDateInput(camp.start_date),
      end_date: toDateInput(camp.end_date),
      registration_deadline: toDateInput(camp.registration_deadline),
      price: camp.price?.toString() ?? "",
      currency: camp.currency,
      capacity: camp.capacity,
      payment_instructions: camp.payment_instructions ?? "",
      document_retention_months: camp.document_retention_months,
    });
    setSlugTouched(false);
  }, [camp]);

  const isDraft = camp?.status === "draft";
  const slugLocked = !isDraft;

  function onTitleChange(next: string) {
    setForm((f) => ({
      ...f,
      title: next,
      slug: !slugTouched && isDraft ? slugifyCampTitle(next) : f.slug,
    }));
  }

  const saveMut = useMutation({
    mutationFn: () =>
      updateFn({
        data: {
          campId,
          patch: {
            title: form.title.trim(),
            ...(isDraft ? { slug: form.slug.trim() } : {}),
            description: form.description.trim() || null,
            venue_id: form.venue_id,
            facility_id: form.facility_id,
            external_location: form.external_location.trim() || null,
            start_date: fromDateInput(form.start_date) ?? undefined,
            end_date: fromDateInput(form.end_date) ?? undefined,
            registration_deadline: fromDateInput(form.registration_deadline),
            price: form.price.trim() === "" ? null : Number(form.price),
            currency: form.currency.trim().toUpperCase().slice(0, 3),
            capacity: Number(form.capacity),
            payment_instructions: form.payment_instructions.trim() || null,
            document_retention_months: Number(form.document_retention_months),
          },
        },
      }),
    onSuccess: () => {
      toast.success(t("form.saved"));
      qc.invalidateQueries({ queryKey: ["club-camp", campId] });
      qc.invalidateQueries({ queryKey: ["club-camps"] });
    },
    onError: (e: Error) => toast.error(mapErr(e.message, t)),
  });

  const publishMut = useMutation({
    mutationFn: () => publishFn({ data: { campId } }),
    onSuccess: () => {
      toast.success(t("lifecycle.published"));
      qc.invalidateQueries({ queryKey: ["club-camp", campId] });
      qc.invalidateQueries({ queryKey: ["club-camps"] });
    },
    onError: (e: Error) => toast.error(mapErr(e.message, t)),
  });

  const closeMut = useMutation({
    mutationFn: () => closeFn({ data: { campId } }),
    onSuccess: () => {
      toast.success(t("lifecycle.closed"));
      qc.invalidateQueries({ queryKey: ["club-camp", campId] });
    },
    onError: (e: Error) => toast.error(mapErr(e.message, t)),
  });

  const archiveMut = useMutation({
    mutationFn: () => archiveFn({ data: { campId } }),
    onSuccess: () => {
      toast.success(t("lifecycle.archived"));
      qc.invalidateQueries({ queryKey: ["club-camps"] });
      navigate({ to: "/admin/camps" });
    },
    onError: (e: Error) => toast.error(mapErr(e.message, t)),
  });

  const deleteMut = useMutation({
    mutationFn: () => deleteFn({ data: { campId } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["club-camps"] });
      navigate({ to: "/admin/camps" });
    },
    onError: (e: Error) => toast.error(mapErr(e.message, t)),
  });

  const duplicateMut = useMutation({
    mutationFn: () => duplicateFn({ data: { campId } }),
    onSuccess: (res) => {
      toast.success(t("duplicate.done"));
      qc.invalidateQueries({ queryKey: ["club-camps"] });
      navigate({ to: "/admin/camps/$campId", params: { campId: res.id } });
    },
    onError: (e: Error) => toast.error(mapErr(e.message, t)),
  });

  if (!canManage) return <Navigate to="/profile" replace />;
  if (isLoading || !camp) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  const slugInvalid = form.slug.trim() !== "" && !isValidCampSlug(form.slug.trim());

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 space-y-6">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => navigate({ to: "/admin/camps" })}>
          <ArrowLeft className="h-4 w-4 mr-1" />
          {t("common.back")}
        </Button>
        <div className="ml-auto flex items-center gap-2">
          {camp.status !== "draft" && camp.club_slug && (
            <Button variant="outline" size="sm" asChild>
              <a
                href={`/stages/${camp.club_slug}/${camp.slug}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <ExternalLink className="h-4 w-4 mr-1.5" />
                {t("lifecycle.openPublic")}
              </a>
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => duplicateMut.mutate()}
            disabled={duplicateMut.isPending}
            title={t("duplicate.hint")}
          >
            {duplicateMut.isPending ? (
              <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
            ) : (
              <Copy className="h-4 w-4 mr-1.5" />
            )}
            {t("duplicate.action")}
          </Button>
          <Badge variant="outline">
            {t(`status.${camp.status}`, { defaultValue: camp.status })}
          </Badge>
        </div>
      </div>

      <Tabs defaultValue="edit" className="space-y-6">
        <TabsList>
          <TabsTrigger value="edit">{t("tabs.edit")}</TabsTrigger>
          <TabsTrigger value="registrations" disabled={camp.status === "draft"}>
            {t("tabs.registrations")}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="registrations" className="space-y-6">
          {camp.status === "draft" ? (
            <p className="text-sm text-muted-foreground">{t("registrations.draftHint")}</p>
          ) : (
            <CampRegistrationsPanel campId={campId} />
          )}
        </TabsContent>

        <TabsContent value="edit" className="space-y-6">
          {camp.status !== "draft" && camp.club_slug && (
            <PublicCampLinkCard clubSlug={camp.club_slug} campSlug={camp.slug} t={t} />
          )}

          {/* Section: Informations */}
          <section className="space-y-4 rounded-xl border border-border bg-card p-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              {t("form.sectionInfo")}
            </h2>

            <div className="space-y-1.5">
              <Label>{t("form.title")}</Label>
              <Input value={form.title} onChange={(e) => onTitleChange(e.target.value)} />
            </div>

            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5">
                {t("form.slug")}
                {slugLocked && <Lock className="h-3.5 w-3.5 text-muted-foreground" />}
              </Label>
              <Input
                value={form.slug}
                onChange={(e) => {
                  setSlugTouched(true);
                  setForm({ ...form, slug: e.target.value });
                }}
                disabled={slugLocked}
              />
              <p className="text-xs text-muted-foreground">
                {slugLocked ? t("form.slugLocked") : t("form.slugHint")}
              </p>
              {slugInvalid && <p className="text-xs text-destructive">{t("errors.slugInvalid")}</p>}
            </div>

            <div className="space-y-1.5">
              <Label>{t("form.description")}</Label>
              <Textarea
                rows={5}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>

            <div>
              <Label className="mb-2 block">{t("form.cover")}</Label>
              <CampCoverUpload
                campId={campId}
                coverUrl={camp.cover_image_url}
                onChange={() => qc.invalidateQueries({ queryKey: ["club-camp", campId] })}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label>{t("form.startDate")}</Label>
                <Input
                  type="date"
                  value={form.start_date}
                  onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>{t("form.endDate")}</Label>
                <Input
                  type="date"
                  value={form.end_date}
                  onChange={(e) => setForm({ ...form, end_date: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>{t("form.deadline")}</Label>
                <Input
                  type="date"
                  value={form.registration_deadline}
                  onChange={(e) => setForm({ ...form, registration_deadline: e.target.value })}
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label>{t("form.price")}</Label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={form.price}
                  onChange={(e) => setForm({ ...form, price: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>{t("form.currency")}</Label>
                <Input
                  maxLength={3}
                  value={form.currency}
                  onChange={(e) => setForm({ ...form, currency: e.target.value.toUpperCase() })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>{t("form.capacity")}</Label>
                <Input
                  type="number"
                  min={1}
                  value={form.capacity}
                  onChange={(e) => setForm({ ...form, capacity: Number(e.target.value) })}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>{t("form.paymentInstructions")}</Label>
              <Textarea
                rows={3}
                value={form.payment_instructions}
                onChange={(e) => setForm({ ...form, payment_instructions: e.target.value })}
                placeholder={t("form.paymentInstructionsPlaceholder")}
              />
            </div>

            <div className="space-y-1.5 max-w-xs">
              <Label>{t("form.retention")}</Label>
              <Input
                type="number"
                min={1}
                max={120}
                value={form.document_retention_months}
                onChange={(e) =>
                  setForm({ ...form, document_retention_months: Number(e.target.value) })
                }
              />
            </div>
          </section>

          {/* Section: Lieu */}
          <section className="space-y-4 rounded-xl border border-border bg-card p-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              {t("form.sectionVenue")}
            </h2>
            <VenueFacilityPicker
              clubId={camp.club_id}
              venueId={form.venue_id}
              facilityId={form.facility_id}
              externalLocation={form.external_location || null}
              onChange={(next) =>
                setForm({
                  ...form,
                  venue_id: next.venueId,
                  facility_id: next.facilityId,
                  external_location: next.externalLocation ?? "",
                })
              }
            />
          </section>

          {/* Section: Catégories d'âge */}
          <section className="space-y-4 rounded-xl border border-border bg-card p-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              {t("form.sectionAgeGroups")}
            </h2>
            <CampAgeGroupsEditor campId={campId} ageGroups={camp.age_groups} />
          </section>

          {/* Section: Programme */}
          <section className="space-y-4 rounded-xl border border-border bg-card p-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              {t("form.sectionProgram")}
            </h2>
            <p className="text-xs text-muted-foreground">{t("form.sectionProgramHint")}</p>
            <CampProgramEditor campId={campId} />
          </section>

          {/* Section: Documents fournis */}
          <section className="space-y-4 rounded-xl border border-border bg-card p-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              {t("form.sectionDocuments")}
            </h2>
            <p className="text-xs text-muted-foreground">{t("form.sectionDocumentsHint")}</p>
            <CampDocumentsEditor campId={campId} />
          </section>

          {/* Section: Pièces à fournir */}
          <section className="space-y-4 rounded-xl border border-border bg-card p-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              {t("form.sectionRequired")}
            </h2>
            <p className="text-xs text-muted-foreground">{t("form.sectionRequiredHint")}</p>
            <CampRequiredDocumentsEditor campId={campId} />
          </section>

          {/* Actions */}
          <div className="sticky bottom-0 z-10 -mx-4 border-t border-border bg-background/95 backdrop-blur px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  onClick={() => saveMut.mutate()}
                  disabled={saveMut.isPending || slugInvalid || !form.title.trim()}
                >
                  {saveMut.isPending ? (
                    <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4 mr-1.5" />
                  )}
                  {t("form.save")}
                </Button>

                {camp.status === "draft" && (
                  <Button
                    variant="default"
                    className="bg-emerald-600 hover:bg-emerald-600/90 text-white"
                    onClick={() => publishMut.mutate()}
                    disabled={publishMut.isPending}
                  >
                    {publishMut.isPending ? (
                      <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                    ) : (
                      <Rocket className="h-4 w-4 mr-1.5" />
                    )}
                    {t("lifecycle.publish")}
                  </Button>
                )}

                {camp.status === "published" && (
                  <Button
                    variant="outline"
                    onClick={() => closeMut.mutate()}
                    disabled={closeMut.isPending}
                  >
                    <XCircle className="h-4 w-4 mr-1.5" />
                    {t("lifecycle.close")}
                  </Button>
                )}
              </div>

              <div className="flex items-center gap-2">
                {camp.status === "draft" ? (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="sm" className="text-destructive">
                        <Trash2 className="h-4 w-4 mr-1.5" />
                        {t("common.delete")}
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>{t("delete.title")}</AlertDialogTitle>
                        <AlertDialogDescription>{t("delete.desc")}</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => deleteMut.mutate()}
                          className="bg-destructive text-destructive-foreground"
                        >
                          {t("common.delete")}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                ) : (
                  camp.status !== "archived" && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => archiveMut.mutate()}
                      disabled={archiveMut.isPending}
                    >
                      <Archive className="h-4 w-4 mr-1.5" />
                      {t("lifecycle.archive")}
                    </Button>
                  )
                )}
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function mapErr(code: string, t: (k: string, o?: { defaultValue: string }) => string): string {
  const map: Record<string, string> = {
    SLUG_TAKEN: t("errors.slugTaken"),
    SLUG_INVALID: t("errors.slugInvalid"),
    SLUG_LOCKED: t("errors.slugLocked"),
    DATES_INVALID: t("errors.datesInvalid"),
    NOT_DRAFT: t("errors.notDraft"),
    DELETE_NOT_DRAFT: t("errors.deleteNotDraft"),
    PUBLISH_TITLE_REQUIRED: t("errors.publishTitleRequired"),
    PUBLISH_DATES_REQUIRED: t("errors.publishDatesRequired"),
    PUBLISH_DATES_ORDER: t("errors.publishDatesOrder"),
    PUBLISH_DEADLINE_AFTER_START: t("errors.publishDeadlineAfterStart"),
    PUBLISH_CAPACITY_REQUIRED: t("errors.publishCapacityRequired"),
    PUBLISH_AGE_GROUP_REQUIRED: t("errors.publishAgeGroupRequired"),
    COVER_TOO_LARGE: t("cover.tooLarge"),
    COVER_TYPE_UNSUPPORTED: t("cover.unsupported"),
  };
  return map[code] ?? code;
}

function PublicCampLinkCard({
  clubSlug,
  campSlug,
  t,
}: {
  clubSlug: string;
  campSlug: string;
  t: (key: string, opts?: { defaultValue?: string }) => string;
}) {
  const path = `/stages/${clubSlug}/${campSlug}`;
  const url = typeof window !== "undefined" ? `${getPublicOrigin()}${path}` : path;
  const copy = async () => {
    try {
      if (!(await copyText(url))) throw new Error("copy failed");
      toast.success(t("lifecycle.publicUrlCopied"));
    } catch {
      toast.error(t("common.copyFailed"));
    }
  };
  return (
    <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm space-y-2">
      <div className="font-medium">{t("lifecycle.publicUrl")}</div>
      <div className="flex items-center gap-2">
        <Input value={url} readOnly className="text-xs h-8" />
        <Button size="sm" variant="outline" onClick={copy} title={t("common.copy")}>
          <Copy className="h-4 w-4" />
        </Button>
        <Button size="sm" variant="outline" asChild>
          <a href={path} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="h-4 w-4" />
          </a>
        </Button>
      </div>
    </div>
  );
}
