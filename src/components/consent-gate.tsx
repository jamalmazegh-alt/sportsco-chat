import { useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { getConsentStatus, recordConsent } from "@/lib/privacy.functions";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

/**
 * Blocks the app shell with a modal until the user has accepted all
 * required consent versions (terms, privacy, data processing).
 * Optional consents (media, notifications) are also presented but skippable.
 */
export function ConsentGate({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth();
  const { i18n } = useTranslation();
  const fetchStatus = useServerFn(getConsentStatus);

  const { data, isLoading } = useQuery({
    queryKey: ["consent-status", session?.user?.id, i18n.language?.slice(0, 2)],
    enabled: !!session?.user,
    queryFn: () => fetchStatus({ data: { locale: i18n.language?.slice(0, 2) || "en" } }),
  });

  if (loading || !session) return <>{children}</>;
  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
      </div>
    );
  }
  if (!data?.missingRequired) return <>{children}</>;

  return (
    <>
      {children}
      <ConsentModal items={data.items} />
    </>
  );
}

type Item = Awaited<ReturnType<typeof getConsentStatus>>["items"][number];

function ConsentModal({ items }: { items: Item[] }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const record = useServerFn(recordConsent);
  const [busy, setBusy] = useState(false);
  // Prefill checked = currently granted
  const [checked, setChecked] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(items.map((i) => [i.kind, i.granted]))
  );

  useEffect(() => {
    setChecked(Object.fromEntries(items.map((i) => [i.kind, i.granted])));
  }, [items]);

  const requiredOk = items.every((i) => !i.required || checked[i.kind]);

  async function submit() {
    if (!requiredOk) return;
    setBusy(true);
    try {
      // Only record items that need recording (out of date OR state changed)
      for (const i of items) {
        if (!i.upToDate || checked[i.kind] !== i.granted) {
          await record({
            data: {
              kind: i.kind as Item["kind"],
              version_id: i.version_id,
              granted: !!checked[i.kind],
            },
          });
        }
      }
      await qc.invalidateQueries({ queryKey: ["consent-status"] });
      toast.success(t("privacy.consentSaved"));
    } catch (e: any) {
      toast.error(e?.message ?? "Error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open modal>
      <DialogContent
        className="max-w-lg"
        onEscapeKeyDown={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <div className="mx-auto mb-2 grid h-10 w-10 place-content-center rounded-full bg-primary/10 text-primary">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <DialogTitle className="text-center">{t("privacy.gateTitle")}</DialogTitle>
          <DialogDescription className="text-center">
            {t("privacy.gateSubtitle")}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[50vh] pr-2">
          <div className="space-y-3">
            {items.map((i) => (
              <label
                key={i.kind}
                className="flex items-start gap-3 rounded-lg border border-border p-3"
              >
                <Checkbox
                  checked={!!checked[i.kind]}
                  onCheckedChange={(v) =>
                    setChecked((c) => ({ ...c, [i.kind]: !!v }))
                  }
                  className="mt-0.5"
                />
                <div className="text-sm">
                  <div className="font-medium">
                    {i.title}
                    {i.required && (
                      <span className="ml-2 text-xs text-destructive">
                        {t("privacy.required")}
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground line-clamp-3 whitespace-pre-line">
                    {i.content_md.replace(/^#+\s.*\n/, "")}
                  </p>
                </div>
              </label>
            ))}
          </div>
        </ScrollArea>

        <Button onClick={submit} disabled={!requiredOk || busy} className="w-full h-11 mt-2">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : t("privacy.acceptAndContinue")}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
