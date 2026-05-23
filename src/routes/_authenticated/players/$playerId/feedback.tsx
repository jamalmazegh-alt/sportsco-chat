import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CoachFeedbackTab } from "@/components/coach-feedback-tab";
import { useAuth, useActiveRole, useMyRoles } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/players/$playerId/feedback")({
  component: PlayerFeedbackPage,
});

function PlayerFeedbackPage() {
  const { playerId } = Route.useParams();
  const { user } = useAuth();
  const role = useActiveRole();
  const roles = useMyRoles();
  const isActiveCoach = roles.includes("admin") || roles.includes("coach") || roles.includes("assistant_coach");

  // Mirror the event-page pattern: combine role with a server-side RPC check.
  // RLS still enforces access at the row level; this just hides edit affordances
  // for a coach who is not actually attached to this player's team.
  const { data: canAuthor } = useQuery({
    queryKey: ["player-feedback-access", playerId, user?.id],
    enabled: !!user && !!playerId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("can_author_player_feedback", {
        _user_id: user!.id,
        _player_id: playerId,
      });
      if (error) return false;
      return !!data;
    },
  });

  const isCoach = isActiveCoach && !!canAuthor;

  return <CoachFeedbackTab playerId={playerId} isCoach={isCoach} />;
}
