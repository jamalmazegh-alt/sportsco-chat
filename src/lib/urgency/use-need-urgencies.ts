// Collecteur besoins ouverts non répondus — MULTI-RÔLE.
//
// Périmètre (spec) : un item est produit ssi
//   - le besoin est open
//   - l'utilisateur est destinataire (garanti par RLS via listMyOpenNeeds)
//   - il n'a AUCUN signup (applied/confirmed/unavailable/withdrawn/declined)
//   - remaining_seats > 0
//   - l'événement n'a pas commencé
//
// Un besoin s'adresse à la personne, pas à ses enfants : 1 besoin = 1 item
// (dédup naturel via id = `open-need:${needId}:${role}`).
//
// La logique pure est extraite pour être table-testée sans React/Supabase.

import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useServerFn } from "@tanstack/react-start";
import { format } from "date-fns";
import { listMyOpenNeeds } from "@/lib/needs/needs.functions";
import { useAuth, useMyRoles } from "@/lib/auth-context";
import { dateLocale } from "@/lib/date-locale";
import { severityForStart as pureSeverityForStart, type SeverityThresholds } from "./pure";
import type { UrgencyCollectorResult, UrgencyItem, UrgencyRole, UrgencySeverity } from "./types";

const DAY_MS = 86_400_000;

export type OpenNeedInput = {
  id: string;
  status: string;
  capacity: number;
  remaining_seats: number;
  role_key: string;
  label: string | null;
  my_signup: { status: string } | null;
  events: {
    id: string;
    title: string | null;
    starts_at: string;
  } | null;
};

// Seuils spécifiques aux besoins ouverts : la fenêtre d'organisation
// est plus large que pour les convocations (24 h / 3 j).
const NEED_THRESHOLDS: SeverityThresholds = {
  criticalHours: 48,
  highHours: 24 * 7,
};

export type ComputeOpenNeedUrgenciesArgs = {
  needs: readonly OpenNeedInput[];
  role: UrgencyRole;
  now?: Date;
  // Injection i18n / formatage — pour rester pur & testable.
  formatWhen: (startsAt: string) => string;
  labelForRole: (roleKey: string) => string;
  seatsSuffix: (remaining: number) => string; // "" si <=1
  fallbackTitle: string;
};

/**
 * Ré-export local pour compat des tests. Délègue à la fonction pure
 * partagée avec les seuils propres aux besoins (48 h / 7 j).
 */
export function severityForStart(startsAt: string, now: Date = new Date()): UrgencySeverity | null {
  return pureSeverityForStart(startsAt, now, NEED_THRESHOLDS);
}

/**
 * Filtrage + mapping pur. Ne fait aucune requête. Dédup implicite via `id`
 * quand plusieurs entrées portent le même needId (mergeUrgencies fait le reste).
 */
export function computeOpenNeedUrgencies(args: ComputeOpenNeedUrgenciesArgs): UrgencyItem[] {
  const {
    needs,
    role,
    now = new Date(),
    formatWhen,
    labelForRole,
    seatsSuffix,
    fallbackTitle,
  } = args;
  const items: UrgencyItem[] = [];
  const seen = new Set<string>();

  for (const n of needs) {
    if (n.status !== "open") continue;
    if (n.my_signup) continue; // toute réponse (y compris unavailable) fait disparaître l'item
    if ((n.remaining_seats ?? 0) <= 0) continue;
    if (!n.events || !n.events.starts_at) continue;

    const sev = severityForStart(n.events.starts_at, now);
    if (!sev) continue;

    const id = `open-need:${n.id}:${role}`;
    if (seen.has(id)) continue; // dédup si doublon dans le payload
    seen.add(id);

    const roleLabel = labelForRole(n.role_key);
    const needLabel = (n.label && n.label.trim().length > 0 ? n.label : roleLabel) || fallbackTitle;
    const title = needLabel;
    const matchTitle = n.events.title?.trim() || fallbackTitle;
    const subtitle = `${matchTitle} · ${formatWhen(n.events.starts_at)}${seatsSuffix(n.remaining_seats)}`;

    items.push({
      id,
      source: "open-need",
      sourceId: n.id,
      severity: sev,
      role,
      title,
      subtitle,
      anchorAt: n.events.starts_at,
      primaryAction: { kind: "open-need", needId: n.id, eventId: n.events.id },
    });
  }

  return items;
}

export function useNeedUrgencies(): UrgencyCollectorResult & { isPending: boolean } {
  const { t } = useTranslation();
  const { user, activeClubId } = useAuth();
  const roles = useMyRoles();
  const isCoach =
    roles.includes("admin") || roles.includes("coach") || roles.includes("assistant_coach");
  const isPlayer = roles.includes("player");
  const isParent = roles.includes("parent");
  const enabled = !!activeClubId && !!user && (isCoach || isPlayer || isParent);

  const listFn = useServerFn(listMyOpenNeeds);

  const q = useQuery({
    queryKey: ["urgency", "open-need", activeClubId, user?.id],
    enabled,
    staleTime: 30_000,
    queryFn: async (): Promise<UrgencyItem[]> => {
      const res = await listFn({ data: {} });
      const needs = (res?.needs ?? []) as unknown as OpenNeedInput[];
      const role: UrgencyRole = isCoach ? "coach" : isPlayer ? "player" : "parent";
      const locale = dateLocale();
      return computeOpenNeedUrgencies({
        needs,
        role,
        formatWhen: (iso: string) => format(new Date(iso), "EEE d MMM, HH:mm", { locale }),
        labelForRole: (key: string) =>
          t(`needs:templates.${key}`, { defaultValue: key.replace(/_/g, " ") }),
        seatsSuffix: (remaining: number) =>
          remaining > 1
            ? ` · ${t("needs:urgency.seatsRemaining", {
                count: remaining,
              })}`
            : "",
        fallbackTitle: t("needs:urgency.fallbackTitle"),
      });
    },
  });

  return {
    items: q.data ?? [],
    failed: q.isError,
    isPending: q.isPending && q.fetchStatus !== "idle",
  };
}
