import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { getPublicOrigin } from "@/lib/native-platform";
import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import i18n from "@/lib/i18n";
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
      { title: i18n.t("registerPlayer.metaTitle") },
      {
        name: "description",
        content: i18n.t("registerPlayer.metaDescription"),
      },
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
  const { t } = useTranslation();
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
  const [country, setCountry] = useState("");

  // step 3
  const [lookingForClub, setLookingForClub] = useState(false);
  const [parentalConsent, setParentalConsent] = useState(false);

  const minor = isMinor(birthDate);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (minor && !parentalConsent) {
      toast.error(t("registerPlayer.parentalRequired"));
      return;
    }
    setBusy(true);
    try {
      const { data: signUpData, error: signUpErr } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${getPublicOrigin()}/`,
          data: {
            first_name: firstName,
            last_name: lastName,
            full_name: `${firstName} ${lastName}`.trim(),
          },
        },
      });
      if (signUpErr) throw signUpErr;
      const userId = signUpData.user?.id;
      if (!userId) {
        toast.success(t("auth.checkEmail"));
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
        country: country || null,
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

      toast.success(t("registerPlayer.successToast"));
      navigate({ to: "/" });
    } catch (err: any) {
      toast.error(err?.message ?? t("auth.signupError"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-primary/5 to-background flex items-center justify-center px-5 py-10">
      <div className="w-full max-w-md rounded-2xl border border-border/60 bg-card p-8 shadow-sm">
        <img src={logo} alt="Clubero" className="mx-auto mb-6 h-14 w-auto object-contain" />
        <h1 className="text-center text-2xl font-bold">{t("registerPlayer.title")}</h1>
        <p className="mt-1 text-center text-sm text-muted-foreground">
          {t("registerPlayer.step", { step })}
        </p>

        <form onSubmit={submit} className="mt-6 space-y-4">
          {step === 1 && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="fn">{t("auth.firstName")}</Label>
                  <Input
                    id="fn"
                    required
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="ln">{t("auth.lastName")}</Label>
                  <Input
                    id="ln"
                    required
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="bd">{t("auth.birthDate")}</Label>
                <Input
                  id="bd"
                  type="date"
                  required
                  value={birthDate}
                  onChange={(e) => setBirthDate(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="em">{t("auth.email")}</Label>
                <Input
                  id="em"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="pw">{t("auth.password")}</Label>
                <PasswordInput
                  id="pw"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <Button
                type="button"
                className="w-full"
                onClick={() => setStep(2)}
                disabled={!firstName || !lastName || !birthDate || !email || password.length < 8}
              >
                {t("common.continue")}
              </Button>
            </>
          )}

          {step === 2 && (
            <>
              <div>
                <Label htmlFor="sp">{t("registerPlayer.mainSport")}</Label>
                <SportSelect
                  value={sport}
                  onValueChange={(v) => {
                    setSport(v);
                    setPosition("");
                  }}
                  placeholder={t("registerPlayer.sportPlaceholder")}
                />
              </div>
              <div>
                <Label htmlFor="po">{t("registerPlayer.preferredPosition")}</Label>
                <PositionCombobox
                  value={position}
                  onChange={setPosition}
                  sport={sport}
                  placeholder={t("common.optional")}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="ci">{t("registerPlayer.city")}</Label>
                  <Input id="ci" value={city} onChange={(e) => setCity(e.target.value)} />
                </div>
                <div>
                  <Label htmlFor="co">{t("registerPlayer.country")}</Label>
                  <select
                    id="co"
                    value={country}
                    onChange={(e) => setCountry(e.target.value)}
                    className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                  >
                    <option value="">{t("registerPlayer.countryPlaceholder")}</option>
                    <option value="France">France</option>
                    <option value="Belgique">Belgique</option>
                    <option value="Suisse">Suisse</option>
                    <option value="Canada">Canada</option>
                    <option value="Luxembourg">Luxembourg</option>
                    <option value="Maroc">Maroc</option>
                    <option value="Tunisie">Tunisie</option>
                    <option value="Algérie">Algérie</option>
                    <option value="Côte d'Ivoire">Côte d'Ivoire</option>
                    <option value="Sénégal">Sénégal</option>
                    <option value="Réunion">Réunion</option>
                    <option value="Guadeloupe">Guadeloupe</option>
                    <option value="Martinique">Martinique</option>
                    <option value="Polynésie française">Polynésie française</option>
                    <option value="Nouvelle-Calédonie">Nouvelle-Calédonie</option>
                    <option value="Autre">{t("registerPlayer.countryOther")}</option>
                  </select>
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  onClick={() => setStep(1)}
                >
                  {t("common.back")}
                </Button>
                <Button
                  type="button"
                  className="flex-1"
                  onClick={() => setStep(3)}
                  disabled={!sport}
                >
                  {t("common.continue")}
                </Button>
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <div className="rounded-lg border border-border/60 bg-muted/30 p-4 text-sm">
                {t("registerPlayer.privacyHint")}
                {minor && (
                  <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">
                    {t("registerPlayer.minorHint")}
                  </p>
                )}
              </div>

              {minor && (
                <label className="flex items-start gap-2 text-sm">
                  <Checkbox
                    checked={parentalConsent}
                    onCheckedChange={(v) => setParentalConsent(v === true)}
                  />
                  <span>{t("registerPlayer.parentalConsent")}</span>
                </label>
              )}

              <label className="flex items-start gap-2 text-sm">
                <Checkbox
                  checked={lookingForClub}
                  onCheckedChange={(v) => setLookingForClub(v === true)}
                />
                <span>{t("registerPlayer.lookingForClub")}</span>
              </label>

              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  onClick={() => setStep(2)}
                >
                  {t("common.back")}
                </Button>
                <Button type="submit" className="flex-1" disabled={busy}>
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : t("registerPlayer.submit")}
                </Button>
              </div>
            </>
          )}
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
