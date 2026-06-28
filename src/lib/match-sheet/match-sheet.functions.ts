import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const InputSchema = z.object({
  eventId: z.string().uuid(),
  lang: z.string().min(2).max(8).optional(),
});

/**
 * Generate the match sheet / player list PDF for an event.
 *
 * Authorization, data fetch, and audit logging happen inside the server-only
 * helper — the bound button on the UI is NEVER the source of truth.
 *
 * Returns the PDF as base64 so the client can build a Blob + trigger a download.
 */
export const generateMatchSheet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { generateMatchSheetForUser, pickLang } = await import("./match-sheet.server");
    const { bytes, filename } = await generateMatchSheetForUser({
      eventId: data.eventId,
      userId: context.userId,
      lang: pickLang(data.lang),
    });
    // Base64 encode for safe transport across the RPC boundary.
    let bin = "";
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    const base64 = btoa(bin);
    return { base64, filename };
  });
