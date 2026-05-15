import { createFileRoute, Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/password-input";

import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import logo from "@/assets/clubero-logo.png";

type SignupRole = "club_admin" | "player" | "parent";

export const Route = createFileRoute("/register")({
  validateSearch: (search: Record<string, unknown>) => ({
    invite: typeof search.invite === "string" ? search.invite : undefined,
  }),
  component: RegisterPage,
  head: () => ({
    meta: [
      { title: "Create account — Clubero" },
      { name: "description", content: "Create your Clubero account in seconds." },
    ],
  }),
});

function RegisterPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const search = useSearch({ from: "/register" });
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [signupRole, setSignupRole] = useState<SignupRole>(
    search.invite ? "player" : "club_admin"
  );
  const inviteToken = search.invite ?? "";
  const hasInvite = inviteToken.length > 0;
  // Member invite kind ("player" | "parent" | "member") if the token belongs to member_invites.
  // Null while loading; "club" means token isn't found in member_invites and we'll fall back to club_invites.
  const [inviteKind, setInviteKind] = useState<string | null>(null);
  const [inviteEmailLocked, setInviteEmailLocked] = useState(false);
  const [inviteLoading, setInviteLoading] = useState(hasInvite);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!hasInvite) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.rpc("get_member_invite_info", {
        _token: inviteToken,
      });
      if (cancelled) return;
      const row = Array.isArray(data) ? data[0] : null;
      if (error || !row) {
        // Likely a club_invites token — keep player as default role
        setInviteKind("club");
        setInviteLoading(false);
        return;
      }
      if (row.expired) toast.error(t("auth.inviteExpired") || "This invitation has expired.");
      if (row.used) toast.error(t("auth.inviteUsed") || "This invitation has already been used.");
      setInviteKind(row.kind);
      if (row.kind === "parent") setSignupRole("parent");
      else if (row.kind === "player") setSignupRole("player");
      if (row.email) {
        setEmail(row.email);
        setInviteEmailLocked(true);
      }
      setInviteLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [hasInvite, inviteToken, t]);

  const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;
  const passwordValid = passwordRegex.test(password);
  const passwordsMatch = password.length > 0 && password === confirm;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!passwordValid) {
      toast.error(t("auth.passwordTooWeak"));
      return;
    }
    if (!passwordsMatch) {
      toast.error(t("auth.passwordsMustMatch"));
      return;
    }
    setBusy(true);
    const fullName = `${firstName.trim()} ${lastName.trim()}`.trim();
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: window.location.origin,
        data: {
          full_name: fullName,
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          preferred_language: i18n.language?.slice(0, 2) || "en",
          signup_role: signupRole,
          invite_token: hasInvite ? inviteToken : null,
        },
      },
    });
    if (error) {
      setBusy(false);
      toast.error(error.message);
      return;
    }
    // If session is immediately available (auto-confirm), redeem invite now
    if (hasInvite) {
      const rpcName = inviteKind === "club" ? "redeem_club_invite" : "redeem_member_invite";
      const { error: rErr } = await supabase.rpc(rpcName, { _token: inviteToken });
      if (rErr) {
        setBusy(false);
        toast.error(rErr.message || t("auth.inviteInvalid"));
        return;
      }
    }
    setBusy(false);
    toast.success(t("auth.signupSuccess"));
    navigate({ to: "/home" });
  }

  // When invited, the role is fixed by the invitation — don't let the user change it.
  const showRoleSelector = !hasInvite;

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-5 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <img src={logo} alt="Clubero" width={144} height={144} className="mx-auto mb-3 h-32 w-32 object-contain drop-shadow-sm" />
          <h1 className="text-2xl font-semibold">{t("auth.register")}</h1>
        </div>

        <form onSubmit={onSubmit} className="space-y-4 rounded-2xl border border-border bg-card p-6 shadow-sm">
          {showRoleSelector ? (
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm space-y-1">
              <div className="font-medium">{t("auth.roleClubAdmin")}</div>
              <div className="text-xs text-muted-foreground">
                {t("auth.publicSignupClubAdminOnly") ||
                  "L'inscription publique est réservée aux dirigeants de club. Les joueurs et parents rejoignent Clubero uniquement via une invitation envoyée par leur club."}
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">
              <div className="font-medium">
                {signupRole === "parent" ? t("auth.roleParent") : t("auth.rolePlayer")}
              </div>
              <div className="text-xs text-muted-foreground">
                {t("auth.invitedAsHint") || "You were invited — your role is set automatically."}
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="first">{t("auth.firstName")}</Label>
              <Input id="first" required value={firstName} onChange={(e) => setFirstName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="last">{t("auth.lastName")}</Label>
              <Input id="last" required value={lastName} onChange={(e) => setLastName(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="email">{t("auth.email")}</Label>
            <Input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={inviteEmailLocked || inviteLoading}
              className={inviteEmailLocked ? "bg-muted text-muted-foreground" : undefined}
            />
            {inviteEmailLocked && (
              <p className="text-xs text-muted-foreground">{t("auth.emailFromInvite") || "Email from your invitation."}</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">{t("auth.password")}</Label>
            <PasswordInput
              id="password"
              required
              autoComplete="new-password"
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <p className={`text-xs ${password.length === 0 || passwordValid ? "text-muted-foreground" : "text-destructive"}`}>
              {t("auth.passwordRequirements")}
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="confirm">{t("auth.confirmPassword")}</Label>
            <PasswordInput
              id="confirm"
              required
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
            {confirm.length > 0 && !passwordsMatch && (
              <p className="text-xs text-destructive">{t("auth.passwordsMustMatch")}</p>
            )}
          </div>
          <Button type="submit" className="w-full h-11" disabled={busy || inviteLoading}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : t("auth.register")}
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            <Link to="/legal/$kind" params={{ kind: "terms" }} className="underline">Terms</Link>
            {" · "}
            <Link to="/legal/$kind" params={{ kind: "privacy" }} className="underline">Privacy</Link>
          </p>
        </form>

        <p className="mt-5 text-center text-sm text-muted-foreground">
          {t("auth.hasAccount")}{" "}
          <Link to="/login" className="font-semibold text-primary hover:underline">
            {t("auth.login")}
          </Link>
        </p>
      </div>
    </div>
  );
}
