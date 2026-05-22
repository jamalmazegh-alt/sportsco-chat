import { useState, type FormEvent } from "react";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Loader2, Trophy, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SportSelect } from "@/components/sport-select";
import {
  listMyAvailablePasses,
  createTournamentFromPass,
} from "@/modules/tournaments/server/passes.functions";

export const Route = createFileRoute("/_authenticated/tournaments/new-from-pass")({
  component: NewFromPassPage,
  head: () => ({
    meta: [{ title: "Créer mon tournoi — Clubero" }],
  }),
});

type Format = "group" | "knockout" | "mixed";

function NewFromPassPage() {
  const navigate = useNavigate();
  const listFn = useServerFn(listMyAvailablePasses);
  const createFn = useServerFn(createTournamentFromPass);

  const passesQ = useQuery({
    queryKey: ["my-tournament-passes"],
    queryFn: () => listFn({ data: undefined as never }),
  });

  const [name, setName] = useState("");
  const [sport, setSport] = useState("football");
  const [category, setCategory] = useState("");
  const [startsOn, setStartsOn] = useState("");
  const [endsOn, setEndsOn] = useState("");
  const [location, setLocation] = useState("");
  const [format, setFormat] = useState<Format>("mixed");
  const [numTeams, setNumTeams] = useState(8);

  const create = useMutation({
    mutationFn: (passId: string) =>
      createFn({
        data: {
          pass_id: passId,
          name: name.trim(),
          sport,
          category: category || null,
          starts_on: startsOn,
          ends_on: endsOn || null,
          format,
          num_teams: numTeams,
          location: location || null,
        },
      }),
    onSuccess: (res) => {
      toast.success("Tournoi créé");
      navigate({
        to: "/tournaments/$tournamentId",
        params: { tournamentId: res.tournament.id },
      });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const passes = passesQ.data?.passes ?? [];
  const pass = passes[0];

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!pass) return;
    if (!name.trim() || !startsOn) {
      toast.error("Nom et date de début requis");
      return;
    }
    create.mutate(pass.id);
  }

  if (passesQ.isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!pass) {
    return (
      <div className="mx-auto max-w-xl px-5 py-16 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-muted">
          <AlertCircle className="h-7 w-7 text-muted-foreground" />
        </div>
        <h1 className="mt-5 font-display text-2xl font-bold">Aucun pass disponible</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Vous n'avez pas de pass tournoi actif. Achetez un pass à 40 € pour
          créer un tournoi sans abonnement.
        </p>
        <Button asChild className="mt-6 h-11">
          <Link to="/pricing">Voir les offres</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-5 py-10">
      <div className="mb-8 flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/10">
          <Trophy className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="font-display text-2xl font-bold">Créer mon tournoi</h1>
          <p className="text-sm text-muted-foreground">
            Pass tournoi validé pour {pass.email}
          </p>
        </div>
      </div>

      <form onSubmit={onSubmit} className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="name">Nom du tournoi *</Label>
          <Input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Coupe du Printemps"
            required
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Sport *</Label>
            <SportSelect value={sport} onChange={setSport} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="category">Catégorie</Label>
            <Input
              id="category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="U15, Seniors…"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="starts">Date de début *</Label>
            <Input
              id="starts"
              type="date"
              value={startsOn}
              onChange={(e) => setStartsOn(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ends">Date de fin</Label>
            <Input
              id="ends"
              type="date"
              value={endsOn}
              onChange={(e) => setEndsOn(e.target.value)}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="location">Lieu</Label>
          <Input
            id="location"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="Adresse ou complexe sportif"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="format">Format</Label>
            <select
              id="format"
              value={format}
              onChange={(e) => setFormat(e.target.value as Format)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="group">Poules</option>
              <option value="knockout">Élimination directe</option>
              <option value="mixed">Poules + phase finale</option>
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="num">Nombre d'équipes</Label>
            <Input
              id="num"
              type="number"
              min={2}
              max={64}
              value={numTeams}
              onChange={(e) => setNumTeams(parseInt(e.target.value) || 8)}
            />
          </div>
        </div>

        <div className="rounded-lg bg-muted/40 p-4 text-xs text-muted-foreground">
          Votre pass sera consommé à la création. Il vous donne accès complet à
          la gestion du tournoi (équipes, poules, scores, partage public).
        </div>

        <Button type="submit" disabled={create.isPending} className="w-full h-11">
          {create.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          Créer le tournoi
        </Button>
      </form>
    </div>
  );
}
