import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { SmilePlus } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

export const WALL_EMOJIS = ["👍", "❤️", "🔥", "👏", "😂", "😮"] as const;

export type WallReaction = { user_id: string; emoji: string; name: string | null };

type Props = {
  reactions: WallReaction[];
  currentUserId: string | null;
  onToggle: (emoji: string) => void;
};

/**
 * Barre de réactions emoji d'une publication du mur.
 * - Bouton "+" : palette de 6 emojis
 * - Pastilles agrégées (emoji + compteur), surlignées si l'utilisateur a réagi
 * - Tap sur une pastille du bas ("qui a réagi") : liste nominative
 */
export function WallReactions({ reactions, currentUserId, onToggle }: Props) {
  const { t } = useTranslation();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [whoOpen, setWhoOpen] = useState(false);

  const grouped = useMemo(() => {
    const map = new Map<string, WallReaction[]>();
    for (const r of reactions) {
      const arr = map.get(r.emoji) ?? [];
      arr.push(r);
      map.set(r.emoji, arr);
    }
    return Array.from(map.entries()).sort((a, b) => b[1].length - a[1].length);
  }, [reactions]);

  const mine = useMemo(
    () => new Set(reactions.filter((r) => r.user_id === currentUserId).map((r) => r.emoji)),
    [reactions, currentUserId],
  );

  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      <Popover open={paletteOpen} onOpenChange={setPaletteOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={t("wall.reactions.add", { defaultValue: "Réagir" })}
            className="inline-flex h-7 items-center gap-1 rounded-full border border-border bg-muted/40 px-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <SmilePlus className="h-3.5 w-3.5" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-auto p-1.5">
          <div className="flex items-center gap-0.5">
            {WALL_EMOJIS.map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => {
                  setPaletteOpen(false);
                  onToggle(e);
                }}
                className={cn(
                  "rounded-full px-2 py-1 text-lg transition-transform hover:scale-125",
                  mine.has(e) && "bg-primary/15",
                )}
              >
                {e}
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>

      {grouped.map(([emoji, list]) => (
        <button
          key={emoji}
          type="button"
          onClick={() => onToggle(emoji)}
          className={cn(
            "inline-flex h-7 items-center gap-1 rounded-full border px-2 text-xs transition-colors",
            mine.has(emoji)
              ? "border-primary/40 bg-primary/10 text-primary"
              : "border-border bg-muted/40 text-muted-foreground hover:bg-muted",
          )}
        >
          <span className="text-sm leading-none">{emoji}</span>
          <span className="font-medium tabular-nums">{list.length}</span>
        </button>
      ))}

      {reactions.length > 0 && (
        <>
          <button
            type="button"
            onClick={() => setWhoOpen(true)}
            className="text-[11px] text-muted-foreground underline-offset-2 hover:underline"
          >
            {t("wall.reactions.who", { defaultValue: "Qui a réagi" })}
          </button>
          <Sheet open={whoOpen} onOpenChange={setWhoOpen}>
            <SheetContent side="bottom" className="max-h-[75vh] overflow-y-auto">
              <SheetHeader>
                <SheetTitle>{t("wall.reactions.who", { defaultValue: "Qui a réagi" })}</SheetTitle>
                <SheetDescription>
                  {t("wall.reactions.count", {
                    defaultValue: "{{count}} réaction(s)",
                    count: reactions.length,
                  })}
                </SheetDescription>
              </SheetHeader>
              <div className="mt-4 space-y-4">
                {grouped.map(([emoji, list]) => (
                  <div key={emoji}>
                    <p className="mb-1.5 text-xs font-semibold text-muted-foreground">
                      {emoji} · {list.length}
                    </p>
                    <ul className="space-y-1">
                      {list.map((r) => (
                        <li
                          key={`${emoji}-${r.user_id}`}
                          className="flex items-center gap-2 rounded-md bg-muted/40 px-2.5 py-1.5 text-sm"
                        >
                          <span className="text-base leading-none">{emoji}</span>
                          <span className="truncate">
                            {r.name ?? t("common.unknown", { defaultValue: "Inconnu" })}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </SheetContent>
          </Sheet>
        </>
      )}
    </div>
  );
}
