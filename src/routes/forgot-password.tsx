import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2, MailCheck } from "lucide-react";
import logo from "@/assets/clubero-logo.png";

const PREFILL_KEY = "clubero:forgot_email";

export const Route = createFileRoute("/forgot-password")({
  component: ForgotPasswordPage,
  head: () => ({
    meta: [
      { title: "Forgot password — Clubero" },
      { name: "description", content: "Reset your Clubero password." },
    ],
  }),
});

function ForgotPasswordPage() {
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  // Prefill from sessionStorage (e.g. typed on /login then clicked "Forgot password")
  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = sessionStorage.getItem(PREFILL_KEY);
    if (saved) setEmail(saved);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (email) sessionStorage.setItem(PREFILL_KEY, email);
  }, [email]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      // 1. Validate the email exists for this account
      const { data: exists, error: rpcErr } = await supabase.rpc("email_exists", {
        _email: email.trim(),
      });
      if (rpcErr) throw rpcErr;
      if (!exists) {
        toast.error(t("auth.emailNotFound"));
        return;
      }
      // 2. Send the reset link
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) {
        toast.error(t("auth.resetError"));
        return;
      }
      setSent(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-5 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <img src={logo} alt="Clubero" width={144} height={144} className="mx-auto mb-3 h-32 w-32 object-contain drop-shadow-sm" />
          <h1 className="text-xl font-semibold">{t("auth.forgotTitle")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("auth.forgotSubtitle")}</p>
        </div>

        {sent ? (
          <div className="rounded-2xl border border-border bg-card p-6 shadow-sm text-center space-y-4">
            <div className="mx-auto h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center">
              <MailCheck className="h-7 w-7 text-primary" />
            </div>
            <div className="space-y-1">
              <h2 className="text-base font-semibold">{t("auth.resetSentTitle")}</h2>
              <p className="text-sm text-muted-foreground">
                {t("auth.resetSentTo")} <span className="font-medium text-foreground break-all">{email}</span>
              </p>
              <p className="text-xs text-muted-foreground pt-2">{t("auth.resetSentHint")}</p>
            </div>
            <div className="flex flex-col gap-2 pt-2">
              <Button asChild className="h-11">
                <Link to="/login">{t("auth.backToLogin")}</Link>
              </Button>
              <button
                type="button"
                className="text-xs text-muted-foreground hover:text-foreground"
                onClick={() => setSent(false)}
              >
                {t("auth.useDifferentEmail")}
              </button>
            </div>
          </div>
        ) : (
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
            <Button type="submit" className="w-full h-11" disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : t("auth.sendResetLink")}
            </Button>
            <p className="text-center text-sm text-muted-foreground">
              <Link to="/login" className="font-semibold text-primary hover:underline">
                {t("auth.backToLogin")}
              </Link>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
