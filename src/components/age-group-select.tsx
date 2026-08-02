import { useTranslation } from "react-i18next";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ADULT_AGE_CATEGORIES,
  YOUTH_AGE_CATEGORIES,
  isCanonicalTeamAgeCategory,
} from "@/lib/team-age-group";

interface AgeGroupSelectProps {
  value: string;
  onValueChange: (v: string) => void;
  placeholder?: string;
  /** Allow clearing the category (edit form). */
  allowEmpty?: boolean;
}

/**
 * Select catalogue pour `teams.age_group`.
 * Si la valeur courante est un legacy hors liste, elle reste sélectionnable
 * le temps que le club la remappe vers un code officiel.
 */
export function AgeGroupSelect({
  value,
  onValueChange,
  placeholder,
  allowEmpty = true,
}: AgeGroupSelectProps) {
  const { t } = useTranslation();
  const legacy = value && !isCanonicalTeamAgeCategory(value) ? value : null;

  return (
    <Select
      value={value || undefined}
      onValueChange={(v) => onValueChange(v === "__none__" ? "" : v)}
    >
      <SelectTrigger data-testid="age-group-select">
        <SelectValue
          placeholder={placeholder ?? t("teams.selectAgeGroup", { defaultValue: "Catégorie" })}
        />
      </SelectTrigger>
      <SelectContent className="max-h-72">
        {allowEmpty && (
          <>
            <SelectItem value="__none__">
              {t("teams.ageGroupNone", { defaultValue: "Non renseignée" })}
            </SelectItem>
            <SelectSeparator />
          </>
        )}
        {legacy && (
          <>
            <SelectGroup>
              <SelectLabel>
                {t("teams.ageGroupLegacy", { defaultValue: "Valeur actuelle" })}
              </SelectLabel>
              <SelectItem value={legacy}>{legacy}</SelectItem>
            </SelectGroup>
            <SelectSeparator />
          </>
        )}
        <SelectGroup>
          <SelectLabel>{t("teams.ageGroupYouth", { defaultValue: "Jeunes" })}</SelectLabel>
          {YOUTH_AGE_CATEGORIES.map((c) => (
            <SelectItem key={c.code} value={c.code}>
              {c.code}
            </SelectItem>
          ))}
        </SelectGroup>
        <SelectSeparator />
        <SelectGroup>
          <SelectLabel>{t("teams.ageGroupAdult", { defaultValue: "Adultes" })}</SelectLabel>
          {ADULT_AGE_CATEGORIES.map((c) => (
            <SelectItem key={c.code} value={c.code}>
              {c.code}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}
