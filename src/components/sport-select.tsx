import { useTranslation } from "react-i18next";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectSeparator, SelectLabel, SelectGroup,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { TOP_SPORTS, COLLECTIVE_SPORTS, RACKET_SPORTS, CUSTOM_SPORT } from "@/lib/sports";

interface SportSelectProps {
  value: string | undefined;
  onValueChange: (v: string) => void;
  placeholder?: string;
  /** Nom du sport personnalisé (affiché si value === "custom"). */
  customName?: string;
  onCustomNameChange?: (v: string) => void;
}

export function SportSelect({
  value,
  onValueChange,
  placeholder,
  customName,
  onCustomNameChange,
}: SportSelectProps) {
  const { t } = useTranslation();
  return (
    <div className="space-y-2">
      <Select value={value || undefined} onValueChange={onValueChange}>
        <SelectTrigger>
          <SelectValue placeholder={placeholder ?? t("teams.selectSport")} />
        </SelectTrigger>
        <SelectContent className="max-h-72">
          <SelectGroup>
            {TOP_SPORTS.map((s) => (
              <SelectItem key={s} value={s}>{t(`teams.sports.${s}`)}</SelectItem>
            ))}
          </SelectGroup>
          <SelectSeparator />
          <SelectGroup>
            <SelectLabel>{t("teams.sportsCollective", { defaultValue: "Sports collectifs" })}</SelectLabel>
            {COLLECTIVE_SPORTS.map((s) => (
              <SelectItem key={s} value={s}>{t(`teams.sports.${s}`)}</SelectItem>
            ))}
          </SelectGroup>
          <SelectSeparator />
          <SelectGroup>
            <SelectLabel>{t("teams.sportsRacket", { defaultValue: "Raquette" })}</SelectLabel>
            {RACKET_SPORTS.map((s) => (
              <SelectItem key={s} value={s}>{t(`teams.sports.${s}`, { defaultValue: s })}</SelectItem>
            ))}
          </SelectGroup>
          <SelectSeparator />
          <SelectGroup>
            <SelectItem value={CUSTOM_SPORT}>
              {t("teams.sports.custom", { defaultValue: "Autre sport…" })}
            </SelectItem>
          </SelectGroup>
        </SelectContent>
      </Select>
      {value === CUSTOM_SPORT && onCustomNameChange && (
        <Input
          value={customName ?? ""}
          onChange={(e) => onCustomNameChange(e.target.value)}
          placeholder={t("teams.sports.customPlaceholder", {
            defaultValue: "Nom du sport (ex. Pétanque)",
          })}
          maxLength={60}
        />
      )}
    </div>
  );
}
