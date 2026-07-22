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
  Users,
  Briefcase,
  HelpCircle,
  CheckCircle2,
  CircleDashed,
  Eye,
  EyeOff,
  Calendar as CalendarIcon,
} from "lucide-react";


type Reason = "vacation" | "injury" | "school" | "family" | "work" | "other";
type Certainty = "confirmed" | "tentative";
type Visibility = "staff" | "admins_only";

const REASONS: Array<{ value: Reason; Icon: typeof Palmtree }> = [
  { value: "vacation", Icon: Palmtree },
  { value: "injury", Icon: HeartPulse },
  { value: "school", Icon: GraduationCap },
  { value: "family", Icon: Users },
  { value: "work", Icon: Briefcase },
  { value: "other", Icon: HelpCircle },
];

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated?: () => void;
}

/**
 * Coach self-declaration of unavailability (Lot 2 — staff availabilities).
 *
 * L'indispo est globale au coach dans le club actif (activeClubId) et
 * couvre TOUTES les équipes qu'il/elle entraîne dans ce club. RLS
 * autorise l'insert par owner (auth.uid() = user_id = created_by).
 */
export function DeclareStaffAbsenceDrawer({ open, onOpenChange, onCreated }: Props) {
  const { t, i18n } = useTranslation();
  const dateLocale = i18n.language?.startsWith("fr") ? frLocale : enUS;

  const { user, activeClubId } = useAuth();
  const qc = useQueryClient();

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
    if (open) {
      const t0 = new Date(`${today}T00:00:00`);
      setRange({ from: t0, to: t0 });
      setReason("vacation");
      setCertainty("confirmed");
      setVisibility("staff");
      setComment("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);


  async function onSubmit() {
    if (!user || !activeClubId) {
      toast.error(
        t("staffAvailability.errors.noClub", {
          defaultValue: "Aucun club actif — impossible d'enregistrer.",
        }),
      );
      return;
    }
    if (endDate < startDate) {
      toast.error(
        t("availability.errors.invalidRange", { defaultValue: "Dates invalides." }),
      );
      return;
    }
    setBusy(true);
    try {
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
      toast.success(
        t("staffAvailability.saved", { defaultValue: "Indisponibilité enregistrée" }),
      );
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
        <SheetHeader>
          <SheetTitle>
            {t("staffAvailability.declare", {
              defaultValue: "Déclarer une indisponibilité",
            })}
          </SheetTitle>
          <SheetDescription>
            {t("staffAvailability.drawerHint", {
              defaultValue:
                "S'applique à toutes tes équipes dans le club actif. Le staff sera informé.",
            })}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 space-y-4">
          <div className="space-y-1.5">
            <Label>{t("availability.dates", { defaultValue: "Période d'absence" })}</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="h-11 w-full justify-start font-normal">
                  <CalendarIcon className="h-4 w-4" />
                  {startDate && endDate ? (
                    startDate === endDate ? (
                      <span>
                        {format(new Date(`${startDate}T00:00:00`), "EEE d MMM", {
                          locale: dateLocale,
                        })}
                      </span>
                    ) : (
                      <span>
                        {format(new Date(`${startDate}T00:00:00`), "EEE d MMM", {
                          locale: dateLocale,
                        })}
                        {" → "}
                        {format(new Date(`${endDate}T00:00:00`), "EEE d MMM", {
                          locale: dateLocale,
                        })}
                      </span>
                    )
                  ) : (
                    t("availability.pickRange", { defaultValue: "Sélectionner une période" })
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="range"
                  numberOfMonths={1}
                  selected={{
                    from: startDate ? new Date(`${startDate}T00:00:00`) : undefined,
                    to: endDate ? new Date(`${endDate}T00:00:00`) : undefined,
                  }}
                  onSelect={(range: { from?: Date; to?: Date } | undefined) => {
                    if (!range) return;
                    if (range.from) {
                      const s = format(range.from, "yyyy-MM-dd");
                      setStartDate(s);
                      setEndDate(range.to ? format(range.to, "yyyy-MM-dd") : s);
                    }
                  }}
                  initialFocus
                  className="p-3 pointer-events-auto"
                />
              </PopoverContent>
            </Popover>
          </div>

          <div className="space-y-1.5">
            <Label>{t("availability.reasonLabel", { defaultValue: "Motif" })}</Label>
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
              <Label>
                {t("staffAvailability.certainty", { defaultValue: "Certitude" })}
              </Label>
              <Select value={certainty} onValueChange={(v) => setCertainty(v as Certainty)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="confirmed">
                    <span className="inline-flex items-center gap-2">
                      <CheckCircle2 className="h-3.5 w-3.5 opacity-70" />
                      {t("staffAvailability.certainty.confirmed", {
                        defaultValue: "Confirmée",
                      })}
                    </span>
                  </SelectItem>
                  <SelectItem value="tentative">
                    <span className="inline-flex items-center gap-2">
                      <CircleDashed className="h-3.5 w-3.5 opacity-70" />
                      {t("staffAvailability.certainty.tentative", {
                        defaultValue: "Possible",
                      })}
                    </span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>
                {t("staffAvailability.visibility", { defaultValue: "Visibilité" })}
              </Label>
              <Select
                value={visibility}
                onValueChange={(v) => setVisibility(v as Visibility)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="staff">
                    <span className="inline-flex items-center gap-2">
                      <Eye className="h-3.5 w-3.5 opacity-70" />
                      {t("staffAvailability.visibility.staff", {
                        defaultValue: "Staff du club",
                      })}
                    </span>
                  </SelectItem>
                  <SelectItem value="admins_only">
                    <span className="inline-flex items-center gap-2">
                      <EyeOff className="h-3.5 w-3.5 opacity-70" />
                      {t("staffAvailability.visibility.admins_only", {
                        defaultValue: "Admins uniquement",
                      })}
                    </span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>{t("availability.comment", { defaultValue: "Commentaire" })}</Label>
            <Textarea
              value={comment}
              onChange={(e) => setComment(e.target.value.slice(0, 300))}
              rows={3}
              maxLength={300}
              placeholder={t("availability.commentPlaceholder", {
                defaultValue: "Optionnel",
              })}
            />
            <p className="text-[11px] text-muted-foreground">
              {t("staffAvailability.commentHint", {
                defaultValue:
                  "Le motif et le commentaire ne sont visibles que par les admins (ou tout le staff selon la visibilité choisie).",
              })}
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
            ) : (
              t("common.save", { defaultValue: "Enregistrer" })
            )}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
