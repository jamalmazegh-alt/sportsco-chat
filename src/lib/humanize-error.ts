import i18n from "@/lib/i18n";
import { toast } from "sonner";

/**
 * Maps raw Postgres / Supabase / network error messages to a friendly,
 * localized sentence. Falls back to a generic message when nothing matches.
 */
export function humanizeError(err: unknown, fallback?: string): string {
  const raw = extractMessage(err).trim();
  const lower = raw.toLowerCase();
  const t = i18n.t.bind(i18n);

  // RLS / permission
  if (
    lower.includes("row-level security") ||
    lower.includes("permission denied") ||
    lower.includes("not authorized") ||
    lower.includes("unauthorized")
  ) {
    return t("errors.notAllowed", {
      defaultValue: "Vous n'avez pas les droits pour faire cette action.",
    });
  }

  // Auth
  if (lower.includes("invalid login credentials")) {
    return t("errors.invalidCredentials", { defaultValue: "E-mail ou mot de passe incorrect." });
  }
  if (lower.includes("email not confirmed")) {
    return t("errors.emailNotConfirmed", {
      defaultValue: "Confirmez votre e-mail avant de vous connecter.",
    });
  }
  if (lower.includes("user already registered") || lower.includes("already been registered")) {
    return t("errors.emailAlreadyUsed", {
      defaultValue: "Cette adresse e-mail est déjà utilisée.",
    });
  }
  if (lower.includes("password should be at least")) {
    return t("errors.passwordTooShort", {
      defaultValue: "Le mot de passe est trop court.",
    });
  }
  if (lower.includes("rate limit") || lower.includes("too many requests")) {
    return t("errors.rateLimited", {
      defaultValue: "Trop de tentatives, réessayez dans quelques instants.",
    });
  }

  // Postgres unique / fk / not-null
  if (lower.includes("duplicate key") || lower.includes("unique constraint")) {
    return t("errors.duplicate", {
      defaultValue: "Cet élément existe déjà.",
    });
  }
  if (lower.includes("foreign key")) {
    return t("errors.foreignKey", {
      defaultValue: "Cette donnée est encore référencée ailleurs.",
    });
  }
  if (lower.includes("not-null") || lower.includes("violates not-null")) {
    return t("errors.missingField", {
      defaultValue: "Un champ obligatoire est manquant.",
    });
  }
  if (lower.includes("check constraint") || lower.includes("violates check")) {
    return t("errors.invalidValue", {
      defaultValue: "Une valeur saisie n'est pas valide.",
    });
  }

  // Invites
  if (lower.includes("invite expired")) {
    return t("errors.inviteExpired", { defaultValue: "Cette invitation a expiré." });
  }
  if (lower.includes("invite already used")) {
    return t("errors.inviteUsed", { defaultValue: "Cette invitation a déjà été utilisée." });
  }
  if (lower.includes("invalid invite")) {
    return t("errors.inviteInvalid", { defaultValue: "Invitation invalide." });
  }

  // Network
  if (
    lower.includes("failed to fetch") ||
    lower.includes("network") ||
    lower.includes("network request failed")
  ) {
    return t("errors.network", {
      defaultValue: "Connexion impossible. Vérifiez votre réseau et réessayez.",
    });
  }
  if (lower.includes("timeout")) {
    return t("errors.timeout", { defaultValue: "L'opération a pris trop de temps." });
  }
  if (lower.includes("not found")) {
    return t("errors.notFound", { defaultValue: "Élément introuvable." });
  }

  // Storage
  if (lower.includes("payload too large") || lower.includes("file too large")) {
    return t("errors.fileTooLarge", { defaultValue: "Le fichier est trop volumineux." });
  }

  // Default: keep raw if it looks human, else fallback
  if (raw && raw.length < 140 && !raw.includes("{") && !/[a-z]+_[a-z]+/.test(raw)) {
    return raw;
  }
  return fallback ?? t("errors.generic", { defaultValue: "Une erreur est survenue. Réessayez." });
}

/** Show a toast for an error with humanized message. */
export function toastError(err: unknown, fallback?: string) {
  toast.error(humanizeError(err, fallback));
}

function extractMessage(err: unknown): string {
  if (!err) return "";
  if (typeof err === "string") return err;
  if (err instanceof Error) return err.message;
  if (typeof err === "object") {
    const anyErr = err as { message?: string; error_description?: string; msg?: string; details?: string };
    return anyErr.message || anyErr.error_description || anyErr.msg || anyErr.details || JSON.stringify(err);
  }
  return String(err);
}
