/**
 * EventNeedsSection — Bloc "Coups de main" sur la page évènement.
 * Staff : créer / publier (avec picker d'audiences riche + preview live) /
 *   décider / fermer / annuler.
 * Membre : candidater / retirer sa candidature.
 * Places restantes = agrégat uniquement.
 */
import { useMemo, useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  HandHelping,
  Plus,
  Users,
  Check,
  X,
  Send,
  Loader2,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Baby,
  IdCard,
  Pencil,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { fr as frLocale, enUS as enLocale } from "date-fns/locale";

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
  updateEventNeed,
  publishEventNeed,
  applyToEventNeed,
  withdrawSignup,
  decideSignup,
  closeEventNeed,
  cancelEventNeed,
  previewEventNeedAudience,
  getNeedAudienceContext,
} from "@/lib/needs/needs.functions";
import { NEED_TEMPLATES, type NeedTemplate } from "@/lib/needs/templates";
import type { AudienceSelector } from "@/modules/groups/groups.functions";
import { getNeedVisual, resolveNeedLabel } from "./need-visuals";

type Props = {
  eventId: string;
  eventType?: string | null;
  sport?: string | null;
  teamId?: string | null;
};

function useDateLocale() {
  const { i18n } = useTranslation();
  return i18n.language?.startsWith("fr") ? frLocale : enLocale;
}

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

  // Coverage aggregate (based only on 'open' needs).
  const openNeeds = needs.filter((n: { status: string }) => n.status === "open");
  const missingSeats = openNeeds.reduce(
    (acc: number, n: { remaining_seats: number }) => acc + (n.remaining_seats ?? 0),
    0,
  );

  if (!isStaff && needs.length === 0) return null;
  if (isLoading) return null;

  return (
    <Card className="border-[1.5px]">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <HandHelping className="h-4 w-4 text-primary" />
            {t("needs:section.title")}
          </CardTitle>
          {isStaff && (
            <Button size="sm" variant="outline" onClick={() => setCreateOpen(true)}>
              <Plus className="h-3.5 w-3.5 mr-1" />
              {t("needs:section.add")}
            </Button>
          )}
        </div>

        {openNeeds.length > 0 && (
          <div className="mt-2">
            {missingSeats === 0 ? (
              <Badge className="bg-emerald-600 text-white">
                <CheckCircle2 className="h-3 w-3 mr-1" />
                {t("needs:section.coverageAll")}
              </Badge>
            ) : (
              <Badge variant="outline" className="border-amber-300 text-amber-700 dark:text-amber-300">
                <AlertCircle className="h-3 w-3 mr-1" />
                {t("needs:section.coverageMissing", { count: missingSeats })}
              </Badge>
            )}
          </div>
        )}

        {isStaff && needs.length === 0 && (
          <p className="text-xs text-muted-foreground mt-1">
            {t("needs:section.emptyStaff")}
          </p>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {needs.map((need: NeedRowType) => (
          <NeedRow
            key={need.id}
            need={need}
            isStaff={isStaff}
            eventId={eventId}
            sport={sport ?? null}
            onChange={refresh}
          />
        ))}
      </CardContent>

      {createOpen && (
        <NeedFormDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          eventId={eventId}
          sport={sport ?? null}
          teamId={teamId ?? null}
          onSaved={refresh}
        />
      )}
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/* NeedRow                                                                    */
/* -------------------------------------------------------------------------- */

type NeedRowType = {
  id: string;
  role_key: string;
  label: string;
  description: string | null;
  status: string;
  capacity: number;
  remaining_seats: number;
  validation_mode: string;
  applied_count: number;
  last_published_at: string | null;
  last_recipients_count: number | null;
  my_signup: { id: string; status: string } | null;
};

function NeedRow({
  need,
  isStaff,
  eventId,
  sport,
  onChange,
}: {
  need: NeedRowType;
  isStaff: boolean;
  eventId: string;
  sport: string | null;
  onChange: () => void;
}) {
  const { t } = useTranslation();
  const locale = useDateLocale();
  const apply = useServerFn(applyToEventNeed);
  const withdraw = useServerFn(withdrawSignup);
  const close = useServerFn(closeEventNeed);
  const cancel = useServerFn(cancelEventNeed);
  const [publishOpen, setPublishOpen] = useState(false);
  const [staffOpen, setStaffOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  const remaining = need.remaining_seats;
  const capacity = need.capacity;
  const status = need.status;
  const mySignup = need.my_signup;

  const applyM = useMutation({
    mutationFn: () => apply({ data: { need_id: need.id } }),
    onSuccess: (r: { status: string } | null | undefined) => {
      toast.success(
        r?.status === "confirmed"
          ? t("needs:signup.confirmed")
          : t("needs:signup.applied"),
      );
      onChange();
    },
    onError: (e: Error) =>
      toast.error(t(`needs:errors.${e.message}`, { defaultValue: e.message })),
  });
  const withdrawM = useMutation({
    mutationFn: () => withdraw({ data: { signup_id: mySignup!.id } }),
    onSuccess: () => {
      toast.success(t("needs:signup.withdrawn"));
      onChange();
    },
    onError: (e: Error) =>
      toast.error(t(`needs:errors.${e.message}`, { defaultValue: e.message })),
  });
  const closeM = useMutation({
    mutationFn: () => close({ data: { need_id: need.id } }),
    onSuccess: () => {
      toast.success(t("needs:actions.close"));
      onChange();
    },
    onError: (e: Error) =>
      toast.error(t(`needs:errors.${e.message}`, { defaultValue: e.message })),
  });
  const cancelM = useMutation({
    mutationFn: () => cancel({ data: { need_id: need.id } }),
    onSuccess: () => {
      toast.success(t("needs:actions.cancel"));
      onChange();
    },
    onError: (e: Error) =>
      toast.error(t(`needs:errors.${e.message}`, { defaultValue: e.message })),
  });

  const statusBadge = (
    <Badge
      variant="outline"
      className={cn(
        "text-[10px] font-semibold uppercase",
        status === "open" &&
          "border-emerald-300 text-emerald-700 bg-emerald-50 dark:bg-emerald-950/40 dark:text-emerald-300",
        status === "draft" &&
          "border-amber-300 text-amber-700 bg-amber-50 dark:bg-amber-950/40 dark:text-amber-300",
        status === "closed" && "border-slate-300 text-slate-600",
        status === "cancelled" && "border-red-300 text-red-700",
      )}
    >
      {t(`needs:status.${status}`)}
    </Badge>
  );

  const publishedBadge = (() => {
    if (status === "draft") {
      return (
        <Badge variant="outline" className="text-[10px] text-muted-foreground">
          {t("needs:publishedBadge.unpublished")}
        </Badge>
      );
    }
    if (need.last_published_at) {
      const time = formatDistanceToNow(new Date(need.last_published_at), {
        addSuffix: true,
        locale,
      });
      const count = need.last_recipients_count ?? 0;
      return (
        <Badge variant="outline" className="text-[10px] text-muted-foreground">
          {t("needs:publishedBadge.at", { time, count })}
        </Badge>
      );
    }
    return null;
  })();

  const { Icon: NeedIcon, chip: needChip } = getNeedVisual(need.role_key);
  const displayLabel = resolveNeedLabel(need, t);

  return (
    <div className="rounded-lg border bg-background/50 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={cn("inline-flex h-7 w-7 items-center justify-center rounded-full shrink-0", needChip)}>
              <NeedIcon className="h-4 w-4" />
            </span>
            <p className="text-sm font-semibold text-foreground truncate">{displayLabel}</p>
            {statusBadge}
            <Badge variant="outline" className="text-[10px]">
              {t(`needs:validationMode.${need.validation_mode}`)}
            </Badge>
            {publishedBadge}
          </div>
          {need.description && (
            <p className="text-xs text-muted-foreground mt-1 whitespace-pre-line">
              {need.description}
            </p>
          )}
          <div className="mt-2 flex items-center gap-3 text-xs flex-wrap">
            <span className="inline-flex items-center gap-1 text-muted-foreground">
              <Users className="h-3.5 w-3.5" />
              <span className="tabular-nums font-semibold text-foreground">
                {capacity - remaining}/{capacity}
              </span>
              <span>
                {remaining === 0
                  ? t("needs:seats.full")
                  : t("needs:seats.remaining", { count: remaining })}
              </span>
            </span>
            {isStaff && need.applied_count > 0 && (
              <button
                type="button"
                onClick={() => setStaffOpen(true)}
                className="inline-flex items-center gap-1 text-primary underline-offset-2 hover:underline"
              >
                <span className="tabular-nums font-semibold">{need.applied_count}</span>
                {t("needs:pendingApplications", { count: need.applied_count })}
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
                  {t(`needs:signup.${mySignup.status}`)}
                </Badge>
                {(mySignup.status === "applied" || mySignup.status === "confirmed") && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => withdrawM.mutate()}
                    disabled={withdrawM.isPending}
                  >
                    {withdrawM.isPending && (
                      <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                    )}
                    {t("needs:actions.withdraw")}
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
                {t("needs:actions.apply")}
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
                  ? t("needs:actions.publish")
                  : t("needs:actions.republish")}
              </Button>
            )}
            {status === "draft" && (
              <Button size="sm" variant="outline" onClick={() => setEditOpen(true)}>
                <Pencil className="h-3.5 w-3.5 mr-1" />
                {t("common.edit", { defaultValue: "Modifier" })}
              </Button>
            )}
            {status === "open" && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => closeM.mutate()}
                disabled={closeM.isPending}
              >
                {t("needs:actions.close")}
              </Button>
            )}
            {(status === "draft" || status === "open") && (
              <Button
                size="sm"
                variant="ghost"
                className="text-destructive"
                onClick={() => {
                  if (confirm(t("needs:confirmCancel"))) cancelM.mutate();
                }}
                disabled={cancelM.isPending}
              >
                <Trash2 className="h-3.5 w-3.5 mr-1" />
                {t("needs:actions.cancel")}
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
          eventId={eventId}
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
      {editOpen && (
        <NeedFormDialog
          open={editOpen}
          onOpenChange={setEditOpen}
          eventId={eventId}
          sport={sport}
          teamId={null}
          initial={{
            id: need.id,
            role_key: need.role_key,
            label: need.label,
            description: need.description,
            capacity: need.capacity,
            validation_mode: need.validation_mode as "auto" | "manual",
          }}
          onSaved={onChange}
        />
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* CreateNeedDialog                                                           */
/* -------------------------------------------------------------------------- */

function NeedFormDialog({
  open,
  onOpenChange,
  eventId,
  sport,
  initial,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  eventId: string;
  sport: string | null;
  teamId: string | null;
  initial?: {
    id: string;
    role_key: string;
    label: string;
    description: string | null;
    capacity: number;
    validation_mode: "auto" | "manual";
  };
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const create = useServerFn(createEventNeed);
  const update = useServerFn(updateEventNeed);
  const isEdit = !!initial;

  const availableTemplates = useMemo<NeedTemplate[]>(() => {
    const s = (sport ?? "").toLowerCase().trim();
    return NEED_TEMPLATES.filter(
      (tpl) => tpl.sports === "all" || (s && (tpl.sports as readonly string[]).includes(s)),
    );
  }, [sport]);

  const [templateKey, setTemplateKey] = useState<string>(
    initial?.role_key ?? availableTemplates[0]?.key ?? "other",
  );
  const currentTpl =
    availableTemplates.find((x) => x.key === templateKey) ??
    NEED_TEMPLATES.find((x) => x.key === templateKey) ??
    NEED_TEMPLATES.find((x) => x.key === "other")!;

  const defaultLabel = t(`needs:templates.${currentTpl.key}`);
  const [label, setLabel] = useState(initial?.label ?? defaultLabel);
  const [description, setDescription] = useState(initial?.description ?? "");
  const [capacity, setCapacity] = useState(
    initial?.capacity ?? currentTpl.suggestedCapacity ?? 1,
  );
  const [mode, setMode] = useState<"auto" | "manual">(
    initial?.validation_mode ?? currentTpl.suggestedValidationMode ?? "auto",
  );

  const [lastKey, setLastKey] = useState(templateKey);
  if (lastKey !== templateKey && !isEdit) {
    setLastKey(templateKey);
    setLabel(t(`needs:templates.${currentTpl.key}`));
    setCapacity(currentTpl.suggestedCapacity ?? 1);
    setMode(currentTpl.suggestedValidationMode ?? "auto");
  }

  const saveM = useMutation({
    mutationFn: () =>
      isEdit
        ? update({
            data: {
              need_id: initial!.id,
              role_key: currentTpl.key,
              label: label.trim() || defaultLabel,
              description: description.trim() || null,
              capacity,
              validation_mode: mode,
            },
          })
        : create({
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
      toast.success(
        isEdit
          ? t("common.saved", { defaultValue: "Modifications enregistrées" })
          : t("needs:section.created"),
      );
      onSaved();
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <HandHelping className="h-4 w-4 text-primary" />
            {isEdit
              ? t("common.edit", { defaultValue: "Modifier le besoin" })
              : t("needs:section.add")}
          </DialogTitle>
          <DialogDescription>{t("needs:section.createDesc")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {/* Template picker as chips (friendly) */}
          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">
              {t("needs:field.template")}
            </Label>
            <div className="flex flex-wrap gap-1.5">
              {availableTemplates.map((tpl) => {
                const active = tpl.key === templateKey;
                const { Icon: TplIcon, chip } = getNeedVisual(tpl.key);
                return (
                  <button
                    key={tpl.key}
                    type="button"
                    onClick={() => setTemplateKey(tpl.key)}
                    className={cn(
                      "inline-flex items-center gap-1.5 text-xs font-medium rounded-full border px-2.5 py-1.5 transition-colors",
                      active
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background hover:bg-muted border-border text-foreground",
                    )}
                  >
                    <span className={cn("inline-flex h-5 w-5 items-center justify-center rounded-full", active ? "bg-primary-foreground/20 text-primary-foreground" : chip)}>
                      <TplIcon className="h-3 w-3" />
                    </span>
                    {t(`needs:templates.${tpl.key}`)}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="need-label">{t("needs:field.label")}</Label>
            <Input
              id="need-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              maxLength={120}
              placeholder={defaultLabel}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="need-capacity">{t("needs:field.capacity")}</Label>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  className="h-9 w-9 shrink-0"
                  onClick={() => setCapacity((c) => Math.max(1, c - 1))}
                  aria-label="-"
                >
                  −
                </Button>
                <Input
                  id="need-capacity"
                  type="number"
                  min={1}
                  max={200}
                  value={capacity}
                  onChange={(e) =>
                    setCapacity(Math.max(1, Math.min(200, +e.target.value || 1)))
                  }
                  className="text-center font-semibold"
                />
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  className="h-9 w-9 shrink-0"
                  onClick={() => setCapacity((c) => Math.min(200, c + 1))}
                  aria-label="+"
                >
                  +
                </Button>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="need-mode">{t("needs:field.mode")}</Label>
              <Select value={mode} onValueChange={(v) => setMode(v as "auto" | "manual")}>
                <SelectTrigger id="need-mode">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">{t("needs:validationMode.auto")}</SelectItem>
                  <SelectItem value="manual">{t("needs:validationMode.manual")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="need-desc">{t("needs:field.description")}</Label>
            <Textarea
              id="need-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={2000}
              rows={3}
              placeholder={t("needs:field.description")}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("common.cancel", { defaultValue: "Annuler" })}
          </Button>
          <Button onClick={() => saveM.mutate()} disabled={saveM.isPending}>
            {saveM.isPending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
            {isEdit
              ? t("common.save", { defaultValue: "Enregistrer" })
              : t("common.create", { defaultValue: "Créer" })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* -------------------------------------------------------------------------- */
/* PublishDialog — picker complet + preview live                              */
/* -------------------------------------------------------------------------- */

type ScalarAudienceKey =
  | "convoked_players"
  | "convoked_parents"
  | "club_members"
  | "club_educators"
  | "club_staff"
  | "club_admins"
  | "club_tournament_managers";

const SCALAR_AUDIENCES: { key: ScalarAudienceKey; needsEvent: boolean }[] = [
  { key: "convoked_players", needsEvent: true },
  { key: "convoked_parents", needsEvent: true },
  { key: "club_members", needsEvent: false },
  { key: "club_educators", needsEvent: false },
  { key: "club_staff", needsEvent: false },
  { key: "club_admins", needsEvent: false },
  { key: "club_tournament_managers", needsEvent: false },
];

function PublishDialog({
  open,
  onOpenChange,
  needId,
  eventId,
  onPublished,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  needId: string;
  eventId: string;
  onPublished: () => void;
}) {
  const { t } = useTranslation();
  const publish = useServerFn(publishEventNeed);
  const preview = useServerFn(previewEventNeedAudience);
  const ctxFn = useServerFn(getNeedAudienceContext);

  const { data: ctx } = useQuery({
    queryKey: ["need-audience-ctx", needId],
    queryFn: () => ctxFn({ data: { need_id: needId } }),
    enabled: open,
  });

  // Scalar audience checkbox state.
  const [selected, setSelected] = useState<Set<ScalarAudienceKey>>(
    new Set(["convoked_parents"]),
  );
  // Multi-selection: groups, teams (with kind), category.
  const [groupIds, setGroupIds] = useState<Set<string>>(new Set());
  type TeamKind = "team_players" | "team_parents" | "team_educators";
  const [teamPicks, setTeamPicks] = useState<Array<{ team_id: string; kind: TeamKind }>>([]);
  const [category, setCategory] = useState<string>("");

  const toggleScalar = (k: ScalarAudienceKey) => {
    const next = new Set(selected);
    if (next.has(k)) next.delete(k);
    else next.add(k);
    setSelected(next);
  };
  const toggleGroup = (id: string) => {
    const next = new Set(groupIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setGroupIds(next);
  };
  const toggleTeam = (team_id: string, kind: TeamKind) => {
    setTeamPicks((prev) => {
      const has = prev.find((p) => p.team_id === team_id && p.kind === kind);
      if (has) return prev.filter((p) => !(p.team_id === team_id && p.kind === kind));
      return [...prev, { team_id, kind }];
    });
  };

  const audiences: AudienceSelector[] = useMemo(() => {
    const list: AudienceSelector[] = [];
    for (const key of selected) {
      const opt = SCALAR_AUDIENCES.find((o) => o.key === key)!;
      if (opt.needsEvent) {
        list.push({ type: key, event_id: eventId } as AudienceSelector);
      } else {
        list.push({ type: key } as AudienceSelector);
      }
    }
    for (const gid of groupIds) list.push({ type: "club_group", group_id: gid });
    for (const tp of teamPicks) list.push({ type: tp.kind, team_id: tp.team_id });
    if (category.trim()) list.push({ type: "category_educators", category: category.trim() });
    return list;
  }, [selected, groupIds, teamPicks, category, eventId]);

  // Live preview count (debounced).
  const [previewCount, setPreviewCount] = useState<number | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  useEffect(() => {
    if (audiences.length === 0) {
      setPreviewCount(0);
      return;
    }
    let cancelled = false;
    setPreviewLoading(true);
    const t = setTimeout(async () => {
      try {
        const r = await preview({ data: { need_id: needId, audiences } });
        if (!cancelled) setPreviewCount(r.count);
      } catch {
        if (!cancelled) setPreviewCount(null);
      } finally {
        if (!cancelled) setPreviewLoading(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [audiences, needId, preview]);

  const publishM = useMutation({
    mutationFn: () => publish({ data: { need_id: needId, audiences } }),
    onSuccess: (r: { recipients_count: number; was_idempotent_skip: boolean } | null | undefined) => {
      if (r?.was_idempotent_skip) {
        toast.success(t("needs:publish.successIdempotent"));
      } else {
        toast.success(
          t("needs:publish.success", { count: r?.recipients_count ?? 0 }),
        );
      }
      onPublished();
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("needs:publish.title")}</DialogTitle>
          <DialogDescription>{t("needs:publish.desc")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Scalar audiences */}
          <div className="space-y-1.5">
            {SCALAR_AUDIENCES.map((opt) => (
              <label
                key={opt.key}
                className="flex items-center gap-2 cursor-pointer rounded-md border p-2 hover:bg-muted/40"
              >
                <Checkbox
                  checked={selected.has(opt.key)}
                  onCheckedChange={() => toggleScalar(opt.key)}
                />
                <span className="text-sm">{t(`needs:audiences.${opt.key}`)}</span>
              </label>
            ))}
          </div>

          {/* Club groups */}
          {ctx && ctx.groups.length > 0 && (
            <div>
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                {t("needs:audiences.club_group")}
              </Label>
              <div className="mt-1.5 space-y-1">
                {ctx.groups.map((g: { id: string; name: string }) => (
                  <label
                    key={g.id}
                    className="flex items-center gap-2 cursor-pointer rounded-md border p-2 hover:bg-muted/40"
                  >
                    <Checkbox
                      checked={groupIds.has(g.id)}
                      onCheckedChange={() => toggleGroup(g.id)}
                    />
                    <span className="text-sm">{g.name}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Teams (players / parents / educators) */}
          {ctx && ctx.teams.length > 0 && (
            <div>
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                {t("needs:publish.chooseTeam")}
              </Label>
              <div className="mt-1.5 space-y-1.5">
                {ctx.teams.map((tm: { id: string; name: string }) => (
                  <div key={tm.id} className="rounded-md border p-2">
                    <p className="text-sm font-medium mb-1.5">{tm.name}</p>
                    <div className="flex flex-wrap gap-3 text-xs">
                      {(["team_players", "team_parents", "team_educators"] as TeamKind[]).map(
                        (kind) => {
                          const active = teamPicks.some(
                            (p) => p.team_id === tm.id && p.kind === kind,
                          );
                          return (
                            <label
                              key={kind}
                              className="flex items-center gap-1.5 cursor-pointer"
                            >
                              <Checkbox
                                checked={active}
                                onCheckedChange={() => toggleTeam(tm.id, kind)}
                              />
                              <span>{t(`needs:audiences.${kind}`)}</span>
                            </label>
                          );
                        },
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Category educators */}
          {ctx && ctx.categories.length > 0 && (
            <div>
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                {t("needs:audiences.category_educators")}
              </Label>
              <Select
                value={category || "__none"}
                onValueChange={(v) => setCategory(v === "__none" ? "" : v)}
              >
                <SelectTrigger className="mt-1.5">
                  <SelectValue placeholder={t("needs:publish.chooseCategory")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">—</SelectItem>
                  {ctx.categories.map((c: string) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Preview */}
          <div
            className={cn(
              "rounded-md border p-3 text-sm",
              previewCount && previewCount > 0
                ? "border-emerald-300 bg-emerald-50 dark:bg-emerald-950/30 dark:border-emerald-800"
                : "border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800",
            )}
          >
            {previewLoading ? (
              <span className="inline-flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                {t("needs:publish.previewLoading")}
              </span>
            ) : audiences.length === 0 || (previewCount ?? 0) === 0 ? (
              <span className="text-amber-800 dark:text-amber-200">
                {t("needs:publish.previewNone")}
              </span>
            ) : (
              <span className="text-emerald-800 dark:text-emerald-200 font-medium">
                {t("needs:publish.preview", { count: previewCount ?? 0 })}
              </span>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("common.cancel", { defaultValue: "Annuler" })}
          </Button>
          <Button
            onClick={() => publishM.mutate()}
            disabled={
              publishM.isPending ||
              audiences.length === 0 ||
              (previewCount ?? 0) === 0
            }
          >
            {publishM.isPending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
            {t("needs:actions.publish")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* -------------------------------------------------------------------------- */
/* StaffSignupsDialog                                                         */
/* -------------------------------------------------------------------------- */

const ROLE_COLORS: Record<string, string> = {
  admin: "bg-red-100 text-red-800 border-red-200 dark:bg-red-950/40 dark:text-red-300",
  coach: "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300",
  assistant_coach: "bg-sky-100 text-sky-800 border-sky-200 dark:bg-sky-950/40 dark:text-sky-300",
  staff: "bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-950/40 dark:text-purple-300",
  tournament_manager:
    "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300",
  player: "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300",
};

type StaffSignup = {
  id: string;
  status: string;
  comment: string | null;
  roles: string[];
  license_number: string | null;
  is_minor: boolean;
  profile?: { full_name: string | null } | null;
};

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
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("needs:staff.title")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-2 max-h-[60vh] overflow-y-auto">
          {((data?.signups ?? []) as StaffSignup[]).map((s) => (
            <div
              key={s.id}
              className="flex items-start justify-between gap-2 rounded-md border p-2"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-medium truncate">
                    {s.profile?.full_name ??
                      t("common.unknown", { defaultValue: "Sans nom" })}
                  </p>
                  {s.roles.map((r) => (
                    <Badge
                      key={r}
                      variant="outline"
                      className={cn("text-[10px]", ROLE_COLORS[r] ?? "")}
                    >
                      {t(`common.roles.${r}`, { defaultValue: r })}
                    </Badge>
                  ))}
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {t(`needs:signup.${s.status}`)}
                </p>
                {s.license_number && (
                  <p className="text-[11px] text-muted-foreground mt-0.5 inline-flex items-center gap-1">
                    <IdCard className="h-3 w-3" />
                    {t("needs:staff.license", { n: s.license_number })}
                  </p>
                )}
                {s.is_minor && s.status === "applied" && (
                  <p className="text-[11px] mt-1 inline-flex items-center gap-1 text-amber-700 dark:text-amber-300">
                    <Baby className="h-3 w-3" />
                    {t("needs:staff.minorPending")}
                  </p>
                )}
                {s.comment && (
                  <p className="text-xs text-muted-foreground mt-1 italic">"{s.comment}"</p>
                )}
              </div>
              {s.status === "applied" && (
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    size="sm"
                    variant="default"
                    onClick={() => decideM.mutate({ signup_id: s.id, decision: "confirm" })}
                    disabled={decideM.isPending}
                  >
                    <Check className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => decideM.mutate({ signup_id: s.id, decision: "decline" })}
                    disabled={decideM.isPending}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )}
            </div>
          ))}
          {((data?.signups ?? []) as StaffSignup[]).length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-6">
              {t("needs:staff.empty")}
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
