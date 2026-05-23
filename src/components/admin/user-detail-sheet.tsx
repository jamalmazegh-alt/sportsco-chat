import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useAuth, useMyRoles } from "@/lib/auth-context";
import {
  Loader2,
  UserCircle2,
  Mail,
  Phone,
  BadgeCheck,
  Ban,
  CheckCircle2,
  KeyRound,
  UserMinus,
  ShieldAlert,
  ShieldCheck,
  Users2,
} from "lucide-react";
import { fmt } from "@/lib/date-locale";
import {
  getClubUserDetail,
  setUserDisabled,
  removeUserFromClub,
  sendUserPasswordReset,
} from "@/lib/admin.functions";
import { setClubMemberRoles } from "@/lib/permissions.functions";
import { Checkbox } from "@/components/ui/checkbox";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
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
import { toast } from "sonner";

const CLUB_ROLE_KEYS = [
  "admin",
  "coach",
  "assistant_coach",
  "staff",
  "tournament_manager",
] as const;
type ClubRoleKey = (typeof CLUB_ROLE_KEYS)[number];

const INCOMPATIBLE_ROLES: Record<string, string[]> = {
  coach: ["assistant_coach"],
  assistant_coach: ["coach", "admin", "staff"],
  admin: ["assistant_coach"],
  staff: ["assistant_coach"],
};

