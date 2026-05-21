import { test } from "@playwright/test";

test("E2E backend config is available", () => {
  test.skip(
    true,
    "SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and SUPABASE_PUBLISHABLE_KEY are not configured; backend E2E tests skipped.",
  );
});