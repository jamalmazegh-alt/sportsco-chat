import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import { getLegalDoc } from "@/lib/legal.functions";

export const Route = createFileRoute("/legal/$kind")({
  loader: async ({ params }) => {
    const doc = await getLegalDoc({ data: { kind: params.kind, locale: "en" } });
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
        <article>
          <h1 className="text-2xl font-semibold mb-1">{doc.title}</h1>
          <p className="text-xs text-muted-foreground mb-4">
            v{doc.version} · {new Date(doc.published_at).toLocaleDateString()}
          </p>
          <pre className="whitespace-pre-wrap font-sans text-sm leading-6">{doc.content_md}</pre>
        </article>
      </div>
    </div>
  );
}
