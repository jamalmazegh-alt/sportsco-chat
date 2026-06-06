import { useEffect, useRef, useState } from "react";
import { Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

type Props = {
  value: string; // "HH:mm"
  onChange: (v: string) => void;
  required?: boolean;
  className?: string;
  minuteStep?: number;
  placeholder?: string;
};

const pad = (n: number) => n.toString().padStart(2, "0");

export function TimePicker({
  value,
  onChange,
  required,
  className,
  minuteStep = 5,
  placeholder = "—",
}: Props) {
  const [open, setOpen] = useState(false);
  const [h, m] = value ? value.split(":").map((s) => parseInt(s, 10)) : [NaN, NaN];
  const validH = Number.isFinite(h) ? h : null;
  const validM = Number.isFinite(m) ? m : null;

  const hours = Array.from({ length: 24 }, (_, i) => i);
  const minutes = Array.from({ length: Math.floor(60 / minuteStep) }, (_, i) => i * minuteStep);

  const setH = (nh: number) => onChange(`${pad(nh)}:${pad(validM ?? 0)}`);
  const setM = (nm: number) => onChange(`${pad(validH ?? 0)}:${pad(nm)}`);

  const hCol = useRef<HTMLDivElement>(null);
  const mCol = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    requestAnimationFrame(() => {
      const hEl = hCol.current?.querySelector<HTMLElement>("[data-active='true']");
      const mEl = mCol.current?.querySelector<HTMLElement>("[data-active='true']");
      hEl?.scrollIntoView({ block: "center" });
      mEl?.scrollIntoView({ block: "center" });
    });
  }, [open]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          aria-required={required}
          className={cn(
            "h-10 justify-start font-normal tabular-nums",
            !value && "text-muted-foreground",
            className,
          )}
        >
          <Clock className="h-4 w-4" />
          {value || placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-2">
        <div className="mb-2">
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9:]*"
            placeholder="HH:MM"
            defaultValue={value}
            key={value}
            onChange={(e) => {
              let v = e.target.value.replace(/[^0-9]/g, "").slice(0, 4);
              if (v.length >= 3) v = `${v.slice(0, 2)}:${v.slice(2)}`;
              e.target.value = v;
              const m = v.match(/^(\d{1,2}):(\d{2})$/);
              if (m) {
                const hh = Math.min(23, parseInt(m[1], 10));
                const mm = Math.min(59, parseInt(m[2], 10));
                onChange(`${pad(hh)}:${pad(mm)}`);
              }
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                setOpen(false);
              }
            }}
            className="w-full h-9 rounded-md border border-input bg-background px-2 text-center text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-ring"
            autoFocus
          />
        </div>
        <div className="flex gap-1">
          <ScrollArea className="h-56 w-16 rounded-md border">
            <div ref={hCol} className="p-1 space-y-0.5">
              {hours.map((hh) => {
                const active = hh === validH;
                return (
                  <button
                    key={hh}
                    type="button"
                    data-active={active}
                    onClick={() => setH(hh)}
                    className={cn(
                      "w-full text-center py-1.5 rounded-md text-sm tabular-nums transition-colors",
                      active
                        ? "bg-primary text-primary-foreground font-semibold"
                        : "hover:bg-accent",
                    )}
                  >
                    {pad(hh)}
                  </button>
                );
              })}
            </div>
          </ScrollArea>
          <div className="self-center text-muted-foreground font-semibold">:</div>
          <ScrollArea className="h-56 w-16 rounded-md border">
            <div ref={mCol} className="p-1 space-y-0.5">
              {minutes.map((mm) => {
                const active = mm === validM;
                return (
                  <button
                    key={mm}
                    type="button"
                    data-active={active}
                    onClick={() => {
                      setM(mm);
                      setOpen(false);
                    }}
                    className={cn(
                      "w-full text-center py-1.5 rounded-md text-sm tabular-nums transition-colors",
                      active
                        ? "bg-primary text-primary-foreground font-semibold"
                        : "hover:bg-accent",
                    )}
                  >
                    {pad(mm)}
                  </button>
                );
              })}
            </div>
          </ScrollArea>
        </div>
      </PopoverContent>
    </Popover>
  );
}
