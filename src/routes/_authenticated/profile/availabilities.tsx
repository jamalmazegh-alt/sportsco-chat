import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  ChevronLeft,
  Plus,
  Trash2,
  Pencil,
  CalendarOff,
  Palmtree,
  HeartPulse,
  GraduationCap,
  BookOpen,
  Users,
  Briefcase,
  HelpCircle,
  CircleDashed,
  CheckCircle2,
  EyeOff,
} from "lucide-react";
import i18n from "@/lib/i18n";
import {
  DeclareStaffAbsenceDrawer,
  type StaffAvailabilityEditPayload,
} from "@/components/declare-staff-absence-drawer";

export const Route = createFileRoute("/_authenticated/profile/availabilities")({
  component: StaffAvailabilitiesPage,
  head: () => ({
    meta: [
      {
        title: i18n.t("staffAvailability.pageTitle", {
          defaultValue: "Mes indisponibilités — Clubero",
        }),
      },
      {
        name: "description",
        content: i18n.t("staffAvailability.pageDescription", {
          defaultValue:
            "Déclarez vos périodes d'indisponibilité pour toutes vos équipes dans le club actif.",
        }),
      },
    ],
  }),
});

type Row = {
  id: string;
  club_id: string;
  start_date: string;
  end_date: string;
  reason: string;
  certainty: string;
  visibility: string;
  comment: string | null;
  status: string;
};

const REASON_ICONS: Record<string, typeof Palmtree> = {
  vacation: Palmtree,
  injury: HeartPulse,
  school: BookOpen,
  training: GraduationCap,
  family: Users,
  work: Briefcase,
  other: HelpCircle,
};

function StaffAvailabilitiesPage() {
  const { t } = useTranslation();
  const { user, activeClubId, memberships } = useAuth();
  const qc = useQueryClient();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<StaffAvailabilityEditPayload | null>(null);

  const club = memberships.find((m) => m.club_id === activeClubId)?.club;

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["my-staff-availabilities", user?.id, activeClubId],
    enabled: !!user && !!activeClubId,
    queryFn: async (): Promise<Row[]> => {
      const today = new Date().toISOString().slice(0, 10);
      const { data, error } = await supabase
        .from("staff_availabilities")
        .select(
          "id, club_id, start_date, end_date, reason, certainty, visibility, comment, status",
        )
        .eq("user_id", user!.id)
        .eq("club_id", activeClubId!)
        .neq("status", "cancelled")
        .gte("end_date", today)
        .order("start_date", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  async function cancel(id: string) {
    const ok = window.confirm(
      t("staffAvailability.cancelConfirm", {
        defaultValue: "Supprimer cette indisponibilité ?",
      }),
    );
    if (!ok) return;
    const { error } = await supabase
      .from("staff_availabilities")
      .update({ status: "cancelled" })
      .eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(
      t("staffAvailability.cancelled", { defaultValue: "Indisponibilité supprimée" }),
    );
    qc.invalidateQueries({ queryKey: ["my-staff-availabilities"] });
    qc.invalidateQueries({ queryKey: ["staff-availabilities"] });
  }

  function fmt(d: string) {
    return new Date(d + "T00:00:00").toLocaleDateString();
  }

  return (
    <div className="px-5 pt-6 pb-8 space-y-5">
      <div className="flex items-center gap-2">
        <Link
          to="/profile"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" />
          {t("common.back", { defaultValue: "Retour" })}
        </Link>
      </div>

      <div>
        <h1 className="text-2xl font-semibold">
          {t("staffAvailability.title", { defaultValue: "Mes indisponibilités" })}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("staffAvailability.subtitle", {
            defaultValue:
              "Périodes où tu ne seras pas disponible pour encadrer tes équipes.",
          })}
          {club?.name ? (
            <>
              {" "}
              <span className="font-medium text-foreground">· {club.name}</span>
            </>
          ) : null}
        </p>
      </div>

      <Button
        className="w-full h-11"
        onClick={() => {
          setEditing(null);
          setDrawerOpen(true);
        }}
      >
        <Plus className="h-4 w-4" />
        {t("staffAvailability.declareCta", { defaultValue: "Déclarer une indisponibilité" })}
      </Button>

      {isLoading ? (
        <div className="text-sm text-muted-foreground">
          {t("common.loading", { defaultValue: "Chargement..." })}
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center">
          <CalendarOff className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-2 text-sm text-muted-foreground">
            {t("staffAvailability.empty", {
              defaultValue: "Aucune indisponibilité déclarée à venir.",
            })}
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => {
            const Icon = REASON_ICONS[r.reason] ?? HelpCircle;
            return (
              <li
                key={r.id}
                className="rounded-2xl border border-border bg-card p-4 flex items-start gap-3"
              >
                <div className="h-10 w-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                  <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center flex-wrap gap-2">
                    <span className="text-sm font-medium">
                      {fmt(r.start_date)}
                      {r.end_date !== r.start_date ? ` → ${fmt(r.end_date)}` : ""}
                    </span>
                    {r.certainty === "tentative" && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-400">
                        <CircleDashed className="h-3 w-3" />
                        {t("staffAvailability.certainty.tentative", {
                          defaultValue: "Possible",
                        })}
                      </span>
                    )}
                    {r.certainty === "confirmed" && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-400">
                        <CheckCircle2 className="h-3 w-3" />
                        {t("staffAvailability.certainty.confirmed", {
                          defaultValue: "Confirmée",
                        })}
                      </span>
                    )}
                    {r.visibility === "admins_only" && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                        <EyeOff className="h-3 w-3" />
                        {t("staffAvailability.visibility.admins_only", {
                          defaultValue: "Admins uniquement",
                        })}
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {t(`availability.reason.${r.reason}`, { defaultValue: r.reason })}
                  </div>
                  {r.comment && (
                    <div className="mt-1 text-xs text-foreground/80 line-clamp-3">
                      {r.comment}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => cancel(r.id)}
                  className="p-2 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                  aria-label={t("common.delete", { defaultValue: "Supprimer" })}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <DeclareStaffAbsenceDrawer open={drawerOpen} onOpenChange={setDrawerOpen} />
    </div>
  );
}
