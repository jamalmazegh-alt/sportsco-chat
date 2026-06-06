import { test } from "@playwright/test";

test("E2E backend config is available", () => {
  test.skip(
    true,
    "Missing one of SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD — backend E2E tests skipped.",
  );
});
