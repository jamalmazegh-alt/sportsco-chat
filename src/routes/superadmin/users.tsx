import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  listAllUsers,
  sendPasswordResetEmail,
  resendOnboardingEmail,
  disableUser,
  reactivateUser,
} from "@/lib/superadmin.functions";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Loader2,
  Search,
  MoreHorizontal,
  KeyRound,
  Mail,
  ShieldOff,
  ShieldCheck,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
import { Avatar, StatusBadge, subTone, roleTone } from "@/lib/superadmin/ui";

export const Route = createFileRoute("/superadmin/users")({
  component: SuperAdminUsers,
});

type UserRow = Awaited<ReturnType<typeof listAllUsers>>["items"][number];

function SuperAdminUsers() {
  const [search, setSearch] = useState("");
  const [items, setItems] = useState<UserRow[]>([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    const t = setTimeout(() => {
      listAllUsers({ data: { search: search || undefined, limit: 50, page } })
        .then((r) => setItems(r.items))
        .catch((e) => toast.error(e instanceof Error ? e.message : "Failed"))
        .finally(() => setLoading(false));
    }, 250);
    return () => clearTimeout(t);
  }, [search, page]);

  const runAction = async (
    id: string,
    label: string,
    fn: () => Promise<unknown>,
    confirm = false,
  ) => {
    if (confirm && !window.confirm(`${label} — are you sure?`)) return;
    setBusyId(id);
    try {
      await fn();
      toast.success(`${label} ✓`);
      // refresh row
      const r = await listAllUsers({
        data: { search: search || undefined, limit: 50, page },
      });
      setItems(r.items);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Action failed");
    } finally {
      setBusyId(null);
    }
  };

  const stats = useMemo(() => {
    const total = items.length;
    const active = items.filter((u) => u.last_sign_in_at && !u.is_banned).length;
    const dormant = items.filter(
      (u) =>
        u.last_sign_in_at &&
        Date.now() - new Date(u.last_sign_in_at).getTime() > 60 * 24 * 3600 * 1000,
    ).length;
    const banned = items.filter((u) => u.is_banned).length;
    return { total, active, dormant, banned };
  }, [items]);

  return (
    <div className="p-6 md:p-8 max-w-[1400px]">
      <header className="mb-5 flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold">Users</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Search, inspect, and act on any platform user.
          </p>
        </div>
        <div className="relative w-full sm:w-96">
          <Search className="h-4 w-4 absolute left-2.5 top-2.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => {
              setPage(1);
              setSearch(e.target.value);
            }}
            placeholder="Name, email, or phone…"
            className="pl-9 h-9"
          />
        </div>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <Mini label="In page" value={stats.total} />
        <Mini label="Active" value={stats.active} tone="success" />
        <Mini label="Dormant 60d+" value={stats.dormant} tone="warn" />
        <Mini label="Disabled" value={stats.banned} tone="danger" />
      </div>

      <div className="rounded-lg border border-border overflow-hidden bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs text-muted-foreground">
            <tr>
              <th className="text-left font-medium px-3 py-2">User</th>
              <th className="text-left font-medium px-3 py-2 hidden lg:table-cell">
                Clubs & roles
              </th>
              <th className="text-left font-medium px-3 py-2 hidden md:table-cell">
                Plan
              </th>
              <th className="text-left font-medium px-3 py-2 hidden md:table-cell">
                Last seen
              </th>
              <th className="text-left font-medium px-3 py-2">Status</th>
              <th className="w-10" />
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={6} className="px-3 py-10 text-center text-muted-foreground">
                  <Loader2 className="h-4 w-4 inline animate-spin mr-2" />
                  Loading…
                </td>
              </tr>
            )}
            {!loading && items.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-10 text-center text-muted-foreground">
                  No users.
                </td>
              </tr>
            )}
            {!loading &&
              items.map((u) => {
                const name =
                  u.full_name ?? u.email ?? u.phone ?? u.id.slice(0, 8);
                const onboardingOk = !!u.email_confirmed_at;
                const dormant =
                  u.last_sign_in_at &&
                  Date.now() - new Date(u.last_sign_in_at).getTime() >
                    60 * 24 * 3600 * 1000;
                const never = !u.last_sign_in_at;
                return (
                  <tr
                    key={u.id}
                    className="border-t border-border hover:bg-muted/30 transition-colors"
                  >
                    <td className="px-3 py-2.5">
                      <Link
                        to="/superadmin/users/$userId"
                        params={{ userId: u.id }}
                        className="flex items-center gap-3 group"
                      >
                        <Avatar url={u.avatar_url} name={name} />
                        <div className="min-w-0">
                          <div className="font-medium truncate group-hover:underline">
                            {name}
                          </div>
                          <div className="text-xs text-muted-foreground truncate">
                            {u.email ?? u.phone ?? "—"}
                          </div>
                        </div>
                      </Link>
                    </td>
                    <td className="px-3 py-2.5 hidden lg:table-cell">
                      {u.clubs.length === 0 ? (
                        <span className="text-xs text-muted-foreground">
                          No club
                        </span>
                      ) : (
                        <div className="flex flex-wrap gap-1.5 max-w-md">
                          {u.clubs.slice(0, 3).map((c) => (
                            <span
                              key={c.club_id}
                              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-1.5 py-0.5 text-[11px]"
                            >
                              <span className="text-foreground truncate max-w-[140px]">
                                {c.name ?? c.club_id.slice(0, 6)}
                              </span>
                              <StatusBadge tone={roleTone(c.role)}>
                                {c.role}
                              </StatusBadge>
                            </span>
                          ))}
                          {u.clubs.length > 3 && (
                            <span className="text-[11px] text-muted-foreground self-center">
                              +{u.clubs.length - 3}
                            </span>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2.5 hidden md:table-cell">
                      {u.clubs[0] ? (
                        <StatusBadge
                          tone={subTone(u.clubs[0].subscription_status).tone}
                        >
                          {subTone(u.clubs[0].subscription_status).label}
                        </StatusBadge>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 hidden md:table-cell text-xs text-muted-foreground">
                      {u.last_sign_in_at
                        ? new Date(u.last_sign_in_at).toLocaleDateString()
                        : "never"}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex flex-wrap gap-1">
                        {u.is_banned ? (
                          <StatusBadge tone="danger">
                            <ShieldOff className="h-3 w-3" /> disabled
                          </StatusBadge>
                        ) : never ? (
                          <StatusBadge tone="warn">never signed in</StatusBadge>
                        ) : dormant ? (
                          <StatusBadge tone="warn">dormant</StatusBadge>
                        ) : (
                          <StatusBadge tone="success">
                            <ShieldCheck className="h-3 w-3" /> active
                          </StatusBadge>
                        )}
                        {!onboardingOk && (
                          <StatusBadge tone="warn">unverified</StatusBadge>
                        )}
                      </div>
                    </td>
                    <td className="px-2 py-2.5">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            size="icon-sm"
                            variant="ghost"
                            disabled={busyId === u.id}
                          >
                            {busyId === u.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <MoreHorizontal className="h-4 w-4" />
                            )}
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-56">
                          <DropdownMenuLabel className="text-xs">
                            Quick actions
                          </DropdownMenuLabel>
                          <DropdownMenuItem asChild>
                            <Link
                              to="/superadmin/users/$userId"
                              params={{ userId: u.id }}
                            >
                              <ExternalLink className="h-4 w-4 mr-2" /> View
                              profile
                            </Link>
                          </DropdownMenuItem>
                          {u.clubs[0] && (
                            <DropdownMenuItem asChild>
                              <Link
                                to="/superadmin/clubs/$clubId"
                                params={{ clubId: u.clubs[0].club_id }}
                              >
                                <ExternalLink className="h-4 w-4 mr-2" /> Open
                                club
                              </Link>
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            disabled={!u.email}
                            onClick={() =>
                              runAction(u.id, "Password reset email", () =>
                                sendPasswordResetEmail({
                                  data: { user_id: u.id },
                                }),
                              )
                            }
                          >
                            <KeyRound className="h-4 w-4 mr-2" /> Send reset
                            email
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            disabled={!u.email}
                            onClick={() =>
                              runAction(u.id, "Onboarding email resent", () =>
                                resendOnboardingEmail({
                                  data: { user_id: u.id },
                                }),
                              )
                            }
                          >
                            <Mail className="h-4 w-4 mr-2" /> Resend onboarding
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          {u.is_banned ? (
                            <DropdownMenuItem
                              onClick={() =>
                                runAction(
                                  u.id,
                                  "Reactivate",
                                  () =>
                                    reactivateUser({
                                      data: { user_id: u.id },
                                    }),
                                  true,
                                )
                              }
                            >
                              <ShieldCheck className="h-4 w-4 mr-2" /> Reactivate
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={() =>
                                runAction(
                                  u.id,
                                  "Disable",
                                  () =>
                                    disableUser({ data: { user_id: u.id } }),
                                  true,
                                )
                              }
                            >
                              <ShieldOff className="h-4 w-4 mr-2" /> Disable
                              account
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-end gap-2 mt-4">
        <Button
          size="sm"
          variant="outline"
          disabled={page <= 1 || loading}
          onClick={() => setPage((p) => Math.max(1, p - 1))}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="text-xs text-muted-foreground">Page {page}</span>
        <Button
          size="sm"
          variant="outline"
          disabled={items.length < 50 || loading}
          onClick={() => setPage((p) => p + 1)}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function Mini({
  label,
  value,
  tone = "muted",
}: {
  label: string;
  value: number;
  tone?: "muted" | "success" | "warn" | "danger";
}) {
  const colors: Record<string, string> = {
    muted: "text-foreground",
    success: "text-emerald-600 dark:text-emerald-400",
    warn: "text-amber-600 dark:text-amber-400",
    danger: "text-destructive",
  };
  return (
    <div className="rounded-lg border border-border bg-card px-4 py-3">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className={`text-2xl font-semibold mt-1 tabular-nums ${colors[tone]}`}>
        {value}
      </div>
    </div>
  );
}
