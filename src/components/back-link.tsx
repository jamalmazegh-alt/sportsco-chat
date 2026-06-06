import { Link } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

type LinkProps = React.ComponentProps<typeof Link>;

interface CommonProps {
  label?: string;
  className?: string;
}

/**
 * Pill-shaped back button with a chevron in a circle.
 * Use either `to` (router link) OR `onClick` (button).
 */
export function BackLink({
  label,
  className,
  ...linkProps
}: CommonProps & LinkProps) {
  const { t } = useTranslation();
  const text = label ?? t("common.back", { defaultValue: "Retour" });
  return (
    <Link
      {...(linkProps as LinkProps)}
      aria-label={text}
      className={cn(backClasses, className)}
    >
      <span className={chevronWrapClasses}>
        <ChevronLeft className="h-3.5 w-3.5" />
      </span>
      {text}
    </Link>
  );
}

export function BackButton({
  label,
  onClick,
  className,
  type = "button",
}: CommonProps & {
  onClick?: React.MouseEventHandler<HTMLButtonElement>;
  type?: "button" | "submit";
}) {
  const { t } = useTranslation();
  const text = label ?? t("common.back", { defaultValue: "Retour" });
  return (
    <button
      type={type}
      onClick={onClick}
      aria-label={text}
      className={cn(backClasses, className)}
    >
      <span className={chevronWrapClasses}>
        <ChevronLeft className="h-3.5 w-3.5" />
      </span>
      {text}
    </button>
  );
}

const backClasses =
  "group inline-flex items-center gap-2 rounded-full border border-border bg-card pl-1.5 pr-3.5 py-1.5 text-xs font-medium text-muted-foreground shadow-sm hover:text-foreground hover:bg-muted/60 hover:border-foreground/20 active:scale-[0.97] transition-all";

const chevronWrapClasses =
  "flex h-6 w-6 items-center justify-center rounded-full bg-muted text-foreground group-hover:bg-primary group-hover:text-primary-foreground transition-colors";
