import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Shuffle, Trophy } from "lucide-react";
import { toast } from "sonner";
import {
  autoCreateGroupsAndFixtures,
  generateKnockoutFromGroups,
} from "../tournaments.functions";

interface Props {
  tournamentId: string;
  format: "group" | "knockout" | "mixed";
  numTeams: number;
  groupsCount: number;
  matchesCount: number;
}

export function GroupsAndFixtures({
  tournamentId,
  format,
  numTeams,
  groupsCount,
  matchesCount,
}: Props) {
  const qc = useQueryClient();
  const [numGroups, setNumGroups] = useState(2);
  const [qualifiers, setQualifiers] = useState(2);
  const [thirdPlace, setThirdPlace] = useState(false);

  const genGroupsFn = useServerFn(autoCreateGroupsAndFixtures);
  const genKnockoutFn = useServerFn(generateKnockoutFromGroups);

  const genGroups = useMutation({
    mutationFn: () =>
      genGroupsFn({
        data: {
          tournament_id: tournamentId,
          num_groups: numGroups,
          qualifiers_per_group: qualifiers,
        },
      }),
    onSuccess: (res) => {
      toast.success(`${res.groups_created} poules · ${res.matches_created} matchs`);
      qc.invalidateQueries({ queryKey: ["tournament", tournamentId] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Erreur"),
  });

  const genKnockout = useMutation({
    mutationFn: () =>
      genKnockoutFn({
        data: { tournament_id: tournamentId, third_place: thirdPlace },
      }),
    onSuccess: (res) => {
      toast.success(`${res.matches_created} matchs de bracket créés`);
      qc.invalidateQueries({ queryKey: ["tournament", tournamentId] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Erreur"),
  });

  const supportsGroups = format !== "knockout";
  const supportsKnockout = format !== "group";

  return (
    <div className="space-y-4">
      {supportsGroups && (
        <section className="rounded-xl border border-border bg-card p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Shuffle className="h-4 w-4 text-primary" />
            <h3 className="font-medium">Poules & calendrier</h3>
          </div>
          <p className="text-xs text-muted-foreground">
            {groupsCount} poule{groupsCount > 1 ? "s" : ""} · {matchesCount} match
            {matchesCount > 1 ? "s" : ""} programmé{matchesCount > 1 ? "s" : ""}
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Nombre de poules</Label>
              <Input
                type="number"
                min={1}
                max={16}
                value={numGroups}
                onChange={(e) => setNumGroups(parseInt(e.target.value || "1", 10))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Qualifiés / poule</Label>
              <Input
                type="number"
                min={1}
                max={8}
                value={qualifiers}
                onChange={(e) => setQualifiers(parseInt(e.target.value || "1", 10))}
              />
            </div>
          </div>
          <Button
            onClick={() => genGroups.mutate()}
            disabled={genGroups.isPending || numTeams < 2}
            className="w-full"
          >
            {genGroups.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              "Générer poules + matchs"
            )}
          </Button>
          {groupsCount > 0 && (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              ⚠ Régénérer supprimera les scores existants des matchs de poule.
            </p>
          )}
        </section>
      )}

      {supportsKnockout && (
        <section className="rounded-xl border border-border bg-card p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Trophy className="h-4 w-4 text-primary" />
            <h3 className="font-medium">Phase finale</h3>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={thirdPlace}
              onChange={(e) => setThirdPlace(e.target.checked)}
              className="h-4 w-4 rounded border-input"
            />
            Match pour la 3e place
          </label>
          <Button
            onClick={() => genKnockout.mutate()}
            disabled={genKnockout.isPending}
            variant="outline"
            className="w-full"
          >
            {genKnockout.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : format === "knockout" ? (
              "Générer le bracket"
            ) : (
              "Générer le bracket depuis les qualifiés"
            )}
          </Button>
          {format === "mixed" && (
            <p className="text-xs text-muted-foreground">
              Les meilleurs de chaque poule (selon classement actuel) sont placés dans le bracket.
            </p>
          )}
        </section>
      )}
    </div>
  );
}
