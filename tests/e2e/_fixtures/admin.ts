/**
 * Service-role Supabase client for E2E seed + teardown only.
 * NEVER use this to assert behaviour under RLS.
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey =
  process.env.SUPABASE_PUBLISHABLE_KEY ??
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!url || !serviceKey || !anonKey) {
  throw new Error(
    "E2E tests require SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and SUPABASE_PUBLISHABLE_KEY env vars.",
  );
}

export const SUPABASE_URL = url;
export const SUPABASE_ANON_KEY = anonKey;

export const admin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
