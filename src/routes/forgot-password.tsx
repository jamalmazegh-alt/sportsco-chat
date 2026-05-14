import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import logo from "@/assets/clubero-logo.png";

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

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setBusy(false);
    if (error) {
      toast.error(t("auth.resetError"));
      return;
    }
    setSent(true);
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-5 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <img src={logo} alt="Clubero" width={96} height={96} className="mx-auto mb-2 h-24 w-24 object-contain" />
          <h1 className="text-xl font-semibold">{t("auth.forgotTitle")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("auth.forgotSubtitle")}</p>
        </div>

        {sent ? (
          <div className="rounded-2xl border border-border bg-card p-6 shadow-sm text-center space-y-3">
            <p className="text-sm">{t("auth.resetSent")}</p>
            <Link to="/login" className="inline-block text-sm font-semibold text-primary hover:underline">
              {t("auth.backToLogin")}
            </Link>
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
