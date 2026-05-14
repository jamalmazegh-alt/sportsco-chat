import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const KindSchema = z.enum(["terms", "privacy", "data_processing", "media", "notifications", "legal_notice", "parental_consent"]);

export const getLegalDoc = createServerFn({ method: "GET" })
  .inputValidator((input: { kind: string; locale?: string }) =>
    z.object({ kind: KindSchema, locale: z.string().min(2).max(5).default("en") }).parse(input)
  )
  .handler(async ({ data }) => {
    const fetchOne = (locale: string) =>
      supabaseAdmin
        .from("consent_versions")
        .select("title, content_md, version, published_at, locale")
        .eq("kind", data.kind)
        .eq("locale", locale)
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle();

    const r = await fetchOne(data.locale);
    if (r.data) return r.data;
    const en = await fetchOne("en");
    return en.data ?? null;
  });
