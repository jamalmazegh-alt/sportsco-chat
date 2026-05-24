import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, ChevronsUpDown, Plus } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  getPositionSuggestions,
  localizedPositionLabel,
  type PositionOption,
} from "@/lib/player-positions";

interface Props {
  value: string;
  onChange: (v: string) => void;
  sport?: string | null;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
}

/**
 * Autocomplete input for a player position. Suggests sport-specific options
 * while always allowing free text.
 */
export function PositionCombobox({
  value,
  onChange,
  sport,
  disabled,
  placeholder,
  className,
}: Props) {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const suggestions = useMemo(() => getPositionSuggestions(sport), [sport]);
  const lang = i18n.language;

  // If there are no suggestions for this sport, fall back to a plain input.
  if (suggestions.length === 0) {
    return (
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        placeholder={placeholder}
        className={className}
        maxLength={40}
      />
    );
  }

  const matchedOption = suggestions.find(
    (o) =>
      o.value.toLowerCase() === value.toLowerCase() ||
      o.en.toLowerCase() === value.toLowerCase() ||
      o.fr.toLowerCase() === value.toLowerCase(),
  );

  const displayLabel = matchedOption
    ? localizedPositionLabel(matchedOption, lang)
    : value;

  const q = query.trim().toLowerCase();
  const filtered = q
    ? suggestions.filter(
        (o) =>
          o.fr.toLowerCase().includes(q) ||
          o.en.toLowerCase().includes(q) ||
          (o.abbr ?? "").toLowerCase().includes(q),
      )
    : suggestions;

  const customAvailable =
    q.length > 0 &&
    !filtered.some(
      (o) =>
        o.fr.toLowerCase() === q ||
        o.en.toLowerCase() === q ||
        o.value.toLowerCase() === q,
    );

  return (
    <Popover open={open} onOpenChange={(v) => { setOpen(v); if (!v) setQuery(""); }}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            "w-full justify-between font-normal",
            !displayLabel && "text-muted-foreground",
            className,
          )}
        >
          <span className="truncate">
            {displayLabel || placeholder || t("position.placeholder", { defaultValue: "Position" })}
            {matchedOption?.abbr && (
              <span className="ml-2 text-xs text-muted-foreground">
                {matchedOption.abbr}
              </span>
            )}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder={t("position.search", { defaultValue: "Rechercher ou saisir…" })}
            value={query}
            onValueChange={setQuery}
          />
          <CommandList>
            {filtered.length === 0 && !customAvailable && (
              <CommandEmpty>{t("position.empty", { defaultValue: "Aucune suggestion" })}</CommandEmpty>
            )}
            {filtered.length > 0 && (
              <CommandGroup heading={t("position.suggested", { defaultValue: "Suggestions" })}>
                {filtered.map((o) => {
                  const label = localizedPositionLabel(o, lang);
                  const isSelected =
                    matchedOption && matchedOption.value === o.value;
                  return (
                    <CommandItem
                      key={o.value}
                      value={o.value}
                      onSelect={() => {
                        onChange(o.value);
                        setOpen(false);
                        setQuery("");
                      }}
                    >
                      <Check
                        className={cn(
                          "mr-2 h-4 w-4",
                          isSelected ? "opacity-100" : "opacity-0",
                        )}
                      />
                      <span className="flex-1 truncate">{label}</span>
                      {o.abbr && (
                        <span className="ml-2 text-xs text-muted-foreground">
                          {o.abbr}
                        </span>
                      )}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            )}
            {customAvailable && (
              <CommandGroup heading={t("position.custom", { defaultValue: "Personnalisé" })}>
                <CommandItem
                  value={`__custom__${query}`}
                  onSelect={() => {
                    onChange(query.trim());
                    setOpen(false);
                    setQuery("");
                  }}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  {t("position.use", { defaultValue: "Utiliser" })} “{query.trim()}”
                </CommandItem>
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
