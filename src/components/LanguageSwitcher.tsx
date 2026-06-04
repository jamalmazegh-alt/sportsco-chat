import { ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export const LANG_OPTS = [
  { value: "fr", label: "FR", fullLabel: "Français", flag: "🇫🇷" },
  { value: "en", label: "EN", fullLabel: "English", flag: "🇬🇧" },
  { value: "de", label: "DE", fullLabel: "Deutsch", flag: "🇩🇪" },
  { value: "es", label: "ES", fullLabel: "Español", flag: "🇪🇸" },
  { value: "pt", label: "PT", fullLabel: "Português", flag: "🇵🇹" },
  { value: "it", label: "IT", fullLabel: "Italiano", flag: "🇮🇹" },
  { value: "nl", label: "NL", fullLabel: "Nederlands", flag: "🇳🇱" },
] as const;

export function LanguageSwitcher({
  current,
  onChange,
  align = "end",
  variant = "compact",
  className,
}: {
  current: string;
  onChange: (lang: string) => void;
  align?: "start" | "end" | "center";
  variant?: "compact" | "full";
  className?: string;
}) {
  const active = LANG_OPTS.find((o) => o.value === current) ?? LANG_OPTS[0];
  const isFull = variant === "full";
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            isFull
              ? "inline-flex w-full items-center justify-between gap-2 rounded-xl border border-border bg-background px-3 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted"
              : "inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted",
            className,
          )}
        >
          <span className="inline-flex items-center gap-2">
            <span className="text-base">{active.flag}</span>
            {isFull ? active.fullLabel : active.label}
          </span>
          <ChevronDown className={cn(isFull ? "h-4 w-4" : "h-3 w-3", "text-muted-foreground")} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className={isFull ? "min-w-[12rem]" : "min-w-[8rem]"}>
        {LANG_OPTS.map((opt) => (
          <DropdownMenuItem
            key={opt.value}
            onClick={() => onChange(opt.value)}
            className={cn(
              "cursor-pointer gap-2",
              current === opt.value && "bg-primary/10 text-primary font-medium",
            )}
          >
            <span>{opt.flag}</span>
            {isFull ? opt.fullLabel : opt.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
