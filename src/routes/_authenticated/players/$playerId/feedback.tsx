import { createFileRoute } from "@tanstack/react-router";
import { CoachFeedbackTab } from "@/components/coach-feedback-tab";
import { useAuth, useActiveRole } from "@/lib/auth-context";
import { useTranslation } from "react-i18next";

export const Route = createFileRoute("/_authenticated/players/$playerId/feedback")({
  component: PlayerFeedbackPage,
});

function PlayerFeedbackPage() {
  const { playerId } = Route.useParams();
  const { t } = useTranslation();
  const role = useActiveRole();
  const isCoach = role === "admin" || role === "coach";

  return (
    <div className="px-5 pb-10">
      <CoachFeedbackTab playerId={playerId} isCoach={isCoach} />
    </div>
  );
}
