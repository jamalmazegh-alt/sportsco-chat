import { createFileRoute, Navigate, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import { useState, type FormEvent } from "react";
import { useAuth, useActiveRole } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { sendTransactionalEmail } from "@/lib/email/send";
import { Loader2, Users, Mail, ShieldCheck, Trophy, UserPlus } from "lucide-react";
import { listClubUsers } from "@/lib/admin.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ResponsiveFormDialog } from "@/components/responsive-form-dialog";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/users")({
  component: AdminUsersPage,
  head: () => ({ meta: [{ title: "Users — Clubero" }] }),
});

function AdminUsersPage() {
  const { t } = useTranslation();
  const { activeClubId, user } = useAuth();
  const role = useActiveRole();
  const qc = useQueryClient();
  const fetchUsers = useServerFn(listClubUsers);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-club-users", activeClubId],
    enabled: !!activeClubId && role === "admin",
    queryFn: async () => {
      const res = await fetchUsers({ data: { club_id: activeClubId! } });
      return res.users;
    },
  });


  const [open, setOpen] = useState(false);
  const [inviteRole, setInviteRole] = useState<"admin" | "coach">("coach");
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [email, setEmail] = useState("");
  const [teamId, setTeamId] = useState<string>("");
  const [busy, setBusy] = useState(false);

  function reset() {
    setInviteRole("coach"); setFirst(""); setLast(""); setEmail(""); setTeamId("");
  }

  async function onInvite(e: FormEvent) {
    e.preventDefault();
    if (!activeClubId || !user) return;
    setBusy(true);

    // Refuse if email already has a Clubero account in this club
    try {
      const { data: exists } = await supabase.rpc("email_exists", { _email: email });
      if (exists === true) {
        setBusy(false);
        toast.error(t("admin.inviteEmailAlreadyUser", { defaultValue: "Cette adresse a déjà un compte Clubero. Demandez-lui de se connecter, puis ajoutez-la via son profil." }));
        return;
      }
    } catch { /* non-blocking */ }

    const token = `${crypto.randomUUID()}-${crypto.randomUUID()}`.replace(/-/g, "");
    const { error: invErr } = await supabase.from("member_invites").insert({
      club_id: activeClubId,
      team_id: inviteRole === "coach" && teamId ? teamId : null,
      role: inviteRole,
      email,
      token,
      created_by: user.id,
    });
    if (invErr) {
      setBusy(false);
      toast.error(invErr.message);
      return;
    }

    const { data: clubRow } = await supabase
      .from("clubs").select("name, logo_url").eq("id", activeClubId).maybeSingle();
    const clubLabel = clubRow?.name ?? "Clubero";
    const clubLogoUrl = clubRow?.logo_url ?? undefined;
    const teamName = inviteRole === "coach" && teamId
      ? teams?.find((tt) => tt.id === teamId)?.name
      : undefined;
    const inviteUrl = `${window.location.origin}/register?invite=${encodeURIComponent(token)}`;

    try {
      await sendTransactionalEmail({
        templateName: "player-invite",
        recipientEmail: email,
        idempotencyKey: `staff-invite-${token}`,
        fromName: `${clubLabel} via Clubero`,
        templateData: {
          firstName: first || undefined,
          teamName,
          clubName: clubLabel,
          clubLogoUrl,
          inviteUrl,
        },
      });
    } catch (err: any) {
      setBusy(false);
      toast.error(t("admin.inviteEmailFailed", { defaultValue: "Invitation créée mais l'email n'a pas pu être envoyé." }));
      qc.invalidateQueries({ queryKey: ["admin-club-users", activeClubId] });
      return;
    }

    setBusy(false);
    setOpen(false);
    reset();
    toast.success(t("admin.inviteSent", { defaultValue: "Invitation envoyée" }));
    qc.invalidateQueries({ queryKey: ["admin-club-users", activeClubId] });
  }

  if (role !== "admin") return <Navigate to="/profile" replace />;

  return (
    <div className="px-5 pt-4 pb-10 space-y-4">
      <header className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Users className="h-4 w-4 text-muted-foreground shrink-0" />
          <h2 className="text-sm font-semibold truncate">{t("admin.usersTitle")}</h2>
        </div>
        <ResponsiveFormDialog
          open={open}
          onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}
          trigger={
            <Button size="sm" className="h-9">
              <UserPlus className="h-4 w-4" />
              {t("admin.inviteUser", { defaultValue: "Inviter" })}
            </Button>
          }
          title={t("admin.inviteUser", { defaultValue: "Inviter un utilisateur" })}
        >
          <form onSubmit={onInvite} className="space-y-4 mt-4 pb-6">
            <div className="space-y-1.5">
              <Label>{t("admin.inviteRole", { defaultValue: "Rôle" })}</Label>
              <Select value={inviteRole} onValueChange={(v) => setInviteRole(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">
                    {t("roles.admin")} — {t("admin.roleAdminHint", { defaultValue: "accès complet au club" })}
                  </SelectItem>
                  <SelectItem value="coach">
                    {t("roles.coach")}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>{t("players.firstName")}</Label>
                <Input value={first} onChange={(e) => setFirst(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>{t("players.lastName")}</Label>
                <Input value={last} onChange={(e) => setLast(e.target.value)} />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>{t("players.email")}<span className="text-destructive ml-1">*</span></Label>
              <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>

            <Button type="submit" className="w-full h-11" disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : (
                <>
                  <Mail className="h-4 w-4" />
                  {t("admin.sendInvite", { defaultValue: "Envoyer l'invitation" })}
                </>
              )}
            </Button>
          </form>
        </ResponsiveFormDialog>
      </header>
      <p className="text-xs text-muted-foreground">{t("admin.usersSubtitle")}</p>

      {isLoading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        </div>
      ) : (data ?? []).length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
          {t("admin.usersEmpty")}
        </div>
      ) : (
        <ul className="rounded-2xl border border-border bg-card divide-y divide-border overflow-hidden">
          {(data ?? []).map((u: any) => {
            const name =
              u.profile?.full_name ??
              [u.profile?.first_name, u.profile?.last_name].filter(Boolean).join(" ") ??
              u.email ??
              "—";
            const isAdmin = u.roles.includes("admin");
            const isCoach = u.roles.includes("coach");
            return (
              <li key={u.user_id}>
                <Link
                  to="/admin/users/$userId"
                  params={{ userId: u.user_id }}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-muted/40 transition-colors"
                >
                  <div className="h-9 w-9 rounded-full bg-muted flex items-center justify-center text-xs font-semibold text-muted-foreground overflow-hidden">
                    {u.profile?.avatar_url ? (
                      <img src={u.profile.avatar_url} alt="" className="h-full w-full object-cover" />
                    ) : (
                      (name?.[0] ?? "?").toUpperCase()
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{name || "—"}</p>
                    {u.email && (
                      <p className="text-xs text-muted-foreground truncate flex items-center gap-1 mt-0.5">
                        <Mail className="h-3 w-3" />
                        {u.email}
                      </p>
                    )}
                    <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                      {u.roles.map((r: string) => {
                        const isStaff = r === "admin" || r === "coach";
                        return (
                          <span
                            key={r}
                            className={
                              "text-[10px] font-semibold px-1.5 py-0.5 rounded-full capitalize inline-flex items-center gap-1 " +
                              (r === "admin"
                                ? "bg-primary/15 text-primary"
                                : r === "coach"
                                ? "bg-amber-500/15 text-amber-700 dark:text-amber-300"
                                : "bg-muted text-muted-foreground")
                            }
                          >
                            {r === "admin" && <ShieldCheck className="h-3 w-3" />}
                            {r === "coach" && <Trophy className="h-3 w-3" />}
                            {t(`roles.${r}`, { defaultValue: r })}
                          </span>
                        );
                      })}
                      {!isAdmin && !isCoach && null}
                    </div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
