import { createFileRoute, Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import {
  getConsentStatus,
  getConsentHistory,
  getPrivacyRequests,
  recordConsent,
  withdrawConsent,
  requestDataExport,
  requestAccountDeletion,
  cancelAccountDeletion,
  setPlayerMediaConsent,
} from "@/lib/privacy.functions";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { ChevronLeft, Download, Trash2, ShieldCheck, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

export const Route = createFileRoute("/_authenticated/profile/privacy")({
  component: PrivacyPage,
  head: () => ({ meta: [{ title: "Privacy & data — Clubero" }] }),
});

function PrivacyPage() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const qc = useQueryClient();

  const fetchStatus = useServerFn(getConsentStatus);
  const fetchHistory = useServerFn(getConsentHistory);
  const fetchRequests = useServerFn(getPrivacyRequests);
  const record = useServerFn(recordConsent);
  const withdraw = useServerFn(withdrawConsent);
  const reqExport = useServerFn(requestDataExport);
  const reqDeletion = useServerFn(requestAccountDeletion);
  const cancelDel = useServerFn(cancelAccountDeletion);
  const setMedia = useServerFn(setPlayerMediaConsent);

  const locale = i18n.language?.slice(0, 2) || "en";

  const { data: status } = useQuery({
    queryKey: ["consent-status", user?.id, locale],
    queryFn: () => fetchStatus({ data: { locale } }),
    enabled: !!user,
  });
  const { data: history } = useQuery({
    queryKey: ["consent-history", user?.id],
    queryFn: () => fetchHistory(),
    enabled: !!user,
  });
  const { data: requests } = useQuery({
    queryKey: ["privacy-requests", user?.id],
    queryFn: () => fetchRequests(),
    enabled: !!user,
  });

  // Children (players where current user is parent)
  const { data: children } = useQuery({
    queryKey: ["my-children", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("player_parents")
        .select("player:player_id(id, first_name, last_name, birth_date, media_consent_status)")
        .eq("parent_user_id", user!.id);
      return (data ?? []).map((r: any) => r.player).filter(Boolean);
    },
  });

  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  async function toggleConsent(kind: string, version_id: string, currentlyGranted: boolean) {
    setBusy(true);
    try {
      await record({ data: { kind: kind as any, version_id, granted: !currentlyGranted } });
      await qc.invalidateQueries({ queryKey: ["consent-status"] });
      await qc.invalidateQueries({ queryKey: ["consent-history"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Error");
    } finally {
      setBusy(false);
    }
  }

  async function onExport() {
    try {
      await reqExport();
      await qc.invalidateQueries({ queryKey: ["privacy-requests"] });
      toast.success(t("privacy.exportRequested"));
    } catch (e: any) {
      toast.error(e?.message ?? "Error");
    }
  }

  async function onDelete() {
    try {
      const r = await reqDeletion({ data: { reason: reason.trim() || undefined } });
      await qc.invalidateQueries({ queryKey: ["privacy-requests"] });
      toast.success(
        t("privacy.deletionScheduled", {
          date: format(new Date(r.scheduled_for), "PP"),
        })
      );
      setReason("");
    } catch (e: any) {
      toast.error(e?.message ?? "Error");
    }
  }

  async function onCancelDel(id: string) {
    await cancelDel({ data: { id } });
    await qc.invalidateQueries({ queryKey: ["privacy-requests"] });
  }

  async function onChildMedia(playerId: string, status: "granted" | "denied") {
    await setMedia({ data: { player_id: playerId, status } });
    await qc.invalidateQueries({ queryKey: ["my-children"] });
    toast.success(t("privacy.consentSaved"));
  }

  const pendingDeletion = requests?.deletions.find((d) => d.status === "pending");

  return (
    <div className="px-4 pb-10 pt-2 space-y-6">
      <div className="flex items-center gap-2">
        <Link to="/profile" className="-ml-2 inline-flex items-center text-sm text-muted-foreground">
          <ChevronLeft className="h-4 w-4" /> {t("common.back")}
        </Link>
      </div>

      <header className="space-y-1">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-primary" />
          <h1 className="text-xl font-semibold">{t("privacy.title")}</h1>
        </div>
        <p className="text-sm text-muted-foreground">{t("privacy.subtitle")}</p>
      </header>

      {/* Consents */}
      <section className="rounded-2xl border border-border bg-card p-4 space-y-3">
        <h2 className="text-sm font-semibold">{t("privacy.yourConsents")}</h2>
        <div className="space-y-2">
          {status?.items.map((i) => (
            <div key={i.kind} className="flex items-start justify-between gap-3 rounded-lg border border-border p-3">
              <div className="text-sm">
                <div className="font-medium">
                  {i.title}
                  {i.required && (
                    <span className="ml-2 text-xs text-destructive">{t("privacy.required")}</span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">v{i.version}</p>
              </div>
              <Switch
                checked={i.granted}
                disabled={busy || (i.required && i.granted)}
                onCheckedChange={() => toggleConsent(i.kind, i.version_id, i.granted)}
              />
            </div>
          ))}
        </div>
      </section>

      {/* Children */}
      {children && children.length > 0 && (
        <section className="rounded-2xl border border-border bg-card p-4 space-y-3">
          <h2 className="text-sm font-semibold">{t("privacy.childrenMedia")}</h2>
          <p className="text-xs text-muted-foreground">{t("privacy.childrenMediaHint")}</p>
          <div className="space-y-2">
            {children.map((c: any) => (
              <div key={c.id} className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
                <div className="text-sm font-medium">
                  {c.first_name} {c.last_name}
                  <div className="text-xs text-muted-foreground">
                    {t("privacy.mediaStatus")}: <b>{c.media_consent_status}</b>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant={c.media_consent_status === "granted" ? "default" : "outline"}
                    onClick={() => onChildMedia(c.id, "granted")}
                  >
                    {t("privacy.allow")}
                  </Button>
                  <Button
                    size="sm"
                    variant={c.media_consent_status === "denied" ? "destructive" : "outline"}
                    onClick={() => onChildMedia(c.id, "denied")}
                  >
                    {t("privacy.deny")}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Legal docs */}
      <section className="rounded-2xl border border-border bg-card p-4 space-y-2">
        <h2 className="text-sm font-semibold">{t("privacy.legalDocs", { defaultValue: "Documents légaux" })}</h2>
        <p className="text-xs text-muted-foreground">{t("privacy.legalDocsHint", { defaultValue: "Consulte les conditions et politiques en vigueur." })}</p>
        <ul className="grid grid-cols-1 gap-1.5 pt-1">
          {(["terms", "privacy", "data_processing", "media", "notifications"] as const).map((k) => (
            <li key={k}>
              <Link
                to="/legal/$kind"
                params={{ kind: k }}
                className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm hover:bg-muted/40"
              >
                <span>{t(`privacy.legal.${k}`, { defaultValue: k })}</span>
                <ChevronLeft className="h-4 w-4 rotate-180 text-muted-foreground" />
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {/* GDPR rights */}
      <section className="rounded-2xl border border-border bg-card p-4 space-y-3">
        <h2 className="text-sm font-semibold">{t("privacy.yourRights")}</h2>

        <div className="flex items-center justify-between rounded-lg border border-border p-3">
          <div className="text-sm">
            <div className="font-medium">{t("privacy.exportTitle")}</div>
            <p className="text-xs text-muted-foreground">{t("privacy.exportHint")}</p>
          </div>
          <Button variant="outline" size="sm" onClick={onExport}>
            <Download className="h-4 w-4 mr-1.5" /> {t("privacy.exportCta")}
          </Button>
        </div>

        {pendingDeletion ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 space-y-2">
            <div className="text-sm font-medium">{t("privacy.deletionPending")}</div>
            <p className="text-xs text-muted-foreground">
              {t("privacy.deletionScheduled", {
                date: format(new Date(pendingDeletion.scheduled_for), "PP"),
              })}
            </p>
            <Button variant="outline" size="sm" onClick={() => onCancelDel(pendingDeletion.id)}>
              {t("privacy.cancelDeletion")}
            </Button>
          </div>
        ) : (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <div className="flex items-center justify-between rounded-lg border border-border p-3 cursor-pointer">
                <div className="text-sm">
                  <div className="font-medium">{t("privacy.deleteTitle")}</div>
                  <p className="text-xs text-muted-foreground">{t("privacy.deleteHint")}</p>
                </div>
                <Button variant="destructive" size="sm">
                  <Trash2 className="h-4 w-4 mr-1.5" /> {t("privacy.deleteCta")}
                </Button>
              </div>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{t("privacy.deleteConfirmTitle")}</AlertDialogTitle>
                <AlertDialogDescription>{t("privacy.deleteConfirmBody")}</AlertDialogDescription>
              </AlertDialogHeader>
              <div className="space-y-1.5">
                <Label htmlFor="reason">{t("privacy.reasonOptional")}</Label>
                <Textarea
                  id="reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={3}
                />
              </div>
              <AlertDialogFooter>
                <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                <AlertDialogAction onClick={onDelete}>
                  {t("privacy.deleteCta")}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </section>

      {/* History */}
      <section className="rounded-2xl border border-border bg-card p-4 space-y-3">
        <h2 className="text-sm font-semibold">{t("privacy.consentHistory")}</h2>
        {!history?.history.length && (
          <p className="text-xs text-muted-foreground">{t("privacy.noHistory")}</p>
        )}
        <div className="space-y-1.5">
          {history?.history.map((h) => (
            <div key={h.id} className="flex items-center justify-between text-xs">
              <span>
                <b className="capitalize">{h.kind.replace("_", " ")}</b> —{" "}
                {h.granted ? t("privacy.granted") : t("privacy.denied")}
                {h.withdrawn_at && ` (${t("privacy.withdrawn")})`}
              </span>
              <span className="text-muted-foreground">
                {format(new Date(h.granted_at), "PPp")}
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
