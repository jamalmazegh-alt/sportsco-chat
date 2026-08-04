import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { WizardOptionCard } from "@/components/wizard/wizard-primitives";
import { format } from "date-fns";
import { fr as frLocale, enUS } from "date-fns/locale";
import { toast } from "sonner";
import {
  Loader2,
  Palmtree,
  HeartPulse,
  GraduationCap,
  BookOpen,
  Users,
  Briefcase,
  HelpCircle,
  CheckCircle2,
  CircleDashed,
  Eye,
  EyeOff,
  Calendar as CalendarIcon,
} from "lucide-react";

type Reason = "vacation" | "injury" | "school" | "training" | "family" | "work" | "other";
type Certainty = "confirmed" | "tentative";
type Visibility = "staff" | "admins_only";

const REASONS: Array<{ value: Reason; Icon: typeof Palmtree }> = [
  { value: "vacation", Icon: Palmtree },
  { value: "injury", Icon: HeartPulse },
  { value: "school", Icon: BookOpen },
  { value: "training", Icon: GraduationCap },
  { value: "family", Icon: Users },
  { value: "work", Icon: Briefcase },
  { value: "other", Icon: HelpCircle },
];

export interface StaffAvailabilityEditPayload {
  id: string;
  start_date: string;
  end_date: string;
  reason: string;
  certainty: string;
  visibility: string;
  comment: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated?: () => void;
  /** When provided, drawer runs in EDIT mode and updates this row. */
  availability?: StaffAvailabilityEditPayload | null;
}

