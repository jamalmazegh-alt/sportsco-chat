/**
 * V2 waitlist capture — vitrine ("À venir") section.
 *
 * Pure capture: zero feature unlock, zero auth, zero payment hook.
 * Server route: POST /api/public/waitlist.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Clock, Mail, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

const FEATURES = [
  "player_network",
  "public_profiles",
  "payments",
  "fundraising",
  "championships",
  "championship_stats",
] as const;

const ROLES = [
  "coach",
  "admin",
  "tournament_organizer",
  "parent",
  "player",
] as const;

type Status = "idle" | "loading" | "success" | "error";

export function V2Waitlist() {
  const { t } = useTranslation("marketing");
  const [email, setEmail] = useState("");
  const [features, setFeatures] = useState<string[]>([]);
  const [role, setRole] = useState<string>("");
  const [consent, setConsent] = useState(false);
  const [website, setWebsite] = useState(""); // honeypot
  const [status, setStatus] = useState<Status>("idle");

  function toggleFeature(f: string) {
    setFeatures((prev) =>
      prev.includes(f) ? prev.filter((x) => x !== f) : [...prev, f],
    );
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email || features.length === 0) return;
    setStatus("loading");
    try {
      const res = await fetch("/api/public/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          features,
          role: role || undefined,
          marketing_consent: consent,
          source: "landing",
          website,
        }),
      });
      if (res.ok) {
        setStatus("success");
        setEmail("");
        setFeatures([]);
        setRole("");
        setConsent(false);
      } else {
        setStatus("error");
      }
    } catch {
      setStatus("error");
    }
  }

  return (
    <section
      className="border-b border-border/60 bg-muted/10 py-20 lg:py-28"
      aria-labelledby="waitlist-title"
      data-testid="waitlist-section"
    >
      <div className="mx-auto max-w-3xl px-5 lg:px-8">
        <div className="text-center">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-300">
            <Clock className="h-3 w-3" />
            {t("waitlist.badge", { defaultValue: "À venir" })}
          </div>
          <h2
            id="waitlist-title"
            className="mt-4 font-display text-3xl font-bold tracking-tight sm:text-4xl"
          >
            {t("waitlist.title", { defaultValue: "Les prochaines fonctionnalités" })}
          </h2>
          <p className="mt-3 text-muted-foreground">
            {t("waitlist.subtitle", {
              defaultValue:
                "Laissez-nous votre email pour être prévenu dès qu'une fonctionnalité est disponible. Aucun engagement, aucun paiement.",
            })}
          </p>
        </div>

        {status === "success" ? (
          <div
            className="mt-10 rounded-3xl border border-border bg-card p-8 text-center"
            data-testid="waitlist-success"
            role="status"
          >
            <CheckCircle2 className="mx-auto h-10 w-10 text-[color:var(--victory)]" />
            <p className="mt-4 text-base font-semibold">
              {t("waitlist.success", {
                defaultValue: "Merci ! On vous écrit dès que c'est prêt.",
              })}
            </p>
          </div>
        ) : (
          <form
            onSubmit={onSubmit}
            className="mt-10 space-y-6 rounded-3xl border border-border bg-card p-6 sm:p-8"
            data-testid="waitlist-form"
            noValidate
          >
            {/* Honeypot */}
            <div className="absolute -left-[9999px] h-0 w-0 overflow-hidden" aria-hidden="true">
              <label htmlFor="website">Website</label>
              <input
                id="website"
                type="text"
                tabIndex={-1}
                autoComplete="off"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="waitlist-email">
                {t("waitlist.emailLabel", { defaultValue: "Votre email" })}
              </Label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="waitlist-email"
                  type="email"
                  required
                  maxLength={255}
                  className="pl-9"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="vous@club.com"
                />
              </div>
            </div>

            <fieldset className="space-y-3">
              <legend className="text-sm font-medium">
                {t("waitlist.featuresLabel", {
                  defaultValue: "Fonctionnalités qui vous intéressent",
                })}
              </legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {FEATURES.map((f) => (
                  <label
                    key={f}
                    className="flex cursor-pointer items-center gap-3 rounded-xl border border-border bg-background px-3 py-2 text-sm hover:border-primary/40"
                  >
                    <Checkbox
                      checked={features.includes(f)}
                      onCheckedChange={() => toggleFeature(f)}
                      data-testid={`waitlist-feature-${f}`}
                    />
                    <span>
                      {t(`waitlist.features.${f}`, { defaultValue: f })}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>

            <div className="space-y-2">
              <Label htmlFor="waitlist-role">
                {t("waitlist.roleLabel", { defaultValue: "Votre rôle" })}
              </Label>
              <select
                id="waitlist-role"
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">
                  {t("waitlist.rolePlaceholder", { defaultValue: "— Choisir —" })}
                </option>
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {t(`waitlist.roles.${r}`, { defaultValue: r })}
                  </option>
                ))}
              </select>
            </div>

            <label className="flex items-start gap-3 text-sm">
              <Checkbox
                checked={consent}
                onCheckedChange={(v) => setConsent(Boolean(v))}
                data-testid="waitlist-consent"
              />
              <span className="text-muted-foreground">
                {t("waitlist.consent", {
                  defaultValue:
                    "J'accepte de recevoir des nouvelles de Clubero sur les fonctionnalités à venir. Désinscription en un clic.",
                })}
              </span>
            </label>

            <Button
              type="submit"
              size="lg"
              className="h-12 w-full"
              disabled={status === "loading" || !email || features.length === 0}
              data-testid="waitlist-submit"
            >
              {status === "loading"
                ? t("waitlist.submitting", { defaultValue: "Envoi…" })
                : t("waitlist.submit", { defaultValue: "Être prévenu" })}
            </Button>

            {status === "error" && (
              <p
                className="text-center text-sm text-destructive"
                role="alert"
                data-testid="waitlist-error"
              >
                {t("waitlist.error", {
                  defaultValue: "Une erreur est survenue. Réessayez dans un instant.",
                })}
              </p>
            )}
          </form>
        )}
      </div>
    </section>
  );
}
