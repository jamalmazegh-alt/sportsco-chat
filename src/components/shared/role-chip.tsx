/**
 * RoleChip — palette de rôles CANONIQUE (spec Phase 2 UI, surface 6 · pastille 6).
 *
 * Un seul mapping rôle → couleur, utilisé partout : /admin/groups,
 * candidatures de besoins, assignation, recherche de membres. Toute couleur
 * de rôle locale doit passer par ce composant, jamais des classes tailwind
 * en dur dans les listes.
 *
 * Palette (recettée sur l'UI groupes actuelle) :
 *   Administrateur      → rouge
 *   Staff / Bénévole    → violet
 *   Éducateur           → vert
 *   Resp. tournois      → ambre
 *   Joueur              → menthe
 *   Parent              → rose
 */
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

export type CanonicalRole =
  | "admin"
  | "staff"
  | "coach"
  | "tournament_manager"
  | "player"
  | "parent";

const CLASSES: Record<CanonicalRole, string> = {
  admin:
    "text-red-700 bg-red-100 dark:text-red-300 dark:bg-red-950/50",
  staff:
    "text-violet-700 bg-violet-100 dark:text-violet-300 dark:bg-violet-950/50",
  coach:
    "text-emerald-800 bg-emerald-100 dark:text-emerald-300 dark:bg-emerald-950/50",
  tournament_manager:
    "text-amber-800 bg-amber-100 dark:text-amber-300 dark:bg-amber-950/50",
  player:
    "text-teal-800 bg-teal-100 dark:text-teal-300 dark:bg-teal-950/50",
  parent:
    "text-pink-700 bg-pink-100 dark:text-pink-300 dark:bg-pink-950/50",
};

/**
 * Résolution rôle brut (base côté serveur) → canonique.
 * Accepte les alias FR/EN et les valeurs déjà canoniques.
 */
export function canonicalizeRole(raw: string | null | undefined): CanonicalRole | null {
  if (!raw) return null;
  const r = raw.toLowerCase().trim();
  if (r === "admin" || r === "administrator" || r === "administrateur") return "admin";
  if (
    r === "staff" ||
    r === "volunteer" ||
    r === "benevole" ||
    r === "bénévole" ||
    r === "dirigeant" ||
    r === "financial_admin"
  )
    return "staff";
  if (
    r === "coach" ||
    r === "educator" ||
    r === "educateur" ||
    r === "éducateur" ||
    r === "assistant_coach"
  )
    return "coach";
  if (
    r === "tournament_manager" ||
    r === "tournament-manager" ||
    r === "resp_tournois" ||
    r === "resp.tournois"
  )
    return "tournament_manager";
  if (r === "player" || r === "joueur") return "player";
  if (r === "parent") return "parent";
  return null;
}

type Props = {
  role: CanonicalRole | string | null | undefined;
  className?: string;
};

export function RoleChip({ role, className }: Props) {
  const { t } = useTranslation();
  const canonical =
    typeof role === "string" ? canonicalizeRole(role) : (role ?? null);
  if (!canonical) return null;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5",
        "text-[10px] font-bold uppercase tracking-wide leading-none",
        CLASSES[canonical],
        className,
      )}
    >
      {t(`common:roles.${canonical}`)}
    </span>
  );
}

/** Variante interne : accepte le rôle canonique déjà résolu. */
export function CanonicalRoleChip({
  role,
  className,
}: {
  role: CanonicalRole;
  className?: string;
}) {
  return <RoleChip role={role} className={className} />;
}
