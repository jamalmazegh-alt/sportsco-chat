/**
 * Liste des personnes masquées par l'utilisateur courant (« bloquer » au sens
 * des stores). Fournit le Set des ids masqués + mute/unmute, avec
 * invalidation react-query partagée entre le mur, le chat et la page
 * Confidentialité.
 */
import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";

export const USER_MUTES_QUERY_KEY = "user-mutes";

export function useUserMutes() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const { data } = useQuery({
    queryKey: [USER_MUTES_QUERY_KEY, user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data: rows } = await supabase.from("user_mutes").select("muted_user_id");
      return (rows ?? []).map((r) => r.muted_user_id as string);
    },
  });

  const muted = useMemo(() => new Set<string>(data ?? []), [data]);

  async function mute(mutedUserId: string): Promise<{ error: string | null }> {
    if (!user) return { error: "not_authenticated" };
    if (mutedUserId === user.id) return { error: "cannot_mute_self" };
    const { error } = await supabase
      .from("user_mutes")
      .upsert(
        { user_id: user.id, muted_user_id: mutedUserId },
        { onConflict: "user_id,muted_user_id", ignoreDuplicates: true },
      );
    if (error) return { error: error.message };
    await qc.invalidateQueries({ queryKey: [USER_MUTES_QUERY_KEY] });
    return { error: null };
  }

  async function unmute(mutedUserId: string): Promise<{ error: string | null }> {
    if (!user) return { error: "not_authenticated" };
    const { error } = await supabase
      .from("user_mutes")
      .delete()
      .eq("user_id", user.id)
      .eq("muted_user_id", mutedUserId);
    if (error) return { error: error.message };
    await qc.invalidateQueries({ queryKey: [USER_MUTES_QUERY_KEY] });
    return { error: null };
  }

  return { muted, mute, unmute };
}