interface Props {
  userId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function UserDetailSheet({ userId, open, onOpenChange }: Props) {
  const { t } = useTranslation();
  const { user, activeClubId } = useAuth();
  const roles = useMyRoles();
  const qc = useQueryClient();

  const fetchDetail = useServerFn(getClubUserDetail);
  const callSetDisabled = useServerFn(setUserDisabled);
  const callRemove = useServerFn(removeUserFromClub);
  const callReset = useServerFn(sendUserPasswordReset);
  const callSetRoles = useServerFn(setClubMemberRoles);

  const [confirmDisable, setConfirmDisable] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [acting, setActing] = useState<string | null>(null);
  const [promoting, setPromoting] = useState(false);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["admin-user-detail", userId, activeClubId],
    enabled: !!userId && !!activeClubId && roles.includes("admin") && open,
    queryFn: () =>
      fetchDetail({ data: { club_id: activeClubId!, user_id: userId! } }),
  });

  const p = data?.profile;
  const name =
    (p?.full_name
      ?? [p?.first_name, p?.last_name].filter(Boolean).join(" "))
    || data?.email
    || "—";
  const isSelf = user?.id === userId;

  const clubMemberships = (data?.memberships ?? []).filter(
    (m: any) => m.club_id === activeClubId,
  );
  const allClubRoles: Set<string> = (() => {
    const set = new Set<string>();
    for (const m of clubMemberships) {
      if (Array.isArray(m.roles) && m.roles.length > 0) {
        for (const r of m.roles) set.add(r);
      } else if (m.role) {
        set.add(m.role);
      }
    }
    return set;
  })();
  const currentRoles: ClubRoleKey[] = CLUB_ROLE_KEYS.filter((r) => allClubRoles.has(r));
  const nonStaffRoles: string[] = ["parent", "player"].filter((r) => allClubRoles.has(r));
  const hasStaffRole = currentRoles.length > 0;
  const isParentOrPlayerOnly = !hasStaffRole && nonStaffRoles.length > 0;
  const isMember = clubMemberships.length > 0;

  async function toggleDisabled(disabled: boolean) {
    if (!activeClubId || !userId) return;
    setActing(disabled ? "disable" : "enable");
    try {
      await callSetDisabled({ data: { club_id: activeClubId, user_id: userId, disabled } });
      toast.success(t(disabled ? "admin.userDisabled" : "admin.userEnabled"));
      refetch();
      qc.invalidateQueries({ queryKey: ["admin-club-users", activeClubId] });
    } catch (e: any) {
      toast.error(e?.message ?? "Error");
    } finally {
      setActing(null);
      setConfirmDisable(false);
    }
  }

  async function removeFromClub() {
    if (!activeClubId || !userId) return;
    setActing("remove");
    try {
      await callRemove({ data: { club_id: activeClubId, user_id: userId } });
      toast.success(t("admin.removedFromClub"));
      qc.invalidateQueries({ queryKey: ["admin-club-users", activeClubId] });
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message ?? "Error");
    } finally {
      setActing(null);
      setConfirmRemove(false);
    }
  }

  async function sendReset() {
    if (!activeClubId || !userId) return;
    setActing("reset");
    try {
      await callReset({ data: { club_id: activeClubId, user_id: userId } });
      toast.success(t("admin.passwordResetSent"));
    } catch (e: any) {
      toast.error(e?.message ?? "Error");
    } finally {
      setActing(null);
    }
  }

  async function toggleRole(role: ClubRoleKey, checked: boolean) {
    if (!activeClubId || !userId) return;
    const next = checked
      ? Array.from(new Set([...currentRoles, role]))
      : currentRoles.filter((r) => r !== role);
    if (next.length === 0) {
      toast.error(t("permissions.atLeastOneRole", { defaultValue: "Au moins un rôle est requis" }));
      return;
    }
    setActing("roles");
    try {
      await callSetRoles({
        data: { club_id: activeClubId, user_id: userId, roles: next },
      });
      toast.success(t("admin.rolesUpdated", { defaultValue: "Rôles mis à jour" }));
      qc.invalidateQueries({ queryKey: ["admin-club-users", activeClubId] });
      refetch();
    } catch (e: any) {
      toast.error(e?.message ?? "Error");
    } finally {
      setActing(null);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        closeLabel={t("common.close", { defaultValue: "Fermer" })}
        onCloseClick={() => onOpenChange(false)}
        className="w-full sm:max-w-md p-0 flex flex-col gap-0 overflow-hidden"
      >
        <SheetHeader className="sr-only">
          <SheetTitle>{name}</SheetTitle>
        </SheetHeader>

        {isLoading || !data ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          </div>
        ) : (
          <>
            {/* Hero */}
            <div className="relative bg-gradient-to-br from-primary/15 via-primary/5 to-transparent px-6 pt-10 pb-6 border-b border-border">
              <div className="flex flex-col items-center text-center">
                <div className="h-20 w-20 rounded-full bg-card ring-4 ring-background shadow-lg overflow-hidden flex items-center justify-center">
                  {p?.avatar_url ? (
                    <img src={p.avatar_url} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <UserCircle2 className="h-12 w-12 text-muted-foreground" />
                  )}
                </div>
                <h2 className="mt-3 text-lg font-semibold truncate max-w-full">{name}</h2>
                {data.is_disabled && (
                  <span className="mt-1.5 inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-destructive/10 text-destructive">
                    <ShieldAlert className="h-3 w-3" />
                    {t("admin.statusDisabled")}
                  </span>
                )}
                {currentRoles.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1 justify-center">
                    {currentRoles.map((r) => (
                      <span
                        key={r}
                        className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-primary/15 text-primary inline-flex items-center gap-1"
                      >
                        {r === "admin" && <ShieldCheck className="h-3 w-3" />}
                        {t(`roles.${r}`, { defaultValue: r })}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
              {/* Contact */}
              <section className="space-y-2">
                {data.email && (
                  <div className="flex items-center gap-2.5 text-sm">
                    <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="truncate">{data.email}</span>
                  </div>
                )}
                {p?.phone && (
                  <div className="flex items-center gap-2.5 text-sm">
                    <Phone className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span>{p.phone}</span>
                    {p.phone_verified_at && <BadgeCheck className="h-4 w-4 text-primary" />}
                  </div>
                )}
                {(p?.created_at || data.last_sign_in_at) && (
                  <div className="pt-1 grid grid-cols-2 gap-2 text-[11px] text-muted-foreground">
                    {p?.created_at && (
                      <div>
                        <p className="uppercase tracking-wider">{t("admin.joined")}</p>
                        <p className="text-foreground/80 mt-0.5">{fmt(new Date(p.created_at), "PP")}</p>
                      </div>
                    )}
                    {data.last_sign_in_at && (
                      <div>
                        <p className="uppercase tracking-wider">{t("admin.lastSignIn")}</p>
                        <p className="text-foreground/80 mt-0.5">{fmt(new Date(data.last_sign_in_at), "PP")}</p>
                      </div>
                    )}
                  </div>
                )}
              </section>

              {/* Roles editor */}
              {!isSelf && isMember && (
                <section className="rounded-xl border border-border bg-card p-4 space-y-3">
                  <div>
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      {t("permissions.clubRoles", { defaultValue: "Rôles dans le club" })}
                    </h3>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {t("permissions.clubRolesHint", {
                        defaultValue: "Un utilisateur peut cumuler plusieurs rôles.",
                      })}
                    </p>
                  </div>
                  <TooltipProvider delayDuration={150}>
                    <div className="space-y-0.5">
                      {CLUB_ROLE_KEYS.map((r) => {
                        const blockingRole = currentRoles.find((sel) =>
                          (INCOMPATIBLE_ROLES[sel] ?? []).includes(r),
                        );
                        const incompatible = !!blockingRole && !currentRoles.includes(r);
                        const isDisabled = acting === "roles" || incompatible;
                        const row = (
                          <label
                            className={
                              "flex items-center gap-3 p-2 rounded-lg " +
                              (incompatible
                                ? "opacity-50 cursor-not-allowed bg-muted/20"
                                : "hover:bg-muted/40 cursor-pointer")
                            }
                          >
                            <Checkbox
                              checked={currentRoles.includes(r)}
                              disabled={isDisabled}
                              onCheckedChange={(v) => toggleRole(r, !!v)}
                            />
                            <span className="text-sm">{t(`roles.${r}`, { defaultValue: r })}</span>
                          </label>
                        );
                        if (incompatible && blockingRole) {
                          return (
                            <Tooltip key={r}>
                              <TooltipTrigger asChild>
                                <div>{row}</div>
                              </TooltipTrigger>
                              <TooltipContent>
                                {t("roles.incompatibleWith", {
                                  role: t(`roles.${blockingRole}`, { defaultValue: blockingRole }),
                                })}
                              </TooltipContent>
                            </Tooltip>
                          );
                        }
                        return <div key={r}>{row}</div>;
                      })}
                    </div>
                  </TooltipProvider>
                </section>
              )}

              {/* Linked players */}
              {(data.linkedPlayers.length > 0 || data.parentLinks.length > 0) && (
                <section className="rounded-xl border border-border bg-card p-4 space-y-2.5">
                  <div className="flex items-center gap-2">
                    <Users2 className="h-4 w-4 text-muted-foreground" />
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      {t("admin.linkedPlayers")}
                    </h3>
                  </div>
                  <ul className="space-y-1">
                    {data.linkedPlayers.map((pl: any) => (
                      <li key={pl.id}>
                        <Link
                          to="/players/$playerId"
                          params={{ playerId: pl.id }}
                          onClick={() => onOpenChange(false)}
                          className="text-sm text-primary hover:underline"
                        >
                          {pl.first_name} {pl.last_name}{" "}
                          <span className="text-xs text-muted-foreground">({t("roles.player")})</span>
                        </Link>
                      </li>
                    ))}
                    {data.parentLinks.map(
                      (pp: any) =>
                        pp.players && (
                          <li key={pp.id}>
                            <Link
                              to="/players/$playerId"
                              params={{ playerId: pp.players.id }}
                              onClick={() => onOpenChange(false)}
                              className="text-sm text-primary hover:underline"
                            >
                              {pp.players.first_name} {pp.players.last_name}{" "}
                              <span className="text-xs text-muted-foreground">({t("roles.parent")})</span>
                            </Link>
                          </li>
                        )
                    )}
                  </ul>
                </section>
              )}

              {/* Actions */}
              {!isSelf && (
                <section className="space-y-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-1">
                    {t("admin.actions")}
                  </h3>
                  <Button
                    variant="outline"
                    className="w-full justify-start"
                    onClick={sendReset}
                    disabled={!data.email || acting === "reset"}
                  >
                    {acting === "reset" ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <KeyRound className="h-4 w-4" />
                    )}
                    {t("admin.sendPasswordReset")}
                  </Button>

                  {data.is_disabled ? (
                    <Button
                      variant="outline"
                      className="w-full justify-start"
                      onClick={() => toggleDisabled(false)}
                      disabled={acting === "enable"}
                    >
                      {acting === "enable" ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <CheckCircle2 className="h-4 w-4" />
                      )}
                      {t("admin.enableUser")}
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      className="w-full justify-start text-destructive hover:text-destructive"
                      onClick={() => setConfirmDisable(true)}
                      disabled={acting === "disable"}
                    >
                      <Ban className="h-4 w-4" />
                      {t("admin.disableUser")}
                    </Button>
                  )}

                  <Button
                    variant="outline"
                    className="w-full justify-start text-destructive hover:text-destructive"
                    onClick={() => setConfirmRemove(true)}
                    disabled={acting === "remove"}
                  >
                    <UserMinus className="h-4 w-4" />
                    {t("admin.removeFromClub")}
                  </Button>
                  <p className="text-[11px] text-muted-foreground px-1">
                    {t("admin.removeFromClubHint")}
                  </p>
                </section>
              )}
            </div>
          </>
        )}

        <AlertDialog open={confirmDisable} onOpenChange={setConfirmDisable}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t("admin.confirmDisable")}</AlertDialogTitle>
              <AlertDialogDescription>{t("admin.disableUserHint")}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
              <AlertDialogAction onClick={() => toggleDisabled(true)}>
                {t("admin.disableUser")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog open={confirmRemove} onOpenChange={setConfirmRemove}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t("admin.confirmRemove")}</AlertDialogTitle>
              <AlertDialogDescription>{t("admin.removeFromClubHint")}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
              <AlertDialogAction onClick={removeFromClub}>
                {t("admin.removeFromClub")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </SheetContent>
    </Sheet>
  );
}
