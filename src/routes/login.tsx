import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import i18n from "@/lib/i18n";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/password-input";
import { toast } from "sonner";
import { ArrowLeft, Loader2 } from "lucide-react";
import logo from "@/assets/clubero-logo.png";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";


export const Route = createFileRoute("/login")({
  validateSearch: (search: Record<string, unknown>) => ({
    invite: typeof search.invite === "string" ? search.invite : undefined,
  }),
  component: LoginPage,
  head: () => ({
    meta: [
      { title: i18n.t("meta.login.title") },
      { name: "description", content: i18n.t("meta.login.description") },
    ],
  }),
});

function LoginPage() {
  const { t } = useTranslation();
  const search = Route.useSearch();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setBusy(false);
      toast.error(t("auth.loginError"));
      return;
    }
    if (search.invite) {
      const { error: memberErr } = await supabase.rpc("redeem_member_invite", { _token: search.invite });
      if (memberErr) {
        const { error: clubErr } = await supabase.rpc("redeem_club_invite", { _token: search.invite });
        if (clubErr) {
          setBusy(false);
          toast.error(memberErr.message || clubErr.message || t("auth.inviteInvalid"));
          return;
        }
      }
    }
    // Force a full reload so AuthProvider rehydrates the session cleanly,
    // avoiding a race where /home renders before onAuthStateChange fires.
    if (typeof window !== "undefined") {
      window.location.replace("/home");
    }
  }

  function rememberEmailForReset() {
    if (typeof window !== "undefined" && email) {
      sessionStorage.setItem("clubero:forgot_email", email);
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-5 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-4 flex justify-end">
          <LanguageSwitcher
            current={(i18n.language ?? "fr").slice(0, 2)}
            onChange={(lng) => i18n.changeLanguage(lng)}
          />
        </div>

        <a
          href="https://www.clubero.app"
          target="_blank"
          rel="noopener noreferrer"
          className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          {t("auth.backToWebsite")}
        </a>
        <div className="mb-8 text-center">
          <img src={logo} alt="Clubero" width={176} height={88} className="mx-auto mb-3 h-20 w-44 object-contain drop-shadow-sm dark:bg-white dark:rounded-md dark:px-2" />
          <p className="mt-1 text-sm text-muted-foreground">{t("app.tagline")}</p>
        </div>

        <form onSubmit={onSubmit} className="space-y-4 rounded-2xl border border-border bg-card p-6 shadow-sm">
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
            <PasswordInput
              id="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <Button type="submit" className="w-full h-11" disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : t("auth.login")}
          </Button>
          <div className="text-center">
            <Link
              to="/forgot-password"
              onClick={rememberEmailForReset}
              className="text-sm text-muted-foreground hover:text-primary hover:underline"
            >
              {t("auth.forgotPassword")}
            </Link>
          </div>
        </form>

        <p className="mt-5 text-center text-sm text-muted-foreground">
          {t("auth.noAccount")}{" "}
          <Link to="/register" className="font-semibold text-primary hover:underline">
            {t("auth.register")}
          </Link>
        </p>
      </div>
    </div>
  );
}
