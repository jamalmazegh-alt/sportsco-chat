import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { ResponsiveFormDialog } from "@/components/responsive-form-dialog";
import { SportSelect } from "@/components/sport-select";
import { AttachmentPicker, type Attachment } from "@/components/attachments";
import { LocationAutocomplete } from "@/components/location-autocomplete";
import { Loader2, ChevronRight, ChevronLeft, Trophy } from "lucide-react";
import { toast } from "sonner";
import { createTournament, updateTournament } from "../tournaments.functions";


type Format =
  | "group"
  | "knockout"
  | "mixed"
  | "double_elimination"
  | "swiss"
  | "round_robin_home_away"
  | "flighted_finals"
  | "consolation";

interface Props {
  clubId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export function TournamentWizard({ clubId, open, onOpenChange }: Props) {
  const { t } = useTranslation("tournaments");
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [sport, setSport] = useState("football");
  const [customSportName, setCustomSportName] = useState("");
  const [category, setCategory] = useState("");
  const [startsOn, setStartsOn] = useState("");
  const [endsOn, setEndsOn] = useState("");
  const [location, setLocation] = useState("");
  const [format, setFormat] = useState<Format>("mixed");
  const [swissRounds, setSwissRounds] = useState<number>(5);
  const [numTeams, setNumTeams] = useState(8);
  const [numTeamsRaw, setNumTeamsRaw] = useState("8");
  const [logo, setLogo] = useState<Attachment[]>([]);

  const navigate = useNavigate();
  const qc = useQueryClient();
  const fn = useServerFn(createTournament);
  const updateFn = useServerFn(updateTournament);

  const create = useMutation({
    mutationFn: async () => {
      const res = await fn({
        data: {
          club_id: clubId,
          name: name.trim(),
          sport,
          custom_sport_name: sport === "custom" ? customSportName.trim() || null : null,
          category: category || null,
          starts_on: startsOn,
          ends_on: endsOn || null,
          format,
          num_teams: numTeams,
          swiss_rounds: format === "swiss" ? swissRounds : null,
          double_round_robin: format === "round_robin_home_away",
          location: location || null,
        },
      });
      if (logo[0]?.url) {
        await updateFn({
          data: {
            tournament_id: res.tournament.id,
            patch: { cover_image_url: logo[0].url },
          },
        });
      }
      return res;
    },
    onSuccess: (res) => {
      toast.success(t("wizard.createdToast"));
      qc.invalidateQueries({ queryKey: ["tournaments", clubId] });
      onOpenChange(false);
      reset();
      navigate({
        to: "/tournaments/$tournamentId",
        params: { tournamentId: res.tournament.id },
      });
    },
    onError: (e: any) => toast.error(e?.message ?? t("wizard.errorToast")),
  });

  function reset() {
    setStep(0);
    setName("");
    setCustomSportName("");
    setCategory("");
    setStartsOn("");
    setEndsOn("");
    setLocation("");
    setFormat("mixed");
    setSwissRounds(5);
    setNumTeams(8);
    setNumTeamsRaw("8");
    setLogo([]);
  }


  function onSubmit(e: FormEvent) {
    e.preventDefault();
    create.mutate();
  }

  const datesValid = !!startsOn && (!endsOn || endsOn >= startsOn);
  const canNext0 = name.trim().length >= 2 && sport;
  const canNext1 = datesValid;
  const canNext2 =
    !!format &&
    numTeams >= 2 &&
    (format !== "swiss" || (swissRounds >= 1 && swissRounds <= 20));

  const formatOptions: { v: Format; label: string; desc: string }[] = [
    { v: "group", label: t("wizard.formatGroup"), desc: t("wizard.formatGroupDesc") },
    { v: "knockout", label: t("wizard.formatKnockout"), desc: t("wizard.formatKnockoutDesc") },
    { v: "mixed", label: t("wizard.formatMixed"), desc: t("wizard.formatMixedDesc") },
    {
      v: "round_robin_home_away",
      label: t("wizard.formatRoundRobinHomeAway"),
      desc: t("wizard.formatRoundRobinHomeAwayDesc"),
    },
    {
      v: "double_elimination",
      label: t("wizard.formatDoubleElimination"),
      desc: t("wizard.formatDoubleEliminationDesc"),
    },
    { v: "swiss", label: t("wizard.formatSwiss"), desc: t("wizard.formatSwissDesc") },
  ];

  return (
    <ResponsiveFormDialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) reset();
      }}
      title={t("wizard.title")}
    >
      <form onSubmit={onSubmit} className="space-y-5 mt-4 pb-6">
        <Stepper step={step} total={4} />

        {step === 0 && (
          <div className="space-y-4">
            <h3 className="font-medium flex items-center gap-2">
              <Trophy className="h-4 w-4 text-primary" />
              {t("wizard.identity")}
            </h3>
            <div className="space-y-1.5">
              <Label>{t("wizard.name")}</Label>
              <Input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("wizard.namePlaceholder")}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t("wizard.sport")}</Label>
              <SportSelect value={sport} onValueChange={setSport} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("wizard.categoryOptional")}</Label>
              <Input
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder={t("wizard.categoryPlaceholder")}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t("wizard.logoOptional")}</Label>
              <AttachmentPicker
                value={logo}
                onChange={setLogo}
                prefix="tournament-cover"
                accept="image/*"
                max={1}
              />
            </div>
          </div>
        )}


        {step === 1 && (
          <div className="space-y-4">
            <h3 className="font-medium">{t("wizard.datesAndPlace")}</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>{t("wizard.start")}</Label>
                <Input
                  type="date"
                  required
                  value={startsOn}
                  onChange={(e) => {
                    const v = e.target.value;
                    setStartsOn(v);
                    // Auto-sync end date if empty or still matching previous start
                    if (v && (!endsOn || endsOn === startsOn || endsOn < v)) {
                      setEndsOn(v);
                    }
                  }}
                />
              </div>
              <div className="space-y-1.5">
                <Label>{t("wizard.end")}</Label>
                <Input
                  type="date"
                  min={startsOn || undefined}
                  value={endsOn}
                  onChange={(e) => setEndsOn(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>{t("wizard.place")}</Label>
              <LocationAutocomplete
                value={location}
                onChange={setLocation}
                placeholder={t("wizard.placePlaceholder")}
              />
              <p className="text-[11px] text-muted-foreground">
                {t("wizard.placeHint")}
              </p>

            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <h3 className="font-medium">{t("wizard.format")}</h3>
            <div className="grid grid-cols-1 gap-2">
              {formatOptions.map((f) => (
                <button
                  type="button"
                  key={f.v}
                  onClick={() => setFormat(f.v)}
                  className={`text-left rounded-xl border p-3 transition-colors ${
                    format === f.v
                      ? "border-primary bg-primary/5"
                      : "border-border bg-card hover:bg-muted/40"
                  }`}
                >
                  <div className="font-medium text-sm">{f.label}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{f.desc}</div>
                </button>
              ))}
            </div>
            <div className="space-y-1.5">
              <Label>{t("wizard.numTeams")}</Label>
              <Input
                type="number"
                min={2}
                max={64}
                value={numTeamsRaw}
                onChange={(e) => {
                  const val = e.target.value;
                  setNumTeamsRaw(val);
                  const n = parseInt(val, 10);
                  if (!isNaN(n)) setNumTeams(n);
                }}
                onBlur={() => {
                  const n = parseInt(numTeamsRaw, 10);
                  if (isNaN(n) || n < 2) {
                    setNumTeams(2);
                    setNumTeamsRaw("2");
                  } else if (n > 64) {
                    setNumTeams(64);
                    setNumTeamsRaw("64");
                  } else {
                    setNumTeams(n);
                    setNumTeamsRaw(String(n));
                  }
                }}
              />
            </div>
            {format === "swiss" && (
              <div className="space-y-1.5">
                <Label>{t("wizard.swissRounds")}</Label>
                <Input
                  type="number"
                  min={1}
                  max={20}
                  value={swissRounds}
                  onChange={(e) => {
                    const n = parseInt(e.target.value, 10);
                    if (!isNaN(n)) setSwissRounds(Math.max(1, Math.min(20, n)));
                  }}
                />
                <p className="text-[11px] text-muted-foreground">
                  {t("wizard.swissRoundsHint")}
                </p>
              </div>
            )}
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <h3 className="font-medium">{t("wizard.summary")}</h3>
            <dl className="rounded-xl border border-border bg-card divide-y divide-border text-sm">
              <Row label={t("wizard.rowName")} value={name} />
              <Row label={t("wizard.rowSport")} value={sport} />
              {category && <Row label={t("wizard.rowCategory")} value={category} />}
              <Row label={t("wizard.rowStart")} value={startsOn} />
              {endsOn && <Row label={t("wizard.rowEnd")} value={endsOn} />}
              <Row label={t("wizard.rowFormat")} value={format} />
              <Row label={t("wizard.rowTeams")} value={String(numTeams)} />
              {location && <Row label={t("wizard.rowPlace")} value={location} />}
            </dl>
            <p className="text-xs text-muted-foreground">
              {t("wizard.summaryHint")}
            </p>
          </div>
        )}

        <div className="flex items-center justify-between gap-2 pt-2">
          {step > 0 ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => setStep((s) => s - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
              {t("wizard.previous")}
            </Button>
          ) : (
            <div />
          )}
          {step < 3 ? (
            <Button
              type="button"
              onClick={() => setStep((s) => s + 1)}
              disabled={
                (step === 0 && !canNext0) ||
                (step === 1 && !canNext1) ||
                (step === 2 && !canNext2)
              }
            >
              {t("wizard.next")}
              <ChevronRight className="h-4 w-4" />
            </Button>
          ) : (
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                t("wizard.create")
              )}
            </Button>
          )}
        </div>
      </form>
    </ResponsiveFormDialog>
  );
}

function Stepper({ step, total }: { step: number; total: number }) {
  return (
    <div className="flex gap-1.5">
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className={`h-1.5 flex-1 rounded-full ${
            i <= step ? "bg-primary" : "bg-muted"
          }`}
        />
      ))}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between px-3 py-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-right">{value}</span>
    </div>
  );
}
