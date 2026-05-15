import { createFileRoute, Navigate, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import { useState } from "react";
import { useAuth, useActiveRole } from "@/lib/auth-context";
import {
  ChevronLeft,
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
} from "lucide-react";
import { fmt } from "@/lib/date-locale";
import {
  getClubUserDetail,
  setUserDisabled,
  removeUserFromClub,
  sendUserPasswordReset,
} from "@/lib/admin.functions";
import { Button } from "@/components/ui/button";
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

export const Route = createFileRoute("/_authenticated/admin/users/$userId")({
  component: AdminUserDetailPage,
  head: () => ({ meta: [{ title: "User — Clubero" }] }),
});

function AdminUserDetailPage() {
  const { userId } = Route.useParams();
  const { t } = useTranslation();
  const { user, activeClubId } = useAuth();
  const role = useActiveRole();
  const qc = useQueryClient();

  const fetchDetail = useServerFn(getClubUserDetail);
  const callSetDisabled = useServerFn(setUserDisabled);
  const callRemove = useServerFn(removeUserFromClub);
  const callReset = useServerFn(sendUserPasswordReset);

  const [confirmDisable, setConfirmDisable] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [acting, setActing] = useState<string | null>(null);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["admin-user-detail", userId, activeClubId],
    enabled: !!activeClubId && role === "admin",
    queryFn: () =>
      fetchDetail({ data: { club_id: activeClubId!, user_id: userId } }),
  });

  if (role !== "admin") return <Navigate to="/profile" replace />;
  if (isLoading || !data) {
    return (
      <div className="flex justify-center pt-20">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
      </div>
    );
  }

  const p = data.profile;
  const name =
    p?.full_name ?? [p?.first_name, p?.last_name].filter(Boolean).join(" ") ?? data.email ?? "—";
  const isSelf = user?.id === userId;

  async function toggleDisabled(disabled: boolean) {
    if (!activeClubId) return;
    setActing(disabled ? "disable" : "enable");
    try {
      await callSetDisabled({
        data: { club_id: activeClubId, user_id: userId, disabled },
      });
      toast.success(t(disabled ? "admin.userDisabled" : "admin.userEnabled"));
      refetch();
    } catch (e: any) {
      toast.error(e?.message ?? "Error");
    } finally {
      setActing(null);
      setConfirmDisable(false);
    }
  }

  async function removeFromClub() {
    if (!activeClubId) return;
    setActing("remove");
    try {
      await callRemove({ data: { club_id: activeClubId, user_id: userId } });
      toast.success(t("admin.removedFromClub"));
      qc.invalidateQueries({ queryKey: ["admin-club-users", activeClubId] });
      // back to list
      window.history.back();
    } catch (e: any) {
      toast.error(e?.message ?? "Error");
    } finally {
      setActing(null);
      setConfirmRemove(false);
    }
  }

  async function sendReset() {
    if (!activeClubId) return;
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

  return (
    <div className="px-5 pt-4 pb-10 space-y-5">
      <Link to="/admin/users" className="inline-flex items-center text-sm text-muted-foreground gap-1">
        <ChevronLeft className="h-4 w-4" /> {t("common.back")}
      </Link>

      <header className="flex items-center gap-4">
        <div className="h-16 w-16 rounded-full bg-muted overflow-hidden flex items-center justify-center">
          {p?.avatar_url ? (
            <img src={p.avatar_url} alt="" className="h-full w-full object-cover" />
          ) : (
            <UserCircle2 className="h-8 w-8 text-muted-foreground" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-semibold truncate">{name || "—"}</h1>
            {data.is_disabled && (
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-destructive/10 text-destructive">
                <ShieldAlert className="h-3 w-3" />
                {t("admin.statusDisabled")}
              </span>
            )}
          </div>
          {data.email && (
            <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1 truncate">
              <Mail className="h-3 w-3" /> {data.email}
            </p>
          )}
          {p?.phone && (
            <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
              <Phone className="h-3 w-3" /> {p.phone}
              {p.phone_verified_at && <BadgeCheck className="h-3 w-3 text-primary" />}
            </p>
          )}
          {p?.created_at && (
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {t("admin.joined")}: {fmt(new Date(p.created_at), "PP")}
            </p>
          )}
          {data.last_sign_in_at && (
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {t("admin.lastSignIn")}: {fmt(new Date(data.last_sign_in_at), "PP")}
            </p>
          )}
        </div>
      </header>

      <section className="rounded-2xl border border-border bg-card p-5 space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          {t("admin.memberships")}
        </h2>
        {data.memberships.length === 0 ? (
          <p className="text-sm text-muted-foreground">—</p>
        ) : (
          <ul className="space-y-1.5">
            {data.memberships.map((m: any) => (
              <li
                key={`${m.club_id}-${m.role}`}
                className="flex items-center justify-between gap-2 text-sm"
              >
                <span className="truncate">{m.clubs?.name ?? m.club_id}</span>
                <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-primary/10 text-primary capitalize">
                  {t(`roles.${m.role}`, { defaultValue: m.role })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-2xl border border-border bg-card p-5 space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          {t("admin.linkedPlayers")}
        </h2>
        {data.linkedPlayers.length === 0 && data.parentLinks.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("admin.noLinkedPlayers")}</p>
        ) : (
          <ul className="space-y-1.5">
            {data.linkedPlayers.map((pl: any) => (
              <li key={pl.id}>
                <Link
                  to="/players/$playerId"
                  params={{ playerId: pl.id }}
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
                      className="text-sm text-primary hover:underline"
                    >
                      {pp.players.first_name} {pp.players.last_name}{" "}
                      <span className="text-xs text-muted-foreground">({t("roles.parent")})</span>
                    </Link>
                  </li>
                )
            )}
          </ul>
        )}
      </section>

      {!isSelf && (
        <section className="rounded-2xl border border-border bg-card p-5 space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            {t("admin.actions")}
          </h2>

          <div className="space-y-2">
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
                  <CheckCircle2 className="h-4 w-4 text-present" />
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
            <p className="text-[11px] text-muted-foreground px-1">
              {t("admin.disableUserHint")}
            </p>

            <Button
              variant="outline"
              className="w-full justify-start text-destructive hover:text-destructive mt-2"
              onClick={() => setConfirmRemove(true)}
              disabled={acting === "remove"}
            >
              <UserMinus className="h-4 w-4" />
              {t("admin.removeFromClub")}
            </Button>
            <p className="text-[11px] text-muted-foreground px-1">
              {t("admin.removeFromClubHint")}
            </p>
          </div>
        </section>
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
    </div>
  );
}
