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
  UserPlus,
  Search,
  MoreHorizontal,
  RotateCcw,
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
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { PersonRow } from "@/components/shared/person-row";
import { formatMemberContextSubline, type MemberContext } from "@/lib/needs/member-context";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

import {
  listEventNeeds,
  listStaffSignupsForNeed,
  listNeedRecipients,
  createEventNeed,
  updateEventNeed,
  publishEventNeed,
  republishEventNeed,
  applyToEventNeed,
  withdrawSignup,
  declareUnavailable,
  decideSignup,
  closeEventNeed,
  reopenEventNeed,
  cancelEventNeed,
  deleteEventNeed,
  previewEventNeedAudience,
  getNeedAudienceContext,
  getEventAudienceContext,
  previewEventAudience,
  searchClubMembersForNeed,
  staffAddManualSignup,
  staffUnassignSignup,
} from "@/lib/needs/needs.functions";
import { NEED_TEMPLATES, type NeedTemplate } from "@/lib/needs/templates";
import type { AudienceSelector } from "@/modules/groups/groups.functions";
import { getNeedVisual, resolveNeedLabel } from "./need-visuals";

type Props = {
  /** Rendu dans une section repliable qui fournit déjà carte, titre et résumé. */
  embedded?: boolean;
  eventId: string;
  eventType?: string | null;
  sport?: string | null;
  teamId?: string | null;
};

function useDateLocale() {
  const { i18n } = useTranslation();
  return i18n.language?.startsWith("fr") ? frLocale : enLocale;
}

