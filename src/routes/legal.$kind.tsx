import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { ChevronLeft } from "lucide-react";
import { getLegalDoc } from "@/lib/legal.functions";
import { MarketingLayout } from "@/components/marketing/MarketingLayout";

export const Route = createFileRoute("/legal/$kind")({
  loader: async ({ params }) => {
    const doc = await getLegalDoc({ data: { kind: params.kind, locale: "fr" } });
    if (!doc) throw notFound();
    return { doc };
  },
  component: LegalPage,
  head: ({ loaderData }) => ({
    meta: [
      { title: `${loaderData?.doc?.title ?? "Légal"} — Clubero` },
      { name: "description", content: loaderData?.doc?.title ?? "Document légal" },
    ],
  }),
});

function renderMarkdown(md: string) {
  // Lightweight markdown rendering: headings, bold, lists, paragraphs.
  const blocks = md.split(/\n{2,}/);
  return blocks.map((block, i) => {
    const trimmed = block.trim();
    if (!trimmed) return null;
    if (trimmed.startsWith("### ")) {
      return <h3 key={i} className="mt-6 font-display text-base font-semibold">{inline(trimmed.slice(4))}</h3>;
    }
    if (trimmed.startsWith("## ")) {
      return <h2 key={i} className="mt-8 font-display text-xl font-bold">{inline(trimmed.slice(3))}</h2>;
    }
    if (trimmed.startsWith("# ")) {
      return <h2 key={i} className="mt-8 font-display text-2xl font-bold">{inline(trimmed.slice(2))}</h2>;
    }
    if (/^([-*]|\d+\.)\s/.test(trimmed)) {
      const ordered = /^\d+\./.test(trimmed);
      const items = trimmed.split(/\n/).map((l) => l.replace(/^([-*]|\d+\.)\s+/, ""));
      const Tag = ordered ? "ol" : "ul";
      return (
        <Tag key={i} className={`mt-3 ${ordered ? "list-decimal" : "list-disc"} space-y-1.5 pl-5 text-sm text-foreground/80`}>
          {items.map((it, j) => <li key={j}>{inline(it)}</li>)}
        </Tag>
      );
    }
    return (
      <p key={i} className="mt-3 text-sm leading-relaxed text-foreground/80">
        {inline(trimmed)}
      </p>
    );
  });
}

function inline(text: string) {
  // Bold **x** and links [t](u)
  const parts: Array<string | ReactNode> = [];
  const regex = /(\*\*([^*]+)\*\*|\[([^\]]+)\]\(([^)]+)\))/g;
  let lastIndex = 0;
  let m: RegExpExecArray | null;
  let key = 0;
  while ((m = regex.exec(text)) !== null) {
    if (m.index > lastIndex) parts.push(text.slice(lastIndex, m.index));
    if (m[2]) parts.push(<strong key={key++} className="font-semibold text-foreground">{m[2]}</strong>);
    else if (m[3] && m[4]) parts.push(<a key={key++} href={m[4]} className="text-primary hover:underline">{m[3]}</a>);
    lastIndex = m.index + m[0].length;
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return parts.map((p, i) => typeof p === "string" ? <span key={i}>{p}</span> : p);
}

function LegalPage() {
  const { doc } = Route.useLoaderData();
  return (
    <MarketingLayout>
      <div className="mx-auto max-w-3xl px-5 py-12 lg:px-8 lg:py-16">
        <Link to="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft className="h-4 w-4" /> Accueil
        </Link>
        <article className="mt-6">
          <h1 className="font-display text-3xl font-bold tracking-tight">{doc.title}</h1>
          <p className="mt-2 text-xs text-muted-foreground">
            v{doc.version} · {new Date(doc.published_at).toLocaleDateString("fr-FR")}
          </p>
          <div className="mt-8">{renderMarkdown(doc.content_md)}</div>
        </article>
      </div>
    </MarketingLayout>
  );
}
