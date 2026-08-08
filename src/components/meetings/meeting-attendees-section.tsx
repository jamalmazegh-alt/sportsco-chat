/**
 * MeetingAttendeesSection — Bloc "Convocations réunion" sur la page événement.
 * Réservé aux événements de type "meeting". Réutilise AudiencePickerBody.
 */
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Users,
  Loader2,
  UserPlus,
  Check,
  X,
  HelpCircle,
  MoreVertical,
  Send,
  UserMinus,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AttendancePill } from "@/components/attendance-pill";
import {
  AudiencePickerBody,
  useAudienceState,
  type AudienceState,
} from "@/components/needs/audience-picker";
import { sourcesToSelection } from "@/lib/meetings/sources-to-selection";
import { getEventAudienceContext } from "@/lib/needs/needs.functions";
import {
  listMeetingAttendees,
  previewMeetingAudience,
  removeMeetingAttendees,
  resendMeetingConvocation,
  syncMeetingAttendees,
  updateMeetingAttendanceStatus,
  type MeetingAttendeeRow,
} from "@/lib/meetings/meetings.functions";
import { summarizeSources } from "@/lib/meetings/attendee-sources";

type AttendanceStatus = "present" | "absent" | "uncertain" | "pending";
type RequiresConfirmationEntry = {
  user_id: string;
  full_name: string | null;
  status: string | null;
};

