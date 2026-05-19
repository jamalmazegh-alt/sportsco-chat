import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { loadLineupForConvocationEmailServerForCoach } from "./lineup-email.server";
import type { LineupEmailData } from "./lineup-email";

const InputSchema = z.object({ eventId: z.string().uuid() });

export const loadLineupForConvocationEmailFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => InputSchema.parse(input))
  .handler(async ({ data, context }): Promise<LineupEmailData | undefined> => {
    return loadLineupForConvocationEmailServerForCoach(
      data.eventId,
      context.userId,
    );
  });