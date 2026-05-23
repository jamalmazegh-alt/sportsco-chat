import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { ChevronLeft } from "lucide-react";
import { Switch } from "@/components/ui/switch";

export function SettingsSubHeader({ title, description }: { title: string; description?: string }) {
  const { t } = useTranslation();
  return (
    <div className="space-y-4">
      <Link
        to="/admin"
        aria-label={t("admin.back", { defaultValue: "Retour aux paramètres" })}
        className="group inline-flex items-center gap-2 rounded-full border border-border bg-card pl-1.5 pr-3.5 py-1.5 text-xs font-medium text-muted-foreground shadow-sm hover:text-foreground hover:bg-muted/60 hover:border-foreground/20 active:scale-[0.97] transition-all"
      >
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-foreground group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
          <ChevronLeft className="h-3.5 w-3.5" />
        </span>
        {t("admin.back", { defaultValue: "Retour aux paramètres" })}
      </Link>
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
