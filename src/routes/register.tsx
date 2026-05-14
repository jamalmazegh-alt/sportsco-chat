import { createFileRoute, Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
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
  const [inviteToken, setInviteToken] = useState(search.invite ?? "");
  const [busy, setBusy] = useState(false);

  const needsInvite = signupRole === "player" || signupRole === "parent";
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
    if (needsInvite && !inviteToken.trim()) {
      toast.error(t("auth.inviteRequired"));
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
          invite_token: needsInvite ? inviteToken.trim() : null,
        },
      },
    });
    if (error) {
      setBusy(false);
      toast.error(error.message);
      return;
    }
    // If session is immediately available (auto-confirm), redeem invite now
    if (needsInvite) {
      const { error: rErr } = await supabase.rpc("redeem_club_invite", {
        _token: inviteToken.trim(),
      });
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

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-5 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <img src={logo} alt="Clubero" width={96} height={96} className="mx-auto mb-2 h-24 w-24 object-contain" />
          <h1 className="text-2xl font-semibold">{t("auth.register")}</h1>
        </div>

        <form onSubmit={onSubmit} className="space-y-4 rounded-2xl border border-border bg-card p-6 shadow-sm">
          <div className="space-y-2">
            <Label>{t("auth.signupAs")}</Label>
            <RadioGroup
              value={signupRole}
              onValueChange={(v) => setSignupRole(v as SignupRole)}
              className="grid gap-2"
            >
              <label className="flex items-start gap-3 rounded-lg border border-border p-3 cursor-pointer has-[:checked]:border-primary has-[:checked]:bg-primary/5">
                <RadioGroupItem value="club_admin" id="r-admin" className="mt-0.5" />
                <div className="text-sm">
                  <div className="font-medium">{t("auth.roleClubAdmin")}</div>
                  <div className="text-xs text-muted-foreground">{t("auth.roleClubAdminHint")}</div>
                </div>
              </label>
              <label className="flex items-start gap-3 rounded-lg border border-border p-3 cursor-pointer has-[:checked]:border-primary has-[:checked]:bg-primary/5">
                <RadioGroupItem value="player" id="r-player" className="mt-0.5" />
                <div className="text-sm">
                  <div className="font-medium">{t("auth.rolePlayer")}</div>
                  <div className="text-xs text-muted-foreground">{t("auth.rolePlayerHint")}</div>
                </div>
              </label>
              <label className="flex items-start gap-3 rounded-lg border border-border p-3 cursor-pointer has-[:checked]:border-primary has-[:checked]:bg-primary/5">
                <RadioGroupItem value="parent" id="r-parent" className="mt-0.5" />
                <div className="text-sm">
                  <div className="font-medium">{t("auth.roleParent")}</div>
                  <div className="text-xs text-muted-foreground">{t("auth.roleParentHint")}</div>
                </div>
              </label>
            </RadioGroup>
          </div>

          {needsInvite && (
            <div className="space-y-1.5">
              <Label htmlFor="invite">{t("auth.inviteCode")}</Label>
              <Input
                id="invite"
                required
                value={inviteToken}
                onChange={(e) => setInviteToken(e.target.value)}
                placeholder="abcd-1234"
              />
              <p className="text-xs text-muted-foreground">{t("auth.inviteHint")}</p>
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
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">{t("auth.password")}</Label>
            <Input
              id="password"
              type="password"
              required
              autoComplete="new-password"
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <Button type="submit" className="w-full h-11" disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : t("auth.register")}
          </Button>
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
