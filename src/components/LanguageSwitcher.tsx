import { ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export const LANG_OPTS = [
  { value: "fr", label: "FR", flag: "🇫🇷" },
  { value: "en", label: "EN", flag: "🇬🇧" },
  { value: "de", label: "DE", flag: "🇩🇪" },
  { value: "es", label: "ES", flag: "🇪🇸" },
  { value: "pt", label: "PT", flag: "🇵🇹" },
  { value: "it", label: "IT", flag: "🇮🇹" },
  { value: "nl", label: "NL", flag: "🇳🇱" },
] as const;

export function LanguageSwitcher({
  current,
  onChange,
  align = "end",
}: {
  current: string;
  onChange: (lang: string) => void;
  align?: "start" | "end" | "center";
}) {
  const active = LANG_OPTS.find((o) => o.value === current) ?? LANG_OPTS[0];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
        >
          <span>{active.flag}</span>
          {active.label}
          <ChevronDown className="h-3 w-3 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="min-w-[8rem]">
        {LANG_OPTS.map((opt) => (
          <DropdownMenuItem
            key={opt.value}
            onClick={() => onChange(opt.value)}
            className={cn(
              "cursor-pointer gap-2",
              current === opt.value && "bg-primary/10 text-primary font-medium"
            )}
          >
            <span>{opt.flag}</span>
            {opt.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
