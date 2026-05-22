import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ResponsiveFormDialog } from "@/components/responsive-form-dialog";
import { toast } from "sonner";
import {
  Loader2,
  Plus,
  ShieldCheck,
  Flag,
  Copy,
  Trash2,
  CheckCircle2,
  Clock,
} from "lucide-react";
import {
  listTournamentCollaborators,
  inviteTournamentCollaborator,
  revokeTournamentCollaborator,
} from "../tournaments.functions";

type Role = "co_organizer" | "referee";

interface Collaborator {
  id: string;
  role: Role;
  email: string;
  display_name: string | null;
  user_id: string | null;
  invitation_token: string;
  invited_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
}

export function CollaboratorsManager({ tournamentId }: { tournamentId: string }) {
  const listFn = useServerFn(listTournamentCollaborators);
  const inviteFn = useServerFn(inviteTournamentCollaborator);
  const revokeFn = useServerFn(revokeTournamentCollaborator);
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: ["tournament-collaborators", tournamentId],
    queryFn: () => listFn({ data: { tournament_id: tournamentId } }),
  });

  const [open, setOpen] = useState(false);
  const [role, setRole] = useState<Role>("co_organizer");
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");

  const invite = useMutation({
    mutationFn: () =>
      inviteFn({
        data: {
          tournament_id: tournamentId,
          role,
          email: email.trim(),
          display_name: displayName.trim() || null,
        },
      }),
    onSuccess: () => {
      toast.success("Invitation envoyée");
      qc.invalidateQueries({ queryKey: ["tournament-collaborators", tournamentId] });
      setOpen(false);
      setEmail("");
      setDisplayName("");
    },
    onError: (e: any) => toast.error(e?.message ?? "Erreur"),
  });

  const revoke = useMutation({
    mutationFn: (id: string) =>
      revokeFn({ data: { tournament_id: tournamentId, collaborator_id: id } }),
    onSuccess: () => {
      toast.success("Retiré");
      qc.invalidateQueries({ queryKey: ["tournament-collaborators", tournamentId] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Erreur"),
  });

  const items = (q.data?.collaborators ?? []) as Collaborator[];
  const coOrgs = items.filter((c) => c.role === "co_organizer");
  const referees = items.filter((c) => c.role === "referee");

  const inviteUrl = (token: string) =>
    typeof window !== "undefined"
      ? `${window.location.origin}/tournament-invite/${token}`
      : `/tournament-invite/${token}`;

  const copyLink = (token: string) => {
    if (typeof navigator === "undefined") return;
    navigator.clipboard
      .writeText(inviteUrl(token))
      .then(() => toast.success("Lien d'invitation copié"))
      .catch(() => toast.error("Impossible de copier"));
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold">Équipe d'organisation</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Invite des co-organisateurs et des arbitres par email.
          </p>
        </div>
        <Button size="sm" onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" />
          Inviter
        </Button>
      </div>

      {q.isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          <Section
            icon={<ShieldCheck className="h-4 w-4 text-primary" />}
            title="Co-organisateurs"
            subtitle="Droits complets sur le tournoi (sauf suppression)."
            items={coOrgs}
            onCopy={copyLink}
            onRevoke={(id) => revoke.mutate(id)}
          />
          <Section
            icon={<Whistle className="h-4 w-4 text-primary" />}
            title="Arbitres"
            subtitle="Peuvent saisir scores et valider les matchs qui leur sont assignés."
            items={referees}
            onCopy={copyLink}
            onRevoke={(id) => revoke.mutate(id)}
          />
        </>
      )}

      <ResponsiveFormDialog
        open={open}
        onOpenChange={setOpen}
        title="Inviter un collaborateur"
        description="Un lien d'invitation sera généré. Partage-le avec la personne concernée."
      >
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Rôle</Label>
            <Select value={role} onValueChange={(v) => setRole(v as Role)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="co_organizer">Co-organisateur</SelectItem>
                <SelectItem value="referee">Arbitre</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="collab-email">Email</Label>
            <Input
              id="collab-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="nom@exemple.com"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="collab-name">Nom (optionnel)</Label>
            <Input
              id="collab-name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Jean Dupont"
            />
          </div>
          <Button
            className="w-full"
            disabled={!email.trim() || invite.isPending}
            onClick={() => invite.mutate()}
          >
            {invite.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Envoyer l'invitation"}
          </Button>
        </div>
      </ResponsiveFormDialog>
    </div>
  );
}

function Section({
  icon,
  title,
  subtitle,
  items,
  onCopy,
  onRevoke,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  items: Collaborator[];
  onCopy: (token: string) => void;
  onRevoke: (id: string) => void;
}) {
  return (
    <section className="space-y-2">
      <div className="flex items-center gap-2">
        {icon}
        <h3 className="text-sm font-semibold">{title}</h3>
        <span className="text-xs text-muted-foreground">({items.length})</span>
      </div>
      <p className="text-xs text-muted-foreground">{subtitle}</p>
      {items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
          Aucune invitation pour le moment.
        </div>
      ) : (
        <ul className="space-y-2">
          {items.map((c) => (
            <li
              key={c.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-card p-3"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">
                  {c.display_name || c.email}
                </p>
                {c.display_name && (
                  <p className="text-xs text-muted-foreground truncate">{c.email}</p>
                )}
                <div className="mt-1 flex items-center gap-1.5 text-[11px]">
                  {c.accepted_at ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-emerald-700 dark:text-emerald-400">
                      <CheckCircle2 className="h-3 w-3" /> Acceptée
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-amber-700 dark:text-amber-400">
                      <Clock className="h-3 w-3" /> En attente
                    </span>
                  )}
                </div>
              </div>
              <div className="flex gap-1">
                {!c.accepted_at && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onCopy(c.invitation_token)}
                  >
                    <Copy className="h-3.5 w-3.5" />
                    Lien
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => onRevoke(c.id)}
                  aria-label="Retirer"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
