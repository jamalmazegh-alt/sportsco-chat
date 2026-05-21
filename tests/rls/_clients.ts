/**
 * signInAs(role) — returns a Supabase client authenticated as the given seeded
 * user. The client uses the anon key, so RLS applies as that user.
 *
 * Sign-ins are cached per role to keep tests fast.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./_admin";
import { getFixtures, type Role } from "./_setup";

const cache = new Map<Role, SupabaseClient>();

export async function signInAs(role: Role): Promise<SupabaseClient> {
  const hit = cache.get(role);
  if (hit) return hit;

  const fx = getFixtures();
  const { email, password } = fx.users[role];

  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) {
    throw new Error(`signInAs(${role}) failed: ${error.message}`);
  }

  cache.set(role, client);
  return client;
}

/** Anonymous client — no auth header, simulates a public/anon visitor. */
export function anonClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
