import type { TFunction } from "i18next";

type SupabaseAuthError = {
  message?: string;
  code?: string;
  status?: number;
  reasons?: string[];
};

/**
 * Map a Supabase auth error to a localized message.
 * Falls back to the raw error.message if no known code matches.
 */
export function localizeAuthError(
  error: SupabaseAuthError | null | undefined,
  t: TFunction,
): string {
  if (!error) return "";
  const code = (error.code || "").toLowerCase();
  const msg = (error.message || "").toLowerCase();
  const status = error.status ?? 0;

  // Weak / pwned password (HIBP)
  if (
    code === "weak_password" ||
    msg.includes("pwned") ||
    msg.includes("data breach") ||
    msg.includes("compromised") ||
    msg.includes("leaked")
  ) {
    return t("auth.weakPasswordPwned");
  }

  // Password length / strength returned by Supabase
  if (msg.includes("password should be") || msg.includes("password is too short")) {
    return t("auth.weakPassword");
  }

  // Already-registered email
  if (
    code === "user_already_exists" ||
    code === "email_exists" ||
    msg.includes("already registered") ||
    msg.includes("user already")
  ) {
    return t("auth.emailAlreadyRegistered");
  }

  // Rate limit
  if (code === "over_email_send_rate_limit" || status === 429 || msg.includes("rate limit")) {
    return t("auth.tooManyRequests");
  }

  // Invalid email
  if (code === "invalid_email" || msg.includes("invalid email")) {
    return t("auth.invalidEmail");
  }

  // Invalid credentials (login)
  if (code === "invalid_credentials" || msg.includes("invalid login")) {
    return t("auth.loginError");
  }

  return error.message || t("auth.signupError");
}
