import { redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

/** Client-side auth guard for protected route layouts (beforeLoad). */
export async function requireAuthBeforeLoad() {
  if (typeof window === "undefined") return;

  const { data } = await supabase.auth.getSession();
  if (!data.session) {
    throw redirect({ to: "/login" });
  }
}
