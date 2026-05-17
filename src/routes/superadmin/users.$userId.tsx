import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import {
  getUserAuthStatus,
  disableUser,
  reactivateUser,
  generatePasswordResetLink,
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
import { ArrowLeft, Loader2, ShieldOff, ShieldCheck, KeyRound, Copy, Check, UserCog } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/superadmin/users/$userId")({
  component: UserDetail,
});

type Status = Awaited<ReturnType<typeof getUserAuthStatus>>;

function UserDetail() {
  const { userId } = Route.useParams();
  const [status, setStatus] = useState<Status | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resetLink, setResetLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const refresh = useCallback(() => {
    setErr(null);
    getUserAuthStatus({ data: { user_id: userId } })
      .then(setStatus)
      .catch((e) => setErr(e instanceof Error ? e.message : "Failed"));
  }, [userId]);

  useEffect(refresh, [refresh]);

  const confirmAndRun = async (
    label: string,
    fn: () => Promise<unknown>,
  ) => {
    if (!window.confirm(`${label} — are you sure?`)) return;
    setBusy(true);
    try {
      await fn();
      toast.success(`${label} done`);
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Action failed");
    } finally {
      setBusy(false);
    }
  };

  const handleResetLink = async () => {
    setBusy(true);
    setResetLink(null);
    try {
      const r = await generatePasswordResetLink({ data: { user_id: userId } });
      setResetLink(r.action_link);
      toast.success("Reset link generated");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="p-6 md:p-8 max-w-3xl">
      <Link
        to="/superadmin/users"
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-3"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> All users
      </Link>

      <header className="mb-6">
        <h1 className="text-xl font-semibold">User</h1>
        <div className="text-[11px] font-mono text-muted-foreground mt-0.5">{userId}</div>
      </header>

      {err && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive mb-4">
          {err}
        </div>
      )}

      {!status && !err && (
        <div className="text-sm text-muted-foreground flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      )}

      {status && (
        <>
          <section className="rounded-lg border border-border bg-card p-4 mb-4">
            <dl className="text-sm space-y-1.5">
              <div className="flex justify-between"><dt className="text-muted-foreground">Email</dt><dd>{status.email ?? "—"}</dd></div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Status</dt>
                <dd>
                  {status.is_banned ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 text-destructive px-2 py-0.5 text-xs">
                      <ShieldOff className="h-3 w-3" /> Disabled
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 px-2 py-0.5 text-xs">
                      <ShieldCheck className="h-3 w-3" /> Active
                    </span>
                  )}
                </dd>
              </div>
              <div className="flex justify-between"><dt className="text-muted-foreground">Last sign-in</dt><dd>{status.last_sign_in_at ? new Date(status.last_sign_in_at).toLocaleString() : "—"}</dd></div>
              <div className="flex justify-between"><dt className="text-muted-foreground">Created</dt><dd>{status.created_at ? new Date(status.created_at).toLocaleDateString() : "—"}</dd></div>
            </dl>
          </section>

          <section className="rounded-lg border border-border bg-card p-4">
            <div className="text-xs uppercase tracking-wide text-muted-foreground mb-3">
              Sensitive actions
            </div>
            <div className="flex flex-wrap gap-2">
              {status.is_banned ? (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() =>
                    confirmAndRun("Reactivate user", () =>
                      reactivateUser({ data: { user_id: userId } }),
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
                    confirmAndRun("Disable user", () =>
                      disableUser({ data: { user_id: userId } }),
                    )
                  }
                >
                  <ShieldOff className="h-4 w-4 mr-1.5" /> Disable
                </Button>
              )}
              <Button
                size="sm"
                variant="outline"
                disabled={busy || !status.email}
                onClick={handleResetLink}
              >
                <KeyRound className="h-4 w-4 mr-1.5" /> Password reset link
              </Button>
            </div>

            {resetLink && (
              <div className="mt-4 rounded-md border border-border bg-muted/30 p-3">
                <div className="text-xs text-muted-foreground mb-1.5">
                  One-time recovery link — share securely with the user.
                </div>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-[11px] font-mono break-all bg-background border border-border rounded px-2 py-1.5">
                    {resetLink}
                  </code>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      navigator.clipboard.writeText(resetLink);
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2000);
                    }}
                  >
                    {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
            )}

            <p className="text-xs text-muted-foreground mt-3">
              All actions are recorded in the audit log.
            </p>
          </section>
        </>
      )}
    </div>
  );
}
