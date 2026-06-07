import { createFileRoute, Navigate, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { Loader2 } from "lucide-react";
import { CoachFeedbackTab } from "@/components/coach-feedback-tab";
import { useAuth, useMyRoles } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/players/$playerId/feedback")({
  component: PlayerFeedbackPage,
});

async function canViewPlayerFeedback(userId: string, playerId: string, isAdmin: boolean, isCoach: boolean) {
  if (!isAdmin && !isCoach) return false;
  if (isAdmin) {
    const { data: adminOk } = await supabase.rpc("is_player_club_admin", {
      _user_id: userId,
      _player_id: playerId,
    });
    if (adminOk) return true;
  }
  if (isCoach) {
    const { data: coachOk } = await supabase.rpc("can_author_player_feedback", {
      _user_id: userId,
      _player_id: playerId,
    });
    return !!coachOk;
  }
  return false;
}

function PlayerFeedbackPage() {
  const { playerId } = Route.useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const roles = useMyRoles();
  const isAdmin = roles.includes("admin");
  const isCoach = roles.includes("coach") || roles.includes("assistant_coach");

  const { data: canView, isLoading: viewLoading } = useQuery({
    queryKey: ["player-feedback-view", playerId, user?.id, isAdmin, isCoach],
    enabled: !!user && !!playerId,
    queryFn: () => canViewPlayerFeedback(user!.id, playerId, isAdmin, isCoach),
  });

  const { data: canAuthor } = useQuery({
    queryKey: ["player-feedback-access", playerId, user?.id],
    enabled: !!user && !!playerId && !!canView,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("can_author_player_feedback", {
        _user_id: user!.id,
        _player_id: playerId,
      });
      if (error) return false;
      return !!data;
    },
  });

  useEffect(() => {
    if (!viewLoading && canView === false) {
      navigate({ to: "/players/$playerId", params: { playerId }, replace: true });
    }
  }, [viewLoading, canView, playerId, navigate]);

  if (viewLoading) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!canView) {
    return <Navigate to="/players/$playerId" params={{ playerId }} replace />;
  }

  const isCoachEditor = (isAdmin || isCoach) && !!canAuthor;
  return <CoachFeedbackTab playerId={playerId} isCoach={isCoachEditor} />;
}
