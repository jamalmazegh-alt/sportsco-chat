import { useTranslation } from "react-i18next";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectSeparator, SelectLabel, SelectGroup,
} from "@/components/ui/select";
import { TOP_SPORTS, COLLECTIVE_SPORTS } from "@/lib/sports";

interface SportSelectProps {
  value: string | undefined;
  onValueChange: (v: string) => void;
  placeholder?: string;
}

export function SportSelect({ value, onValueChange, placeholder }: SportSelectProps) {
  const { t } = useTranslation();
  return (
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
          <SelectLabel>{t("teams.sportsCollective")}</SelectLabel>
          {COLLECTIVE_SPORTS.map((s) => (
            <SelectItem key={s} value={s}>{t(`teams.sports.${s}`)}</SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}
