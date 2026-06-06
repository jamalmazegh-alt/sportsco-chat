/**
 * Programmatic auth helpers — sign a user in via Supabase REST API,
 * then inject the session into the page's localStorage so the React app
 * boots already authenticated. Much faster + more reliable than UI login.
 */
import type { Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./admin";

export async function getSessionForUser(email: string, password: string) {
  // Use an isolated client (no persistSession) to grab tokens.
  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.session) {
    throw new Error(`signIn(${email}) failed: ${error?.message ?? "no session"}`);
  }
  return data.session;
}

/**
 * Hydrate the page with a Supabase session so the app boots logged-in.
 * Must be called BEFORE the first page.goto().
 */
export async function loginAs(
  page: Page,
  user: { email: string; password: string },
) {
  const session = await getSessionForUser(user.email, user.password);
  // Supabase JS v2 stores the session under `sb-<projectRef>-auth-token`.
  // We can derive the storage key from the URL (subdomain = project ref).
  const projectRef = new URL(SUPABASE_URL).hostname.split(".")[0];
  const storageKey = `sb-${projectRef}-auth-token`;
  const storageValue = JSON.stringify(session);

  await page.addInitScript(
    ([key, value]) => {
      try {
        window.localStorage.setItem(key, value);
      } catch {
        /* ignore */
      }
    },
    [storageKey, storageValue],
  );
}

/**
 * Returns a Supabase JS client already signed-in as the given user.
 * Useful for tests that want to verify behaviour via RLS without UI clicks.
 */
export async function clientFor(user: { email: string; password: string }) {
  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.signInWithPassword({
    email: user.email,
    password: user.password,
  });
  if (error || !data.session) {
    throw new Error(`clientFor(${user.email}): ${error?.message ?? "no session"}`);
  }
  return client;
}
