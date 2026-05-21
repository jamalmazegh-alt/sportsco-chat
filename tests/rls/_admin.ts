/**
 * Service-role Supabase client for fixture setup/teardown only.
 * NEVER import this from a test that's verifying RLS — service_role bypasses
 * all policies and would give false positives.
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  throw new Error(
    "RLS tests require SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars.",
  );
}

export const admin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

export const SUPABASE_URL = url;
export const SUPABASE_ANON_KEY =
  process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.VITE_SUPABASE_PUBLISHABLE_KEY!;
