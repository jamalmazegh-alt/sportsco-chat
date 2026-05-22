import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import i18n from "@/lib/i18n";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/password-input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Loader2, Trophy } from "lucide-react";
import { toast } from "sonner";
import logo from "@/assets/clubero-logo.png";

const NEXT = "/tournaments/new-from-pass";

export const Route = createFileRoute("/tournaments/start")({
  component: StartPage,
  validateSearch: (s: Record<string, unknown>) => ({
    auth_error: typeof s.auth_error === "string" ? s.auth_error : undefined,
  }),
  head: () => ({
    meta: [
      { title: i18n.t("tournaments.start.metaTitle", { ns: "marketing" }) },
      {
        name: "description",
        content: i18n.t("tournaments.start.metaDesc", { ns: "marketing" }),
      },
    ],
  }),
});


function StartPage() {
  const { session, loading } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation("marketing");

  useEffect(() => {
    if (!loading && session) {
      navigate({ to: NEXT });
    }
  }, [loading, session, navigate]);

  if (loading || session) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-5 py-10">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <img
            src={logo}
            alt="Clubero"
            width={144}
            height={72}
            className="mx-auto mb-3 h-16 w-36 object-contain drop-shadow-sm dark:bg-white dark:rounded-md dark:px-2"
          />
          <div className="mx-auto mt-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <Trophy className="h-6 w-6 text-primary" />
          </div>
          <h1 className="mt-4 font-display text-2xl font-bold">{t("tournaments.start.heading")}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {t("tournaments.start.subheading")}
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <Tabs defaultValue="signup" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="signup">{t("tournaments.start.tabSignup")}</TabsTrigger>
              <TabsTrigger value="login">{t("tournaments.start.tabLogin")}</TabsTrigger>
            </TabsList>
            <TabsContent value="signup" className="mt-4">
              <SignupForm />
            </TabsContent>
            <TabsContent value="login" className="mt-4">
              <LoginForm />
            </TabsContent>
          </Tabs>
        </div>

        <p className="mt-5 text-center text-xs text-muted-foreground">
          {t("tournaments.start.termsPre")}
          <Link to="/legal/$kind" params={{ kind: "terms" }} className="underline">
            {t("tournaments.start.terms")}
          </Link>
          {t("tournaments.start.termsMid")}
          <Link to="/legal/$kind" params={{ kind: "privacy" }} className="underline">
            {t("tournaments.start.privacy")}
          </Link>
          .
        </p>
      </div>
    </div>
  );
}

function SignupForm() {
  const navigate = useNavigate();
  const { t } = useTranslation("marketing");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const passwordValid = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/.test(password);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!passwordValid) {
      toast.error(t("tournaments.start.passwordError"));
      return;
    }
    setBusy(true);
    const fullName = `${firstName.trim()} ${lastName.trim()}`.trim();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}${NEXT}`,
        data: {
          full_name: fullName,
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          signup_role: "tournament_organizer",
        },
      },
    });
    if (error) {
      setBusy(false);
      toast.error(error.message);
      return;
    }
    if (data.session) {
      toast.success(t("tournaments.start.accountCreated"));
      navigate({ to: NEXT });
      return;
    }
    setBusy(false);
    toast.success(t("tournaments.start.checkEmail"), {
      duration: 8000,
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="s-first">{t("tournaments.start.firstName")}</Label>
          <Input
            id="s-first"
            required
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="s-last">{t("tournaments.start.lastName")}</Label>
          <Input
            id="s-last"
            required
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="s-email">{t("tournaments.start.email")}</Label>
        <Input
          id="s-email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="s-password">{t("tournaments.start.password")}</Label>
        <PasswordInput
          id="s-password"
          required
          autoComplete="new-password"
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <p
          className={`text-xs ${
            password.length === 0 || passwordValid
              ? "text-muted-foreground"
              : "text-destructive"
          }`}
        >
          {t("tournaments.start.passwordHelp")}
        </p>
      </div>
      <Button type="submit" className="w-full h-11" disabled={busy}>
        {busy ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <>
            <Trophy className="h-4 w-4" />
            {t("tournaments.start.signupCta")}
          </>
        )}
      </Button>
    </form>
  );
}

function LoginForm() {
  const navigate = useNavigate();
  const { t } = useTranslation("marketing");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setBusy(false);
      toast.error(t("tournaments.start.invalidCreds"));
      return;
    }
    navigate({ to: NEXT });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="l-email">{t("tournaments.start.email")}</Label>
        <Input
          id="l-email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="l-password">{t("tournaments.start.password")}</Label>
        <PasswordInput
          id="l-password"
          required
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>
      <Button type="submit" className="w-full h-11" disabled={busy}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : t("tournaments.start.loginCta")}
      </Button>
      <p className="text-center text-xs">
        <Link to="/forgot-password" className="text-muted-foreground hover:text-primary hover:underline">
          {t("tournaments.start.forgotPassword")}
        </Link>
      </p>
    </form>
  );
}
