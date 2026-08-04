import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Sparkles, Settings2, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CampWizard } from "./CampWizard";
import { createClubCamp } from "@/lib/camps.functions";

type Mode = "chooser" | "wizard" | "classic";

interface Props {
  clubId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved: () => void;
}

export function CampCreateChooser({ clubId, open, onOpenChange, onSaved }: Props) {
  const { t } = useTranslation("camps");
  const navigate = useNavigate();
  const qc = useQueryClient();
  const createFn = useServerFn(createClubCamp);
  const [mode, setMode] = useState<Mode>("chooser");
  const [draft, setDraft] = useState({
    title: "",
    startDate: "",
    endDate: "",
    capacity: 20,
  });

  useEffect(() => {
    if (!open) {
      setMode("chooser");
      setDraft({ title: "", startDate: "", endDate: "", capacity: 20 });
    }
  }, [open]);

  const createMut = useMutation({
    mutationFn: () =>
      createFn({
        data: {
          clubId,
          title: draft.title.trim(),
          startDate: new Date(draft.startDate).toISOString(),
          endDate: new Date(draft.endDate).toISOString(),
          capacity: Number(draft.capacity),
        },
      }),
    onSuccess: (res) => {
      onSaved();
      qc.invalidateQueries({ queryKey: ["club-camps", clubId] });
      qc.invalidateQueries({ queryKey: ["home-camps", clubId] });
      onOpenChange(false);
      navigate({ to: "/admin/camps/$campId", params: { campId: res.id } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={mode === "wizard" ? "max-w-md p-0 overflow-hidden gap-0" : "max-w-md"}
        hideClose={mode === "wizard"}
      >
        {mode === "chooser" && (
          <>
            <DialogHeader>
              <DialogTitle>{t("chooser.title")}</DialogTitle>
              <DialogDescription>{t("chooser.subtitle")}</DialogDescription>
            </DialogHeader>
            <div className="grid gap-2 pt-2">
              <DoorButton
                icon={<Sparkles className="h-5 w-5" />}
                title={t("chooser.assistant")}
                hint={t("chooser.assistantHint")}
                primary
                onClick={() => setMode("wizard")}
              />
              <DoorButton
                icon={<Settings2 className="h-5 w-5" />}
                title={t("chooser.classic")}
                hint={t("chooser.classicHint")}
                onClick={() => setMode("classic")}
              />
            </div>
          </>
        )}

        {mode === "wizard" && (
          <>
            <DialogHeader className="sr-only">
              <DialogTitle>{t("wizard.title")}</DialogTitle>
              <DialogDescription>{t("chooser.assistantHint")}</DialogDescription>
            </DialogHeader>
            <CampWizard
              clubId={clubId}
              onClose={() => onOpenChange(false)}
              onCreated={() => {
                onSaved();
                qc.invalidateQueries({ queryKey: ["club-camps", clubId] });
                qc.invalidateQueries({ queryKey: ["home-camps", clubId] });
              }}
            />
          </>
        )}

        {mode === "classic" && (
          <>
            <DialogHeader>
              <DialogTitle>{t("list.newTitle")}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">{t("form.title")}</label>
                <Input
                  data-testid="camp-title-input"
                  value={draft.title}
                  onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                  placeholder={t("form.titlePlaceholder")}
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">{t("form.startDate")}</label>
                  <Input
                    type="date"
                    value={draft.startDate}
                    onChange={(e) => setDraft({ ...draft, startDate: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">{t("form.endDate")}</label>
                  <Input
                    type="date"
                    value={draft.endDate}
                    onChange={(e) => setDraft({ ...draft, endDate: e.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">{t("form.capacity")}</label>
                <Input
                  type="number"
                  min={1}
                  value={draft.capacity}
                  onChange={(e) => setDraft({ ...draft, capacity: Number(e.target.value) })}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setMode("chooser")}>
                {t("wizard.back")}
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
                {t("list.create")}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function DoorButton({
  icon,
  title,
  hint,
  primary,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  hint?: string;
  primary?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "group relative flex items-start gap-3 overflow-hidden rounded-2xl border p-4 text-left transition-all duration-200 hover:-translate-y-0.5 active:scale-[0.99] " +
        (primary
          ? "border-primary/40 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent hover:border-primary"
          : "border-border bg-card hover:border-primary/40 hover:bg-muted/40")
      }
    >
      {primary && (
        <span
          aria-hidden
          className="absolute left-0 top-0 bottom-0 w-[3px] rounded-r bg-gradient-to-b from-primary to-primary/70"
        />
      )}
      <div
        className={
          "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl " +
          (primary
            ? "bg-gradient-to-br from-primary to-primary/80 text-primary-foreground"
            : "bg-primary/10 text-primary")
        }
      >
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="font-semibold text-sm leading-tight">{title}</div>
        {hint && <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{hint}</p>}
      </div>
    </button>
  );
}
