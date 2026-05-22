import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ResponsiveFormDialog } from "@/components/responsive-form-dialog";
import { SportSelect } from "@/components/sport-select";
import { AttachmentPicker, type Attachment } from "@/components/attachments";
import { Loader2, ChevronRight, ChevronLeft, Trophy } from "lucide-react";
import { toast } from "sonner";
import { createTournament, updateTournament } from "../tournaments.functions";


type Format = "group" | "knockout" | "mixed";

interface Props {
  clubId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export function TournamentWizard({ clubId, open, onOpenChange }: Props) {
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [sport, setSport] = useState("football");
  const [category, setCategory] = useState("");
  const [startsOn, setStartsOn] = useState("");
  const [endsOn, setEndsOn] = useState("");
  const [location, setLocation] = useState("");
  const [format, setFormat] = useState<Format>("mixed");
  const [numTeams, setNumTeams] = useState(8);
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
          category: category || null,
          starts_on: startsOn,
          ends_on: endsOn || null,
          format,
          num_teams: numTeams,
          location: location || null,
        },
      });
      // Apply cover image after creation (if uploaded)
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
      toast.success("Tournoi créé");
      qc.invalidateQueries({ queryKey: ["tournaments", clubId] });
      onOpenChange(false);
      reset();
      navigate({
        to: "/tournaments/$tournamentId",
        params: { tournamentId: res.tournament.id },
      });
    },
    onError: (e: any) => toast.error(e?.message ?? "Erreur"),
  });

  function reset() {
    setStep(0);
    setName("");
    setCategory("");
    setStartsOn("");
    setEndsOn("");
    setLocation("");
    setFormat("mixed");
    setNumTeams(8);
    setLogo([]);
  }


  function onSubmit(e: FormEvent) {
    e.preventDefault();
    create.mutate();
  }

  const canNext0 = name.trim().length >= 2 && sport;
  const canNext1 = !!startsOn;
  const canNext2 = !!format && numTeams >= 2;

  return (
    <ResponsiveFormDialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) reset();
      }}
      title="Nouveau tournoi"
    >
      <form onSubmit={onSubmit} className="space-y-5 mt-4 pb-6">
        <Stepper step={step} total={4} />

        {step === 0 && (
          <div className="space-y-4">
            <h3 className="font-medium flex items-center gap-2">
              <Trophy className="h-4 w-4 text-primary" />
              Identité
            </h3>
            <div className="space-y-1.5">
              <Label>Nom du tournoi</Label>
              <Input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Tournoi de Printemps U13"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Sport</Label>
              <SportSelect value={sport} onValueChange={setSport} />
            </div>
            <div className="space-y-1.5">
              <Label>Catégorie (optionnel)</Label>
              <Input
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="U13, Senior, Mixte…"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Logo / image de couverture (optionnel)</Label>
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
            <h3 className="font-medium">Dates & lieu</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Début</Label>
                <Input
                  type="date"
                  required
                  value={startsOn}
                  onChange={(e) => setStartsOn(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Fin</Label>
                <Input
                  type="date"
                  value={endsOn}
                  onChange={(e) => setEndsOn(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Lieu</Label>
              <Textarea
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Stade municipal, terrain 1 et 2"
                rows={2}
              />
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <h3 className="font-medium">Format</h3>
            <div className="grid grid-cols-1 gap-2">
              {(
                [
                  { v: "group", label: "Poules uniquement", desc: "Toutes les équipes se rencontrent dans des poules" },
                  { v: "knockout", label: "Élimination directe", desc: "Bracket à élimination simple" },
                  { v: "mixed", label: "Poules + Élimination", desc: "Phase de groupes, puis bracket des qualifiés" },
                ] as { v: Format; label: string; desc: string }[]
              ).map((f) => (
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
              <Label>Nombre d'équipes prévu</Label>
              <Input
                type="number"
                min={2}
                max={64}
                value={numTeams}
                onChange={(e) => setNumTeams(parseInt(e.target.value || "0", 10))}
              />
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <h3 className="font-medium">Récapitulatif</h3>
            <dl className="rounded-xl border border-border bg-card divide-y divide-border text-sm">
              <Row label="Nom" value={name} />
              <Row label="Sport" value={sport} />
              {category && <Row label="Catégorie" value={category} />}
              <Row label="Début" value={startsOn} />
              {endsOn && <Row label="Fin" value={endsOn} />}
              <Row label="Format" value={format} />
              <Row label="Équipes" value={String(numTeams)} />
              {location && <Row label="Lieu" value={location} />}
            </dl>
            <p className="text-xs text-muted-foreground">
              Tu pourras ensuite ajouter les équipes, créer les poules et générer le calendrier.
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
              Précédent
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
              Suivant
              <ChevronRight className="h-4 w-4" />
            </Button>
          ) : (
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Créer le tournoi"
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
