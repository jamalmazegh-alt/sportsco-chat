import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { ChevronLeft, Loader2, KeyRound, Eye, EyeOff } from "lucide-react";

export const Route = createFileRoute("/_authenticated/profile/password")({
  component: PasswordPage,
  head: () => ({ meta: [{ title: "Mot de passe — Clubero" }] }),
});

function PasswordPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNext, setShowNext] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user?.email) return;

    if (next.length < 8) {
      toast.error(
        t("profile.password.tooShort", {
          defaultValue: "Le mot de passe doit faire au moins 8 caractères.",
        }),
      );
      return;
    }
    if (next !== confirm) {
      toast.error(
        t("profile.password.mismatch", {
          defaultValue: "Les deux mots de passe ne correspondent pas.",
        }),
      );
      return;
    }
    if (next === current) {
      toast.error(
        t("profile.password.sameAsCurrent", {
          defaultValue: "Le nouveau mot de passe doit être différent de l'actuel.",
        }),
      );
      return;
    }

    setBusy(true);

    // Re-authenticate to verify the current password
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: current,
    });
    if (signInError) {
      setBusy(false);
      toast.error(
        t("profile.password.wrongCurrent", {
          defaultValue: "Mot de passe actuel incorrect.",
        }),
      );
      return;
    }

    const { error } = await supabase.auth.updateUser({ password: next });
    setBusy(false);

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success(
      t("profile.password.updated", {
        defaultValue: "Mot de passe mis à jour.",
      }),
    );
    setCurrent("");
    setNext("");
    setConfirm("");
    navigate({ to: "/profile" });
  }

  return (
    <div className="px-5 pt-6 pb-10 space-y-6 max-w-lg mx-auto">
      <BackLink to="/profile" />


      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
          <KeyRound className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-xl font-semibold">
            {t("profile.password.title", { defaultValue: "Mot de passe" })}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t("profile.password.subtitle", {
              defaultValue: "Modifiez le mot de passe de votre compte.",
            })}
          </p>
        </div>
      </div>

      <form
        onSubmit={onSubmit}
        className="rounded-2xl border border-border bg-card p-5 space-y-4"
      >
        <div className="space-y-1.5">
          <Label htmlFor="current">
            {t("profile.password.current", { defaultValue: "Mot de passe actuel" })}
          </Label>
          <div className="relative">
            <Input
              id="current"
              type={showCurrent ? "text" : "password"}
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              autoComplete="current-password"
              required
            />
            <button
              type="button"
              onClick={() => setShowCurrent((v) => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-1"
              tabIndex={-1}
            >
              {showCurrent ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="next">
            {t("profile.password.new", { defaultValue: "Nouveau mot de passe" })}
          </Label>
          <div className="relative">
            <Input
              id="next"
              type={showNext ? "text" : "password"}
              value={next}
              onChange={(e) => setNext(e.target.value)}
              autoComplete="new-password"
              minLength={8}
              required
            />
            <button
              type="button"
              onClick={() => setShowNext((v) => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-1"
              tabIndex={-1}
            >
              {showNext ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          <p className="text-xs text-muted-foreground">
            {t("profile.password.hint", {
              defaultValue: "8 caractères minimum.",
            })}
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="confirm">
            {t("profile.password.confirm", { defaultValue: "Confirmer le nouveau mot de passe" })}
          </Label>
          <Input
            id="confirm"
            type={showNext ? "text" : "password"}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
            minLength={8}
            required
          />
        </div>

        <Button type="submit" className="w-full h-11" disabled={busy}>
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            t("profile.password.save", { defaultValue: "Mettre à jour le mot de passe" })
          )}
        </Button>
      </form>
    </div>
  );
}
