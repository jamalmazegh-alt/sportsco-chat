import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { useAuth, useActiveRole } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, QrCode, Copy, Download, Trash2, Plus, Printer } from "lucide-react";
import { toast } from "sonner";
import { toastError } from "@/lib/humanize-error";

export const Route = createFileRoute("/_authenticated/admin/invites")({
  component: ClubInvitesPage,
  head: () => ({ meta: [{ title: "Invitations QR — Clubero" }] }),
});

type ClubInvite = {
  id: string;
  token: string;
  role: "player" | "parent" | "coach" | "dirigeant" | "admin";
  expires_at: string | null;
  max_uses: number | null;
  uses_count: number;
  created_at: string;
};

function ClubInvitesPage() {
  const { t } = useTranslation();
  const { activeClubId, user } = useAuth();
  const role = useActiveRole();

  const { data: club } = useQuery({
    queryKey: ["club-name", activeClubId],
    enabled: !!activeClubId,
    queryFn: async () => {
      const { data } = await supabase.from("clubs").select("name, logo_url").eq("id", activeClubId!).single();
      return data;
    },
  });

  const { data: invites, isLoading, refetch } = useQuery({
    queryKey: ["club-invites", activeClubId],
    enabled: !!activeClubId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("club_invites")
        .select("id, token, role, expires_at, max_uses, uses_count, created_at")
        .eq("club_id", activeClubId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ClubInvite[];
    },
  });

  const [creating, setCreating] = useState(false);
  const [newRole, setNewRole] = useState<ClubInvite["role"]>("player");
  const [newMaxUses, setNewMaxUses] = useState<string>("");
  const [newExpiresDays, setNewExpiresDays] = useState<string>("90");
  const [openInvite, setOpenInvite] = useState<ClubInvite | null>(null);

  if (role !== "admin") return <Navigate to="/profile" replace />;

  function inviteUrlFor(token: string) {
    return `${window.location.origin}/register?invite=${encodeURIComponent(token)}`;
  }

  async function createInvite() {
    if (!activeClubId || !user) return;
    setCreating(true);
    try {
      const token = crypto.randomUUID().replace(/-/g, "");
      const expires_at = newExpiresDays
        ? new Date(Date.now() + Number(newExpiresDays) * 86400_000).toISOString()
        : null;
      const max_uses = newMaxUses ? Number(newMaxUses) : null;
      const { data, error } = await supabase
        .from("club_invites")
        .insert({
          club_id: activeClubId,
          created_by: user.id,
          role: newRole,
          token,
          expires_at,
          max_uses,
        })
        .select("id, token, role, expires_at, max_uses, uses_count, created_at")
        .single();
      if (error) throw error;
      toast.success(t("invites.created", { defaultValue: "Invitation créée" }));
      await refetch();
      setOpenInvite(data as ClubInvite);
    } catch (e) {
      toastError(e);
    } finally {
      setCreating(false);
    }
  }

  async function deleteInvite(id: string) {
    const { error } = await supabase.from("club_invites").delete().eq("id", id);
    if (error) return toastError(error);
    toast.success(t("invites.deleted", { defaultValue: "Invitation supprimée" }));
    refetch();
  }

  async function copyLink(token: string) {
    await navigator.clipboard.writeText(inviteUrlFor(token));
    toast.success(t("invites.linkCopied", { defaultValue: "Lien copié" }));
  }

  return (
    <div className="px-5 py-4 space-y-5">
      <p className="text-sm text-muted-foreground">
        {t("invites.subtitle", {
          defaultValue:
            "Génère un QR code à imprimer en début de saison. Toute personne qui le scanne rejoint automatiquement le club.",
        })}
      </p>

      {/* Create form */}
      <section className="rounded-2xl border border-border bg-card p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Plus className="h-4 w-4 text-primary" />
          <Label className="text-base">{t("invites.create", { defaultValue: "Créer une invitation" })}</Label>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <Label className="text-xs">{t("invites.role", { defaultValue: "Rôle attribué" })}</Label>
            <Select value={newRole} onValueChange={(v) => setNewRole(v as ClubInvite["role"])}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="player">{t("roles.player", { defaultValue: "Joueur" })}</SelectItem>
                <SelectItem value="parent">{t("roles.parent", { defaultValue: "Parent" })}</SelectItem>
                <SelectItem value="coach">{t("roles.coach", { defaultValue: "Coach" })}</SelectItem>
                <SelectItem value="dirigeant">{t("roles.dirigeant", { defaultValue: "Dirigeant" })}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">{t("invites.maxUses", { defaultValue: "Utilisations max (vide = illimité)" })}</Label>
            <Input type="number" min="1" value={newMaxUses} onChange={(e) => setNewMaxUses(e.target.value)} placeholder="∞" />
          </div>
          <div>
            <Label className="text-xs">{t("invites.expiresDays", { defaultValue: "Expire dans (jours)" })}</Label>
            <Input type="number" min="1" value={newExpiresDays} onChange={(e) => setNewExpiresDays(e.target.value)} placeholder="90" />
          </div>
        </div>
        <Button className="w-full sm:w-auto" onClick={createInvite} disabled={creating}>
          {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <><QrCode className="h-4 w-4 mr-2" />{t("invites.generate", { defaultValue: "Générer le QR" })}</>}
        </Button>
      </section>

      {/* List */}
      <section className="rounded-2xl border border-border bg-card p-5 space-y-3">
        <Label className="text-base">{t("invites.active", { defaultValue: "Invitations actives" })}</Label>
        {isLoading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
        ) : !invites || invites.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">{t("invites.empty", { defaultValue: "Aucune invitation. Crée-en une ci-dessus." })}</p>
        ) : (
          <ul className="divide-y divide-border">
            {invites.map((inv) => {
              const expired = inv.expires_at && new Date(inv.expires_at) < new Date();
              const exhausted = inv.max_uses != null && inv.uses_count >= inv.max_uses;
              return (
                <li key={inv.id} className="py-3 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium capitalize">{t(`roles.${inv.role}`, { defaultValue: inv.role })}</span>
                      {(expired || exhausted) && (
                        <span className="text-[10px] uppercase tracking-wide bg-destructive/10 text-destructive px-1.5 py-0.5 rounded">
                          {expired ? t("invites.expired", { defaultValue: "Expirée" }) : t("invites.exhausted", { defaultValue: "Épuisée" })}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {t("invites.usesCount", { defaultValue: "Utilisations" })}: {inv.uses_count}{inv.max_uses != null ? ` / ${inv.max_uses}` : ""}
                      {inv.expires_at ? ` · ${t("invites.expiresOn", { defaultValue: "Expire le" })} ${new Date(inv.expires_at).toLocaleDateString()}` : ""}
                    </p>
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => copyLink(inv.token)}><Copy className="h-4 w-4" /></Button>
                  <Button size="sm" variant="outline" onClick={() => setOpenInvite(inv)}><QrCode className="h-4 w-4" /></Button>
                  <Button size="sm" variant="ghost" onClick={() => deleteInvite(inv.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <Dialog open={!!openInvite} onOpenChange={(o) => !o && setOpenInvite(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("invites.qrTitle", { defaultValue: "QR code d'invitation" })}</DialogTitle>
          </DialogHeader>
          {openInvite && (
            <QrPreview
              url={inviteUrlFor(openInvite.token)}
              clubName={club?.name ?? "Club"}
              clubLogo={club?.logo_url ?? null}
              roleLabel={t(`roles.${openInvite.role}`, { defaultValue: openInvite.role })}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function QrPreview({ url, clubName, clubLogo, roleLabel }: { url: string; clubName: string; clubLogo: string | null; roleLabel: string }) {
  const { t } = useTranslation();
  const [dataUrl, setDataUrl] = useState<string>("");
  const posterRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    QRCode.toDataURL(url, { width: 512, margin: 1, errorCorrectionLevel: "H" }).then(setDataUrl).catch(() => setDataUrl(""));
  }, [url]);

  async function downloadPoster() {
    // Render an A4 poster as PNG using canvas
    const W = 1240, H = 1754; // A4 @ 150dpi
    const canvas = document.createElement("canvas");
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, W, H);

    // Header band
    ctx.fillStyle = "#0f172a";
    ctx.fillRect(0, 0, W, 220);
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 64px Inter, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(clubName, W / 2, 130);
    ctx.font = "32px Inter, system-ui, sans-serif";
    ctx.fillStyle = "#cbd5e1";
    ctx.fillText(t("invites.posterTagline", { defaultValue: "Rejoignez le club en scannant ce QR code" }), W / 2, 180);

    // QR
    const qrImg = new Image();
    qrImg.src = await QRCode.toDataURL(url, { width: 900, margin: 1, errorCorrectionLevel: "H" });
    await new Promise((r) => { qrImg.onload = r; });
    const qrSize = 850;
    ctx.drawImage(qrImg, (W - qrSize) / 2, 320, qrSize, qrSize);

    // Role chip
    ctx.fillStyle = "#0f172a";
    ctx.font = "bold 40px Inter, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(`${t("invites.roleLabel", { defaultValue: "Rôle" })} : ${roleLabel}`, W / 2, 1280);

    // Steps
    ctx.fillStyle = "#334155";
    ctx.font = "28px Inter, system-ui, sans-serif";
    ctx.textAlign = "center";
    const step1 = t("invites.posterStep1", { defaultValue: "1. Ouvrez l'appareil photo de votre téléphone" });
    const step2 = t("invites.posterStep2", { defaultValue: "2. Pointez vers le QR code" });
    const step3 = t("invites.posterStep3", { defaultValue: "3. Créez votre compte en 1 minute" });
    ctx.fillText(step1, W / 2, 1380);
    ctx.fillText(step2, W / 2, 1430);
    ctx.fillText(step3, W / 2, 1480);

    // Footer link
    ctx.fillStyle = "#64748b";
    ctx.font = "22px monospace";
    ctx.fillText(url.replace(/^https?:\/\//, ""), W / 2, 1680);

    const blob: Blob = await new Promise((r) => canvas.toBlob((b) => r(b!), "image/png")!);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `clubero-invitation-${clubName.replace(/\s+/g, "-").toLowerCase()}.png`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function printPoster() {
    const w = window.open("", "_blank", "width=900,height=1200");
    if (!w) return;
    w.document.write(`<!doctype html><html><head><title>${clubName}</title>
      <style>
        @page { size: A4; margin: 0; }
        body { font-family: Inter, system-ui, sans-serif; margin: 0; padding: 40px; text-align: center; color: #0f172a; }
        h1 { font-size: 36px; margin: 0 0 8px; }
        p { color: #475569; margin: 4px 0; }
        img { width: 70%; max-width: 500px; height: auto; margin: 24px auto; display: block; }
        .url { font-family: monospace; color: #64748b; margin-top: 24px; word-break: break-all; }
      </style></head><body>
      <h1>${clubName}</h1>
      <p>${t("invites.posterTagline", { defaultValue: "Rejoignez le club en scannant ce QR code" })}</p>
      <img src="${dataUrl}" alt="QR" />
      <p><strong>${t("invites.roleLabel", { defaultValue: "Rôle" })} :</strong> ${roleLabel}</p>
      <p>1. ${t("invites.posterStep1Short", { defaultValue: "Ouvrez l'appareil photo" })}<br/>
         2. ${t("invites.posterStep2Short", { defaultValue: "Pointez vers le QR" })}<br/>
         3. ${t("invites.posterStep3Short", { defaultValue: "Créez votre compte" })}</p>
      <p class="url">${url}</p>
      <script>window.onload=()=>setTimeout(()=>window.print(),300);</script>
      </body></html>`);
    w.document.close();
  }

  return (
    <div className="space-y-4">
      <div ref={posterRef} className="bg-white rounded-xl p-6 flex flex-col items-center gap-3 border border-border">
        {dataUrl ? (
          <img src={dataUrl} alt="QR code" className="w-64 h-64" />
        ) : (
          <div className="w-64 h-64 flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
        )}
        <p className="text-xs text-muted-foreground break-all text-center">{url}</p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="outline" onClick={downloadPoster} disabled={!dataUrl}>
          <Download className="h-4 w-4 mr-2" />{t("invites.downloadPoster", { defaultValue: "Poster A4" })}
        </Button>
        <Button variant="outline" onClick={printPoster} disabled={!dataUrl}>
          <Printer className="h-4 w-4 mr-2" />{t("invites.print", { defaultValue: "Imprimer" })}
        </Button>
      </div>
    </div>
  );
}
