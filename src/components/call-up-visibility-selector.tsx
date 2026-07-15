import { Eye, Lock } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  useCallUpVisibilityConfig,
  type CallUpVisibilityConfig,
  type CallUpVisibilitySource,
} from "@/hooks/use-call-up-visibility";
import { cn } from "@/lib/utils";

/**
 * Discriminated union: `club` scope has NO `inherit` option — the club is
 * the root of the cascade. Only `event` and `team` inherit from a parent.
 */
export type CallUpVisibilitySelectorProps =
  | {
      level: "event";
      id: string;
      isStaff: boolean;
      value: "inherit" | "visible" | "masked";
      onChange: (v: "inherit" | "visible" | "masked") => void;
      disabled?: boolean;
      className?: string;
    }
  | {
      level: "team";
      id: string;
      isStaff: boolean;
      value: "inherit" | "visible" | "masked";
      onChange: (v: "inherit" | "visible" | "masked") => void;
      disabled?: boolean;
      className?: string;
    }
  | {
      level: "club";
      id: string;
      isStaff: boolean;
      value: "visible" | "masked";
      onChange: (v: "visible" | "masked") => void;
      disabled?: boolean;
      className?: string;
    };

/**
 * Three-level visibility selector.
 *
 * Rendering contract:
 *  - `event` / `team`: options are `inherit | visible | masked`. When the
 *    user picks `inherit`, the resolved effective value + source is rendered
 *    NEXT TO the choice (not instead of it). Example:
 *      [•] Hériter → 🔒 Masqué (hérité de l'équipe)
 *  - `club`: options are `visible | masked` only. No `inherit`, no orphan
 *    "inherited from" suffix. The choice IS the result.
 *
 * The config RPC is staff-only; `isStaff` MUST reflect the caller's
 * server-side capability. When false the selector is rendered read-only
 * without mounting the config hook (no 42501 loop).
 */
export function CallUpVisibilitySelector(props: CallUpVisibilitySelectorProps) {
  const { t } = useTranslation("common");
  const { level, id, isStaff, disabled, className } = props;

  const { data: config, isLoading } = useCallUpVisibilityConfig(level, id, {
    enabled: isStaff,
  });

  return (
    <div className={cn("space-y-3", className)}>
      <div>
        <Label className="text-sm font-medium">{t("callUpList.settingLabel")}</Label>
        <p className="text-xs text-muted-foreground mt-1">{t("callUpList.settingHelp")}</p>
      </div>

      <RadioGroup
        value={props.value}
        onValueChange={(v) => {
          if (level === "club") {
            if (v === "visible" || v === "masked") props.onChange(v);
          } else if (v === "inherit" || v === "visible" || v === "masked") {
            props.onChange(v);
          }
        }}
        disabled={disabled || !isStaff}
        className="gap-2"
      >
        {(level === "event" || level === "team") && (
          <OptionRow
            id={`callup-${level}-${id}-inherit`}
            value="inherit"
            label={t("callUpList.inherit")}
            trailing={
              // Show the resolved effective value alongside the "inherit" choice.
              config && !isLoading ? (
                <ResolvedEffective config={config} level={level} />
              ) : null
            }
          />
        )}

        <OptionRow
          id={`callup-${level}-${id}-visible`}
          value="visible"
          label={t("callUpList.optionVisible")}
          leadingIcon={<Eye className="h-3.5 w-3.5" aria-hidden />}
        />

        <OptionRow
          id={`callup-${level}-${id}-masked`}
          value="masked"
          label={t("callUpList.optionMasked")}
          leadingIcon={<Lock className="h-3.5 w-3.5" aria-hidden />}
        />
      </RadioGroup>
    </div>
  );
}

function OptionRow({
  id,
  value,
  label,
  leadingIcon,
  trailing,
}: {
  id: string;
  value: string;
  label: string;
  leadingIcon?: React.ReactNode;
  trailing?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2">
      <RadioGroupItem id={id} value={value} />
      <Label htmlFor={id} className="flex items-center gap-1.5 cursor-pointer font-normal">
        {leadingIcon}
        <span>{label}</span>
      </Label>
      {trailing ? (
        <span className="text-xs text-muted-foreground ml-1 flex items-center gap-1">
          <span aria-hidden>→</span>
          {trailing}
        </span>
      ) : null}
    </div>
  );
}

/**
 * Renders `effective + source` from the RPC. Only used inside the `inherit`
 * row of `event` and `team` selectors. Source label:
 *  - source='event': "Défini ici" (only meaningful on the team form when
 *    someone else set an event override — normally the event row itself is
 *    "Défini ici"; source is honest even when the override equals its parent)
 *  - source='team': "Hérité de l'équipe"
 *  - source='club': "Hérité du club"
 */
function ResolvedEffective({
  config,
  level,
}: {
  config: CallUpVisibilityConfig;
  level: "event" | "team";
}) {
  const { t } = useTranslation("common");
  const Icon = config.effective ? Eye : Lock;
  const stateLabel = config.effective ? t("callUpList.visible") : t("callUpList.masked");
  const sourceLabel = sourceLabelFor(config.source, level, t);
  return (
    <>
      <Icon className="h-3 w-3" aria-hidden />
      <span>{stateLabel}</span>
      {sourceLabel ? <span className="opacity-70">({sourceLabel})</span> : null}
    </>
  );
}

function sourceLabelFor(
  source: CallUpVisibilitySource,
  level: "event" | "team",
  t: (k: string) => string,
): string | null {
  // On the event form: "inherit" ⇒ source is 'team' or 'club'.
  // On the team form:  "inherit" ⇒ source is 'club'.
  // If source equals the current level, the user did not actually pick
  // inherit — no suffix is rendered.
  if (source === level) return null;
  if (source === "team") return t("callUpList.inheritedFromTeam");
  if (source === "club") return t("callUpList.inheritedFromClub");
  return null;
}
