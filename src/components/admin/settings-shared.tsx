import { useTranslation } from "react-i18next";
import { Switch } from "@/components/ui/switch";
import { BackLink } from "@/components/back-link";

export function SettingsSubHeader({ title, description }: { title: string; description?: string }) {
  const { t } = useTranslation();
  return (
    <div className="space-y-4">
      <BackLink
        to="/admin"
        label={t("admin.back", { defaultValue: "Retour aux paramètres" })}
      />
      <div>
        <h1 className="text-xl font-semibold">{title}</h1>
        {description && <p className="text-sm text-muted-foreground mt-1">{description}</p>}
      </div>
    </div>
  );
}

export function SettingsRow({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-1">
      <div className="min-w-0">
        <p className="text-sm font-medium">{label}</p>
        {hint && <p className="text-xs text-muted-foreground mt-0.5">{hint}</p>}
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
