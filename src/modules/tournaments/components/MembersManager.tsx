import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { sendTransactionalEmail } from "@/lib/email/send";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  listTournamentMembers,
  inviteTournamentMember,
  removeTournamentMember,
  assignRefereeToMatch,
  convertOfflineMember,
} from "@/lib/permissions.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ResponsiveFormDialog } from "@/components/responsive-form-dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Loader2, UserPlus, Mail, Trash2, ShieldCheck, Gavel, Briefcase, Copy,
} from "lucide-react";
import { toast } from "sonner";

type TournamentRole = "tournament_admin" | "staff" | "referee";

interface Match {
  id: string;
  match_number?: number | null;
  team_a_id?: string | null;
  team_b_id?: string | null;
}
interface Team {
  id: string;
  name: string;
}

interface Props {
  tournamentId: string;
  matches: Match[];
  teams: Team[];
}

const ROLE_ICON: Record<TournamentRole, any> = {
  tournament_admin: ShieldCheck,
  staff: Briefcase,
  referee: Gavel,
};

export function MembersManager({ tournamentId, matches, teams }: Props) {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();

  const listFn = useServerFn(listTournamentMembers);
  const inviteFn = useServerFn(inviteTournamentMember);
  const removeFn = useServerFn(removeTournamentMember);
  const assignFn = useServerFn(assignRefereeToMatch);
  const convertFn = useServerFn(convertOfflineMember);

  const { data, isLoading } = useQuery({
    queryKey: ["tournament-members", tournamentId],
    queryFn: () => listFn({ data: { tournament_id: tournamentId } }),
  });

  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [role, setRole] = useState<TournamentRole>("staff");
  const [busy, setBusy] = useState(false);
  const [removeId, setRemoveId] = useState<string | null>(null);

  const teamById = new Map(teams.map((tm) => [tm.id, tm.name]));

  function resetForm() {
    setEmail(""); setFirstName(""); setLastName(""); setRole("staff");
  }

  async function onInvite(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await inviteFn({
        data: {
          tournament_id: tournamentId,
          email,
          first_name: firstName,
          last_name: lastName,
          role,
        },
      });
      toast.success(
        res.linked
          ? t("tournamentMembers.added", { defaultValue: "Membre ajouté" })
          : res.offline
            ? t("tournamentMembers.offlineAdded", { defaultValue: "Ajouté (sans compte)" })
            : t("tournamentMembers.invited", { defaultValue: "Invitation créée" }),
      );

      const locale = (i18n.language?.startsWith("en") ? "en" : "fr") as "fr" | "en";
      const roleLabel = t(`roles.${role}`, { lng: locale, defaultValue: role });

      if (res.linked && res.tournament_slug && email) {
        const tournamentUrl = `${window.location.origin}/tournament/${res.tournament_slug}`;
        sendTransactionalEmail({
          templateName: "tournament-member-added",
          recipientEmail: email,
          idempotencyKey: `tournament-member-added-${res.member_id}`,
          templateData: {
            displayName: firstName,
            tournamentName: res.tournament_name ?? undefined,
            roleLabel,
            tournamentUrl,
            locale,
          },
        }).catch((err) => {
          console.error("tournament-member-added email failed", err);
        });
      } else if (!res.linked && !res.offline && res.invite_token && email) {
        const inviteUrl = `${window.location.origin}/tournament-invite/${res.invite_token}`;
        sendTransactionalEmail({
          templateName: "tournament-invite",
          recipientEmail: email,
          idempotencyKey: `tournament-member-invite-${res.member_id}`,
          templateData: {
            displayName: firstName,
            tournamentName: res.tournament_name ?? undefined,
            roleLabel,
            inviteUrl,
          },
        }).catch((err) => {
          console.error("tournament-member invite email failed", err);
        });
      }



      setOpen(false);
      resetForm();
      qc.invalidateQueries({ queryKey: ["tournament-members", tournamentId] });
    } catch (err: any) {
      toast.error(err?.message ?? "Error");
    } finally {
      setBusy(false);
    }
  }

  async function confirmRemove() {
    const memberId = removeId;
    if (!memberId) return;
    setRemoveId(null);
    try {
      await removeFn({ data: { tournament_id: tournamentId, member_id: memberId } });
      toast.success(t("tournamentMembers.removed", { defaultValue: "Membre retiré" }));
      qc.invalidateQueries({ queryKey: ["tournament-members", tournamentId] });
    } catch (err: any) {
      toast.error(err?.message ?? "Error");
    }
  }

  async function toggleAssign(memberId: string, matchId: string, currentlyAssigned: boolean) {
    try {
      await assignFn({
        data: {
          tournament_id: tournamentId,
          member_id: memberId,
          match_id: matchId,
          remove: currentlyAssigned,
        },
      });
      qc.invalidateQueries({ queryKey: ["tournament-members", tournamentId] });
    } catch (err: any) {
      toast.error(err?.message ?? "Error");
    }
  }

  function copyInviteLink(token: string) {
    const url = `${window.location.origin}/tournament-invite/${token}`;
    navigator.clipboard.writeText(url);
    toast.success(t("tournamentMembers.linkCopied", { defaultValue: "Lien copié" }));
  }

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">
          {t("tournamentMembers.title", { defaultValue: "Membres du tournoi" })}
        </h3>
        <ResponsiveFormDialog
          open={open}
          onOpenChange={(o) => { setOpen(o); if (!o) resetForm(); }}
          trigger={
            <Button size="sm" className="h-9">
              <UserPlus className="h-4 w-4" />
              {t("tournamentMembers.invite", { defaultValue: "Inviter" })}
            </Button>
          }
          title={t("tournamentMembers.inviteTitle", { defaultValue: "Inviter un membre" })}
        >
          <form onSubmit={onInvite} className="space-y-4 mt-4 pb-6">
            <div className="space-y-1.5">
              <Label>{t("tournamentMembers.role", { defaultValue: "Rôle" })}</Label>
              <Select value={role} onValueChange={(v) => setRole(v as TournamentRole)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="tournament_admin">
                    {t("roles.tournament_admin", { defaultValue: "Admin du tournoi" })}
                  </SelectItem>
                  <SelectItem value="staff">
                    {t("roles.staff", { defaultValue: "Staff" })}
                  </SelectItem>
                  <SelectItem value="referee">
                    {t("roles.referee", { defaultValue: "Arbitre" })}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>{t("players.firstName")}<span className="text-destructive ml-1">*</span></Label>
                <Input required value={firstName} onChange={(e) => setFirstName(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>{t("players.lastName")}<span className="text-destructive ml-1">*</span></Label>
                <Input required value={lastName} onChange={(e) => setLastName(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>
                {t("players.email")}{" "}
                <span className="text-muted-foreground text-xs font-normal">
                  ({t("common.optional", { defaultValue: "optionnel" })})
                </span>
              </Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              <p className="text-[11px] text-muted-foreground leading-snug">
                {t("tournamentMembers.emailHint", {
                  defaultValue: "Laissez vide pour ajouter sans compte. Vous pourrez l'inviter plus tard.",
                })}
              </p>
            </div>
            <Button type="submit" className="w-full h-11" disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : (
                <><Mail className="h-4 w-4" />{t("tournamentMembers.sendInvite", { defaultValue: "Envoyer l'invitation" })}</>
              )}
            </Button>
          </form>
        </ResponsiveFormDialog>
      </header>

      {isLoading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        </div>
      ) : (data?.members ?? []).length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
          {t("tournamentMembers.empty", { defaultValue: "Aucun membre pour le moment." })}
        </div>
      ) : (
        <ul className="rounded-2xl border border-border bg-card divide-y divide-border overflow-hidden">
          {(data?.members ?? []).map((m: any) => {
            const Icon = ROLE_ICON[m.role as TournamentRole] ?? Briefcase;
            const fullName = [m.first_name, m.last_name].filter(Boolean).join(" ") || m.email;
            const assigned: string[] = m.assigned_match_ids ?? [];
            return (
              <li key={m.id} className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate flex items-center gap-2">
                      <Icon className="h-4 w-4 text-muted-foreground" />
                      {fullName}
                    </p>
                    <p className="text-xs text-muted-foreground truncate mt-0.5">{m.email}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-primary/10 text-primary">
                        {t(`roles.${m.role}`, { defaultValue: m.role })}
                      </span>
                      {!m.joined_at && (
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-300">
                          {t("tournamentMembers.pending", { defaultValue: "En attente" })}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {!m.joined_at && m.invite_token && (
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => copyInviteLink(m.invite_token)}
                        title={t("tournamentMembers.copyLink", { defaultValue: "Copier le lien" })}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    )}
                    <Button
                      size="icon"
                      variant="ghost"
                      className="text-destructive hover:text-destructive"
                      onClick={() => setRemoveId(m.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                {m.role === "referee" && matches.length > 0 && (
                  <details className="text-xs">
                    <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                      {t("tournamentMembers.assignMatches", { defaultValue: "Affecter à des matchs" })} ({assigned.length})
                    </summary>
                    <div className="mt-2 grid gap-1 max-h-64 overflow-y-auto pr-1">
                      {matches.map((mt) => {
                        const isOn = assigned.includes(mt.id);
                        const home = mt.team_a_id ? teamById.get(mt.team_a_id) : "?";
                        const away = mt.team_b_id ? teamById.get(mt.team_b_id) : "?";
                        return (
                          <label
                            key={mt.id}
                            className="flex items-center gap-2 p-1.5 rounded hover:bg-muted/40 cursor-pointer"
                          >
                            <input
                              type="checkbox"
                              className="h-3.5 w-3.5 accent-primary"
                              checked={isOn}
                              onChange={() => toggleAssign(m.id, mt.id, isOn)}
                            />
                            <span className="truncate">
                              #{mt.match_number ?? "—"} · {home ?? "?"} vs {away ?? "?"}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </details>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <AlertDialog open={!!removeId} onOpenChange={(o) => { if (!o) setRemoveId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("tournamentMembers.confirmRemoveTitle", { defaultValue: "Retirer ce membre ?" })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("tournamentMembers.confirmRemoveDesc", { defaultValue: "Cette personne n'aura plus accès au tournoi. Vous pourrez la réinviter plus tard." })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel", { defaultValue: "Annuler" })}</AlertDialogCancel>
            <AlertDialogAction onClick={confirmRemove} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {t("tournamentMembers.confirmRemoveAction", { defaultValue: "Retirer" })}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
