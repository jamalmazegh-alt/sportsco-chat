import { createFileRoute, Link, Navigate, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import { useState } from "react";
import i18nInstance from "@/lib/i18n";
import { toast } from "sonner";
import { Loader2, Plus, MapPin, CalendarDays, Users } from "lucide-react";
import { useAuth, useMyRoles } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { listClubCamps, createClubCamp, type ClubCamp } from "@/lib/camps.functions";

export const Route = createFileRoute("/_authenticated/admin/camps/")({
  component: CampsListPage,
  head: () => ({
    meta: [
      {
        title: i18nInstance.t("camps:meta.list.title", { defaultValue: "Stages du club – Clubero" }),
      },
      {
        name: "description",
        content: i18nInstance.t("camps:meta.list.description", {
          defaultValue: "Créez, publiez et gérez les stages proposés par votre club.",
        }),
      },
    ],
  }),
});

const MANAGER_ROLES = new Set(["admin", "dirigeant", "coach"]);

function statusTone(status: ClubCamp["status"]): string {
  switch (status) {
    case "published":
      return "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30";
    case "closed":
      return "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30";
    case "archived":
      return "bg-muted text-muted-foreground border-border";
    default:
      return "bg-primary/10 text-primary border-primary/30";
  }
}

function CampsListPage() {
  const { t } = useTranslation("camps");
  const { activeClubId } = useAuth();
  const roles = useMyRoles();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const canManage = roles.some((r) => MANAGER_ROLES.has(r));
  const listFn = useServerFn(listClubCamps);
  const createFn = useServerFn(createClubCamp);

  const { data: camps, isLoading } = useQuery({
    queryKey: ["club-camps", activeClubId],
    queryFn: () => listFn({ data: { clubId: activeClubId!, includeArchived: true } }),
    enabled: !!activeClubId,
  });

  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState({
    title: "",
    startDate: "",
    endDate: "",
    capacity: 20,
  });

  const createMut = useMutation({
    mutationFn: () =>
      createFn({
        data: {
          clubId: activeClubId!,
          title: draft.title.trim(),
          startDate: new Date(draft.startDate).toISOString(),
          endDate: new Date(draft.endDate).toISOString(),
          capacity: Number(draft.capacity),
        },
      }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["club-camps", activeClubId] });
      setCreating(false);
      setDraft({ title: "", startDate: "", endDate: "", capacity: 20 });
      navigate({ to: "/admin/camps/$campId", params: { campId: res.id } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!canManage) return <Navigate to="/profile" replace />;

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{t("list.title", { defaultValue: "Stages du club" })}</h1>
          <p className="text-sm text-muted-foreground">
            {t("list.subtitle", {
              defaultValue: "Créez et publiez les stages proposés par votre club.",
            })}
          </p>
        </div>
        <Button onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4 mr-1" />
          {t("list.new", { defaultValue: "Nouveau stage" })}
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : (camps ?? []).length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          {t("list.empty", { defaultValue: "Aucun stage pour le moment." })}
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {(camps ?? []).map((c) => (
            <li key={c.id}>
              <Link
                to="/admin/camps/$campId"
                params={{ campId: c.id }}
                className="block rounded-xl border border-border bg-card p-4 hover:bg-muted/30 transition"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-semibold truncate">{c.title}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <CalendarDays className="h-3.5 w-3.5" />
                        {new Date(c.start_date).toLocaleDateString()} →{" "}
                        {new Date(c.end_date).toLocaleDateString()}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Users className="h-3.5 w-3.5" />
                        {c.capacity}
                      </span>
                      {c.venue_id && (
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="h-3.5 w-3.5" />
                          {t("list.hasVenue", { defaultValue: "Lieu défini" })}
                        </span>
                      )}
                    </div>
                  </div>
                  <Badge variant="outline" className={statusTone(c.status)}>
                    {t(`status.${c.status}`, { defaultValue: c.status })}
                  </Badge>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("list.newTitle", { defaultValue: "Nouveau stage" })}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">
                {t("form.title", { defaultValue: "Titre" })}
              </label>
              <Input
                value={draft.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                placeholder={t("form.titlePlaceholder", { defaultValue: "Stage de Pâques U9-U11" })}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">
                  {t("form.startDate", { defaultValue: "Début" })}
                </label>
                <Input
                  type="date"
                  value={draft.startDate}
                  onChange={(e) => setDraft({ ...draft, startDate: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">
                  {t("form.endDate", { defaultValue: "Fin" })}
                </label>
                <Input
                  type="date"
                  value={draft.endDate}
                  onChange={(e) => setDraft({ ...draft, endDate: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">
                {t("form.capacity", { defaultValue: "Capacité" })}
              </label>
              <Input
                type="number"
                min={1}
                value={draft.capacity}
                onChange={(e) => setDraft({ ...draft, capacity: Number(e.target.value) })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreating(false)}>
              {t("common.cancel", { defaultValue: "Annuler" })}
            </Button>
            <Button
              onClick={() => createMut.mutate()}
              disabled={
                createMut.isPending ||
                !draft.title.trim() ||
                !draft.startDate ||
                !draft.endDate ||
                !draft.capacity
              }
            >
              {createMut.isPending && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              {t("list.create", { defaultValue: "Créer le brouillon" })}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
