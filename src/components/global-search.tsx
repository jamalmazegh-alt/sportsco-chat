import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Search, Calendar, Users, UserCircle2 } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { fmt } from "@/lib/date-locale";

export function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const { t } = useTranslation();
  const { activeClubId } = useAuth();
  const navigate = useNavigate();

  // Cmd/Ctrl + K keyboard shortcut
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Preload entities (club is small enough; filtering happens client-side via cmdk)
  const { data } = useQuery({
    queryKey: ["global-search", activeClubId],
    enabled: !!activeClubId && open,
    queryFn: async () => {
      const [teamsRes, playersRes, eventsRes] = await Promise.all([
        supabase.from("teams").select("id, name, age_group").eq("club_id", activeClubId!),
        supabase
          .from("players")
          .select("id, first_name, last_name, jersey_number")
          .eq("club_id", activeClubId!),
        (async () => {
          const { data: ts } = await supabase
            .from("teams")
            .select("id")
            .eq("club_id", activeClubId!);
          const ids = (ts ?? []).map((x) => x.id);
          if (ids.length === 0) return { data: [] as any[] };
          return supabase
            .from("events")
            .select("id, title, starts_at, opponent")
            .in("team_id", ids)
            .order("starts_at", { ascending: false })
            .limit(100);
        })(),
      ]);
      return {
        teams: teamsRes.data ?? [],
        players: playersRes.data ?? [],
        events: eventsRes.data ?? [],
      };
    },
    staleTime: 30_000,
  });

  function go(path: string, params?: Record<string, string>) {
    setOpen(false);
    navigate({ to: path as any, params: params as any });
  }

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        aria-label={t("search.open", { defaultValue: "Search" })}
        onClick={() => setOpen(true)}
      >
        <Search className="h-4 w-4" />
      </Button>
      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput
          placeholder={t("search.placeholder", { defaultValue: "Search players, teams, events…" })}
        />
        <CommandList>
          <CommandEmpty>{t("search.empty", { defaultValue: "No results." })}</CommandEmpty>

          {data?.players && data.players.length > 0 && (
            <CommandGroup heading={t("nav.players", { defaultValue: "Players" })}>
              {data.players.map((p) => (
                <CommandItem
                  key={`p-${p.id}`}
                  value={`player ${p.first_name} ${p.last_name} ${p.jersey_number ?? ""}`}
                  onSelect={() => go("/players/$playerId", { playerId: p.id })}
                >
                  <UserCircle2 className="h-4 w-4 text-muted-foreground" />
                  <span>
                    {p.first_name} {p.last_name}
                  </span>
                  {p.jersey_number != null && (
                    <span className="ml-auto text-xs text-muted-foreground">#{p.jersey_number}</span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          {data?.teams && data.teams.length > 0 && (
            <CommandGroup heading={t("nav.teams")}>
              {data.teams.map((tm) => (
                <CommandItem
                  key={`t-${tm.id}`}
                  value={`team ${tm.name} ${tm.age_group ?? ""}`}
                  onSelect={() => go("/teams/$teamId", { teamId: tm.id })}
                >
                  <Users className="h-4 w-4 text-muted-foreground" />
                  <span>{tm.name}</span>
                  {tm.age_group && (
                    <span className="ml-auto text-xs text-muted-foreground">{tm.age_group}</span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          {data?.events && data.events.length > 0 && (
            <CommandGroup heading={t("nav.events")}>
              {data.events.map((e: any) => (
                <CommandItem
                  key={`e-${e.id}`}
                  value={`event ${e.title} ${e.opponent ?? ""}`}
                  onSelect={() => go("/events/$eventId", { eventId: e.id })}
                >
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <span className="truncate">{e.title}</span>
                  <span className="ml-auto text-xs text-muted-foreground">
                    {fmt(new Date(e.starts_at), "d MMM")}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
        </CommandList>
      </CommandDialog>
    </>
  );
}
