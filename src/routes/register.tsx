import { createFileRoute, Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useServerFn } from "@tanstack/react-start";
import i18n from "@/lib/i18n";
import { supabase } from "@/integrations/supabase/client";
import { validateInviteToken, confirmInvitedUserEmail, type InviteValidationResult } from "@/lib/invite.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/password-input";

import { toast } from "sonner";
import { AlertCircle, Loader2 } from "lucide-react";
import logo from "@/assets/clubero-logo.png";

type SignupRole = "club_admin" | "player" | "parent";

export const Route = createFileRoute("/register")({
  validateSearch: (search: Record<string, unknown>) => ({
    invite: typeof search.invite === "string" ? search.invite : undefined,
  }),
  component: RegisterPage,
  head: () => ({
    meta: [
      { title: i18n.t("meta.register.title") },
      { name: "description", content: i18n.t("meta.register.description") },
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
  const [inviteValidation, setInviteValidation] = useState<InviteValidationResult | null>(null);
  const [busy, setBusy] = useState(false);
  const validateInvite = useServerFn(validateInviteToken);
  const confirmInvitedEmail = useServerFn(confirmInvitedUserEmail);

  useEffect(() => {
    if (!hasInvite) return;
    let cancelled = false;
    (async () => {
      try {
        const result = await validateInvite({ data: { token: inviteToken } });
        if (cancelled) return;
        setInviteValidation(result);
        if (!result.valid) return;

        if (result.source === "club") {
          setInviteKind("club");
          if (result.role === "club_admin") setSignupRole("club_admin");
          else if (result.role === "parent") setSignupRole("parent");
          else setSignupRole("player");
        } else {
          setInviteKind(result.kind);
          if (result.kind === "parent") setSignupRole("parent");
          else if (result.kind === "player") setSignupRole("player");
          if (result.email) {
            setEmail(result.email);
            setInviteEmailLocked(true);
          }
          if (result.suggestedFirstName) setFirstName(result.suggestedFirstName);
          if (result.suggestedLastName) setLastName(result.suggestedLastName);
        }
      } catch {
        if (!cancelled) setInviteValidation({ valid: false, reason: "invalid" });
      } finally {
        if (!cancelled) setInviteLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [hasInvite, inviteToken, validateInvite]);

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
    const { data: signUpData, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/home`,
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
    // If session is immediately available (auto-confirm), redeem invite + go home.
    // Otherwise, show "check your email" message and send to login.
    if (signUpData.session) {
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
      return;
    }
    // No session: email confirmation is required. For invited users the
    // invite link is proof of email ownership, so auto-confirm and sign them in.
    if (hasInvite) {
      try {
        await confirmInvitedEmail({ data: { token: inviteToken, email } });
        const { error: signInErr } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (signInErr) throw signInErr;
        const rpcName = inviteKind === "club" ? "redeem_club_invite" : "redeem_member_invite";
        const { error: rErr } = await supabase.rpc(rpcName, { _token: inviteToken });
        if (rErr) {
          setBusy(false);
          toast.error(rErr.message || t("auth.inviteInvalid"));
          return;
        }
        setBusy(false);
        toast.success(t("auth.signupSuccess"));
        navigate({ to: "/home" });
        return;
      } catch (err: any) {
        setBusy(false);
        toast.error(err?.message || t("auth.inviteInvalid"));
        return;
      }
    }
    setBusy(false);
    toast.success(t("auth.checkEmail"), { duration: 8000 });
    navigate({ to: "/login" });
  }

  // When invited, the role is fixed by the invitation — don't let the user change it.
  const showRoleSelector = !hasInvite;

  if (hasInvite && inviteLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (hasInvite && inviteValidation && !inviteValidation.valid) {
    const message =
      inviteValidation.reason === "expired"
        ? t("auth.inviteExpired") || "This invitation has expired."
        : inviteValidation.reason === "used"
          ? t("auth.inviteUsed") || "This invitation has already been used."
          : t("auth.inviteInvalid");
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-5 py-10">
        <div className="w-full max-w-sm text-center space-y-4">
          <img
            src={logo}
            alt="Clubero"
            width={144}
            height={72}
            className="mx-auto h-16 w-36 object-contain drop-shadow-sm dark:bg-white dark:rounded-md dark:px-2"
          />
          <div className="rounded-2xl border border-border bg-card p-6 shadow-sm space-y-3">
            <AlertCircle className="mx-auto h-10 w-10 text-destructive" />
            <h1 className="text-xl font-semibold">{t("auth.inviteInvalid")}</h1>
            <p className="text-sm text-muted-foreground">{message}</p>
            <Button asChild variant="outline" className="w-full">
              <Link to="/login">{t("auth.login")}</Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-5 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <img src={logo} alt="Clubero" width={144} height={72} className="mx-auto mb-3 h-16 w-36 object-contain drop-shadow-sm dark:bg-white dark:rounded-md dark:px-2" />
          <h1 className="text-2xl font-semibold">{t("auth.register")}</h1>
        </div>

        <form onSubmit={onSubmit} className="space-y-4 rounded-2xl border border-border bg-card p-6 shadow-sm">
          {showRoleSelector ? (
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm space-y-2">
              <div className="font-medium">{t("auth.roleClubAdmin")}</div>
              <div className="text-xs text-muted-foreground">
                {t("auth.publicSignupClubAdminOnly") ||
                  "Cette inscription est destinée aux dirigeants de club. Les joueurs et parents rattachés à un club rejoignent Clubero via une invitation."}
              </div>
              <div className="text-xs">
                <Link to="/register/player" className="font-semibold text-primary hover:underline">
                  {t("auth.playerSignupLink") || "Vous êtes joueur ? Créez votre profil ici →"}
                </Link>
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
