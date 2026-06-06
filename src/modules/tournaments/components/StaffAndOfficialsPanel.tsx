import { CollaboratorsManager } from "./CollaboratorsManager";

/**
 * Unified Staff & arbitres panel.
 * CollaboratorsManager handles both co-organizers and referees via a single
 * invite flow with a role selector — no need for a second sub-screen.
 */
export function StaffAndOfficialsPanel({ tournamentId }: { tournamentId: string }) {
  return <CollaboratorsManager tournamentId={tournamentId} />;
}
