/**
 * MeetingAttendeesSection — Bloc "Convocations réunion" sur la page événement.
 * Réservé aux événements de type "meeting". Réutilise AudiencePickerBody.
 */
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Users, Loader2, UserPlus, Check, X, HelpCircle } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

  if (eventType !== "meeting") return null;

  const data = listQuery.data;
  const isStaff = data?.is_staff ?? false;
  const attendees: MeetingAttendeeRow[] = data?.attendees ?? [];
  const counts = data?.counts ?? { present: 0, absent: 0, uncertain: 0, pending: 0 };
  const total = attendees.length;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="flex items-center gap-2 text-base">
          <Users className="h-4 w-4" />
          {t("meetings:section.title", { defaultValue: "Convocations réunion" })}
          {total > 0 && (
            <Badge variant="secondary" className="ml-2">
              {t("meetings:section.count", {
                defaultValue: "{{count}} convoqué(s)",
                count: total,
              })}
            </Badge>
          )}
        </CardTitle>
        {isStaff && (
          <ManageAttendeesDialog
            eventId={eventId}
            onDone={refresh}
            initialSelection={sourcesToSelection(attendees)}
          />
        )}
      </CardHeader>

      <CardContent className="space-y-4">
        {listQuery.isLoading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t("common.loading", { defaultValue: "Chargement…" })}
          </div>
        )}

        {!listQuery.isLoading && total === 0 && (
          <p className="text-sm text-muted-foreground">
            {isStaff
              ? t("meetings:empty.staff", {
                  defaultValue:
                    "Aucun convoqué — utilisez « Gérer les convoqués » pour inviter des groupes ou des personnes.",
                })
              : t("meetings:empty.member", {
                  defaultValue: "Vous n'êtes pas convoqué à cette réunion.",
                })}
          </p>
        )}

        {total > 0 && (
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <AttendancePill status="present" />
            <span className="tabular-nums">{counts.present}</span>
            <AttendancePill status="uncertain" />
            <span className="tabular-nums">{counts.uncertain}</span>
            <AttendancePill status="absent" />
            <span className="tabular-nums">{counts.absent}</span>
            <AttendancePill status="pending" />
            <span className="tabular-nums">{counts.pending}</span>
          </div>
        )}

        {!isStaff && data?.my_attendance && (
          <div className="flex items-center justify-between gap-2 rounded-md border p-3">
            <span className="text-sm">
              {t("meetings:self.prompt", { defaultValue: "Votre présence :" })}
            </span>
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
          <ul className="divide-y">
            {attendees.map((a) => {
              const chips = summarizeSources(a.sources);
              return (
                <li key={a.id} className="flex items-center gap-3 py-2">
                  <Avatar className="h-9 w-9">
                    {a.avatar_url && <AvatarImage src={a.avatar_url} alt="" />}
                    <AvatarFallback>{initials(a.full_name)}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">
                      {a.full_name ?? t("common.unknown", { defaultValue: "Inconnu" })}
                    </div>
                    <div className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                      {chips.map((chip) => (
                        <Badge key={chip.key} variant="outline" className="text-[10px]">
                          {chip.kind === "manual"
                            ? t("meetings:source.manual", {
                                defaultValue: "ajouté manuellement",
                              })
                            : chip.label}
                        </Badge>
                      ))}
                      {a.roles.slice(0, 3).map((r) => (
                        <Badge key={r} variant="secondary" className="text-[10px]">
                          {r}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <StatusButtons
                    value={a.status}
                    onChange={(status) =>
                      updateStatus.mutate({ user_id: a.user_id, status })
                    }
                    disabled={updateStatus.isPending}
                  />
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
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
  const btn = (
    s: AttendanceStatus,
    Icon: typeof Check,
    activeCls: string,
    label: string,
  ) => (
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
}: {
  eventId: string;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [pendingConfirm, setPendingConfirm] = useState<RequiresConfirmationEntry[]>([]);

  const ctxFn = useServerFn(getEventAudienceContext);
  const ctxQuery = useQuery({
    queryKey: ["meeting-audience-ctx", eventId],
    queryFn: () => ctxFn({ data: { event_id: eventId } }),
    enabled: open,
  });

  const { state, controls, buildAudiences } = useAudienceState();

  const audiences = useMemo(() => buildAudiences(eventId), [buildAudiences, eventId]);
  const manualUserIds = useMemo(
    () => state.preassigned.map((p) => p.user_id),
    [state.preassigned],
  );

  const previewFn = useServerFn(previewMeetingAudience);
  const previewQuery = useQuery({
    queryKey: ["meeting-preview", eventId, audiences, manualUserIds],
    queryFn: () =>
      previewFn({
        data: { event_id: eventId, audiences, manual_user_ids: manualUserIds },
      }),
    enabled: open && (audiences.length > 0 || manualUserIds.length > 0),
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
          defaultValue: "{{added}} ajouté(s), {{removed}} retiré(s)",
          added: r.added_count,
          removed: r.removed_count,
        }),
      );
      if (r.requires_confirmation.length > 0) {
        setPendingConfirm(r.requires_confirmation);
      } else {
        setPendingConfirm([]);
        setOpen(false);
        onDone();
      }
    },
    onError: (e: Error) =>
      toast.error(t(`meetings:errors.${e.message}`, { defaultValue: e.message })),
  });

  const hasSelection = audiences.length > 0 || manualUserIds.length > 0;

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button size="sm" variant="outline">
            <UserPlus className="mr-2 h-4 w-4" />
            {t("meetings:manage.cta", { defaultValue: "Gérer les convoqués" })}
          </Button>
        </DialogTrigger>
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {t("meetings:manage.title", { defaultValue: "Qui convoquer ?" })}
            </DialogTitle>
            <DialogDescription>
              {t("meetings:manage.desc", {
                defaultValue:
                  "Sélectionnez des groupes, des équipes ou des personnes. Chaque personne n'est convoquée qu'une fois.",
              })}
            </DialogDescription>
          </DialogHeader>

          {ctxQuery.isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t("common.loading", { defaultValue: "Chargement…" })}
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
            <Button
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={sync.isPending}
            >
              {t("common.cancel", { defaultValue: "Annuler" })}
            </Button>
            <Button
              onClick={() => sync.mutate([])}
              disabled={!hasSelection || sync.isPending}
            >
              {sync.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("meetings:manage.confirm", { defaultValue: "Convoquer" })}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={pendingConfirm.length > 0}
        onOpenChange={(o) => {
          if (!o) setPendingConfirm([]);
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {t("meetings:confirmRemove.title", {
                defaultValue: "Retirer des personnes ayant déjà répondu ?",
              })}
            </DialogTitle>
            <DialogDescription>
              {t("meetings:confirmRemove.desc", {
                defaultValue:
                  "Ces personnes ont déjà répondu ou été pointées. Les retirer supprimera aussi leur réponse et leur présence enregistrées. Elles restent convoquées tant que vous ne confirmez pas.",
              })}
            </DialogDescription>
          </DialogHeader>

          <ul className="divide-y">
            {pendingConfirm.map((p) => (
              <li key={p.user_id} className="flex items-center justify-between gap-2 py-2">
                <span className="text-sm">
                  {p.full_name ?? t("common.unknown", { defaultValue: "Inconnu" })}
                </span>
                {p.status && (
                  <AttendancePill status={p.status as AttendanceStatus} />
                )}
              </li>
            ))}
          </ul>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setPendingConfirm([])}
              disabled={sync.isPending}
            >
              {t("meetings:confirmRemove.keep", { defaultValue: "Les conserver" })}
            </Button>
            <Button
              variant="destructive"
              onClick={() => sync.mutate(pendingConfirm.map((p) => p.user_id))}
              disabled={sync.isPending}
            >
              {sync.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("meetings:confirmRemove.confirm", { defaultValue: "Retirer quand même" })}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
