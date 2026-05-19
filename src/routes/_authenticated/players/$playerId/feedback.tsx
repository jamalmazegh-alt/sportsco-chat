import { createFileRoute } from "@tanstack/react-router";
import { CoachFeedbackTab } from "@/components/coach-feedback-tab";
import { useAuth, useActiveRole } from "@/lib/auth-context";

export const Route = createFileRoute("/_authenticated/players/$playerId/feedback")({
  component: PlayerFeedbackPage,
});

function PlayerFeedbackPage() {
  const { playerId } = Route.useParams();
  const role = useActiveRole();
  const isCoach = role === "admin" || role === "coach";

  return <CoachFeedbackTab playerId={playerId} isCoach={isCoach} />;
}
