/**
 * EventNeedsSection — Bloc "Coups de main" affiché sur la page d'un évènement.
 *
 * - Staff (admin/coach/staff/tournament_manager) : peut créer, publier, décider
 *   les candidatures, fermer, annuler.
 * - Membre destinataire : peut candidater / retirer sa candidature.
 * - Places restantes = agrégat only (jamais de liste de confirmés côté membre).
 */
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { HandHelping, Plus, Users, Check, X, Send, Loader2, Trash2 } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

import {
  listEventNeeds,
  listStaffSignupsForNeed,
  createEventNeed,
  publishEventNeed,
  applyToEventNeed,
  withdrawSignup,
  decideSignup,
  closeEventNeed,
  cancelEventNeed,
} from "@/lib/needs/needs.functions";
import { NEED_TEMPLATES, type NeedTemplate } from "@/lib/needs/templates";
import type { AudienceSelector } from "@/modules/groups/groups.functions";

type Props = {
  eventId: string;
  eventType?: string | null;
  sport?: string | null;
  teamId?: string | null;
};

export function EventNeedsSection({ eventId, sport, teamId }: Props) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const listFn = useServerFn(listEventNeeds);

  const { data, isLoading } = useQuery({
    queryKey: ["event-needs", eventId],
    queryFn: () => listFn({ data: { event_id: eventId } }),
  });

  const isStaff = data?.is_staff ?? false;
  const needs = data?.needs ?? [];
  const [createOpen, setCreateOpen] = useState(false);

  const refresh = () => qc.invalidateQueries({ queryKey: ["event-needs", eventId] });

  // Membre standard : rien à afficher tant qu'il n'y a pas de besoin ouvert visible.
  if (!isStaff && needs.length === 0) return null;
  if (isLoading) return null;

  return (
    <Card className="border-[1.5px]">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <HandHelping className="h-4 w-4 text-primary" />
            {t("needs.section.title", { defaultValue: "Coups de main" })}
          </CardTitle>
          {isStaff && (
            <Button size="sm" variant="outline" onClick={() => setCreateOpen(true)}>
              <Plus className="h-3.5 w-3.5 mr-1" />
              {t("needs.section.add", { defaultValue: "Ajouter un besoin" })}
            </Button>
          )}
        </div>
        {isStaff && needs.length === 0 && (
          <p className="text-xs text-muted-foreground mt-1">
            {t("needs.section.emptyStaff", {
              defaultValue:
                "Créez un besoin (arbitre, buvette, chronométreur…) pour solliciter des volontaires.",
            })}
          </p>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {needs.map((need: any) => (
          <NeedRow key={need.id} need={need} isStaff={isStaff} eventId={eventId} onChange={refresh} />
        ))}
      </CardContent>

      {createOpen && (
        <CreateNeedDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          eventId={eventId}
          sport={sport ?? null}
          teamId={teamId ?? null}
          onCreated={refresh}
        />
      )}
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/* NeedRow                                                                    */
/* -------------------------------------------------------------------------- */

function NeedRow({
  need,
  isStaff,
  eventId,
  onChange,
}: {
  need: any;
  isStaff: boolean;
  eventId: string;
  onChange: () => void;
}) {
  const { t } = useTranslation();
  const apply = useServerFn(applyToEventNeed);
  const withdraw = useServerFn(withdrawSignup);
  const close = useServerFn(closeEventNeed);
  const cancel = useServerFn(cancelEventNeed);
  const [publishOpen, setPublishOpen] = useState(false);
  const [staffOpen, setStaffOpen] = useState(false);

  const remaining = need.remaining_seats as number;
  const capacity = need.capacity as number;
  const status = need.status as string;
  const mySignup = need.my_signup as null | { id: string; status: string };

  const applyM = useMutation({
    mutationFn: () => apply({ data: { need_id: need.id } }),
    onSuccess: (r: any) => {
      const label =
        r?.status === "confirmed"
          ? t("needs.signup.confirmed")
          : t("needs.signup.applied");
      toast.success(label);
      onChange();
    },
    onError: (e: any) => toast.error(t(`needs.errors.${e.message}`, { defaultValue: e.message })),
  });
  const withdrawM = useMutation({
    mutationFn: () => withdraw({ data: { signup_id: mySignup!.id } }),
    onSuccess: () => {
      toast.success(t("needs.signup.withdrawn"));
      onChange();
    },
    onError: (e: any) => toast.error(t(`needs.errors.${e.message}`, { defaultValue: e.message })),
  });
  const closeM = useMutation({
    mutationFn: () => close({ data: { need_id: need.id } }),
    onSuccess: () => {
      toast.success(t("needs.actions.close"));
      onChange();
    },
    onError: (e: any) => toast.error(t(`needs.errors.${e.message}`, { defaultValue: e.message })),
  });
  const cancelM = useMutation({
    mutationFn: () => cancel({ data: { need_id: need.id } }),
    onSuccess: () => {
      toast.success(t("needs.actions.cancel"));
      onChange();
    },
    onError: (e: any) => toast.error(t(`needs.errors.${e.message}`, { defaultValue: e.message })),
  });

  const statusBadge = (
    <Badge
      variant="outline"
      className={cn(
        "text-[10px] font-semibold uppercase",
        status === "open" && "border-emerald-300 text-emerald-700 bg-emerald-50 dark:bg-emerald-950/40 dark:text-emerald-300",
        status === "draft" && "border-amber-300 text-amber-700 bg-amber-50 dark:bg-amber-950/40 dark:text-amber-300",
        status === "closed" && "border-slate-300 text-slate-600",
        status === "cancelled" && "border-red-300 text-red-700",
      )}
    >
      {t(`needs.status.${status}`)}
    </Badge>
  );

  return (
    <div className="rounded-lg border bg-background/50 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-semibold text-foreground truncate">{need.label}</p>
            {statusBadge}
            <Badge variant="outline" className="text-[10px]">
              {t(`needs.validationMode.${need.validation_mode}`)}
            </Badge>
          </div>
          {need.description && (
            <p className="text-xs text-muted-foreground mt-1 whitespace-pre-line">
              {need.description}
            </p>
          )}
          <div className="mt-2 flex items-center gap-3 text-xs">
            <span className="inline-flex items-center gap-1 text-muted-foreground">
              <Users className="h-3.5 w-3.5" />
              <span className="tabular-nums font-semibold text-foreground">
                {capacity - remaining}/{capacity}
              </span>
              <span>
                {remaining === 0
                  ? t("needs.seats.full")
                  : t("needs.seats.remaining", { count: remaining })}
              </span>
            </span>
            {isStaff && need.applied_count > 0 && (
              <button
                type="button"
                onClick={() => setStaffOpen(true)}
                className="inline-flex items-center gap-1 text-primary underline-offset-2 hover:underline"
              >
                <span className="tabular-nums font-semibold">{need.applied_count}</span>
                {t("needs.pendingApplications", { defaultValue: "en attente" })}
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {!isStaff && status === "open" && (
          <>
            {mySignup ? (
              <>
                <Badge
                  className={cn(
                    "text-[11px] px-2 py-1",
                    mySignup.status === "confirmed" && "bg-emerald-600",
                    mySignup.status === "applied" && "bg-amber-500",
                    mySignup.status === "declined" && "bg-slate-500",
                  )}
                >
                  {t(`needs.signup.${mySignup.status}`)}
                </Badge>
                {(mySignup.status === "applied" || mySignup.status === "confirmed") && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => withdrawM.mutate()}
                    disabled={withdrawM.isPending}
                  >
                    {withdrawM.isPending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                    {t("needs.actions.withdraw")}
                  </Button>
                )}
              </>
            ) : (
              <Button
                size="sm"
                onClick={() => applyM.mutate()}
                disabled={applyM.isPending || remaining === 0}
              >
                {applyM.isPending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                {t("needs.actions.apply")}
              </Button>
            )}
          </>
        )}
        {isStaff && (
          <>
            {(status === "draft" || status === "open") && (
              <Button size="sm" variant="default" onClick={() => setPublishOpen(true)}>
                <Send className="h-3.5 w-3.5 mr-1" />
                {status === "draft"
                  ? t("needs.actions.publish")
                  : t("needs.actions.republish")}
              </Button>
            )}
            {status === "open" && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => closeM.mutate()}
                disabled={closeM.isPending}
              >
                {t("needs.actions.close")}
              </Button>
            )}
            {(status === "draft" || status === "open") && (
              <Button
                size="sm"
                variant="ghost"
                className="text-destructive"
                onClick={() => {
                  if (confirm(t("needs.confirmCancel", { defaultValue: "Annuler ce besoin ?" })))
                    cancelM.mutate();
                }}
                disabled={cancelM.isPending}
              >
                <Trash2 className="h-3.5 w-3.5 mr-1" />
                {t("needs.actions.cancel")}
              </Button>
            )}
          </>
        )}
      </div>

      {publishOpen && (
        <PublishDialog
          open={publishOpen}
          onOpenChange={setPublishOpen}
          needId={need.id}
          onPublished={onChange}
        />
      )}
      {staffOpen && (
        <StaffSignupsDialog
          open={staffOpen}
          onOpenChange={setStaffOpen}
          needId={need.id}
          onChanged={onChange}
        />
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* CreateNeedDialog                                                           */
/* -------------------------------------------------------------------------- */

function CreateNeedDialog({
  open,
  onOpenChange,
  eventId,
  sport,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  eventId: string;
  sport: string | null;
  teamId: string | null;
  onCreated: () => void;
}) {
  const { t } = useTranslation();
  const create = useServerFn(createEventNeed);

  const availableTemplates = useMemo<NeedTemplate[]>(() => {
    const s = (sport ?? "").toLowerCase().trim();
    return NEED_TEMPLATES.filter(
      (tpl) => tpl.sports === "all" || (s && (tpl.sports as readonly string[]).includes(s)),
    );
  }, [sport]);

  const [templateKey, setTemplateKey] = useState<string>(availableTemplates[0]?.key ?? "other");
  const currentTpl =
    availableTemplates.find((x) => x.key === templateKey) ??
    NEED_TEMPLATES.find((x) => x.key === "other")!;

  const defaultLabel = t(`needs.templates.${currentTpl.key}`);
  const [label, setLabel] = useState(defaultLabel);
  const [description, setDescription] = useState("");
  const [capacity, setCapacity] = useState(currentTpl.suggestedCapacity ?? 1);
  const [mode, setMode] = useState<"auto" | "manual">(
    currentTpl.suggestedValidationMode ?? "auto",
  );

  // Sync when template changes
  const [lastKey, setLastKey] = useState(templateKey);
  if (lastKey !== templateKey) {
    setLastKey(templateKey);
    setLabel(t(`needs.templates.${currentTpl.key}`));
    setCapacity(currentTpl.suggestedCapacity ?? 1);
    setMode(currentTpl.suggestedValidationMode ?? "auto");
  }

  const createM = useMutation({
    mutationFn: () =>
      create({
        data: {
          event_id: eventId,
          role_key: currentTpl.key,
          label: label.trim() || defaultLabel,
          description: description.trim() || null,
          capacity,
          validation_mode: mode,
        },
      }),
    onSuccess: () => {
      toast.success(t("needs.section.created", { defaultValue: "Besoin créé" }));
      onCreated();
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("needs.section.add", { defaultValue: "Ajouter un besoin" })}</DialogTitle>
          <DialogDescription>
            {t("needs.section.createDesc", {
              defaultValue: "Créez le besoin, puis publiez-le vers l'audience de votre choix.",
            })}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>{t("needs.field.template", { defaultValue: "Type" })}</Label>
            <Select value={templateKey} onValueChange={setTemplateKey}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {availableTemplates.map((tpl) => (
                  <SelectItem key={tpl.key} value={tpl.key}>
                    {t(`needs.templates.${tpl.key}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>{t("needs.field.label", { defaultValue: "Libellé" })}</Label>
            <Input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={120} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>{t("needs.field.capacity", { defaultValue: "Nombre de places" })}</Label>
              <Input
                type="number"
                min={1}
                max={200}
                value={capacity}
                onChange={(e) => setCapacity(Math.max(1, Math.min(200, +e.target.value || 1)))}
              />
            </div>
            <div>
              <Label>{t("needs.field.mode", { defaultValue: "Validation" })}</Label>
              <Select value={mode} onValueChange={(v) => setMode(v as any)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">{t("needs.validationMode.auto")}</SelectItem>
                  <SelectItem value="manual">{t("needs.validationMode.manual")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>{t("needs.field.description", { defaultValue: "Détails (optionnel)" })}</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={2000}
              rows={3}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("common.cancel", { defaultValue: "Annuler" })}
          </Button>
          <Button onClick={() => createM.mutate()} disabled={createM.isPending}>
            {createM.isPending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
            {t("common.create", { defaultValue: "Créer" })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* -------------------------------------------------------------------------- */
/* PublishDialog — audience picker                                            */
/* -------------------------------------------------------------------------- */

const AUDIENCE_OPTIONS = [
  { key: "convoked_players", labelKey: "audiences.convoked_players", needsEvent: true },
  { key: "convoked_parents", labelKey: "audiences.convoked_parents", needsEvent: true },
  { key: "club_members", labelKey: "audiences.club_members", needsEvent: false },
  { key: "club_educators", labelKey: "audiences.club_educators", needsEvent: false },
  { key: "club_staff", labelKey: "audiences.club_staff", needsEvent: false },
  { key: "club_admins", labelKey: "audiences.club_admins", needsEvent: false },
  { key: "club_tournament_managers", labelKey: "audiences.club_tournament_managers", needsEvent: false },
] as const;

function PublishDialog({
  open,
  onOpenChange,
  needId,
  onPublished,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  needId: string;
  onPublished: () => void;
}) {
  const { t } = useTranslation();
  const publish = useServerFn(publishEventNeed);
  const [selected, setSelected] = useState<Set<string>>(new Set(["convoked_parents"]));

  const toggle = (k: string) => {
    const next = new Set(selected);
    if (next.has(k)) next.delete(k);
    else next.add(k);
    setSelected(next);
  };

  const publishM = useMutation({
    mutationFn: async () => {
      // Récupérer event_id depuis need pour audiences liées à l'évènement
      // (le server-side re-résout ; on passe simplement l'audience courante).
      // Ici, on n'a pas event_id sous la main : on filtre les audiences globales.
      const audiences: AudienceSelector[] = Array.from(selected)
        .filter((k) => !AUDIENCE_OPTIONS.find((o) => o.key === k)?.needsEvent)
        .map((k) => ({ type: k as any }));
      // Ajouter les audiences liées à l'évènement (event_id résolu côté serveur).
      const eventScoped = Array.from(selected).filter(
        (k) => AUDIENCE_OPTIONS.find((o) => o.key === k)?.needsEvent,
      );
      for (const k of eventScoped) {
        audiences.push({ type: k as any, event_id: "__from_need__" } as any);
      }
      return publish({ data: { need_id: needId, audiences } });
    },
    onSuccess: (r: any) => {
      toast.success(
        t("needs.section.published", {
          defaultValue: "Besoin publié · {{c}} destinataire(s)",
          c: r?.recipient_count ?? 0,
        }),
      );
      onPublished();
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("needs.publish.title", { defaultValue: "Publier le besoin" })}</DialogTitle>
          <DialogDescription>
            {t("needs.publish.desc", {
              defaultValue: "Sélectionnez qui recevra la notification.",
            })}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          {AUDIENCE_OPTIONS.map((opt) => (
            <label
              key={opt.key}
              className="flex items-center gap-2 cursor-pointer rounded-md border p-2 hover:bg-muted/40"
            >
              <Checkbox
                checked={selected.has(opt.key)}
                onCheckedChange={() => toggle(opt.key)}
              />
              <span className="text-sm">
                {t(`needs.${opt.labelKey}`, {
                  defaultValue: opt.key,
                })}
              </span>
            </label>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("common.cancel", { defaultValue: "Annuler" })}
          </Button>
          <Button
            onClick={() => publishM.mutate()}
            disabled={publishM.isPending || selected.size === 0}
          >
            {publishM.isPending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
            {t("needs.actions.publish")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* -------------------------------------------------------------------------- */
/* StaffSignupsDialog                                                         */
/* -------------------------------------------------------------------------- */

function StaffSignupsDialog({
  open,
  onOpenChange,
  needId,
  onChanged,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  needId: string;
  onChanged: () => void;
}) {
  const { t } = useTranslation();
  const listFn = useServerFn(listStaffSignupsForNeed);
  const decide = useServerFn(decideSignup);
  const qc = useQueryClient();

  const { data, refetch } = useQuery({
    queryKey: ["need-signups", needId],
    queryFn: () => listFn({ data: { need_id: needId } }),
    enabled: open,
  });

  const decideM = useMutation({
    mutationFn: (v: { signup_id: string; decision: "confirm" | "decline" }) =>
      decide({ data: v }),
    onSuccess: () => {
      refetch();
      onChanged();
      qc.invalidateQueries({ queryKey: ["need-signups", needId] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("needs.staff.title", { defaultValue: "Candidatures" })}</DialogTitle>
        </DialogHeader>
        <div className="space-y-2 max-h-[60vh] overflow-y-auto">
          {(data?.signups ?? []).map((s: any) => (
            <div
              key={s.id}
              className="flex items-center justify-between gap-2 rounded-md border p-2"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">
                  {s.profile?.full_name ?? t("common.unknown", { defaultValue: "Sans nom" })}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {t(`needs.signup.${s.status}`)}
                </p>
                {s.comment && (
                  <p className="text-xs text-muted-foreground mt-1 italic">"{s.comment}"</p>
                )}
              </div>
              {s.status === "applied" && (
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    size="sm"
                    variant="default"
                    onClick={() =>
                      decideM.mutate({ signup_id: s.id, decision: "confirm" })
                    }
                    disabled={decideM.isPending}
                  >
                    <Check className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      decideM.mutate({ signup_id: s.id, decision: "decline" })
                    }
                    disabled={decideM.isPending}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )}
            </div>
          ))}
          {(data?.signups ?? []).length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-6">
              {t("needs.staff.empty", { defaultValue: "Aucune candidature pour le moment." })}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("common.close", { defaultValue: "Fermer" })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
