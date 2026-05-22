import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
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
  head: () => ({
    meta: [
      { title: "Lancer un tournoi — Clubero" },
      {
        name: "description",
        content:
          "Créez votre compte Clubero et lancez votre tournoi en quelques minutes. Payez à l'événement, sans abonnement.",
      },
    ],
  }),
});

function StartPage() {
  const { session, loading } = useAuth();
  const navigate = useNavigate();

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
          <h1 className="mt-4 font-display text-2xl font-bold">Lancer un tournoi</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Connectez-vous ou créez votre compte en quelques secondes. Aucun
            abonnement requis — vous payez à l'événement.
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <Tabs defaultValue="signup" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="signup">Créer un compte</TabsTrigger>
              <TabsTrigger value="login">J'ai un compte</TabsTrigger>
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
          En continuant vous acceptez nos{" "}
          <Link to="/legal/$kind" params={{ kind: "terms" }} className="underline">
            Conditions
          </Link>{" "}
          et notre{" "}
          <Link to="/legal/$kind" params={{ kind: "privacy" }} className="underline">
            Politique de confidentialité
          </Link>
          .
        </p>
      </div>
    </div>
  );
}

function SignupForm() {
  const navigate = useNavigate();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const passwordValid = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/.test(password);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!passwordValid) {
      toast.error(
        "Le mot de passe doit contenir 8 caractères, avec majuscule, minuscule et chiffre."
      );
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
          signup_role: "club_admin",
        },
      },
    });
    if (error) {
      setBusy(false);
      toast.error(error.message);
      return;
    }
    if (data.session) {
      toast.success("Compte créé");
      navigate({ to: NEXT });
      return;
    }
    setBusy(false);
    toast.success("Vérifiez votre email pour confirmer votre compte.", {
      duration: 8000,
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="s-first">Prénom</Label>
          <Input
            id="s-first"
            required
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="s-last">Nom</Label>
          <Input
            id="s-last"
            required
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="s-email">Email</Label>
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
        <Label htmlFor="s-password">Mot de passe</Label>
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
          8 caractères min., 1 majuscule, 1 minuscule, 1 chiffre.
        </p>
      </div>
      <Button type="submit" className="w-full h-11" disabled={busy}>
        {busy ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <>
            <Trophy className="h-4 w-4" />
            Créer mon compte et continuer
          </>
        )}
      </Button>
    </form>
  );
}

function LoginForm() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setBusy(false);
      toast.error("Email ou mot de passe incorrect");
      return;
    }
    navigate({ to: NEXT });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="l-email">Email</Label>
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
        <Label htmlFor="l-password">Mot de passe</Label>
        <PasswordInput
          id="l-password"
          required
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>
      <Button type="submit" className="w-full h-11" disabled={busy}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Se connecter et continuer"}
      </Button>
      <p className="text-center text-xs">
        <Link to="/forgot-password" className="text-muted-foreground hover:text-primary hover:underline">
          Mot de passe oublié ?
        </Link>
      </p>
    </form>
  );
}
