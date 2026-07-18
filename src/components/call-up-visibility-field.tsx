import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  useCallUpVisibilityConfig,
  useSetCallUpVisibility,
  type CallUpVisibilityChoiceNullable,
  type CallUpVisibilityChoiceStrict,
} from "@/hooks/use-call-up-visibility";
import {
  CallUpVisibilitySelector,
  type CallUpVisibilitySelectorProps,
} from "@/components/call-up-visibility-selector";

/**
 * Self-contained "call-up list visibility" field.
 *
 * One line to plug into any staff-facing edit surface (event edit, team
 * settings, club settings). Owns the whole loop:
 *
 *   RPC read (staff-gated cascade)
 *   → three-value selector (or two-value for club)
 *   → RPC write (SECURITY DEFINER, same guard as read)
 *   → prefix invalidation of both `call-up-visibility-*` query families
 *
 * Read + write both go through RPCs; NEVER touch `show_called_up_players_*`
 * columns directly from the client. `isStaff` gates the config RPC; a
 * non-staff surface must not mount this component.
 *
 * `mode="edit"` is required for scopes `event`/`team` — a not-yet-created
 * event/team has no id to key the cascade on. Callers should only render
 * this after the parent object exists.
 */
type Props =
  | {
      scope: "event";
      id: string;
      isStaff?: boolean;
      disabled?: boolean;
      className?: string;
    }
  | {
      scope: "team";
      id: string;
      isStaff?: boolean;
      disabled?: boolean;
      className?: string;
    }
  | {
      scope: "club";
      id: string;
      isStaff?: boolean;
      disabled?: boolean;
      className?: string;
    };

export function CallUpVisibilityField(props: Props) {
  const { t } = useTranslation("common");
  const { scope, id, disabled, className } = props;
  const isStaff = props.isStaff ?? true;

  const {
    data: config,
    isLoading,
    error,
  } = useCallUpVisibilityConfig(scope, id, {
    enabled: isStaff && Boolean(id),
  });
  const setVisibility = useSetCallUpVisibility();

  if (!isStaff) return null;

  if (isLoading) {
    return (
      <div className={className}>
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !config) {
    // Staff-gated RPC returned 42501 or the row is missing. Do NOT fall back
    // to a raw select — the whole point of the RPC is to be the only read
    // path. Render nothing rather than a wrong default.
    return null;
  }

  // Derive UI value from the config. `source === scope` means an explicit
  // override exists here (even when equal to the parent — see lot B spec
  // decision "défini ici honnête plutôt qu'hérité trompeur").
  const uiValueNullable: CallUpVisibilityChoiceNullable = (() => {
    if (scope === "event") {
      if (config.event_override === null) return "inherit";
      return config.event_override ? "visible" : "masked";
    }
    if (scope === "team") {
      if (config.team_override === null) return "inherit";
      return config.team_override ? "visible" : "masked";
    }
    // club: unreachable in the nullable branch
    return config.club_default ? "visible" : "masked";
  })();

  const uiValueStrict: CallUpVisibilityChoiceStrict = config.club_default ? "visible" : "masked";

  function persist(choice: CallUpVisibilityChoiceNullable | CallUpVisibilityChoiceStrict) {
    // Type-narrow per scope so the RPC gets the right shape.
    if (scope === "club") {
      if (choice === "inherit") return; // guarded by selector too
      setVisibility.mutate(
        { scope: "club", id, choice },
        {
          onSuccess: () => toast.success(t("callUpList.saved")),
          onError: (e) => toast.error((e as Error).message),
        },
      );
      return;
    }
    setVisibility.mutate(
      {
        scope,
        id,
        choice: choice as CallUpVisibilityChoiceNullable,
      },
      {
        onSuccess: () => toast.success(t("callUpList.saved")),
        onError: (e) => toast.error((e as Error).message),
      },
    );
  }

  // Assemble the discriminated selector props per scope. Splitting the union
  // here avoids a `any` cast at the call site.
  const selectorProps: CallUpVisibilitySelectorProps =
    scope === "club"
      ? {
          level: "club",
          id,
          isStaff,
          value: uiValueStrict,
          onChange: persist,
          disabled: disabled || setVisibility.isPending,
        }
      : {
          level: scope,
          id,
          isStaff,
          value: uiValueNullable,
          onChange: persist,
          disabled: disabled || setVisibility.isPending,
        };

  return (
    <div className={className}>
      <CallUpVisibilitySelector {...selectorProps} />
    </div>
  );
}
