"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sparkles, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface Props {
  clubId: string;
  currentName: string;
}

export function ConvertPersonalClubBanner({ clubId, currentName }: Props) {
  const [open, setOpen] = useState(false);
  const [newName, setNewName] = useState(currentName);
  const qc = useQueryClient();
  const { refreshMemberships } = useAuth();

  const mutation = useMutation({
    mutationFn: async () => {
      const trimmed = newName.trim();
      const { error } = await supabase.rpc("convert_personal_club_to_real", {
        _club_id: clubId,
        ...(trimmed ? { _new_name: trimmed } : {}),
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("Organisation convertie en vrai club Clubero");
      await refreshMemberships();
      await qc.invalidateQueries({ queryKey: ["club-name", clubId] });
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="rounded-2xl border border-pink-500/20 bg-gradient-to-br from-pink-500/5 to-fuchsia-500/5 p-4 space-y-3">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-pink-500/10 text-pink-600 dark:text-pink-400">
          <Sparkles className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Tu utilises Clubero en mode organisateur libre</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Convertis cette organisation en vrai club Clubero pour inviter ton équipe, gérer
            tes joueurs et souscrire à un abonnement.
          </p>
        </div>
      </div>
      {open ? (
        <div className="space-y-3 pt-1">
          <div className="space-y-1.5">
            <Label htmlFor="new-club-name" className="text-xs">
              Nom du club
            </Label>
            <Input
              id="new-club-name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              maxLength={120}
              placeholder="ex. AS Saint-Étienne U15"
            />
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={() => mutation.mutate()}
              disabled={mutation.isPending || !newName.trim()}
            >
              {mutation.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />}
              Confirmer la conversion
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
              Annuler
            </Button>
          </div>
        </div>
      ) : (
        <Button size="sm" onClick={() => setOpen(true)} className="w-full sm:w-auto">
          Convertir en vrai club
        </Button>
      )}
    </div>
  );
}
