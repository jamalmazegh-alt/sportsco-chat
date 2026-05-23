import { createFileRoute, Navigate, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import { useState, type FormEvent } from "react";
import { useAuth, useActiveRole, useMyRoles } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { sendTransactionalEmail } from "@/lib/email/send";
import { Loader2, Users, Mail, ShieldCheck, Trophy, UserPlus, Search, X } from "lucide-react";
import { listClubUsers } from "@/lib/admin.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ResponsiveFormDialog } from "@/components/responsive-form-dialog";
import { UserDetailSheet } from "@/components/admin/user-detail-sheet";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/users/")({
  component: AdminUsersPage,
  head: () => ({ meta: [{ title: "Users — Clubero" }] }),
});

function AdminUsersPage() {
  const { t } = useTranslation();
  const { activeClubId, user } = useAuth();
  const role = useActiveRole();
  const roles = useMyRoles();
  const qc = useQueryClient();
  const fetchUsers = useServerFn(listClubUsers);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-club-users", activeClubId],
    enabled: !!activeClubId && roles.includes("admin"),
    queryFn: async () => {
      const res = await fetchUsers({ data: { club_id: activeClubId! } });
      return res.users;
    },
  });


  const CLUB_ROLE_KEYS = [
    "admin",
    "coach",
    "assistant_coach",
    "staff",
    "tournament_manager",
  ] as const;
  type ClubRoleKey = (typeof CLUB_ROLE_KEYS)[number];

  const [open, setOpen] = useState(false);
  const [inviteRoles, setInviteRoles] = useState<ClubRoleKey[]>(["coach"]);
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);


  function reset() {
    setInviteRoles(["coach"]); setFirst(""); setLast(""); setEmail("");
  }

  function toggleInviteRole(r: ClubRoleKey, checked: boolean) {
    setInviteRoles((prev) => {
      if (checked) return Array.from(new Set([...prev, r]));
      const next = prev.filter((x) => x !== r);
      return next.length === 0 ? prev : next;
    });
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
    const primaryRole: string = inviteRoles.includes("admin")
      ? "admin"
      : inviteRoles.includes("coach")
        ? "coach"
        : "dirigeant";
    const { error: invErr } = await supabase.from("member_invites").insert({
      club_id: activeClubId,
      role: primaryRole as any,
      email,
      token,
      created_by: user.id,
      first_name: first.trim() || null,
      last_name: last.trim() || null,
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
    const inviteUrl = `${window.location.origin}/register?invite=${encodeURIComponent(token)}`;

    const roleLabel = inviteRoles
      .map((r) => t(`roles.${r}`, { defaultValue: r }))
      .join(", ");

    try {
      await sendTransactionalEmail({
        templateName: "player-invite",
        recipientEmail: email,
        idempotencyKey: `staff-invite-${token}`,
        fromName: `${clubLabel} via Clubero`,
        templateData: {
          firstName: first || undefined,
          clubName: clubLabel,
          clubLogoUrl,
          inviteUrl,
          roleLabel,
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

  if (!roles.includes("admin")) return <Navigate to="/profile" replace />;

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
              <Label>{t("admin.inviteRole", { defaultValue: "Rôles" })}</Label>
              <p className="text-[11px] text-muted-foreground">
                {t("permissions.clubRolesHint", { defaultValue: "Un utilisateur peut cumuler plusieurs rôles." })}
              </p>
              <div className="space-y-1">
                {CLUB_ROLE_KEYS.map((r) => (
                  <label
                    key={r}
                    className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/40 cursor-pointer border border-border/40"
                  >
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-primary"
                      checked={inviteRoles.includes(r)}
                      onChange={(e) => toggleInviteRole(r, e.target.checked)}
                    />
                    <span className="text-sm">{t(`roles.${r}`, { defaultValue: r })}</span>
                  </label>
                ))}
              </div>
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

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("admin.searchUsersPlaceholder", { defaultValue: "Rechercher par nom ou email…" })}
          className="pl-9 pr-9 h-10"
        />
        {search && (
          <button
            type="button"
            onClick={() => setSearch("")}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-md hover:bg-muted text-muted-foreground"
            aria-label={t("common.clear", { defaultValue: "Effacer" })}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        </div>
      ) : (() => {
        const STAFF_ROLES = new Set(["admin", "coach", "assistant_coach", "staff", "tournament_manager"]);
        const q = search.trim().toLowerCase();
        const allUsersRaw = (data ?? []) as any[];
        const allUsers = q
          ? allUsersRaw.filter((u) => {
              const fn = u.profile?.first_name ?? "";
              const ln = u.profile?.last_name ?? "";
              const full = u.profile?.full_name ?? `${fn} ${ln}`;
              const em = u.email ?? "";
              return (
                full.toLowerCase().includes(q) ||
                fn.toLowerCase().includes(q) ||
                ln.toLowerCase().includes(q) ||
                em.toLowerCase().includes(q)
              );
            })
          : allUsersRaw;
        const staff = allUsers.filter((u) => (u.roles ?? []).some((r: string) => STAFF_ROLES.has(r)));
        const playersParents = allUsers.filter(
          (u) =>
            !(u.roles ?? []).some((r: string) => STAFF_ROLES.has(r)) &&
            ((u.roles ?? []).includes("player") || (u.roles ?? []).includes("parent")),
        );

        const renderList = (users: any[], emptyKey: string) =>
          users.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
              {t(emptyKey, { defaultValue: t("admin.usersEmpty") })}
            </div>
          ) : (
            <ul className="rounded-2xl border border-border bg-card divide-y divide-border overflow-hidden">
              {users.map((u: any) => {
                const name =
                  u.profile?.full_name ??
                  [u.profile?.first_name, u.profile?.last_name].filter(Boolean).join(" ") ??
                  u.email ??
                  "—";
                return (
                  <li key={u.user_id}>
                    <button
                      type="button"
                      onClick={() => setSelectedUserId(u.user_id)}
                      className="w-full text-left flex items-center gap-3 px-4 py-3 hover:bg-muted/40 transition-colors"
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
                          {(u.roles ?? []).map((r: string) => (
                            <span
                              key={r}
                              className={
                                "text-[10px] font-semibold px-1.5 py-0.5 rounded-full capitalize inline-flex items-center gap-1 " +
                                (r === "admin"
                                  ? "bg-primary/15 text-primary"
                                  : r === "coach" || r === "assistant_coach"
                                  ? "bg-amber-500/15 text-amber-700 dark:text-amber-300"
                                  : "bg-muted text-muted-foreground")
                              }
                            >
                              {r === "admin" && <ShieldCheck className="h-3 w-3" />}
                              {(r === "coach" || r === "assistant_coach") && <Trophy className="h-3 w-3" />}
                              {t(`roles.${r}`, { defaultValue: r })}
                            </span>
                          ))}
                        </div>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          );

        return (
          <Tabs defaultValue="staff" className="w-full">
            <TabsList className="grid grid-cols-2 w-full">
              <TabsTrigger value="staff">
                {t("admin.tabClubMembers", { defaultValue: "Membres du club" })} ({staff.length})
              </TabsTrigger>
              <TabsTrigger value="players">
                {t("admin.tabPlayersParents", { defaultValue: "Joueurs & parents" })} ({playersParents.length})
              </TabsTrigger>
            </TabsList>
            <TabsContent value="staff" className="mt-3">
              {renderList(staff, "admin.tabClubMembersEmpty")}
            </TabsContent>
            <TabsContent value="players" className="mt-3">
              {renderList(playersParents, "admin.tabPlayersParentsEmpty")}
            </TabsContent>
          </Tabs>
        );
      })()}

      <UserDetailSheet
        userId={selectedUserId}
        open={!!selectedUserId}
        onOpenChange={(o) => { if (!o) setSelectedUserId(null); }}
      />
    </div>
  );
}
