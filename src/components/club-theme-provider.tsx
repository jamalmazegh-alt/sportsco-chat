import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
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
  useEffect(() => {
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

  useEffect(() => {
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
