import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { SmilePlus } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

export const WALL_EMOJIS = [
  "👍",
  "❤️",
  "🔥",
  "👏",
  "😂",
  "😮",
  "😢",
  "🙏",
  "💪",
  "🎉",
  "⚽",
  "🤩",
] as const;

export type WallReaction = { user_id: string; emoji: string; name: string | null };

type Props = {
  reactions: WallReaction[];
  currentUserId: string | null;
  onToggle: (emoji: string) => void;
};

/**
 * Barre de réactions emoji d'une publication du mur (façon WhatsApp).
 * - Bouton "+" : palette de 6 emojis
 * - Pastilles agrégées (emoji + compteur) : un tap ouvre le détail « qui a réagi »
 * - Dans la feuille : palette pour changer sa réaction, tap sur sa propre ligne
 *   pour la retirer, et swipe vers le bas pour fermer.
 */
export function WallReactions({ reactions, currentUserId, onToggle }: Props) {
  const { t } = useTranslation();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [dragY, setDragY] = useState(0);
  const startY = useRef<number | null>(null);

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

  function closeDetail() {
    setDetailOpen(false);
    setDragY(0);
  }

  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      <Popover open={paletteOpen} onOpenChange={setPaletteOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={t("wall.reactions.add")}
            className="inline-flex h-7 items-center gap-1 rounded-full border border-border bg-muted/40 px-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <SmilePlus className="h-3.5 w-3.5" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-auto max-w-[16rem] p-1.5">
          <div className="flex flex-wrap items-center justify-center gap-0.5">
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
          onClick={() => setDetailOpen(true)}
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
        <Sheet
          open={detailOpen}
          onOpenChange={(o) => {
            if (!o) closeDetail();
            else setDetailOpen(true);
          }}
        >
          <SheetContent
            side="bottom"
            showClose={false}
            className="max-h-[75vh] overflow-y-auto pt-3"
            style={{ transform: dragY ? `translateY(${dragY}px)` : undefined }}
            onTouchStart={(e) => {
              startY.current = e.touches[0].clientY;
            }}
            onTouchMove={(e) => {
              if (startY.current == null) return;
              const dy = e.touches[0].clientY - startY.current;
              if (dy > 0) setDragY(dy);
            }}
            onTouchEnd={() => {
              startY.current = null;
              if (dragY > 80) closeDetail();
              else setDragY(0);
            }}
          >
            <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-muted-foreground/30" />
            <SheetTitle className="text-center text-base">
              {t("wall.reactions.count", {
                count: reactions.length,
              })}
            </SheetTitle>

            {/* Palette : changer / retirer sa réaction sans quitter la feuille */}
            <div className="mt-3 flex flex-wrap items-center justify-center gap-1">
              {WALL_EMOJIS.map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => onToggle(e)}
                  className={cn(
                    "rounded-full px-2 py-1 text-xl transition-transform active:scale-110",
                    mine.has(e) && "bg-primary/15",
                  )}
                >
                  {e}
                </button>
              ))}
            </div>

            <div className="mt-4 space-y-4 pb-6">
              {grouped.map(([emoji, list]) => (
                <div key={emoji}>
                  <p className="mb-1.5 text-xs font-semibold text-muted-foreground">
                    {emoji} · {list.length}
                  </p>
                  <ul className="space-y-1">
                    {list.map((r) => {
                      const isMine = r.user_id === currentUserId;
                      return (
                        <li key={`${emoji}-${r.user_id}`}>
                          <button
                            type="button"
                            disabled={!isMine}
                            onClick={() => isMine && onToggle(emoji)}
                            className={cn(
                              "flex w-full items-center gap-2 rounded-md bg-muted/40 px-2.5 py-1.5 text-left text-sm",
                              isMine && "hover:bg-muted",
                            )}
                          >
                            <span className="text-base leading-none">{emoji}</span>
                            <span className="truncate">{r.name ?? t("common.unknown")}</span>
                            {isMine && (
                              <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                                {t("wall.reactions.tapToRemove")}
                              </span>
                            )}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          </SheetContent>
        </Sheet>
      )}
    </div>
  );
}