export function EventNeedsSection({ eventId, sport, teamId, embedded = false }: Props) {
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
    <Card
      id="needs"
      className={cn(
        "scroll-mt-24",
        embedded ? "border-0 bg-transparent p-0 shadow-none" : "border-[1.5px]",
      )}
    >
      {/* Intégré, le titre et le résumé de couverture vivent sur la ligne de la
          section repliable : n'y reste que l'action d'ajout. */}
      <CardHeader className={cn("pb-3", embedded && "px-0 pt-0")}>
        <div className="flex items-center justify-between gap-2">
          {embedded ? (
            <span />
          ) : (
            <CardTitle className="flex items-center gap-2 text-base">
              <HandHelping className="h-4 w-4 text-primary" />
              {t("needs:section.title")}
            </CardTitle>
          )}
          {isStaff && (
            <Button size="sm" variant="outline" onClick={() => setCreateOpen(true)}>
              <Plus className="h-3.5 w-3.5 mr-1" />
              {t("needs:section.add")}
            </Button>
          )}
        </div>

        {!embedded && openNeeds.length > 0 && (
          <div className="mt-2">
            {missingSeats === 0 ? (
              <Badge className="bg-emerald-600 text-white">
                <CheckCircle2 className="h-3 w-3 mr-1" />
                {t("needs:section.coverageAll")}
              </Badge>
            ) : (
              <Badge
                variant="outline"
                className="border-amber-300 text-amber-700 dark:text-amber-300"
              >
                <AlertCircle className="h-3 w-3 mr-1" />
                {t("needs:section.coverageMissing", { count: missingSeats })}
              </Badge>
            )}
          </div>
        )}

        {isStaff && needs.length === 0 && (
          <p className="text-xs text-muted-foreground mt-1">{t("needs:section.emptyStaff")}</p>
        )}
      </CardHeader>
      <CardContent className={cn("space-y-3", embedded && "px-0 pb-0")}>
        {needs.map((need: NeedRowType) => (
          <NeedRow
            key={need.id}
            need={need}
            isStaff={isStaff}
            eventId={eventId}
            sport={sport ?? null}
            existingRoleKeys={needs.map((n: NeedRowType) => n.role_key)}
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
          existingRoleKeys={needs.map((n: NeedRowType) => n.role_key)}
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
  confirmed_count: number;
  last_published_at: string | null;
  last_recipients_count: number | null;
  my_signup: { id: string; status: string } | null;
  confirmed_signups?: {
    user_id: string;
    full_name: string | null;
    context: MemberContext | null;
  }[];
};

function NeedRow({
  need,
  isStaff,
  eventId,
  sport,
  existingRoleKeys,
  onChange,
}: {
  need: NeedRowType;
  isStaff: boolean;
  eventId: string;
  sport: string | null;
  existingRoleKeys: string[];
  onChange: () => void;
}) {
  const { t } = useTranslation();
  const locale = useDateLocale();
  const apply = useServerFn(applyToEventNeed);
  const withdraw = useServerFn(withdrawSignup);
  const declareUnavail = useServerFn(declareUnavailable);
  const close = useServerFn(closeEventNeed);
  const reopen = useServerFn(reopenEventNeed);
  const cancel = useServerFn(cancelEventNeed);
  const deleteFn = useServerFn(deleteEventNeed);

  const [publishOpen, setPublishOpen] = useState(false);
  const [resendOpen, setResendOpen] = useState(false);
  const [editAudienceOpen, setEditAudienceOpen] = useState(false);
  const [viewRecipientsOpen, setViewRecipientsOpen] = useState(false);
  const [staffOpen, setStaffOpen] = useState(false);

  const [editOpen, setEditOpen] = useState(false);
  const [closeConfirmOpen, setCloseConfirmOpen] = useState(false);
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  const remaining = need.remaining_seats;
  const capacity = need.capacity;
  const status = need.status;
  const mySignup = need.my_signup;
  const confirmedCount = need.confirmed_count;
  const pendingCount = need.applied_count;
  const isReadOnly = status === "closed" || status === "cancelled";
  const isDraft = status === "draft";
  const isOpen = status === "open";

  const applyM = useMutation({
    mutationFn: () => apply({ data: { need_id: need.id } }),
    onSuccess: (r: { status: string } | null | undefined) => {
      toast.success(
        r?.status === "confirmed" ? t("needs:signup.confirmed") : t("needs:signup.applied"),
      );
      onChange();
    },
    onError: (e: Error) => toast.error(t(`needs:errors.${e.message}`, { defaultValue: e.message })),
  });
  const withdrawM = useMutation({
    mutationFn: () => withdraw({ data: { signup_id: mySignup!.id } }),
    onSuccess: () => {
      toast.success(t("needs:signup.withdrawn"));
      onChange();
    },
    onError: (e: Error) => toast.error(t(`needs:errors.${e.message}`, { defaultValue: e.message })),
  });
  const declareUnavailM = useMutation({
    mutationFn: () => declareUnavail({ data: { need_id: need.id } }),
    onSuccess: () => {
      toast.success(t("needs:unavailable.confirmed"));
      onChange();
    },
    onError: (e: Error) => toast.error(t(`needs:errors.${e.message}`, { defaultValue: e.message })),
  });
  const closeM = useMutation({
    mutationFn: () => close({ data: { need_id: need.id } }),
    onSuccess: () => {
      toast.success(t("needs:status.closed"));
      setCloseConfirmOpen(false);
      onChange();
    },
    onError: (e: Error) => toast.error(t(`needs:errors.${e.message}`, { defaultValue: e.message })),
  });
  const reopenM = useMutation({
    mutationFn: () => reopen({ data: { need_id: need.id } }),
    onSuccess: () => {
      toast.success(t("needs:status.reopened"));
      onChange();
    },
    onError: (e: Error) => toast.error(t(`needs:errors.${e.message}`, { defaultValue: e.message })),
  });
  const cancelM = useMutation({
    mutationFn: () => cancel({ data: { need_id: need.id } }),
    onSuccess: () => {
      toast.success(t("needs:status.cancelled"));
      setCancelConfirmOpen(false);
      onChange();
    },
    onError: (e: Error) => toast.error(t(`needs:errors.${e.message}`, { defaultValue: e.message })),
  });
  const deleteM = useMutation({
    mutationFn: () => deleteFn({ data: { need_id: need.id } }),
    onSuccess: () => {
      toast.success(t("needs:deleteDraft.success"));
      setDeleteConfirmOpen(false);
      onChange();
    },
    onError: (e: Error) => toast.error(t(`needs:errors.${e.message}`, { defaultValue: e.message })),
  });

  /* -------------------- badges (S1 · pastille 2) -------------------- */

  const statusBadge = (() => {
    if (isDraft) {
      return (
        <Badge
          variant="outline"
          className="text-[10px] font-semibold uppercase border-amber-300 text-amber-700 bg-amber-50 dark:bg-amber-950/40 dark:text-amber-300"
        >
          {t("needs:badge.unpublished")}
        </Badge>
      );
    }
    if (status === "closed") {
      return (
        <Badge
          variant="outline"
          className="text-[10px] font-semibold uppercase border-slate-300 text-slate-600 dark:text-slate-300"
        >
          {t("needs:badge.closed")}
        </Badge>
      );
    }
    if (status === "cancelled") {
      return (
        <Badge
          variant="outline"
          className="text-[10px] font-semibold uppercase border-red-300 text-red-700 dark:text-red-300"
        >
          {t("needs:badge.cancelled")}
        </Badge>
      );
    }
    return null;
  })();

  /* -------------------- meta line (S1 · pastille 3) -------------------- */

  const metaLine = (() => {
    if (isDraft) return t("needs:card.unpublishedMeta");
    if (need.last_published_at) {
      const time = formatDistanceToNow(new Date(need.last_published_at), {
        addSuffix: false,
        locale,
      });
      return t("needs:card.publishedAt", {
        time,
        count: need.last_recipients_count ?? 0,
      });
    }
    return null;
  })();

  /* -------------------- seats pill (S1 · pastille 4) -------------------- */

  const seatsPill = (() => {
    if (remaining === 0) {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300 px-2 py-0.5 text-[11px] font-semibold">
          <CheckCircle2 className="h-3 w-3" />
          {t("needs:card.seatsFullConfirmed", { count: confirmedCount })}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300 px-2 py-0.5 text-[11px] font-semibold">
        <Users className="h-3 w-3" />
        {t("needs:card.seatsRemaining", { count: remaining })}
        <span className="opacity-70">
          · {confirmedCount}/{capacity}
        </span>
      </span>
    );
  })();

  const { Icon: NeedIcon, chip: needChip } = getNeedVisual(need.role_key);
  const displayLabel = resolveNeedLabel(need, t);

  /* -------------------- contextual ⋯ menu (S7 · pastille 1) -------------------- */
  // Draft:              Modifier · Supprimer
  // Published (open):   Modifier · Fermer · Annuler
  // Closed:             Rouvrir
  // Cancelled:          no menu (read-only)
  const isClosed = status === "closed";
  const showMenu = isStaff && (!isReadOnly || isClosed);

  return (
    <div
      className={cn(
        "rounded-lg border bg-background/50 p-2.5 transition-colors",
        isReadOnly && "opacity-70",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          {/* Ligne titre : icône · libellé · badge d'état */}
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className={cn(
                "inline-flex h-6 w-6 items-center justify-center rounded-full shrink-0",
                needChip,
              )}
            >
              <NeedIcon className="h-3.5 w-3.5" />
            </span>
            <p className="text-sm font-semibold text-foreground truncate">{displayLabel}</p>
            {statusBadge}
          </div>

          {/* Description (optionnelle) */}
          {need.description && (
            <p className="text-xs text-muted-foreground mt-1 whitespace-pre-line line-clamp-2">
              {need.description}
            </p>
          )}

          {/* Ligne méta + places fusionnée (S1 · pastilles 3-4-5) */}
          <div className="mt-1.5 flex items-center gap-1.5 flex-wrap text-[11px] text-muted-foreground">
            {metaLine && <span>{metaLine}</span>}
            {metaLine && <span aria-hidden>·</span>}
            <span>{t(`needs:validationMode.${need.validation_mode}`)}</span>
            <span aria-hidden>·</span>
            {seatsPill}
          </div>

          {isStaff && (need.confirmed_signups?.length ?? 0) > 0 && (
            <div className="w-full mt-1.5 rounded-md border border-emerald-200 bg-emerald-50/40 dark:border-emerald-800/60 dark:bg-emerald-950/20 px-2 py-1 divide-y divide-emerald-100 dark:divide-emerald-900/60">
              {need.confirmed_signups!.map((s) => {
                const ctx = s.context;
                const roles = ctx?.primary_role ? [ctx.primary_role] : [];
                const subline = formatMemberContextSubline(ctx, {
                  playerSubline: (c) => t("common:person.playerSubline", { category: c }),
                  playerSublineMulti: (c) =>
                    t("common:person.playerSublineMulti", { categories: c }),
                  parentSubline: (c) => t("common:person.parentSubline", { children: c }),
                });
                return (
                  <PersonRow
                    key={s.user_id}
                    compact
                    name={s.full_name ?? t("common.unknown")}
                    roles={roles}
                    subline={subline}
                  />
                );
              })}
            </div>
          )}
        </div>

        {/* Menu ⋯ contextuel — dernier élément aligné en top-right */}
        {showMenu && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8 shrink-0"
                aria-label={t("needs:card.menuLabel")}
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              {!isClosed && (
                <DropdownMenuItem onClick={() => setEditOpen(true)}>
                  <Pencil className="h-3.5 w-3.5 mr-2" />
                  {t("needs:menu.edit")}
                </DropdownMenuItem>
              )}
              {isClosed && (
                <DropdownMenuItem onClick={() => reopenM.mutate()} disabled={reopenM.isPending}>
                  <RotateCcw className="h-3.5 w-3.5 mr-2" />
                  {t("needs:menu.reopenNeed")}
                </DropdownMenuItem>
              )}
              {isOpen && (
                <>
                  <DropdownMenuItem onClick={() => setEditAudienceOpen(true)}>
                    <Users className="h-3.5 w-3.5 mr-2" />
                    {t("needs:menu.editAudience")}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setViewRecipientsOpen(true)}>
                    <Users className="h-3.5 w-3.5 mr-2" />
                    {t("needs:menu.viewRecipients")}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => setCloseConfirmOpen(true)}>
                    <CheckCircle2 className="h-3.5 w-3.5 mr-2" />
                    {t("needs:menu.closeNeed")}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => setCancelConfirmOpen(true)}
                    className="text-destructive focus:text-destructive"
                  >
                    <AlertCircle className="h-3.5 w-3.5 mr-2" />
                    {t("needs:menu.cancelNeed")}
                  </DropdownMenuItem>
                </>
              )}
              {isDraft && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => setDeleteConfirmOpen(true)}
                    className="text-destructive focus:text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5 mr-2" />
                    {t("needs:menu.delete")}
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {/* Actions ligne — primaire d'abord (Candidatures / Publier / Relancer), puis secondaires */}
      <div className="mt-2 flex flex-wrap gap-1.5">
        {/* Staff — Candidatures (primaire quand il y a des candidatures en attente) */}
        {isStaff && isOpen && (
          <Button
            size="sm"
            variant={pendingCount > 0 ? "default" : "outline"}
            onClick={() => setStaffOpen(true)}
          >
            <Users className="h-3.5 w-3.5 mr-1" />
            {t("needs:card.applicationsCta")}
            {pendingCount > 0 && (
              <span className="ml-1.5 tabular-nums font-semibold">· {pendingCount}</span>
            )}
          </Button>
        )}

        {/* Staff — Publier (draft) / Relancer (open avec places restantes).
            Un besoin complet (open, 0 place) ne propose plus de re-solliciter. */}
        {isStaff && (isDraft || (isOpen && remaining > 0)) && (
          <Button
            size="sm"
            variant={isDraft ? "default" : "outline"}
            onClick={() => (isDraft ? setEditOpen(true) : setResendOpen(true))}
          >
            <Send className="h-3.5 w-3.5 mr-1" />
            {isDraft ? t("needs:actions.publish") : t("needs:card.republish")}
          </Button>
        )}

        {/* S1-5 : « Assigner » vit DANS le dialog Candidatures (StaffSignupsDialog), pas sur la carte. */}

        {/* Membre — S5 : 3 états normalisés + « Je me propose » / « Pas dispo » permanent */}
        {!isStaff && isOpen && (
          <>
            {mySignup?.status === "confirmed" && (
              <>
                <Badge className="text-[11px] px-2 py-1 bg-emerald-600">
                  {t("needs:memberCard.confirmed")}
                </Badge>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => withdrawM.mutate()}
                  disabled={withdrawM.isPending}
                >
                  {withdrawM.isPending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                  {t("needs:actions.withdraw")}
                </Button>
              </>
            )}
            {mySignup?.status === "applied" && (
              <>
                <Badge className="text-[11px] px-2 py-1 bg-amber-500">
                  {t("needs:memberCard.pending")}
                </Badge>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => withdrawM.mutate()}
                  disabled={withdrawM.isPending}
                >
                  {withdrawM.isPending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                  {t("needs:actions.withdraw")}
                </Button>
              </>
            )}
            {mySignup?.status === "unavailable" && (
              <>
                <Badge variant="outline" className="text-[11px] px-2 py-1">
                  {t("needs:memberCard.unavailableCta")}
                </Badge>
                <Button
                  size="sm"
                  onClick={() => applyM.mutate()}
                  disabled={applyM.isPending || remaining === 0}
                >
                  {applyM.isPending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                  {t("needs:unavailable.backToApply")}
                </Button>
              </>
            )}
            {(!mySignup ||
              (mySignup.status !== "confirmed" &&
                mySignup.status !== "applied" &&
                mySignup.status !== "unavailable")) && (
              <>
                <Button
                  size="sm"
                  onClick={() => applyM.mutate()}
                  disabled={applyM.isPending || remaining === 0}
                >
                  {applyM.isPending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                  {t("needs:memberCard.applyCta")}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => declareUnavailM.mutate()}
                  disabled={declareUnavailM.isPending}
                >
                  {declareUnavailM.isPending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                  {t("needs:memberCard.unavailableCta")}
                </Button>
              </>
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
          mode="publish"
        />
      )}
      {resendOpen && (
        <PublishDialog
          open={resendOpen}
          onOpenChange={setResendOpen}
          needId={need.id}
          eventId={eventId}
          onPublished={onChange}
          mode="resend"
        />
      )}
      {editAudienceOpen && (
        <PublishDialog
          open={editAudienceOpen}
          onOpenChange={setEditAudienceOpen}
          needId={need.id}
          eventId={eventId}
          onPublished={onChange}
          mode="edit_audience"
        />
      )}
      {viewRecipientsOpen && (
        <NeedRecipientsDialog
          open={viewRecipientsOpen}
          onOpenChange={setViewRecipientsOpen}
          needId={need.id}
          needLabel={resolveNeedLabel(need, t)}
        />
      )}
      {staffOpen && (
        <StaffSignupsDialog
          open={staffOpen}
          onOpenChange={setStaffOpen}
          needId={need.id}
          capacity={need.capacity}
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
          existingRoleKeys={existingRoleKeys}
          initial={{
            id: need.id,
            role_key: need.role_key,
            label: need.label,
            description: need.description,
            capacity: need.capacity,
            validation_mode: need.validation_mode as "auto" | "manual",
            status: need.status,
            confirmed_count: need.confirmed_count,
          }}
          onSaved={onChange}
        />
      )}

      {/* Fermer le besoin — S7 · pastille 3 */}
      <AlertDialog open={closeConfirmOpen} onOpenChange={setCloseConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("needs:closeDialog2.title")}</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmedCount === 0
                ? t("needs:closeDialog2.descriptionEmpty")
                : t("needs:closeDialog2.description", {
                    count: confirmedCount,
                    confirmed: confirmedCount,
                  })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("needs:closeDialog2.abort")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                closeM.mutate();
              }}
              disabled={closeM.isPending}
            >
              {closeM.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("needs:closeDialog2.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Annuler le besoin — S7 · pastille 3 (notifie confirmés + en attente) */}
      <AlertDialog open={cancelConfirmOpen} onOpenChange={setCancelConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("needs:cancelDialog2.title")}</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmedCount === 0 && pendingCount === 0
                ? t("needs:cancelDialog2.descriptionNone")
                : confirmedCount > 0 && pendingCount === 0
                  ? t("needs:cancelDialog2.descriptionOnlyConfirmed", {
                      count: confirmedCount,
                      confirmed: confirmedCount,
                    })
                  : confirmedCount === 0 && pendingCount > 0
                    ? t("needs:cancelDialog2.descriptionOnlyPending", {
                        count: pendingCount,
                        pending: pendingCount,
                      })
                    : t("needs:cancelDialog2.descriptionMany", {
                        confirmed: confirmedCount,
                        pending: pendingCount,
                      })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("needs:cancelDialog2.abort")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                cancelM.mutate();
              }}
              disabled={cancelM.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {cancelM.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("needs:cancelDialog2.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Supprimer un brouillon — S7 · pastille 2 (aucun destinataire prévenu) */}
      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("needs:deleteDraft.title")}</AlertDialogTitle>
            <AlertDialogDescription>{t("needs:deleteDraft.description")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("needs:deleteDraft.abort")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                deleteM.mutate();
              }}
              disabled={deleteM.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteM.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("needs:deleteDraft.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
  existingRoleKeys,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  eventId: string;
  sport: string | null;
  teamId: string | null;
  existingRoleKeys?: string[];
  initial?: {
    id: string;
    role_key: string;
    label: string;
    description: string | null;
    capacity: number;
    validation_mode: "auto" | "manual";
    status: string;
    confirmed_count: number;
  };
  onSaved: () => void;
}) {
  const { t } = useTranslation();

  const create = useServerFn(createEventNeed);
  const update = useServerFn(updateEventNeed);
  const publish = useServerFn(publishEventNeed);
  const addManualFn = useServerFn(staffAddManualSignup);
  const ctxFn = useServerFn(getEventAudienceContext);
  const previewFn = useServerFn(previewEventAudience);

  const isEdit = !!initial;
  const isDraftEdit = isEdit && initial?.status === "draft";
  const showAudienceStep = !isEdit || isDraftEdit;
  const templateLocked = isEdit && initial?.status === "open";

  // Audience picker is shown at CREATION and when editing a DRAFT.
  const { data: audienceCtx } = useQuery({
    queryKey: ["event-audience-ctx", eventId],
    queryFn: () => ctxFn({ data: { event_id: eventId } }),
    enabled: open && showAudienceStep,
  });

  const { state: audState, controls: audControls, buildAudiences } = useAudienceState();
  const audiences = useMemo<AudienceSelector[]>(
    () => (showAudienceStep ? buildAudiences(eventId) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [audState, eventId, showAudienceStep],
  );

  const [previewCount, setPreviewCount] = useState<number | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  useEffect(() => {
    if (!showAudienceStep || audiences.length === 0) {
      setPreviewCount(0);
      return;
    }
    let cancelled = false;
    setPreviewLoading(true);
    const to = setTimeout(async () => {
      try {
        const r = await previewFn({ data: { event_id: eventId, audiences } });
        if (!cancelled) setPreviewCount(r.count);
      } catch {
        if (!cancelled) setPreviewCount(null);
      } finally {
        if (!cancelled) setPreviewLoading(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(to);
    };
  }, [audiences, eventId, previewFn, showAudienceStep]);

  const availableTemplates = useMemo<NeedTemplate[]>(() => {
    const s = (sport ?? "").toLowerCase().trim();
    const used = new Set(existingRoleKeys ?? []);
    // Always keep the current role_key visible when editing so it stays selectable.
    if (initial) used.delete(initial.role_key);
    return NEED_TEMPLATES.filter((tpl) => {
      const sportOk = tpl.sports === "all" || (s && (tpl.sports as readonly string[]).includes(s));
      if (!sportOk) return false;
      // "other" is always allowed (multiple custom needs are OK).
      if (tpl.key === "other") return true;
      return !used.has(tpl.key);
    });
  }, [sport, initial, existingRoleKeys]);

  const [templateKey, setTemplateKey] = useState<string>(
    initial?.role_key ?? availableTemplates[0]?.key ?? "other",
  );
  const currentTpl =
    availableTemplates.find((x) => x.key === templateKey) ??
    NEED_TEMPLATES.find((x) => x.key === templateKey) ??
    NEED_TEMPLATES.find((x) => x.key === "other")!;

  const defaultLabel = t(`needs:templates.${currentTpl.key}`);
  const [label, setLabel] = useState(
    initial?.label && !/^needs[.:]templates\./.test(initial.label) ? initial.label : "",
  );

  const [description, setDescription] = useState(initial?.description ?? "");
  const [capacity, setCapacity] = useState(initial?.capacity ?? currentTpl.suggestedCapacity ?? 1);
  const [mode, setMode] = useState<"auto" | "manual">(
    initial?.validation_mode ?? currentTpl.suggestedValidationMode ?? "auto",
  );

  const [lastKey, setLastKey] = useState(templateKey);
  if (lastKey !== templateKey && !isEdit) {
    setLastKey(templateKey);
    setLabel("");
    setCapacity(currentTpl.suggestedCapacity ?? 1);
    setMode(currentTpl.suggestedValidationMode ?? "auto");
  }

  // 2-step wizard: step 1 = fields, step 2 = audience.
  // Draft edits jump straight to step 2 (fields still editable via "back").
  const [step, setStep] = useState<1 | 2>(1);
  useEffect(() => {
    if (open) setStep(isDraftEdit ? 2 : 1);
  }, [open, isDraftEdit]);

  // Saves as draft only when neither broadcast audience nor pre-assignments are set.
  // Any audience selection (broadcast OR pre-assignments) triggers publication.
  const wantsPublish =
    showAudienceStep && (audiences.length > 0 || audState.preassigned.length > 0);

  const saveM = useMutation({
    mutationFn: async () => {
      let needId: string;
      let created: { id: string } | null = null;
      if (isEdit) {
        await update({
          data: {
            need_id: initial!.id,
            role_key: currentTpl.key,
            label: label.trim() || defaultLabel,
            description: description.trim() || null,
            capacity,
            validation_mode: mode,
          },
        });
        needId = initial!.id;
      } else {
        created = await create({
          data: {
            event_id: eventId,
            role_key: currentTpl.key,
            label: label.trim() || defaultLabel,
            description: description.trim() || null,
            capacity,
            validation_mode: mode,
          },
        });
        needId = created!.id;
      }
      // Publish FIRST so the need is open, THEN materialize pre-assignments.
      // A draft must never notify anyone: pre-assignments are only sent when
      // the need actually transitions to "open".
      let published: { recipients_count?: number } | null = null;
      const hasPreassign = showAudienceStep && audState.preassigned.length > 0;
      const shouldPublish =
        showAudienceStep &&
        (audiences.length > 0 || (hasPreassign && (!isEdit || initial?.status !== "open")));
      if (shouldPublish) {
        published = await publish({ data: { need_id: needId, audiences } });
      }
      // Pre-assign selected people (confirmed immediately, notified).
      // Skipped entirely if the need stays a draft.
      let preassignedCount = 0;
      const needIsOpen = shouldPublish || (isEdit && initial?.status === "open");
      if (hasPreassign && needIsOpen) {
        for (const p of audState.preassigned) {
          try {
            await addManualFn({ data: { need_id: needId, user_id: p.user_id } });
            preassignedCount++;
          } catch (e) {
            console.error("[preassign] failed", p.user_id, e);
          }
        }
      }
      return {
        id: needId,
        __published: published,
        __preassignedCount: preassignedCount,
        __wasEdit: isEdit,
      };
    },
    onSuccess: (r) => {
      const pre = (r as { __preassignedCount?: number })?.__preassignedCount ?? 0;
      const pub = (r as { __published?: { recipients_count?: number } | null }).__published;
      const wasEdit = (r as { __wasEdit?: boolean }).__wasEdit;
      if (pub) {
        toast.success(t("needs:publish.success", { count: pub.recipients_count ?? 0 }));
      } else if (wasEdit) {
        toast.success(t("common.saved"));
      } else {
        toast.success(t("needs:section.created"));
      }
      if (pre > 0) {
        toast.success(t("needs:audiences.preassign.confirmed", { count: pre }));
      }

      onSaved();
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const totalSteps = showAudienceStep ? 2 : 1;
  const currentStep = showAudienceStep ? step : 1;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          {showAudienceStep && (
            <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {t("needs:wizard.step", { current: currentStep, total: totalSteps })}
            </div>
          )}
          <DialogTitle className="flex items-center gap-2">
            <HandHelping className="h-4 w-4 text-primary" />
            {!showAudienceStep
              ? t("common.edit")
              : step === 1
                ? t("needs:wizard.step1Title")
                : t("needs:wizard.step2Title")}
          </DialogTitle>
          <DialogDescription>
            {!showAudienceStep
              ? t("needs:section.createDesc")
              : step === 1
                ? t("needs:section.createDesc")
                : t("needs:publish.desc")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {(!showAudienceStep || step === 1) && (
            <>
              {/* Permanent minor reminder */}
              <div className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 px-3 py-2 text-xs text-amber-900 dark:text-amber-200">
                {t("needs:wizard.minorReminder")}
              </div>

              {/* Template picker as chips */}
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
                        disabled={templateLocked}
                        onClick={() => setTemplateKey(tpl.key)}
                        className={cn(
                          "inline-flex items-center gap-1.5 text-xs font-medium rounded-full border px-2.5 py-1.5 transition-colors",
                          active
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-background hover:bg-muted border-border text-foreground",
                          templateLocked && "opacity-60 cursor-not-allowed",
                        )}
                      >
                        <span
                          className={cn(
                            "inline-flex h-5 w-5 items-center justify-center rounded-full",
                            active ? "bg-primary-foreground/20 text-primary-foreground" : chip,
                          )}
                        >
                          <TplIcon className="h-3 w-3" />
                        </span>
                        {t(`needs:templates.${tpl.key}`)}
                      </button>
                    );
                  })}
                </div>
                {templateLocked && (
                  <p className="text-xs text-muted-foreground">{t("needs:edit.templateLocked")}</p>
                )}
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
                <Label htmlFor="need-desc">{t("needs:wizard.commentLabel")}</Label>
                <Textarea
                  id="need-desc"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  maxLength={2000}
                  rows={3}
                  placeholder={t("needs:wizard.commentPlaceholder")}
                />
              </div>
            </>
          )}

          {showAudienceStep && step === 2 && (
            <div className="space-y-3">
              <AudiencePickerBody
                ctx={audienceCtx ?? null}
                state={audState}
                controls={audControls}
                preview={{ count: previewCount, loading: previewLoading }}
                capacity={capacity}
                enablePreassign
              />
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          {showAudienceStep && step === 2 ? (
            <>
              <Button variant="outline" onClick={() => setStep(1)}>
                {t("needs:wizard.back")}
              </Button>
              <Button onClick={() => saveM.mutate()} disabled={saveM.isPending}>
                {saveM.isPending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                {wantsPublish
                  ? t("needs:actions.publish")
                  : isEdit
                    ? t("common.save")
                    : t("common.create")}
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                {t("common.cancel")}
              </Button>
              {!showAudienceStep ? (
                <Button onClick={() => saveM.mutate()} disabled={saveM.isPending}>
                  {saveM.isPending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                  {t("common.save")}
                </Button>
              ) : (
                <Button onClick={() => setStep(2)}>{t("needs:wizard.continueToRecipients")}</Button>
              )}
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* -------------------------------------------------------------------------- */
/* PublishDialog — picker complet + preview live                              */
/* -------------------------------------------------------------------------- */

import { AudiencePickerBody, useAudienceState } from "./audience-picker";

type PublishDialogMode = "publish" | "resend" | "edit_audience";

function PublishDialog({
  open,
  onOpenChange,
  needId,
  eventId,
  onPublished,
  mode = "publish",
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  needId: string;
  eventId: string;
  onPublished: () => void;
  mode?: PublishDialogMode;
}) {
  const { t } = useTranslation();
  const publish = useServerFn(publishEventNeed);
  const republishFn = useServerFn(republishEventNeed);
  const preview = useServerFn(previewEventNeedAudience);
  const ctxFn = useServerFn(getNeedAudienceContext);

  const isPublish = mode === "publish";
  const isResend = mode === "resend";
  const isEditAudience = mode === "edit_audience";

  const { data: ctx } = useQuery({
    queryKey: ["need-audience-ctx", needId],
    queryFn: () => ctxFn({ data: { need_id: needId } }),
    enabled: open,
  });

  const { state, controls, buildAudiences } = useAudienceState();
  const audiences = useMemo<AudienceSelector[]>(
    () => buildAudiences(eventId),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state, eventId],
  );

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
    const to = setTimeout(async () => {
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
      clearTimeout(to);
    };
  }, [audiences, needId, preview]);

  const publishM = useMutation({
    mutationFn: () => {
      if (isPublish) return publish({ data: { need_id: needId, audiences } });
      return republishFn({
        data: {
          need_id: needId,
          audiences,
          mode: isEditAudience ? "delta" : "resend",
        },
      });
    },
    onSuccess: (
      r:
        | {
            recipients_count: number;
            notified_count?: number;
            was_idempotent_skip: boolean;
          }
        | null
        | undefined,
    ) => {
      if (r?.was_idempotent_skip) {
        toast.success(t("needs:publish.successIdempotent"));
      } else if (isPublish) {
        toast.success(t("needs:publish.success", { count: r?.recipients_count ?? 0 }));
      } else if (isResend) {
        toast.success(
          t("needs:resend.success", { count: r?.notified_count ?? r?.recipients_count ?? 0 }),
        );
      } else {
        // edit_audience — delta
        const delta = r?.notified_count ?? 0;
        if (delta === 0) {
          toast.success(t("needs:editAudience.successNoDelta"));
        } else {
          toast.success(t("needs:editAudience.success", { count: delta }));
        }
      }
      onPublished();
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const titleKey = isPublish
    ? "needs:publish.title"
    : isResend
      ? "needs:resend.title"
      : "needs:editAudience.title";
  const descKey = isEditAudience ? "needs:editAudience.desc" : "needs:publish.desc";
  const ctaKey = isPublish
    ? "needs:actions.publish"
    : isResend
      ? "needs:actions.resend"
      : "needs:actions.notifyNew";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t(titleKey)}</DialogTitle>
          <DialogDescription>{t(descKey)}</DialogDescription>
        </DialogHeader>

        <AudiencePickerBody
          ctx={ctx ?? null}
          state={state}
          controls={controls}
          preview={{ count: previewCount, loading: previewLoading }}
        />

        {isEditAudience && (
          <p className="text-xs text-muted-foreground mt-2">{t("needs:editAudience.deltaHint")}</p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button
            onClick={() => publishM.mutate()}
            disabled={publishM.isPending || audiences.length === 0 || (previewCount ?? 0) === 0}
          >
            {publishM.isPending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
            {t(ctaKey)}
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
  staff:
    "bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-950/40 dark:text-purple-300",
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
  context: MemberContext | null;
};

function StaffSignupsDialog({
  open,
  onOpenChange,
  needId,
  capacity,
  onChanged,
  defaultAddOpen = false,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  needId: string;
  capacity: number;
  onChanged: () => void;
  defaultAddOpen?: boolean;
}) {
  const { t } = useTranslation();
  const listFn = useServerFn(listStaffSignupsForNeed);
  const decide = useServerFn(decideSignup);
  const searchFn = useServerFn(searchClubMembersForNeed);
  const addManual = useServerFn(staffAddManualSignup);
  const unassignFn = useServerFn(staffUnassignSignup);
  const qc = useQueryClient();

  const { data, refetch } = useQuery({
    queryKey: ["need-signups", needId],
    queryFn: () => listFn({ data: { need_id: needId } }),
    enabled: open,
  });

  const decideM = useMutation({
    mutationFn: (v: { signup_id: string; decision: "confirm" | "decline" }) => decide({ data: v }),
    onSuccess: () => {
      refetch();
      onChanged();
      qc.invalidateQueries({ queryKey: ["need-signups", needId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkPending, setBulkPending] = useState(false);
  const [addOpen, setAddOpen] = useState(defaultAddOpen);
  const [searchText, setSearchText] = useState("");
  const [addPendingUser, setAddPendingUser] = useState<string | null>(null);

  const { data: memberResults, isFetching: memberSearchLoading } = useQuery({
    queryKey: ["need-add-members", needId, searchText],
    queryFn: () => searchFn({ data: { need_id: needId, search: searchText } }),
    enabled: open && addOpen,
    staleTime: 15_000,
  });

  const addManualM = useMutation({
    mutationFn: (user_id: string) => addManual({ data: { need_id: needId, user_id } }),
    onMutate: (uid) => setAddPendingUser(uid),
    onSettled: () => setAddPendingUser(null),
    onSuccess: (r: { already?: boolean } | null | undefined) => {
      toast.success(r?.already ? t("needs:staff.alreadyConfirmed") : t("needs:staff.manualAdded"));
      refetch();
      onChanged();
      qc.invalidateQueries({ queryKey: ["need-add-members", needId] });
    },
    onError: (e: Error) => toast.error(t(`needs:errors.${e.message}`, { defaultValue: e.message })),
  });

  const unassignM = useMutation({
    mutationFn: (signup_id: string) => unassignFn({ data: { signup_id } }),
    onSuccess: () => {
      toast.success(t("needs:staff.unassigned"));
      refetch();
      onChanged();
      qc.invalidateQueries({ queryKey: ["need-signups", needId] });
    },
    onError: (e: Error) => toast.error(t(`needs:errors.${e.message}`, { defaultValue: e.message })),
  });

  const signups = (data?.signups ?? []) as StaffSignup[];
  const pending = signups.filter((s) => s.status === "applied");
  const confirmedCount = signups.filter((s) => s.status === "confirmed").length;
  const isFull = confirmedCount >= capacity;
  const pendingIds = pending.map((s) => s.id);
  const allPendingSelected = pendingIds.length > 0 && pendingIds.every((id) => selected.has(id));

  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const toggleAll = () => {
    setSelected(allPendingSelected ? new Set() : new Set(pendingIds));
  };

  const bulk = async (decision: "confirm" | "decline") => {
    const ids = Array.from(selected).filter((id) => pendingIds.includes(id));
    if (ids.length === 0) return;
    setBulkPending(true);
    try {
      const results = await Promise.allSettled(
        ids.map((signup_id) => decide({ data: { signup_id, decision } })),
      );
      const failed = results.filter((r) => r.status === "rejected").length;
      const ok = results.length - failed;
      if (ok > 0) {
        toast.success(
          decision === "confirm"
            ? t("needs:staff.bulkConfirmed", {
                count: ok,
              })
            : t("needs:staff.bulkDeclined", {
                count: ok,
              }),
        );
      }
      if (failed > 0) toast.error(t("common.error"));
      setSelected(new Set());
      await refetch();
      onChanged();
      qc.invalidateQueries({ queryKey: ["need-signups", needId] });
    } finally {
      setBulkPending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("needs:staff.title")}</DialogTitle>
          <p className="text-xs text-muted-foreground">
            {t("needs:applications.summary", {
              count: pending.length + signups.filter((s) => s.status === "confirmed").length,
              pending: pending.length,
              confirmed: signups.filter((s) => s.status === "confirmed").length,
              seats: signups.filter((s) => s.status === "confirmed").length,
            })}
          </p>
        </DialogHeader>

        {pending.length > 0 && (
          <div className="flex items-center justify-between gap-2 rounded-md border bg-muted/40 p-2">
            <label className="flex items-center gap-2 text-xs font-medium cursor-pointer">
              <Checkbox checked={allPendingSelected} onCheckedChange={toggleAll} />
              {allPendingSelected
                ? t("common.deselectAll")
                : t("needs:staff.selectAllPending", {
                    count: pending.length,
                  })}
            </label>
            <div className="flex items-center gap-1">
              <Button
                size="sm"
                variant="default"
                disabled={selected.size === 0 || bulkPending}
                onClick={() => bulk("confirm")}
              >
                {bulkPending ? (
                  <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                ) : (
                  <Check className="h-3.5 w-3.5 mr-1" />
                )}
                {t("needs:staff.confirmSelection")}
                {selected.size > 0 && ` (${selected.size})`}
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={selected.size === 0 || bulkPending}
                onClick={() => bulk("decline")}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        )}

        {/* S4-4 : Assigner section moved below signups list */}

        <div className="space-y-1 max-h-[60vh] overflow-y-auto">
          {signups.map((s) => {
            const isPending = s.status === "applied";
            const checked = selected.has(s.id);
            const name = s.profile?.full_name ?? t("common.unknown");
            const sublineParts: React.ReactNode[] = [];
            const ctxSubline = formatMemberContextSubline(s.context, {
              playerSubline: (c) => t("common:person.playerSubline", { category: c }),
              playerSublineMulti: (c) => t("common:person.playerSublineMulti", { categories: c }),
              parentSubline: (c) => t("common:person.parentSubline", { children: c }),
            });
            if (ctxSubline) sublineParts.push(<span key="ctx">{ctxSubline}</span>);
            sublineParts.push(t(`needs:signup.${s.status}`));
            if (s.license_number) {
              sublineParts.push(
                <span key="lic" className="inline-flex items-center gap-1">
                  <IdCard className="h-3 w-3" />
                  {t("needs:applications.licenseLabel", { n: s.license_number })}
                </span>,
              );
            }
            if (s.comment) {
              sublineParts.push(<em key="c">« {s.comment} »</em>);
            }
            return (
              <div
                key={s.id}
                className={cn(
                  "rounded-md border px-2",
                  checked && "bg-primary/5 border-primary/40",
                )}
              >
                <div className="flex items-start gap-2">
                  {isPending && (
                    <Checkbox
                      className="mt-3"
                      checked={checked}
                      onCheckedChange={() => toggleOne(s.id)}
                    />
                  )}
                  <PersonRow
                    className="flex-1"
                    name={name}
                    roles={s.roles}
                    isMinor={s.is_minor && s.status === "applied"}
                    minorLabel={t("needs:applications.minorTag")}
                    subline={
                      sublineParts.length ? (
                        <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-0.5">
                          {sublineParts.map((p, i) => (
                            <span key={i}>
                              {i > 0 && <span className="mx-1">·</span>}
                              {p}
                            </span>
                          ))}
                        </span>
                      ) : null
                    }
                    action={
                      isPending ? (
                        <div className="flex items-center gap-1">
                          <Button
                            size="sm"
                            variant="default"
                            onClick={() => decideM.mutate({ signup_id: s.id, decision: "confirm" })}
                            disabled={decideM.isPending || bulkPending || isFull}
                            title={isFull ? t("needs:staff.fullTitle") : undefined}
                          >
                            <Check className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => decideM.mutate({ signup_id: s.id, decision: "decline" })}
                            disabled={decideM.isPending || bulkPending}
                          >
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      ) : s.status === "confirmed" ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => unassignM.mutate(s.id)}
                          disabled={unassignM.isPending}
                          title={t("needs:staff.unassignCta")}
                        >
                          {unassignM.isPending ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <X className="h-3.5 w-3.5" />
                          )}
                        </Button>
                      ) : null
                    }
                  />
                </div>
              </div>
            );
          })}
          {signups.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-6">
              {t("needs:staff.empty")}
            </p>
          )}
        </div>

        {/* S4-4 : Assigner replié en bas — notification automatique à l'assigné */}
        <div className="rounded-md border bg-muted/20 p-2 space-y-2 mt-2">
          <button
            type="button"
            onClick={() => setAddOpen((v) => !v)}
            className="flex items-center justify-between w-full text-xs font-medium text-primary hover:underline"
          >
            <span className="inline-flex items-center gap-2">
              <UserPlus className="h-3.5 w-3.5" />
              {t("needs:applications.assignSection")}
            </span>
            <span className="text-[10px] text-muted-foreground">{addOpen ? "−" : "+"}</span>
          </button>
          {addOpen && (
            <>
              {isFull ? (
                <p className="text-[11px] rounded border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 text-amber-800 dark:text-amber-200 px-2 py-1.5">
                  {t("needs:staff.fullBlock")}
                </p>
              ) : (
                <p className="text-[11px] text-muted-foreground">
                  {t("needs:applications.assignHelp")}
                </p>
              )}
              <div className="space-y-2">
                <div className="relative">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    className="pl-7 h-8 text-sm"
                    placeholder={t("needs:applications.searchPlaceholder")}
                    value={searchText}
                    onChange={(e) => setSearchText(e.target.value)}
                    autoFocus
                  />
                </div>
                <div className="max-h-40 overflow-y-auto space-y-1">
                  {memberSearchLoading && (
                    <p className="text-[11px] text-muted-foreground px-1">
                      <Loader2 className="h-3 w-3 inline animate-spin mr-1" />
                      {t("common.loading")}
                    </p>
                  )}
                  {!memberSearchLoading && (memberResults?.members ?? []).length === 0 && (
                    <p className="text-[11px] text-muted-foreground px-1 py-2">
                      {t("needs:staff.noMembers")}
                    </p>
                  )}
                  {(memberResults?.members ?? []).map((m) => {
                    const ctxSubline = formatMemberContextSubline(
                      (m as { context?: import("@/lib/needs/member-context").MemberContext | null })
                        .context ?? null,
                      {
                        playerSubline: (c) => t("common:person.playerSubline", { category: c }),
                        playerSublineMulti: (c) =>
                          t("common:person.playerSublineMulti", { categories: c }),
                        parentSubline: (c) => t("common:person.parentSubline", { children: c }),
                      },
                    );
                    return (
                      <PersonRow
                        key={m.member_id}
                        className="rounded border bg-background px-2"
                        compact
                        name={m.full_name ?? t("common.unknown")}
                        roles={m.roles}
                        subline={ctxSubline ?? undefined}
                        action={
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-[11px]"
                            onClick={() => addManualM.mutate(m.user_id)}
                            disabled={addPendingUser === m.user_id || isFull}
                          >
                            {addPendingUser === m.user_id ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <>
                                <Plus className="h-3 w-3 mr-1" />
                                {t("needs:applications.assignCta")}
                              </>
                            )}
                          </Button>
                        }
                      />
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("common.close")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* -------------------------------------------------------------------------- */
/* NeedRecipientsDialog — staff: liste des destinataires notifiés             */
/* -------------------------------------------------------------------------- */

function NeedRecipientsDialog({
  open,
  onOpenChange,
  needId,
  needLabel,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  needId: string;
  needLabel: string;
}) {
  const { t } = useTranslation();
  const listFn = useServerFn(listNeedRecipients);

  const { data, isLoading } = useQuery({
    queryKey: ["need-recipients", needId],
    queryFn: () => listFn({ data: { need_id: needId } }),
    enabled: open,
  });

  const recipients = data?.recipients ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("needs:recipients.title")}</DialogTitle>
          <DialogDescription>{t("needs:recipients.desc", { need: needLabel })}</DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] overflow-y-auto -mx-1 px-1">
          {isLoading && (
            <p className="text-sm text-muted-foreground py-4 text-center">
              <Loader2 className="h-4 w-4 animate-spin inline mr-2" />
              {t("common.loading")}
            </p>
          )}
          {!isLoading && recipients.length === 0 && (
            <p className="text-sm text-muted-foreground py-4 text-center">
              {t("needs:recipients.empty")}
            </p>
          )}
          {!isLoading && recipients.length > 0 && (
            <>
              <p className="text-xs text-muted-foreground mb-2">
                {t("needs:recipients.count", { count: recipients.length })}
              </p>
              <div className="divide-y divide-border/60">
                {recipients.map((r) => (
                  <PersonRow
                    key={r.user_id}
                    name={r.full_name ?? t("common.unknown")}
                    roles={r.roles}
                    compact
                  />
                ))}
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("common.close")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
