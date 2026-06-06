import { useEffect, useLayoutEffect } from "react";
import { useQuery } from "@tanstack/react-query";

// useLayoutEffect on the client, useEffect during SSR (avoids React warning).
const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import {
  applyClubTheme,
  isClubThemeKey,
  readStoredTheme,
  storeTheme,
  DEFAULT_CLUB_THEME,
} from "@/lib/club-themes";

/**
 * Applies the active club's brand colour to the whole app.
 * - On mount (before auth is ready / on login page): apply last stored theme.
 * - When activeClubId resolves: fetch theme_color and apply + persist.
 */
export function ClubThemeProvider({ children }: { children: React.ReactNode }) {
  const { activeClubId } = useAuth();

  // Apply stored theme ASAP (covers login page + first paint).
  // Apply stored theme synchronously before first paint (covers login + first paint, no flash).
  useIsoLayoutEffect(() => {
    applyClubTheme(readStoredTheme());
  }, []);

  const { data } = useQuery({
    queryKey: ["club-theme", activeClubId],
    enabled: !!activeClubId,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clubs")
        .select("theme_color")
        .eq("id", activeClubId!)
        .single();
      if (error) throw error;
      return data;
    },
  });

  useIsoLayoutEffect(() => {
    if (!activeClubId) {
      // logged-out: keep stored theme (don't reset)
      return;
    }
    const key = isClubThemeKey(data?.theme_color) ? data!.theme_color : DEFAULT_CLUB_THEME;
    applyClubTheme(key);
    storeTheme(key);
  }, [activeClubId, data?.theme_color]);

  return <>{children}</>;
}
