import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Loader2, ShieldCheck, Flag, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import {
  acceptTournamentInvite,
  getTournamentInviteByToken,
} from "@/modules/tournaments/tournaments.functions";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/tournament-invite/$token")({
  component: AcceptInvitePage,
});

function AcceptInvitePage() {
  const { token } = Route.useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const getFn = useServerFn(getTournamentInviteByToken);
  const acceptFn = useServerFn(acceptTournamentInvite);

  const q = useQuery({
    queryKey: ["tournament-invite", token],
    queryFn: () => getFn({ data: { token } }),
  });

  const accept = useMutation({
    mutationFn: () => acceptFn({ data: { token } }),
    onSuccess: (res: any) => {
      toast.success("Invitation acceptée");
      const slug = (q.data?.invite as any)?.tournament_slug;
      if (slug) navigate({ to: `/tournament/${slug}` });
    },
    onError: (e: any) => toast.error(e?.message ?? "Erreur"),
  });

  if (q.isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  const invite = (q.data?.invite ?? null) as null | {
    tournament_name: string;
    tournament_slug: string;
    role: "co_organizer" | "referee";
    email: string;
    accepted: boolean;
    revoked: boolean;
  };

  if (!invite) {
    return (
      <div className="max-w-md mx-auto p-6 text-center space-y-3">
        <h1 className="text-xl font-semibold">Invitation invalide</h1>
        <p className="text-sm text-muted-foreground">
          Ce lien d'invitation n'existe pas ou a été supprimé.
        </p>
      </div>
    );
  }

  if (invite.revoked) {
    return (
      <div className="max-w-md mx-auto p-6 text-center space-y-3">
        <h1 className="text-xl font-semibold">Invitation révoquée</h1>
        <p className="text-sm text-muted-foreground">
          Cette invitation a été annulée par l'organisateur.
        </p>
      </div>
    );
  }

  const Icon = invite.role === "co_organizer" ? ShieldCheck : Flag;
  const roleLabel =
    invite.role === "co_organizer" ? "Co-organisateur" : "Arbitre";

  return (
    <div className="max-w-md mx-auto p-6 space-y-5">
      <div className="flex items-center justify-center h-16 w-16 mx-auto rounded-2xl bg-primary/10">
        <Icon className="h-7 w-7 text-primary" />
      </div>
      <div className="text-center space-y-1.5">
        <h1 className="text-xl font-semibold">Invitation au tournoi</h1>
        <p className="text-sm text-muted-foreground">
          Tu es invité·e en tant que <strong>{roleLabel.toLowerCase()}</strong> pour
        </p>
        <p className="text-base font-medium">{invite.tournament_name}</p>
        <p className="text-xs text-muted-foreground">Adresse invitée : {invite.email}</p>
      </div>

      {invite.accepted ? (
        <div className="rounded-xl border border-border bg-card p-4 text-center space-y-3">
          <div className="inline-flex items-center gap-1.5 text-sm text-emerald-700 dark:text-emerald-400">
            <CheckCircle2 className="h-4 w-4" />
            Invitation déjà acceptée
          </div>
          <Button asChild className="w-full">
            <Link to={`/tournament/${invite.tournament_slug}`}>
              Voir le tournoi
            </Link>
          </Button>
        </div>
      ) : !user ? (
        <div className="space-y-2">
          <p className="text-sm text-center text-muted-foreground">
            Connecte-toi pour accepter cette invitation.
          </p>
          <Button asChild className="w-full">
            <Link
              to="/login"
              search={{ redirect: `/tournament-invite/${token}` }}
            >
              Se connecter
            </Link>
          </Button>
        </div>
      ) : (
        <Button
          className="w-full"
          disabled={accept.isPending}
          onClick={() => accept.mutate()}
        >
          {accept.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            "Accepter l'invitation"
          )}
        </Button>
      )}
    </div>
  );
}