export function DeclareStaffAbsenceDrawer({ open, onOpenChange, onCreated, availability }: Props) {
  const { t, i18n } = useTranslation();
  const dateLocale = i18n.language?.startsWith("fr") ? frLocale : enUS;

  const { user, activeClubId } = useAuth();
  const qc = useQueryClient();

  const editing = !!availability;

  const today = new Date().toISOString().slice(0, 10);
  const todayDate = new Date(`${today}T00:00:00`);
  const [range, setRange] = useState<{ from?: Date; to?: Date }>({
    from: todayDate,
    to: todayDate,
  });
  const [reason, setReason] = useState<Reason>("vacation");
  const [certainty, setCertainty] = useState<Certainty>("confirmed");
  const [visibility, setVisibility] = useState<Visibility>("staff");
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (availability) {
      setRange({
        from: new Date(`${availability.start_date}T00:00:00`),
        to: new Date(`${availability.end_date}T00:00:00`),
      });
      setReason((availability.reason as Reason) ?? "vacation");
      setCertainty((availability.certainty as Certainty) ?? "confirmed");
      setVisibility((availability.visibility as Visibility) ?? "staff");
      setComment(availability.comment ?? "");
    } else {
      const t0 = new Date(`${today}T00:00:00`);
      setRange({ from: t0, to: t0 });
      setReason("vacation");
      setCertainty("confirmed");
      setVisibility("staff");
      setComment("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, availability?.id]);

  async function onSubmit() {
    if (!user || !activeClubId) {
      toast.error(t("staffAvailability.errors.noClub"));
      return;
    }
    if (!range.from) {
      toast.error(t("availability.errors.invalidRange"));
      return;
    }
    const startDate = format(range.from, "yyyy-MM-dd");
    const endDate = format(range.to ?? range.from, "yyyy-MM-dd");
    if (endDate < startDate) {
      toast.error(t("availability.errors.invalidRange"));
      return;
    }
    setBusy(true);
    try {
      // Overlap check — block if another ACTIVE row overlaps [start,end].
      let q = supabase
        .from("staff_availabilities")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("club_id", activeClubId)
        .eq("status", "active")
        .lte("start_date", endDate)
        .gte("end_date", startDate);
      if (editing) q = q.neq("id", availability!.id);
      const { count, error: overlapErr } = await q;
      if (overlapErr) throw overlapErr;
      if ((count ?? 0) > 0) {
        toast.error(t("availability.errors.overlap"));
        setBusy(false);
        return;
      }

      if (editing) {
        const { error } = await supabase
          .from("staff_availabilities")
          .update({
            start_date: startDate,
            end_date: endDate,
            reason,
            certainty,
            visibility,
            comment: comment.trim() || null,
          })
          .eq("id", availability!.id);
        if (error) throw error;
        toast.success(t("staffAvailability.updated"));
      } else {
        const { error } = await supabase.from("staff_availabilities").insert({
          user_id: user.id,
          created_by_user_id: user.id,
          club_id: activeClubId,
          start_date: startDate,
          end_date: endDate,
          reason,
          certainty,
          visibility,
          comment: comment.trim() || null,
        });
        if (error) throw error;
        toast.success(t("staffAvailability.saved"));
      }
      qc.invalidateQueries({ queryKey: ["my-staff-availabilities"] });
      qc.invalidateQueries({ queryKey: ["staff-availabilities"] });
      onCreated?.();
      onOpenChange(false);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Error";
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader className="pt-[env(safe-area-inset-top)]">
          <SheetTitle>
            {editing ? t("staffAvailability.edit") : t("staffAvailability.declare")}
          </SheetTitle>
          <SheetDescription>{t("staffAvailability.drawerHint")}</SheetDescription>
        </SheetHeader>

        <div className="mt-4 space-y-4">
          <div className="space-y-1.5">
            <Label>{t("availability.dates")}</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  data-testid="availability-range-trigger"
                  variant="outline"
                  className="h-11 w-full justify-start font-normal"
                >
                  <CalendarIcon className="h-4 w-4" />
                  {range.from ? (
                    !range.to || range.from.getTime() === range.to.getTime() ? (
                      <span>{format(range.from, "EEE d MMM", { locale: dateLocale })}</span>
                    ) : (
                      <span>
                        {format(range.from, "EEE d MMM", { locale: dateLocale })}
                        {" → "}
                        {format(range.to, "EEE d MMM", { locale: dateLocale })}
                      </span>
                    )
                  ) : (
                    t("availability.pickRange")
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="range"
                  numberOfMonths={1}
                  selected={range.from ? (range as { from: Date; to?: Date }) : undefined}
                  onSelect={(next: { from?: Date; to?: Date } | undefined, clickedDay?: Date) => {
                    if (range.from && range.to && clickedDay) {
                      setRange({ from: clickedDay, to: undefined });
                      return;
                    }
                    setRange(next ?? {});
                  }}
                  initialFocus
                  className="p-3 pointer-events-auto"
                />
              </PopoverContent>
            </Popover>
          </div>

          <div className="space-y-1.5">
            <Label>{t("availability.reasonLabel")}</Label>
            <div className="grid grid-cols-2 gap-2">
              {REASONS.map(({ value, Icon }) => (
                <WizardOptionCard
                  key={value}
                  active={reason === value}
                  onClick={() => setReason(value)}
                  icon={<Icon className="h-4 w-4" />}
                  title={t(`availability.reason.${value}`, { defaultValue: value })}
                />
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{t("staffAvailability.certaintyLabel")}</Label>
              <Select value={certainty} onValueChange={(v) => setCertainty(v as Certainty)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="confirmed">
                    <span className="inline-flex items-center gap-2">
                      <CheckCircle2 className="h-3.5 w-3.5 opacity-70" />
                      {t("staffAvailability.certainty.confirmed")}
                    </span>
                  </SelectItem>
                  <SelectItem value="tentative">
                    <span className="inline-flex items-center gap-2">
                      <CircleDashed className="h-3.5 w-3.5 opacity-70" />
                      {t("staffAvailability.certainty.tentative")}
                    </span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{t("staffAvailability.visibility")}</Label>
              <Select value={visibility} onValueChange={(v) => setVisibility(v as Visibility)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="staff">
                    <span className="inline-flex items-center gap-2">
                      <Eye className="h-3.5 w-3.5 opacity-70" />
                      {t("staffAvailability.visibilityStaff")}
                    </span>
                  </SelectItem>
                  <SelectItem value="admins_only">
                    <span className="inline-flex items-center gap-2">
                      <EyeOff className="h-3.5 w-3.5 opacity-70" />
                      {t("staffAvailability.visibilityAdminsOnly")}
                    </span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>{t("availability.comment")}</Label>
            <Textarea
              value={comment}
              onChange={(e) => setComment(e.target.value.slice(0, 300))}
              rows={3}
              maxLength={300}
              placeholder={t("availability.commentPlaceholder")}
            />
            <p className="text-[11px] text-muted-foreground">
              {t("staffAvailability.commentHint")}
            </p>
          </div>

          <Button
            type="button"
            className="w-full h-11"
            disabled={busy || !activeClubId}
            onClick={onSubmit}
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : editing ? (
              t("common.saveChanges")
            ) : (
              t("common.save")
            )}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