function initials(name: string | null): string {
  if (!name) return "?";
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

export function MeetingAttendeesSection({
  eventId,
  eventType,
}: {
  eventId: string;
  eventType: string | null | undefined;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();

  const listFn = useServerFn(listMeetingAttendees);
  const listQuery = useQuery({
    queryKey: ["meeting-attendees", eventId],
    queryFn: () => listFn({ data: { event_id: eventId } }),
    enabled: eventType === "meeting",
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ["meeting-attendees", eventId] });

  const updateFn = useServerFn(updateMeetingAttendanceStatus);
  const updateStatus = useMutation({
    mutationFn: (vars: { user_id: string; status: AttendanceStatus }) =>
      updateFn({
        data: { event_id: eventId, user_id: vars.user_id, status: vars.status },
      }),
    onSuccess: () => refresh(),
    onError: (e: Error) => toast.error(e.message),
  });

  const resendFn = useServerFn(resendMeetingConvocation);
  const resendOne = useMutation({
    mutationFn: (userId: string) => resendFn({ data: { event_id: eventId, user_ids: [userId] } }),
    onSuccess: () => toast.success(t("meetings:row.resend.success")),
    onError: (e: Error) => toast.error(e.message),
  });

  const removeFn = useServerFn(removeMeetingAttendees);
  const [removeTarget, setRemoveTarget] = useState<MeetingAttendeeRow | null>(null);
  const removeOne = useMutation({
    mutationFn: (userId: string) => removeFn({ data: { event_id: eventId, user_ids: [userId] } }),
    onSuccess: () => {
      toast.success(t("meetings:row.remove.success"));
      setRemoveTarget(null);
      refresh();
    },
    onError: (e: Error) => {
      toast.error(e.message);
      setRemoveTarget(null);
    },
  });

  if (eventType !== "meeting") return null;

  const data = listQuery.data;
  const isStaff = data?.is_staff ?? false;
  const attendees: MeetingAttendeeRow[] = data?.attendees ?? [];
  const counts = data?.counts ?? { present: 0, absent: 0, uncertain: 0, pending: 0 };
  const total = attendees.length;

  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-card">
      {(() => {
        const totalP = counts.present + counts.uncertain + counts.absent + counts.pending;
        const respondedP = totalP - counts.pending;
        const rate = totalP === 0 ? 0 : Math.round((respondedP / totalP) * 100);
        const pct = (n: number) => (totalP === 0 ? 0 : (n / totalP) * 100);

        if (total === 0) {
          return (
            <header className="flex items-start justify-between gap-3 border-b border-border/60 px-4 py-3">
              <div className="min-w-0 flex items-center gap-2">
                <Users className="h-4 w-4 shrink-0 text-muted-foreground" />
                <h2 className="text-base font-extrabold tracking-tight text-foreground">
                  {t("meetings:section.title")}
                </h2>
              </div>
              {isStaff && (
                <ManageAttendeesDialog
                  eventId={eventId}
                  onDone={refresh}
                  initialSelection={sourcesToSelection(attendees)}
                  hasExistingAttendees={total > 0}
                />
              )}
            </header>
          );
        }

        return (
          <div className="border-b border-border/60 px-4 pb-3 pt-3">
            <div className="mb-2.5 flex items-start justify-between gap-3">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <Users className="h-4 w-4 shrink-0 text-muted-foreground" />
                <h2 className="text-sm font-extrabold tracking-tight">
                  {t("meetings:section.title")}
                </h2>
                <span className="inline-flex items-center rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                  {t("meetings:section.count", { count: total })}
                </span>
              </div>
              {isStaff && (
                <ManageAttendeesDialog
                  eventId={eventId}
                  onDone={refresh}
                  initialSelection={sourcesToSelection(attendees)}
                  hasExistingAttendees={total > 0}
                />
              )}
            </div>

            <div className="mb-2 flex items-end justify-between gap-3">
              <div className="leading-none">
                <div className="flex items-baseline gap-1">
                  <span className="font-display text-[34px] font-bold leading-none tracking-[-0.03em] tabular-nums">
                    {rate}
                  </span>
                  <span className="text-base font-bold text-muted-foreground">%</span>
                </div>
                <p className="mt-1.5 text-[9.5px] font-bold uppercase tracking-[0.13em] text-muted-foreground">
                  {t("attendance.responseRate")}
                </p>
              </div>
              <div className="text-right text-xs leading-tight text-muted-foreground">
                <p className="tabular-nums">
                  <span className="font-bold text-foreground">{respondedP}</span>/{totalP}{" "}
                  {t("attendance.responded")}
                </p>
              </div>
            </div>

            {/* Même barre que les présences d'un match : 2 px de fond entre les
                segments, et la piste porte les non-répondants. */}
            <div
              className="flex h-[7px] gap-0.5 overflow-hidden rounded-full bg-muted"
              role="img"
              aria-label={[
                `${counts.present} ${t("attendance.present")}`,
                `${counts.uncertain} ${t("attendance.uncertain")}`,
                `${counts.absent} ${t("attendance.absent")}`,
                `${counts.pending} ${t("attendance.pending")}`,
              ].join(" · ")}
            >
              {counts.present > 0 && (
                <div
                  style={{ width: `${pct(counts.present)}%` }}
                  className="rounded-full bg-present"
                />
              )}
              {counts.uncertain > 0 && (
                <div
                  style={{ width: `${pct(counts.uncertain)}%` }}
                  className="rounded-full bg-uncertain"
                />
              )}
              {counts.absent > 0 && (
                <div
                  style={{ width: `${pct(counts.absent)}%` }}
                  className="rounded-full bg-absent"
                />
              )}
            </div>

            <div className="mt-2.5 grid grid-cols-4 gap-1.5">
              {[
                {
                  key: "present",
                  val: counts.present,
                  label: t("attendance.present"),
                  tone: "bg-present",
                },
                {
                  key: "uncertain",
                  val: counts.uncertain,
                  label: t("attendance.uncertain"),
                  tone: "bg-uncertain",
                },
                {
                  key: "absent",
                  val: counts.absent,
                  label: t("attendance.absent"),
                  tone: "bg-absent",
                },
                {
                  key: "pending",
                  val: counts.pending,
                  label: t("attendance.pending"),
                  tone: "bg-muted-foreground/40",
                },
              ].map((b) => (
                <div
                  key={b.key}
                  className="rounded-xl border border-border px-1.5 py-1.5 text-center"
                >
                  <div className="flex items-center justify-center gap-1.5">
                    <span className={cn("h-1.5 w-1.5 rounded-full", b.tone)} />
                    <span className="font-display text-[15px] font-bold leading-none tabular-nums">
                      {b.val}
                    </span>
                  </div>
                  <p className="mt-1 truncate text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                    {b.label}
                  </p>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      <div className="p-4 space-y-4">
        {listQuery.isLoading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t("common.loading")}
          </div>
        )}

        {!listQuery.isLoading && total === 0 && (
          <p className="text-sm text-muted-foreground">
            {isStaff ? t("meetings:empty.staff") : t("meetings:empty.member")}
          </p>
        )}

        {!isStaff && data?.my_attendance && (
          <div className="flex items-center justify-between gap-2 rounded-2xl border border-border/70 bg-muted/30 p-3">
            <span className="text-sm font-medium">{t("meetings:self.prompt")}</span>
            <StatusButtons
              value={data.my_attendance.status as AttendanceStatus}
              onChange={(status) =>
                updateStatus.mutate({
                  user_id: data.my_attendance!.user_id,
                  status,
                })
              }
              disabled={updateStatus.isPending}
            />
          </div>
        )}

        {isStaff && attendees.length > 0 && (
          <>
            <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground px-1">
              <span>{t("attendance.convokedHeader")}</span>
              <span>{t("attendance.responseHeader")}</span>
            </div>
            <ul className="divide-y divide-border/70">
              {attendees.map((a) => {
                const chips = summarizeSources(a.sources);
                return (
                  <li key={a.id} className="flex items-center gap-3 py-2.5">
                    <Avatar className="h-9 w-9 shrink-0">
                      {a.avatar_url && <AvatarImage src={a.avatar_url} alt="" />}
                      <AvatarFallback>{initials(a.full_name)}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold">
                        {a.full_name ?? t("common.unknown")}
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                        {chips.map((chip) => (
                          <Badge
                            key={chip.key}
                            variant="outline"
                            className="text-[10px] font-normal"
                          >
                            {chip.kind === "manual" ? t("meetings:source.manual") : chip.label}
                          </Badge>
                        ))}
                      </div>
                    </div>
                    <StatusButtons
                      value={a.status}
                      onChange={(status) => updateStatus.mutate({ user_id: a.user_id, status })}
                      disabled={updateStatus.isPending}
                    />
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 shrink-0"
                          aria-label={t("meetings:row.actions")}
                        >
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => resendOne.mutate(a.user_id)}
                          disabled={resendOne.isPending}
                        >
                          <Send className="mr-2 h-4 w-4" />
                          {t("meetings:row.resend.cta")}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={() => setRemoveTarget(a)}
                        >
                          <UserMinus className="mr-2 h-4 w-4" />
                          {t("meetings:row.remove.cta")}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>

      <AlertDialog
        open={!!removeTarget}
        onOpenChange={(o) => !o && !removeOne.isPending && setRemoveTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("meetings:row.remove.confirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("meetings:row.remove.confirmDesc", {
                name: removeTarget?.full_name ?? t("common.unknown"),
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removeOne.isPending}>
              {t("common.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={removeOne.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (removeTarget) removeOne.mutate(removeTarget.user_id);
              }}
            >
              {removeOne.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("meetings:row.remove.confirmCta")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

function StatusButtons({
  value,
  onChange,
  disabled,
}: {
  value: AttendanceStatus;
  onChange: (s: AttendanceStatus) => void;
  disabled?: boolean;
}) {
  const btn = (s: AttendanceStatus, Icon: typeof Check, activeCls: string, label: string) => (
    <Button
      key={s}
      type="button"
      size="icon"
      variant={value === s ? "default" : "outline"}
      className={value === s ? `h-8 w-8 ${activeCls}` : "h-8 w-8"}
      disabled={disabled}
      aria-label={label}
      onClick={() => onChange(s)}
    >
      <Icon className="h-4 w-4" />
    </Button>
  );
  return (
    <div className="flex items-center gap-1">
      {btn("present", Check, "bg-emerald-600 hover:bg-emerald-700 text-white", "présent")}
      {btn("uncertain", HelpCircle, "bg-amber-500 hover:bg-amber-600 text-white", "incertain")}
      {btn("absent", X, "bg-red-600 hover:bg-red-700 text-white", "absent")}
    </div>
  );
}

function ManageAttendeesDialog({
  eventId,
  onDone,
  initialSelection,
  hasExistingAttendees,
}: {
  eventId: string;
  onDone: () => void;
  initialSelection: Partial<AudienceState>;
  hasExistingAttendees: boolean;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <UserPlus className="mr-2 h-4 w-4" />
          {t("meetings:manage.cta")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("meetings:manage.title")}</DialogTitle>
          <DialogDescription>{t("meetings:manage.desc")}</DialogDescription>
        </DialogHeader>

        {open && (
          <AttendeesEditor
            key={eventId}
            eventId={eventId}
            initialSelection={initialSelection}
            hasExistingAttendees={hasExistingAttendees}
            onClose={() => setOpen(false)}
            onDone={onDone}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function AttendeesEditor({
  eventId,
  initialSelection,
  hasExistingAttendees,
  onClose,
  onDone,
}: {
  eventId: string;
  initialSelection: Partial<AudienceState>;
  hasExistingAttendees: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [pendingConfirm, setPendingConfirm] = useState<RequiresConfirmationEntry[]>([]);

  const ctxFn = useServerFn(getEventAudienceContext);
  const ctxQuery = useQuery({
    queryKey: ["meeting-audience-ctx", eventId],
    queryFn: () => ctxFn({ data: { event_id: eventId } }),
  });

  const { state, controls, buildAudiences } = useAudienceState(initialSelection);

  const audiences = useMemo(() => buildAudiences(eventId), [buildAudiences, eventId]);
  const manualUserIds = useMemo(() => state.preassigned.map((p) => p.user_id), [state.preassigned]);

  const previewFn = useServerFn(previewMeetingAudience);
  const previewQuery = useQuery({
    queryKey: ["meeting-preview", eventId, audiences, manualUserIds],
    queryFn: () =>
      previewFn({
        data: { event_id: eventId, audiences, manual_user_ids: manualUserIds },
      }),
    enabled: audiences.length > 0 || manualUserIds.length > 0,
  });

  const syncFn = useServerFn(syncMeetingAttendees);
  const sync = useMutation({
    mutationFn: (confirmIds: string[]) =>
      syncFn({
        data: {
          event_id: eventId,
          audiences,
          manual_user_ids: manualUserIds,
          confirm_remove_user_ids: confirmIds,
          dry_run: false,
        },
      }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["meeting-attendees", eventId] });
      toast.success(
        t("meetings:sync.success", {
          added: r.added_count,
          removed: r.removed_count,
        }),
      );
      if (r.requires_confirmation.length > 0) {
        setPendingConfirm(r.requires_confirmation);
      } else {
        setPendingConfirm([]);
        onClose();
        onDone();
      }
    },
    onError: (e: Error) =>
      toast.error(t(`meetings:errors.${e.message}`, { defaultValue: e.message })),
  });

  const hasSelection = audiences.length > 0 || manualUserIds.length > 0;

  return (
    <>
      {ctxQuery.isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t("common.loading")}
        </div>
      ) : (
        <AudiencePickerBody
          ctx={ctxQuery.data ?? null}
          state={state}
          controls={controls}
          preview={{
            count: previewQuery.data?.count ?? null,
            loading: previewQuery.isFetching,
          }}
          enablePreassign
        />
      )}

      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={sync.isPending}>
          {t("common.cancel")}
        </Button>
        <Button onClick={() => sync.mutate([])} disabled={!hasSelection || sync.isPending}>
          {sync.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {hasExistingAttendees ? t("meetings:manage.save") : t("meetings:manage.confirm")}
        </Button>
      </DialogFooter>

      <Dialog
        open={pendingConfirm.length > 0}
        onOpenChange={(o) => {
          if (!o) setPendingConfirm([]);
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("meetings:confirmRemove.title")}</DialogTitle>
            <DialogDescription>{t("meetings:confirmRemove.desc")}</DialogDescription>
          </DialogHeader>

          <ul className="divide-y">
            {pendingConfirm.map((p) => (
              <li key={p.user_id} className="flex items-center justify-between gap-2 py-2">
                <span className="text-sm">{p.full_name ?? t("common.unknown")}</span>
                {p.status && <AttendancePill status={p.status as AttendanceStatus} />}
              </li>
            ))}
          </ul>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setPendingConfirm([])}
              disabled={sync.isPending}
            >
              {t("meetings:confirmRemove.keep")}
            </Button>
            <Button
              variant="destructive"
              onClick={() => sync.mutate(pendingConfirm.map((p) => p.user_id))}
              disabled={sync.isPending}
            >
              {sync.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("meetings:confirmRemove.confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
