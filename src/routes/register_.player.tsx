import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/password-input";
import { Checkbox } from "@/components/ui/checkbox";
import { SportSelect } from "@/components/sport-select";
import { PositionCombobox } from "@/components/position-combobox";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import logo from "@/assets/clubero-logo.png";

export const Route = createFileRoute("/register_/player")({
  component: RegisterPlayerPage,
  head: () => ({
    meta: [
      { title: "Crée ton profil joueur — Clubero" },
      { name: "description", content: "Rejoins Clubero comme joueur indépendant. Crée ton profil sportif en quelques minutes." },
    ],
  }),
});

function isMinor(birth: string) {
  if (!birth) return false;
  const d = new Date(birth);
  const age = (Date.now() - d.getTime()) / (365.25 * 24 * 3600 * 1000);
  return age < 18;
}

function RegisterPlayerPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);

  // step 1
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // step 2
  const [sport, setSport] = useState("");
  const [position, setPosition] = useState("");
  const [city, setCity] = useState("");
  const [region, setRegion] = useState("");

  // step 3
  const [lookingForClub, setLookingForClub] = useState(false);
  const [parentalConsent, setParentalConsent] = useState(false);

  const minor = isMinor(birthDate);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (minor && !parentalConsent) {
      toast.error("Un parent doit approuver le profil public.");
      return;
    }
    setBusy(true);
    try {
      const { data: signUpData, error: signUpErr } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/`,
          data: { first_name: firstName, last_name: lastName, full_name: `${firstName} ${lastName}`.trim() },
        },
      });
      if (signUpErr) throw signUpErr;
      const userId = signUpData.user?.id;
      if (!userId) {
        toast.success("Vérifie ton email pour confirmer ton inscription.");
        navigate({ to: "/login" });
        return;
      }

      await supabase.from("profiles").upsert({
        id: userId,
        first_name: firstName,
        last_name: lastName,
        full_name: `${firstName} ${lastName}`.trim(),
        birth_date: birthDate || null,
        city: city || null,
        region: region || null,
        is_independent: true,
        person_type: "player",
        looking_for_club: lookingForClub,
        parental_public_consent: minor ? parentalConsent : false,
      } as any);

      await supabase.from("players").insert({
        club_id: null,
        user_id: userId,
        first_name: firstName,
        last_name: lastName,
        birth_date: birthDate || null,
        preferred_position: position || null,
      } as any);

      toast.success("Profil créé !");
      navigate({ to: "/" });
    } catch (err: any) {
      toast.error(err?.message ?? "Erreur lors de l'inscription");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-primary/5 to-background flex items-center justify-center px-5 py-10">
      <div className="w-full max-w-md rounded-2xl border border-border/60 bg-card p-8 shadow-sm">
        <img src={logo} alt="Clubero" className="mx-auto mb-6 h-14 w-auto object-contain" />
        <h1 className="text-center text-2xl font-bold">Crée ton profil joueur</h1>
        <p className="mt-1 text-center text-sm text-muted-foreground">Étape {step} sur 3</p>

        <form onSubmit={submit} className="mt-6 space-y-4">
          {step === 1 && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="fn">Prénom</Label>
                  <Input id="fn" required value={firstName} onChange={(e) => setFirstName(e.target.value)} />
                </div>
                <div>
                  <Label htmlFor="ln">Nom</Label>
                  <Input id="ln" required value={lastName} onChange={(e) => setLastName(e.target.value)} />
                </div>
              </div>
              <div>
                <Label htmlFor="bd">Date de naissance</Label>
                <Input id="bd" type="date" required value={birthDate} onChange={(e) => setBirthDate(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="em">Email</Label>
                <Input id="em" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="pw">Mot de passe</Label>
                <PasswordInput id="pw" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
              </div>
              <Button type="button" className="w-full" onClick={() => setStep(2)} disabled={!firstName || !lastName || !birthDate || !email || password.length < 8}>
                Continuer
              </Button>
            </>
          )}

          {step === 2 && (
            <>
              <div>
                <Label htmlFor="sp">Sport principal</Label>
                <SportSelect value={sport} onValueChange={(v) => { setSport(v); setPosition(""); }} placeholder="Choisis ton sport" />
              </div>
              <div>
                <Label htmlFor="po">Poste préféré</Label>
                <PositionCombobox value={position} onChange={setPosition} sport={sport} placeholder="Optionnel" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="ci">Ville</Label>
                  <Input id="ci" value={city} onChange={(e) => setCity(e.target.value)} />
                </div>
                <div>
                  <Label htmlFor="re">Région</Label>
                  <Input id="re" value={region} onChange={(e) => setRegion(e.target.value)} />
                </div>
              </div>
              <div className="flex gap-2">
                <Button type="button" variant="outline" className="flex-1" onClick={() => setStep(1)}>Retour</Button>
                <Button type="button" className="flex-1" onClick={() => setStep(3)} disabled={!sport}>Continuer</Button>
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <div className="rounded-lg border border-border/60 bg-muted/30 p-4 text-sm">
                Ton profil est privé par défaut. Tu pourras le rendre public depuis tes paramètres.
                {minor && (
                  <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">
                    Tu es mineur : un parent/tuteur doit approuver la publication d'un profil public.
                  </p>
                )}
              </div>

              {minor && (
                <label className="flex items-start gap-2 text-sm">
                  <Checkbox checked={parentalConsent} onCheckedChange={(v) => setParentalConsent(v === true)} />
                  <span>Mon parent/tuteur approuve la création de mon profil public.</span>
                </label>
              )}

              <label className="flex items-start gap-2 text-sm">
                <Checkbox checked={lookingForClub} onCheckedChange={(v) => setLookingForClub(v === true)} />
                <span>Je recherche un club</span>
              </label>

              <div className="flex gap-2">
                <Button type="button" variant="outline" className="flex-1" onClick={() => setStep(2)}>Retour</Button>
                <Button type="submit" className="flex-1" disabled={busy}>
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Créer mon profil"}
                </Button>
              </div>
            </>
          )}
        </form>

        <p className="mt-5 text-center text-sm text-muted-foreground">
          Déjà un compte ? <Link to="/login" className="font-semibold text-primary hover:underline">Se connecter</Link>
        </p>
      </div>
    </div>
  );
}
