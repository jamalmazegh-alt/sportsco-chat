import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import { format, addDays } from "date-fns";
import { toast } from "sonner";
import {
  ChevronLeft,
  X,
  Tent,
  CalendarDays,
  Users,
  MapPin,
  Tag,
  Loader2,
  Plus,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { WizardProgress } from "@/components/wizard/wizard-primitives";
import { VenueFacilityPicker } from "@/components/camps/venue-facility-picker";
import {
  createClubCamp,
  updateClubCamp,
  upsertCampAgeGroup,
} from "@/lib/camps.functions";
import { cn } from "@/lib/utils";

type Step = "title" | "dates" | "capacity" | "venue" | "ageGroups" | "summary";

interface Props {
  clubId: string;
  onClose: () => void;
  onCreated: (campId: string) => void;
}

interface WizardState {
  title: string;
  startDate: string;
  endDate: string;
  deadline: string;
  capacity: number;
  price: string;
  venueId: string | null;
  facilityId: string | null;
  externalLocation: string;
  ageGroups: Array<{ label: string; min: number | null; max: number | null }>;
}

function defaultState(): WizardState {
  const today = new Date();
  const start = addDays(today, 21);
  const end = addDays(start, 4);
  return {
    title: "",
    startDate: format(start, "yyyy-MM-dd"),
    endDate: format(end, "yyyy-MM-dd"),
    deadline: "",
    capacity: 20,
    price: "",
    venueId: null,
    facilityId: null,
    externalLocation: "",
    ageGroups: [],
  };
}

const STEP_ORDER: Step[] = ["title", "dates", "capacity", "venue", "ageGroups", "summary"];

export function CampWizard({ clubId, onClose, onCreated }: Props) {
  const { t } = useTranslation("camps");
  const navigate = useNavigate();
  const createFn = useServerFn(createClubCamp);
  const updateFn = useServerFn(updateClubCamp);
  const ageGroupFn = useServerFn(upsertCampAgeGroup);

  const [state, setState] = useState<WizardState>(defaultState);
  const [stepIdx, setStepIdx] = useState(0);
  const [presetChoice, setPresetChoice] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const current = STEP_ORDER[stepIdx];
  const totalSteps = STEP_ORDER.length;

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }, [stepIdx]);

  function patch<K extends keyof WizardState>(k: K, v: WizardState[K]) {
    setState((s) => ({ ...s, [k]: v }));
  }
  function go(delta: number) {
    setStepIdx((i) => Math.max(0, Math.min(totalSteps - 1, i + delta)));
  }

  // U6 → U19 presets with birth years derived from current football season.
  const seasonStart =
    new Date().getMonth() >= 7 ? new Date().getFullYear() : new Date().getFullYear() - 1;
  const existingLabels = useMemo(
    () => new Set(state.ageGroups.map((g) => g.label.toUpperCase())),
    [state.ageGroups],
  );
  const presets = useMemo(
    () =>
      Array.from({ length: 14 }, (_, i) => {
        const n = i + 6;
        const label = `U${n}`;
        const min = seasonStart - n + 1;
        return { label, min, max: min + 1 };
      }).filter((p) => !existingLabels.has(p.label)),
    [existingLabels, seasonStart],
  );

  function addPreset() {
    const p = presets.find((x) => x.label === presetChoice);
    if (!p) return;
    setState((s) => ({
      ...s,
      ageGroups: [...s.ageGroups, { label: p.label, min: p.min, max: p.max }],
    }));
    setPresetChoice("");
  }
  function removeAgeGroup(label: string) {
    setState((s) => ({ ...s, ageGroups: s.ageGroups.filter((g) => g.label !== label) }));
  }

  // Validation per step
  const stepValid: Record<Step, boolean> = {
    title: state.title.trim().length > 0,
    dates:
      !!state.startDate &&
      !!state.endDate &&
      state.endDate >= state.startDate &&
      (!state.deadline || state.deadline <= state.startDate),
    capacity: state.capacity > 0,
    venue: true, // optional
    ageGroups: state.ageGroups.length > 0,
    summary: true,
  };

  const createMut = useMutation({
    mutationFn: async () => {
      const created = await createFn({
        data: {
          clubId,
          title: state.title.trim(),
          startDate: new Date(state.startDate).toISOString(),
          endDate: new Date(state.endDate).toISOString(),
          capacity: state.capacity,
        },
      });
      // Patch optional fields
      const patchBody: Record<string, unknown> = {};
      if (state.deadline) patchBody.registration_deadline = new Date(state.deadline).toISOString();
      if (state.price.trim()) {
        const n = Number(state.price);
        if (Number.isFinite(n) && n >= 0) patchBody.price = n;
      }
      if (state.venueId) patchBody.venue_id = state.venueId;
      if (state.facilityId) patchBody.facility_id = state.facilityId;
      if (!state.venueId && state.externalLocation.trim()) {
        patchBody.external_location = state.externalLocation.trim();
      }
      if (Object.keys(patchBody).length > 0) {
        await updateFn({ data: { campId: created.id, patch: patchBody } });
      }
      // Add age groups sequentially so sort_order stays stable
      for (const g of state.ageGroups) {
        await ageGroupFn({
          data: {
            campId: created.id,
            group: { label: g.label, birth_year_min: g.min, birth_year_max: g.max },
          },
        });
      }
      return created;
    },
    onSuccess: (res) => {
      onCreated(res.id);
      navigate({ to: "/admin/camps/$campId", params: { campId: res.id } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const eyebrows: Record<Step, { eyebrow: string; title: string; hint: string; icon: React.ElementType }> = {
    title: {
      eyebrow: t("wizard.eyebrow.title", { defaultValue: "Étape 1" }),
      title: t("wizard.step.title.title", { defaultValue: "Nom du stage" }),
      hint: t("wizard.step.title.hint", { defaultValue: "Ce que verront les familles" }),
      icon: Tent,
    },
    dates: {
      eyebrow: t("wizard.eyebrow.dates", { defaultValue: "Étape 2" }),
      title: t("wizard.step.dates.title", { defaultValue: "Quand ?" }),
      hint: t("wizard.step.dates.hint", { defaultValue: "Début, fin et deadline d'inscription" }),
      icon: CalendarDays,
    },
    capacity: {
      eyebrow: t("wizard.eyebrow.capacity", { defaultValue: "Étape 3" }),
      title: t("wizard.step.capacity.title", { defaultValue: "Places et tarif" }),
      hint: t("wizard.step.capacity.hint", { defaultValue: "Combien de participants, à quel prix" }),
      icon: Users,
    },
    venue: {
      eyebrow: t("wizard.eyebrow.venue", { defaultValue: "Étape 4" }),
      title: t("wizard.step.venue.title", { defaultValue: "Où se passe le stage ?" }),
      hint: t("wizard.step.venue.hint", { defaultValue: "Facultatif — modifiable plus tard" }),
      icon: MapPin,
    },
    ageGroups: {
      eyebrow: t("wizard.eyebrow.ageGroups", { defaultValue: "Étape 5" }),
      title: t("wizard.step.ageGroups.title", { defaultValue: "Catégories d'âge" }),
      hint: t("wizard.step.ageGroups.hint", {
        defaultValue: "Requis pour publier — sélectionne au moins une catégorie",
      }),
      icon: Tag,
    },
    summary: {
      eyebrow: t("wizard.eyebrow.summary", { defaultValue: "Récap" }),
      title: t("wizard.step.summary.title", { defaultValue: "Prêt à créer" }),
      hint: t("wizard.step.summary.hint", { defaultValue: "Brouillon créé — publication au prochain écran" }),
      icon: Check,
    },
  };

  const head = eyebrows[current];
  const HeadIcon = head.icon;

  const isLast = current === "summary";
  const canNext = stepValid[current];

  return (
    <div className="flex flex-col h-[85vh] max-h-[720px]">
      {/* Header */}
      <div className="relative overflow-hidden text-white">
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(135deg, color-mix(in oklab, var(--primary) 70%, black) 0%, var(--primary) 100%)",
          }}
        />
        <div className="relative z-10 px-4 pt-3 pb-3">
          <div className="flex items-center justify-between">
            <b className="text-[10px] uppercase tracking-[0.16em] opacity-70 font-semibold">
              {head.eyebrow}
            </b>
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-white/12 px-2 py-0.5 text-[10px] font-semibold tracking-wide opacity-80">
                {stepIdx + 1} / {totalSteps}
              </span>
              <button
                type="button"
                onClick={onClose}
                className="flex h-6 w-6 items-center justify-center rounded-full bg-white/15 ring-1 ring-white/30 transition hover:bg-white/30"
                aria-label={t("common.cancel", { defaultValue: "Fermer" })}
              >
                <X className="h-3.5 w-3.5 text-white" strokeWidth={3} />
              </button>
            </div>
          </div>
          <div className="mt-1 flex items-end gap-2">
            <h2 className="flex-1 text-[22px] font-extrabold leading-[1.1] tracking-[-0.5px]">
              {head.title}
            </h2>
            <div
              aria-hidden
              className="shrink-0 h-10 w-10 rounded-xl bg-white/12 ring-1 ring-white/25 flex items-center justify-center"
            >
              <HeadIcon className="h-[19px] w-[19px] text-white" strokeWidth={2.25} />
            </div>
          </div>
          <p className="mt-1.5 text-[11.5px] leading-snug opacity-75 line-clamp-1">{head.hint}</p>
          <WizardProgress step={stepIdx} total={totalSteps} variant="onPrimary" className="mt-2.5" />
        </div>
      </div>

      {/* Body */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {stepIdx > 0 && !isLast && (
          <Button variant="ghost" size="sm" className="h-7 px-2 -ml-2" onClick={() => go(-1)}>
            <ChevronLeft className="h-3.5 w-3.5" />
            {t("wizard.back", { defaultValue: "Retour" })}
          </Button>
        )}

        {current === "title" && (
          <div className="space-y-2">
            <Label>{t("form.title", { defaultValue: "Titre" })}</Label>
            <Input
              autoFocus
              value={state.title}
              onChange={(e) => patch("title", e.target.value)}
              placeholder={t("form.titlePlaceholder", { defaultValue: "Stage de Pâques U9-U11" })}
            />
          </div>
        )}

        {current === "dates" && (
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>{t("form.startDate", { defaultValue: "Début" })}</Label>
                <Input
                  type="date"
                  value={state.startDate}
                  onChange={(e) => patch("startDate", e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>{t("form.endDate", { defaultValue: "Fin" })}</Label>
                <Input
                  type="date"
                  value={state.endDate}
                  onChange={(e) => patch("endDate", e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>{t("form.deadline", { defaultValue: "Date limite d'inscription" })}</Label>
              <Input
                type="date"
                value={state.deadline}
                onChange={(e) => patch("deadline", e.target.value)}
              />
              <p className="text-[11px] text-muted-foreground">
                {t("wizard.deadlineHint", {
                  defaultValue: "Facultatif — doit être avant la date de début.",
                })}
              </p>
            </div>
            {!stepValid.dates && (
              <p className="text-xs text-destructive">
                {state.endDate < state.startDate
                  ? t("errors.datesInvalid", {
                      defaultValue: "La date de fin doit être postérieure au début.",
                    })
                  : t("errors.publishDeadlineAfterStart", {
                      defaultValue: "La deadline d'inscription doit être avant la date de début.",
                    })}
              </p>
            )}
          </div>
        )}

        {current === "capacity" && (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>{t("form.capacity", { defaultValue: "Capacité" })}</Label>
              <Input
                type="number"
                min={1}
                value={state.capacity}
                onChange={(e) => patch("capacity", Number(e.target.value))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>
                {t("form.price", { defaultValue: "Tarif indicatif" })}
                <span className="ml-1 text-[10px] text-muted-foreground">
                  ({t("wizard.optional", { defaultValue: "optionnel" })})
                </span>
              </Label>
              <Input
                type="number"
                inputMode="decimal"
                min={0}
                value={state.price}
                onChange={(e) => patch("price", e.target.value)}
                placeholder="€"
              />
            </div>
          </div>
        )}

        {current === "venue" && (
          <div className="space-y-2">
            <VenueFacilityPicker
              clubId={clubId}
              venueId={state.venueId}
              facilityId={state.facilityId}
              externalLocation={state.externalLocation || null}
              onChange={(next) =>
                setState((s) => ({
                  ...s,
                  venueId: next.venueId,
                  facilityId: next.facilityId,
                  externalLocation: next.externalLocation ?? "",
                }))
              }
            />
            <p className="text-[11px] text-muted-foreground">
              {t("wizard.venueHint", {
                defaultValue: "Tu peux passer cette étape et l'ajouter plus tard.",
              })}
            </p>
          </div>
        )}

        {current === "ageGroups" && (
          <div className="space-y-3">
            <div className="flex gap-2">
              <Select
                value={presetChoice}
                onValueChange={setPresetChoice}
                disabled={presets.length === 0}
              >
                <SelectTrigger className="flex-1">
                  <SelectValue
                    placeholder={
                      presets.length === 0
                        ? t("ageGroups.allAdded", { defaultValue: "Toutes ajoutées" })
                        : t("ageGroups.pickPreset", { defaultValue: "Choisir U6 – U19" })
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {presets.map((p) => (
                    <SelectItem key={p.label} value={p.label}>
                      {p.label}
                      <span className="ml-2 text-xs text-muted-foreground">
                        ({p.min}–{p.max})
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button type="button" onClick={addPreset} disabled={!presetChoice}>
                <Plus className="h-4 w-4 mr-1" />
                {t("common.add", { defaultValue: "Ajouter" })}
              </Button>
            </div>

            {state.ageGroups.length > 0 ? (
              <ul className="flex flex-wrap gap-2">
                {state.ageGroups.map((g) => (
                  <li
                    key={g.label}
                    className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-xs"
                  >
                    <span className="font-semibold">{g.label}</span>
                    <span className="text-muted-foreground">
                      {g.min}–{g.max}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeAgeGroup(g.label)}
                      className="ml-1 rounded-full hover:bg-muted p-0.5"
                      aria-label={t("common.delete", { defaultValue: "Supprimer" })}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-muted-foreground">
                {t("wizard.ageGroupsEmpty", {
                  defaultValue:
                    "Au moins une catégorie est requise pour publier. Tu pourras en ajouter d'autres après.",
                })}
              </p>
            )}
          </div>
        )}

        {current === "summary" && (
          <div className="space-y-3">
            <div className="rounded-xl border border-border bg-card p-4 space-y-1.5 text-sm">
              <div className="font-semibold text-base">{state.title || "—"}</div>
              <div className="text-muted-foreground">
                📅 {state.startDate} → {state.endDate}
                {state.deadline && (
                  <>
                    {" · "}
                    {t("wizard.summary.deadline", { defaultValue: "deadline" })} {state.deadline}
                  </>
                )}
              </div>
              <div>
                👥 {state.capacity} {t("wizard.summary.places", { defaultValue: "places" })}
                {state.price && ` · ${state.price} €`}
              </div>
              {state.venueId && (
                <div>📍 {t("wizard.summary.venueSet", { defaultValue: "Lieu défini" })}</div>
              )}
              <div className="pt-1">
                <span className="text-xs text-muted-foreground">
                  {t("wizard.summary.ageGroups", { defaultValue: "Catégories" })} :{" "}
                </span>
                {state.ageGroups.map((g) => g.label).join(" · ") || "—"}
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              {t("wizard.summary.next", {
                defaultValue:
                  "Le stage sera créé en brouillon. Tu pourras ajouter description, image, programme et documents avant de publier.",
              })}
            </p>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-border bg-background/95 px-4 py-3 flex items-center justify-between gap-2">
        <span className="text-[11px] text-muted-foreground">
          {isLast
            ? t("wizard.footerReady", { defaultValue: "Tout est prêt" })
            : t("wizard.footerProgress", {
                current: stepIdx + 1,
                total: totalSteps,
                defaultValue: "Étape {{current}} sur {{total}}",
              })}
        </span>
        {isLast ? (
          <Button
            onClick={() => createMut.mutate()}
            disabled={createMut.isPending || !state.title.trim() || state.ageGroups.length === 0}
            className={cn("min-w-[140px]")}
          >
            {createMut.isPending && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
            {t("wizard.create", { defaultValue: "Créer le stage" })}
          </Button>
        ) : (
          <Button onClick={() => go(1)} disabled={!canNext} className="min-w-[110px]">
            {t("wizard.next", { defaultValue: "Suivant" })}
          </Button>
        )}
      </div>
    </div>
  );
}
