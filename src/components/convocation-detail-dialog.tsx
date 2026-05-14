import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { fmt } from "@/lib/date-locale";
import { Bell, Mail, MessageSquare, Smartphone, Send, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AttendancePill } from "@/components/attendance-pill";
import { supabase } from "@/integrations/supabase/client";

type Convocation = {
  id: string;
  status: string;
  comment: string | null;
  player_id: string;
  players?: {
    first_name?: string | null;
    last_name?: string | null;
    jersey_number?: number | null;
    photo_url?: string | null;
    preferred_position?: string | null;
  } | null;
};

type Reminder = {
  id: string;
  channel: string;
  sent_at: string;
};

const channelIcon = (ch: string) => {
  switch (ch) {
    case "email":
      return Mail;
    case "sms":
      return MessageSquare;
    case "whatsapp":
      return Smartphone;
    default:
      return Bell;
  }
};

export function ConvocationDetailDialog({
  open,
  onOpenChange,
  convocation,
  eventConvocationsSentAt,
  isCoach,
  onRemind,
  onCancel,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  convocation: Convocation | null;
  eventConvocationsSentAt?: string | null;
  isCoach: boolean;
  onRemind?: (convocationId: string) => void;
  onCancel?: (convocationId: string) => void;
}) {
  const { t } = useTranslation();

  const { data: meta } = useQuery({
    queryKey: ["convocation-meta", convocation?.id],
    enabled: !!convocation && open,
    queryFn: async () => {
      const [{ data: conv }, { data: rems }] = await Promise.all([
        supabase
          .from("convocations")
          .select("created_at, responded_at")
          .eq("id", convocation!.id)
          .single(),
        supabase
          .from("reminders")
          .select("id, channel, sent_at")
          .eq("convocation_id", convocation!.id)
          .order("sent_at", { ascending: false }),
      ]);
      return {
        created_at: conv?.created_at as string | undefined,
        responded_at: conv?.responded_at as string | undefined,
        reminders: (rems ?? []) as Reminder[],
      };
    },
  });

  if (!convocation) return null;
  const p = convocation.players ?? {};
  const sentAt = meta?.created_at ?? eventConvocationsSentAt ?? null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-muted overflow-hidden shrink-0">
              {p.photo_url ? (
                <img src={p.photo_url} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="h-full w-full flex items-center justify-center text-xs font-semibold text-muted-foreground">
                  {(p.first_name?.[0] ?? "") + (p.last_name?.[0] ?? "")}
                </div>
              )}
            </div>
            <span>
              {p.first_name} {p.last_name}
              {p.jersey_number ? (
                <span className="text-muted-foreground font-normal"> · #{p.jersey_number}</span>
              ) : null}
            </span>
          </DialogTitle>
          {p.preferred_position && (
            <DialogDescription>{p.preferred_position}</DialogDescription>
          )}
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center justify-between rounded-xl border p-3">
            <span className="text-sm text-muted-foreground">{t("attendance.status")}</span>
            <AttendancePill status={convocation.status as any} />
          </div>

          {convocation.comment && (
            <div className="rounded-xl border bg-muted/50 p-3">
              <p className="text-xs text-muted-foreground mb-1">{t("attendance.comment")}</p>
              <p className="text-sm italic">"{convocation.comment}"</p>
            </div>
          )}

          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t("attendance.history")}
            </p>
            <ul className="space-y-1.5">
              {sentAt && (
                <li className="flex items-center gap-2 text-sm">
                  <Send className="h-3.5 w-3.5 text-primary" />
                  <span className="text-muted-foreground">
                    {t("events.convocationsSent")}
                  </span>
                  <span className="ml-auto tabular-nums text-xs">
                    {fmt(new Date(sentAt), "d MMM HH:mm")}
                  </span>
                </li>
              )}
              {meta?.responded_at && (
                <li className="flex items-center gap-2 text-sm">
                  <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                  <span className="text-muted-foreground">{t("attendance.respondedAt")}</span>
                  <span className="ml-auto tabular-nums text-xs">
                    {fmt(new Date(meta.responded_at), "d MMM HH:mm")}
                  </span>
                </li>
              )}
              {(meta?.reminders ?? []).map((r) => {
                const Icon = channelIcon(r.channel);
                return (
                  <li key={r.id} className="flex items-center gap-2 text-sm">
                    <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-muted-foreground">
                      {t("attendance.reminderVia", { channel: t(`channels.${r.channel}`, r.channel) })}
                    </span>
                    <span className="ml-auto tabular-nums text-xs">
                      {fmt(new Date(r.sent_at), "d MMM HH:mm")}
                    </span>
                  </li>
                );
              })}
              {sentAt == null && (meta?.reminders?.length ?? 0) === 0 && (
                <li className="text-sm text-muted-foreground">{t("attendance.noActivity")}</li>
              )}
            </ul>
          </div>
        </div>

        {isCoach && (
          <DialogFooter className="gap-2 sm:gap-2">
            {convocation.status === "pending" && onRemind && (
              <Button
                variant="outline"
                onClick={() => onRemind(convocation.id)}
                className="gap-2"
              >
                <Bell className="h-4 w-4" />
                {t("attendance.remind")}
              </Button>
            )}
            {onCancel && (
              <Button
                variant="outline"
                onClick={() => onCancel(convocation.id)}
                className="gap-2 text-destructive hover:text-destructive"
              >
                <X className="h-4 w-4" />
                {t("attendance.cancelConvocation")}
              </Button>
            )}
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
