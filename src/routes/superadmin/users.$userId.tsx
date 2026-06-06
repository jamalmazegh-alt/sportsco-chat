import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import {
  getUserDetail,
  disableUser,
  reactivateUser,
  generatePasswordResetLink,
  sendPasswordResetEmail,
  resendOnboardingEmail,
  generateImpersonationLink,
} from "@/lib/superadmin.functions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  ArrowLeft,
  Loader2,
  ShieldOff,
  ShieldCheck,
  KeyRound,
  Copy,
  Check,
  UserCog,
  Mail,
  Phone,
  Globe,
  Building2,
  Users as UsersIcon,
  Calendar,
  History,
} from "lucide-react";
import { toast } from "sonner";
import {
  Avatar,
  StatusBadge,
  subTone,
  roleTone,
  categorize,
} from "@/lib/superadmin/ui";

export const Route = createFileRoute("/superadmin/users/$userId")({
  component: UserDetail,
});

type Detail = Awaited<ReturnType<typeof getUserDetail>>;

function UserDetail() {
  const { userId } = Route.useParams();
  const [data, setData] = useState<Detail | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resetLink, setResetLink] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const [impersonateOpen, setImpersonateOpen] = useState(false);
  const [impReason, setImpReason] = useState("");
  const [impLink, setImpLink] = useState<string | null>(null);

  const refresh = useCallback(() => {
    setErr(null);
    getUserDetail({ data: { user_id: userId } })
      .then(setData)
      .catch((e) => setErr(e instanceof Error ? e.message : "Failed"));
  }, [userId]);

  useEffect(refresh, [refresh]);

  const copy = (key: string, value: string) => {
    navigator.clipboard.writeText(value);
    setCopied(key);
    setTimeout(() => setCopied(null), 1500);
  };

  const run = async (label: string, fn: () => Promise<unknown>, confirm = false) => {
    if (confirm && !window.confirm(`${label} — are you sure?`)) return;
    setBusy(true);
    try {
      await fn();
      toast.success(`${label} ✓`);
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Action failed");
    } finally {
      setBusy(false);
    }
  };

  if (err)
    return (
      <div className="p-8 text-sm text-destructive">{err}</div>
    );
  if (!data)
    return (
      <div className="p-8 text-sm text-muted-foreground flex items-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading…
      </div>
    );

  const name =
    data.profile?.full_name ??
    [data.profile?.first_name, data.profile?.last_name]
      .filter(Boolean)
      .join(" ") ??
    data.auth.email ??
    "—";

  return (
    <div className="p-6 md:p-8 max-w-5xl">
      <Link
        to="/superadmin/users"
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-3"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> All users
      </Link>

      <header className="flex items-start gap-4 mb-6 flex-wrap">
        <Avatar url={data.profile?.avatar_url} name={name} size={64} />
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-semibold flex items-center gap-2 flex-wrap">
            {name}
            {data.auth.is_banned ? (
              <StatusBadge tone="danger">
                <ShieldOff className="h-3 w-3" /> disabled
              </StatusBadge>
            ) : (
              <StatusBadge tone="success">
                <ShieldCheck className="h-3 w-3" /> active
              </StatusBadge>
            )}
            {!data.auth.email_confirmed_at && (
              <StatusBadge tone="warn">email unverified</StatusBadge>
            )}
          </h1>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground mt-1.5">
            {data.auth.email && (
              <span className="flex items-center gap-1">
                <Mail className="h-3 w-3" /> {data.auth.email}
              </span>
            )}
            {data.profile?.phone && (
              <span className="flex items-center gap-1">
                <Phone className="h-3 w-3" /> {data.profile.phone}
              </span>
            )}
            {data.profile?.preferred_language && (
              <span className="flex items-center gap-1">
                <Globe className="h-3 w-3" />{" "}
                {data.profile.preferred_language.toUpperCase()}
              </span>
            )}
          </div>
          <div className="text-[10px] font-mono text-muted-foreground/60 mt-1">
            {userId}
          </div>
        </div>
      </header>

      {/* Sensitive actions */}
      <section className="rounded-xl border border-border bg-card p-4 mb-6">
        <div className="text-xs uppercase tracking-wide text-muted-foreground mb-3">
          Actions
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={busy || !data.auth.email}
            onClick={() =>
              run("Reset email sent", () =>
                sendPasswordResetEmail({ data: { user_id: userId } }),
              )
            }
          >
            <Mail className="h-4 w-4 mr-1.5" /> Send reset email
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={busy || !data.auth.email}
            onClick={async () => {
              setBusy(true);
              setResetLink(null);
              try {
                const r = await generatePasswordResetLink({
                  data: { user_id: userId },
                });
                setResetLink(r.action_link);
                toast.success("Recovery link generated");
              } catch (e) {
                toast.error(e instanceof Error ? e.message : "Failed");
              } finally {
                setBusy(false);
              }
            }}
          >
            <KeyRound className="h-4 w-4 mr-1.5" /> Generate reset link
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={busy || !data.auth.email}
            onClick={() =>
              run("Onboarding email resent", () =>
                resendOnboardingEmail({ data: { user_id: userId } }),
              )
            }
          >
            <Mail className="h-4 w-4 mr-1.5" /> Resend onboarding
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={busy || !data.auth.email}
            onClick={() => {
              setImpLink(null);
              setImpReason("");
              setImpersonateOpen(true);
            }}
          >
            <UserCog className="h-4 w-4 mr-1.5" /> Impersonate
          </Button>
          {data.auth.is_banned ? (
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() =>
                run(
                  "Reactivate user",
                  () => reactivateUser({ data: { user_id: userId } }),
                  true,
                )
              }
            >
              <ShieldCheck className="h-4 w-4 mr-1.5" /> Reactivate
            </Button>
          ) : (
            <Button
              size="sm"
              variant="destructive"
              disabled={busy}
              onClick={() =>
                run(
                  "Disable user",
                  () => disableUser({ data: { user_id: userId } }),
                  true,
                )
              }
            >
              <ShieldOff className="h-4 w-4 mr-1.5" /> Disable
            </Button>
          )}
        </div>

        {resetLink && (
          <div className="mt-4 rounded-md border border-border bg-muted/30 p-3">
            <div className="text-xs text-muted-foreground mb-1.5">
              One-time recovery link — share securely.
            </div>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-[11px] font-mono break-all bg-background border border-border rounded px-2 py-1.5">
                {resetLink}
              </code>
              <Button
                size="sm"
                variant="outline"
                onClick={() => copy("reset", resetLink)}
              >
                {copied === "reset" ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>
        )}

        <p className="text-xs text-muted-foreground mt-3">
          All actions are recorded in the audit log.
        </p>
      </section>

      <div className="grid md:grid-cols-2 gap-4 mb-6">
        <InfoCard
          icon={Calendar}
          label="Account"
          rows={[
            [
              "Created",
              data.auth.created_at
                ? new Date(data.auth.created_at).toLocaleDateString()
                : "—",
            ],
            [
              "Last sign-in",
              data.auth.last_sign_in_at
                ? new Date(data.auth.last_sign_in_at).toLocaleString()
                : "never",
            ],
            [
              "Email confirmed",
              data.auth.email_confirmed_at
                ? new Date(data.auth.email_confirmed_at).toLocaleDateString()
                : "no",
            ],
          ]}
        />
        <InfoCard
          icon={UsersIcon}
          label="Relations"
          rows={[
            ["Clubs", String(data.clubs.length)],
            ["Teams", String(data.teams.length)],
            ["Player profiles", String(data.players.length)],
            ["Parent links", String(data.parent_of.length)],
          ]}
        />
      </div>

      {/* Clubs */}
      <Section
        icon={Building2}
        title={`Clubs (${data.clubs.length})`}
      >
        {data.clubs.length === 0 ? (
          <Empty>No club memberships.</Empty>
        ) : (
          <ul className="divide-y divide-border">
            {data.clubs.map((m) => (
              <li key={m.club_id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <Link
                  to="/superadmin/clubs/$clubId"
                  params={{ clubId: m.club_id }}
                  className="flex items-center gap-3 min-w-0 hover:underline"
                >
                  <Avatar url={m.club?.logo_url} name={m.club?.name ?? "?"} size={28} />
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">
                      {m.club?.name ?? m.club_id.slice(0, 8)}
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      joined {new Date(m.joined_at).toLocaleDateString()}
                    </div>
                  </div>
                </Link>
                <div className="flex gap-1.5">
                  <StatusBadge tone={roleTone(m.role)}>{m.role}</StatusBadge>
                  {m.subscription && (
                    <StatusBadge tone={subTone(m.subscription.status).tone}>
                      {subTone(m.subscription.status).label}
                    </StatusBadge>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* Teams */}
      <Section icon={UsersIcon} title={`Teams (${data.teams.length})`}>
        {data.teams.length === 0 ? (
          <Empty>No team assignments.</Empty>
        ) : (
          <ul className="divide-y divide-border">
            {data.teams.map((t) => (
              <li
                key={t.team_id + t.role}
                className="px-4 py-2.5 flex items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">
                    {t.team?.name ?? t.team_id.slice(0, 8)}
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    {t.team?.sport ?? "—"}
                  </div>
                </div>
                <StatusBadge tone={roleTone(t.role)}>{t.role}</StatusBadge>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* Recent convocations */}
      <Section icon={Calendar} title="Recent convocations">
        {data.recent_convocations.length === 0 ? (
          <Empty>No convocations.</Empty>
        ) : (
          <ul className="divide-y divide-border">
            {data.recent_convocations.map((c) => (
              <li key={c.id} className="px-4 py-2 flex items-center justify-between gap-3 text-sm">
                <div className="min-w-0">
                  <div className="font-medium truncate">
                    {c.event?.title ?? "Event"}
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    {c.event?.starts_at
                      ? new Date(c.event.starts_at).toLocaleDateString()
                      : "—"}
                  </div>
                </div>
                <StatusBadge
                  tone={
                    c.status === "present"
                      ? "success"
                      : c.status === "absent"
                        ? "danger"
                        : c.status === "uncertain"
                          ? "warn"
                          : "muted"
                  }
                >
                  {c.status}
                </StatusBadge>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* Admin activity history */}
      <Section icon={History} title="Recent admin actions on this user">
        {data.recent_admin_actions.length === 0 ? (
          <Empty>No prior admin actions.</Empty>
        ) : (
          <ul className="divide-y divide-border">
            {data.recent_admin_actions.map((l) => {
              const cat = categorize(l.action);
              return (
                <li
                  key={l.id}
                  className="px-4 py-2 flex items-center justify-between gap-3 text-sm"
                >
                  <div className="min-w-0">
                    <code className="text-[11px] font-mono">{l.action}</code>
                    <div className="text-[11px] text-muted-foreground">
                      {new Date(l.created_at).toLocaleString()}
                    </div>
                  </div>
                  <StatusBadge tone={cat.tone}>{cat.category}</StatusBadge>
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      {/* Impersonate dialog */}
      <Dialog open={impersonateOpen} onOpenChange={setImpersonateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Impersonate user</DialogTitle>
            <DialogDescription>
              One-time magic link as{" "}
              <span className="font-medium text-foreground">
                {data.auth.email}
              </span>
              . Open in a private window so it doesn't replace your super-admin
              session.
            </DialogDescription>
          </DialogHeader>
          {!impLink ? (
            <>
              <div className="space-y-2">
                <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Reason (min 10 chars)
                </label>
                <Textarea
                  rows={3}
                  value={impReason}
                  onChange={(e) => setImpReason(e.target.value)}
                  placeholder="e.g. Ticket #421 — user reports missing events"
                />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setImpersonateOpen(false)}>
                  Cancel
                </Button>
                <Button
                  disabled={busy || impReason.trim().length < 10}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      const r = await generateImpersonationLink({
                        data: { user_id: userId, reason: impReason.trim() },
                      });
                      setImpLink(r.action_link);
                      toast.success("Impersonation link generated");
                    } catch (e) {
                      toast.error(e instanceof Error ? e.message : "Failed");
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  {busy && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
                  Generate link
                </Button>
              </DialogFooter>
            </>
          ) : (
            <div className="space-y-3">
              <div className="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
                Single-use link. Open in private/incognito.
              </div>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-[11px] font-mono break-all bg-background border border-border rounded px-2 py-1.5">
                  {impLink}
                </code>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => copy("imp", impLink)}
                >
                  {copied === "imp" ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setImpersonateOpen(false)}>
                  Close
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Section({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof Mail;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border bg-card overflow-hidden mb-4">
      <div className="px-4 py-2.5 border-b border-border bg-muted/30 flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {title}
      </div>
      {children}
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-4 py-6 text-sm text-muted-foreground text-center">
      {children}
    </div>
  );
}

function InfoCard({
  icon: Icon,
  label,
  rows,
}: {
  icon: typeof Mail;
  label: string;
  rows: Array<[string, string]>;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground mb-2">
        <Icon className="h-3.5 w-3.5" /> {label}
      </div>
      <dl className="text-sm space-y-1">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-3">
            <dt className="text-muted-foreground">{k}</dt>
            <dd className="text-right truncate">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
