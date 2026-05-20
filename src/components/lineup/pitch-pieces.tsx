import { useDraggable, useDroppable } from "@dnd-kit/core";
import { cn } from "@/lib/utils";

export interface PlayerLite {
  id: string;
  first_name: string;
  last_name: string;
  jersey_number: number | null;
  photo_url: string | null;
  convocated?: boolean;
}

function initials(p: PlayerLite) {
  return `${(p.first_name?.[0] ?? "").toUpperCase()}${(p.last_name?.[0] ?? "").toUpperCase()}`;
}

export function PlayerChip({
  player,
  isCaptain,
  isGK,
  className,
  size = "md",
}: {
  player: PlayerLite;
  isCaptain?: boolean;
  isGK?: boolean;
  className?: string;
  size?: "sm" | "md";
}) {
  const dim = size === "sm" ? "h-11 w-11 text-[11px]" : "h-14 w-14 text-xs";
  return (
    <div className={cn("flex flex-col items-center gap-0.5 select-none", className)}>
      <div className="relative">
        <div
          className={cn(
            "rounded-full ring-2 ring-white shadow-md grid place-content-center font-bold overflow-hidden",
            dim,
            player.convocated === false ? "bg-muted text-muted-foreground" : "bg-primary text-primary-foreground",
          )}
        >
          {player.photo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={player.photo_url} alt="" className="h-full w-full object-cover" />
          ) : player.jersey_number != null ? (
            <span>{player.jersey_number}</span>
          ) : (
            <span>{initials(player)}</span>
          )}
        </div>
        {isCaptain && (
          <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-yellow-400 text-black text-[10px] font-bold grid place-content-center ring-2 ring-white">
            C
          </span>
        )}
        {isGK && !isCaptain && (
          <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-orange-500 text-white text-[10px] font-bold grid place-content-center ring-2 ring-white">
            GK
          </span>
        )}
      </div>
      <span className="text-[10px] font-medium text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)] max-w-[80px] truncate">
        {player.last_name || player.first_name}
      </span>
    </div>
  );
}

export function DraggablePlayer({
  id,
  player,
  isCaptain,
  isGK,
  size,
  selected,
  onSelect,
}: {
  id: string;
  player: PlayerLite;
  isCaptain?: boolean;
  isGK?: boolean;
  size?: "sm" | "md";
  selected?: boolean;
  onSelect?: () => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id,
    data: { playerId: player.id },
  });
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onClick={(e) => {
        if (!onSelect) return;
        e.stopPropagation();
        onSelect();
      }}
      className={cn(
        "touch-none cursor-pointer rounded-full transition-all",
        selected && "ring-4 ring-amber-400 ring-offset-2 ring-offset-background scale-105",
        isDragging && "opacity-30",
      )}
    >
      <PlayerChip player={player} isCaptain={isCaptain} isGK={isGK} size={size} />
    </div>
  );
}

export function DroppableSlot({
  id,
  x,
  y,
  role,
  children,
  empty,
  highlight,
  onClick,
}: {
  id: string;
  x: number;
  y: number;
  role: string;
  children?: React.ReactNode;
  empty: boolean;
  highlight?: boolean;
  onClick?: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id, data: { kind: "slot" } });
  return (
    <div
      ref={setNodeRef}
      onClick={onClick}
      className={cn(
        "absolute -translate-x-1/2 -translate-y-1/2 transition-all",
        (isOver || highlight) && "scale-110",
        onClick && "cursor-pointer",
      )}
      style={{ left: `${x}%`, top: `${y}%` }}
    >
      {empty ? (
        <div
          className={cn(
            "h-14 w-14 rounded-full border-2 border-dashed border-white/60 grid place-content-center text-[10px] font-semibold text-white/80 bg-white/10 backdrop-blur-sm transition-colors",
            isOver && "bg-white/30 border-white",
            highlight && "bg-amber-400/40 border-amber-300 animate-pulse",
          )}
        >
          {role}
        </div>
      ) : (
        children
      )}
    </div>
  );
}

export function DroppableBench({
  children,
  highlight,
  onClick,
}: {
  children: React.ReactNode;
  highlight?: boolean;
  onClick?: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: "bench", data: { kind: "bench" } });
  return (
    <div
      ref={setNodeRef}
      onClick={onClick}
      className={cn(
        "rounded-xl border-2 border-dashed p-3 min-h-[88px] transition-colors",
        isOver ? "border-primary bg-primary/10" : "border-border bg-muted/40",
        highlight && "border-amber-400 bg-amber-400/10 ring-2 ring-amber-300/40",
        onClick && "cursor-pointer",
      )}
    >
      <div className="flex gap-3 flex-wrap">{children}</div>
    </div>
  );
}

export function DroppableAvailable({
  children,
  highlight,
  onClick,
}: {
  children: React.ReactNode;
  highlight?: boolean;
  onClick?: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: "available", data: { kind: "available" } });
  return (
    <div
      ref={setNodeRef}
      onClick={onClick}
      className={cn(
        "rounded-xl border p-3 min-h-[120px] transition-colors",
        isOver ? "border-primary bg-primary/10" : "border-border bg-card",
        highlight && "border-amber-400 ring-2 ring-amber-300/40",
        onClick && "cursor-pointer",
      )}
    >
      <div className="flex gap-3 flex-wrap">{children}</div>
    </div>
  );
}
