
function PublicCampLinkCard({
  clubSlug,
  campSlug,
  t,
}: {
  clubSlug: string;
  campSlug: string;
  t: (key: string, opts?: any) => string;
}) {
  const path = `/stages/${clubSlug}/${campSlug}`;
  const url = typeof window !== "undefined" ? `${window.location.origin}${path}` : path;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success(t("lifecycle.publicUrlCopied", { defaultValue: "Lien copié" }));
    } catch {
      toast.error(t("common.copyFailed", { defaultValue: "Impossible de copier" }));
    }
  };
  return (
    <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm space-y-2">
      <div className="font-medium">
        {t("lifecycle.publicUrl", { defaultValue: "Lien public" })}
      </div>
      <div className="flex items-center gap-2">
        <Input value={url} readOnly className="text-xs h-8" />
        <Button size="sm" variant="outline" onClick={copy} title={t("common.copy", { defaultValue: "Copier" })}>
          <Copy className="h-4 w-4" />
        </Button>
        <Button size="sm" variant="outline" asChild>
          <a href={path} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="h-4 w-4" />
          </a>
        </Button>
      </div>
    </div>
  );
}
