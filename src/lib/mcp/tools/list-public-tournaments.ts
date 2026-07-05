import { defineTool } from "@lovable.dev/mcp-js";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

/**
 * Public tournament lookup — no auth needed. Uses the anon/publishable key and
 * relies on RLS + narrow SELECT policies on the tournaments-public view.
 */
function publicClient() {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export default defineTool({
  name: "list_public_tournaments",
  title: "List public tournaments",
  description:
    "List upcoming public tournaments visible on Clubero, ordered by start date.",
  inputSchema: {
    limit: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .describe("Max rows to return (1-50, default 20)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
  handler: async ({ limit }) => {
    const supabase = publicClient();
    const { data, error } = await supabase
      .from("tournaments")
      .select("id, slug, name, sport, start_date, end_date, city, country, status")
      .eq("visibility", "public")
      .gte("end_date", new Date().toISOString().slice(0, 10))
      .order("start_date", { ascending: true })
      .limit(limit ?? 20);

    if (error) {
      return {
        content: [{ type: "text", text: `Error: ${error.message}` }],
        isError: true,
      };
    }
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? [], null, 2) }],
      structuredContent: { tournaments: data ?? [] },
    };
  },
});
