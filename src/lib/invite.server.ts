import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type FoundAuthUser = { id: string; email_confirmed_at: string | null };

/**
 * Find an auth user by exact e-mail, paginating through `listUsers`
 * (a single page silently caps at 200 users).
 */
export async function findUserByEmail(email: string): Promise<FoundAuthUser | null> {
  const target = email.trim().toLowerCase();
  for (let page = 1; page <= 50; page++) {
    const { data: userList, error } = await supabaseAdmin.auth.admin.listUsers({
      page,
      perPage: 200,
    });
    if (error) throw new Response(error.message, { status: 500 });
    const found = userList.users.find((u) => (u.email ?? "").toLowerCase() === target);
    if (found) return { id: found.id, email_confirmed_at: found.email_confirmed_at ?? null };
    if (userList.users.length < 200) break;
  }
  return null;
}
