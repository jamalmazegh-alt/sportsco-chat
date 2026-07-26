/**
 * PersonRow — ligne personne canonique (spec Phase 2 UI, surface 6 · pastille 4).
 *
 * UN composant partagé pour toutes les listes de personnes :
 *   /admin/groups (membres individuels + recherche d'ajout)
 *   dialog Candidatures d'un besoin (en attente + confirmés + indisponibles)
 *   dialog Assigner directement
 *
 * Structure :
 *   [avatar initiales] [nom + chips de rôle + tag mineur]        [slot action]
 *                      [sous-ligne contexte (Parent de… · licence · commentaire)]
 */
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { RoleChip, type CanonicalRole } from "./role-chip";

export type PersonRowRole = CanonicalRole | string;

export type PersonRowProps = {
  /** Nom affiché (« Théo B. », « David Keller »). */
  name: string;
  /** Rôles à afficher en chips à droite du nom. */
  roles?: PersonRowRole[];
  /**
   * Sous-ligne libre — mixe icône + texte au besoin :
   * « 🪪 Licence 2547318809 · « Je peux venir dès 17h30 » »
   * « Parent de Léo M., Adam M. »
   */
  subline?: ReactNode;
  /**
   * Slot d'action à droite (bouton compact, groupe de boutons, menu ⋯).
   * Aligné verticalement en top pour laisser respirer la sous-ligne.
   */
  action?: ReactNode;
  /**
   * Tag « 🛡️ Mineur — validation adulte requise » en pill violet.
   * Uniquement affiché si `true`.
   */
  isMinor?: boolean;
  /** Libellé i18n du tag mineur (fourni par le parent pour rester traduit). */
  minorLabel?: string;
  /** Avatar override — sinon initiales dérivées de `name`. */
  avatarOverride?: ReactNode;
  /** Style compact (moins de padding, avatar plus petit). */
  compact?: boolean;
  className?: string;
  /** Souligne la ligne (dernière hors bordure inférieure gérée par le parent). */
  divider?: boolean;
};

function initialsFrom(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean).slice(0, 2);
  if (parts.length === 0) return "?";
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("");
}

export function PersonRow({
  name,
  roles,
  subline,
  action,
  isMinor,
  minorLabel,
  avatarOverride,
  compact,
  className,
  divider,
}: PersonRowProps) {
  return (
    <div
      className={cn(
        "flex items-start gap-3",
        compact ? "py-2" : "py-2.5",
        divider && "border-b border-border/60 last:border-b-0",
        className,
      )}
    >
      {avatarOverride ?? (
        <div
          className={cn(
            "flex-shrink-0 rounded-full flex items-center justify-center font-semibold",
            "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300",
            compact ? "h-8 w-8 text-xs" : "h-9 w-9 text-sm",
          )}
          aria-hidden
        >
          {initialsFrom(name)}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-semibold text-sm leading-tight">{name}</span>
          {roles?.map((r, i) => (
            <RoleChip key={`${r}-${i}`} role={r} />
          ))}
          {isMinor && (
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2 py-0.5",
                "text-[10px] font-bold leading-none",
                "text-violet-700 bg-violet-100 dark:text-violet-300 dark:bg-violet-950/50",
              )}
            >
              🛡️ {minorLabel ?? "Mineur"}
            </span>
          )}
        </div>
        {subline && (
          <div className="mt-1 text-xs text-muted-foreground leading-snug">{subline}</div>
        )}
      </div>
      {action && <div className="flex-shrink-0 self-start pt-0.5">{action}</div>}
    </div>
  );
}
