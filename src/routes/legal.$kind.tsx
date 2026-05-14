import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { ChevronLeft } from "lucide-react";

const KindSchema = z.enum(["terms", "privacy", "data_processing", "media", "notifications"]);

const getLegal = createServerFn({ method: "GET" })
  .inputValidator((input: { kind: string; locale?: string }) =>
    z
      .object({
        kind: KindSchema,
        locale: z.string().min(2).max(5).default("en"),
      })
      .parse(input)
  )
  .handler(async ({ data }) => {
    const { data: row, error } = await supabaseAdmin
      .from("consent_versions")
      .select("title, content_md, version, published_at, locale")
      .eq("kind", data.kind)
      .eq("locale", data.locale)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (!row) {
      // Fallback to English
      const { data: en } = await supabaseAdmin
        .from("consent_versions")
        .select("title, content_md, version, published_at, locale")
        .eq("kind", data.kind)
        .eq("locale", "en")
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!en) return null;
      return en;
    }
    return row;
  });

export const Route = createFileRoute("/legal/$kind")({
  loader: async ({ params }) => {
    const doc = await getLegal({ data: { kind: params.kind, locale: "en" } });
    if (!doc) throw notFound();
    return { doc };
  },
  component: LegalPage,
  head: ({ loaderData }) => ({
    meta: [
      { title: `${loaderData?.doc?.title ?? "Legal"} — Clubero` },
      { name: "description", content: loaderData?.doc?.title ?? "Legal document" },
    ],
  }),
});

function LegalPage() {
  const { doc } = Route.useLoaderData();
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-2xl px-5 py-8">
        <Link to="/" className="inline-flex items-center text-sm text-muted-foreground mb-4">
          <ChevronLeft className="h-4 w-4" /> Home
        </Link>
        <article className="prose prose-sm max-w-none">
          <h1>{doc.title}</h1>
          <p className="text-xs text-muted-foreground">
            v{doc.version} · {new Date(doc.published_at).toLocaleDateString()}
          </p>
          <pre className="whitespace-pre-wrap font-sans text-sm">{doc.content_md}</pre>
        </article>
      </div>
    </div>
  );
}
