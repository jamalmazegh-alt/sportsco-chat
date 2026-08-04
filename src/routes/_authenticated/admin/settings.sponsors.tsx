import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import i18nInstance from "@/lib/i18n";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Loader2,
  Plus,
  Pencil,
  Trash2,
  Download,
  ExternalLink,
  Image as ImageIcon,
} from "lucide-react";
import { useAuth, useMyRoles } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { SettingsSubHeader } from "@/components/admin/settings-shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  createSignedSponsorLogoUpload,
  createSponsor,
  deleteSponsor,
  getSponsorStats,
  listClubSponsors,
  updateSponsor,
} from "@/lib/sponsors.functions";
import { toCsv, downloadCsv } from "@/lib/csv";
import { Slider } from "@/components/ui/slider";
import { SponsorLogo } from "@/components/sponsors/SponsorLogo";
import { SponsorBannerFrame } from "@/components/sponsors/SponsorBannerFrame";
import {
  SPONSOR_LOGO_DEFAULT_SCALE,
  SPONSOR_LOGO_MAX_HEIGHT,
  SPONSOR_LOGO_MAX_SCALE,
  SPONSOR_LOGO_MAX_WIDTH,
  SPONSOR_LOGO_MIN_SCALE,
  clampSponsorLogoScale,
} from "@/components/sponsors/sponsor-logo.constants";

export const Route = createFileRoute("/_authenticated/admin/settings/sponsors")({
  component: SponsorsSettingsPage,
  head: () => ({
    meta: [
      {
        title: i18nInstance.t("meta.adminSponsors.title"),
      },
      {
        name: "description",
        content: i18nInstance.t("meta.adminSponsors.description"),
      },
    ],
  }),
});

type Range = "today" | "7d" | "30d" | "month" | "season" | "custom";

function computeRange(
  range: Range,
  customFrom: string,
  customTo: string,
): { from: string; to: string; label: string } {
  const today = new Date();
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const fmt = (d: Date) => d.toLocaleDateString();
  const from = new Date(today);
  const to = new Date(today);
  if (range === "today") {
    return { from: iso(today), to: iso(today), label: fmt(today) };
  }
  if (range === "7d") {
    from.setDate(from.getDate() - 6);
    return { from: iso(from), to: iso(today), label: `${fmt(from)} – ${fmt(today)}` };
  }
  if (range === "30d") {
    from.setDate(from.getDate() - 29);
    return { from: iso(from), to: iso(today), label: `${fmt(from)} – ${fmt(today)}` };
  }
  if (range === "month") {
    const first = new Date(today.getFullYear(), today.getMonth(), 1);
    return { from: iso(first), to: iso(today), label: `${fmt(first)} – ${fmt(today)}` };
  }
  if (range === "season") {
    // Football season: Aug 1 → Jul 31.
    const y = today.getMonth() >= 7 ? today.getFullYear() : today.getFullYear() - 1;
    const start = new Date(y, 7, 1);
    return { from: iso(start), to: iso(today), label: `${fmt(start)} – ${fmt(today)}` };
  }
  const cf = customFrom || iso(today);
  const ct = customTo || iso(today);
  return { from: cf, to: ct, label: `${fmt(new Date(cf))} – ${fmt(new Date(ct))}` };
}

function SponsorsSettingsPage() {
  const { t } = useTranslation();
  const { activeClubId, memberships } = useAuth();
  const roles = useMyRoles();
  const qc = useQueryClient();
  const club = memberships.find((m) => m.club_id === activeClubId)?.club;

  const listFn = useServerFn(listClubSponsors);
  const createFn = useServerFn(createSponsor);
  const updateFn = useServerFn(updateSponsor);
  const deleteFn = useServerFn(deleteSponsor);
  const uploadFn = useServerFn(createSignedSponsorLogoUpload);
  const statsFn = useServerFn(getSponsorStats);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<null | {
    id?: string;
    name: string;
    targetUrl: string;
    logoPath: string | null;
    logoPreviewUrl: string | null;
    logoScale: number;
    isActive: boolean;
  }>(null);
  // Keep track of any local object URLs to revoke on cleanup.
  const localObjectUrlsRef = useRef<Set<string>>(new Set());
  const revokeLocalUrl = (url: string | null | undefined) => {
    if (!url) return;
    if (localObjectUrlsRef.current.has(url)) {
      URL.revokeObjectURL(url);
      localObjectUrlsRef.current.delete(url);
    }
  };
  const revokeAllLocalUrls = () => {
    for (const u of localObjectUrlsRef.current) URL.revokeObjectURL(u);
    localObjectUrlsRef.current.clear();
  };
  useEffect(() => () => revokeAllLocalUrls(), []);
  useEffect(() => {
    if (!dialogOpen) revokeAllLocalUrls();
  }, [dialogOpen]);

  const [range, setRange] = useState<Range>("30d");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const rangeComputed = useMemo(
    () => computeRange(range, customFrom, customTo),
    [range, customFrom, customTo],
  );

  const { data: sponsors, isLoading } = useQuery({
    queryKey: ["admin-sponsors", activeClubId],
    enabled: !!activeClubId && roles.includes("admin"),
    queryFn: () => listFn({ data: { clubId: activeClubId! } }),
  });

  const { data: stats } = useQuery({
    queryKey: ["admin-sponsor-stats", activeClubId, rangeComputed.from, rangeComputed.to],
    enabled: !!activeClubId && roles.includes("admin"),
    queryFn: () =>
      statsFn({ data: { clubId: activeClubId!, from: rangeComputed.from, to: rangeComputed.to } }),
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!editing || !activeClubId) return;
      if (editing.id) {
        await updateFn({
          data: {
            sponsorId: editing.id,
            clubId: activeClubId,
            name: editing.name,
            targetUrl: editing.targetUrl,
            logoPath: editing.logoPath,
            isActive: editing.isActive,
            logoScale: editing.logoScale,
          },
        });
      } else {
        await createFn({
          data: {
            clubId: activeClubId,
            name: editing.name,
            targetUrl: editing.targetUrl,
            logoPath: editing.logoPath,
            isActive: editing.isActive,
            logoScale: editing.logoScale,
          },
        });
      }
    },
    onSuccess: () => {
      toast.success(t("sponsor.admin.saved"));
      qc.invalidateQueries({ queryKey: ["admin-sponsors", activeClubId] });
      qc.invalidateQueries({ queryKey: ["sponsors-home", activeClubId] });
      setDialogOpen(false);
      setEditing(null);
    },
    onError: (e: Error) => {
      toast.error(e.message || t("sponsor.admin.saveError"));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      if (!activeClubId) return;
      await deleteFn({ data: { sponsorId: id, clubId: activeClubId } });
    },
    onSuccess: () => {
      toast.success(t("sponsor.admin.deleted"));
      qc.invalidateQueries({ queryKey: ["admin-sponsors", activeClubId] });
      qc.invalidateQueries({ queryKey: ["sponsors-home", activeClubId] });
    },
  });

  async function handleLogoFile(file: File) {
    if (!editing || !activeClubId) return;
    const allowed = ["image/png", "image/jpeg", "image/webp"];
    if (!allowed.includes(file.type)) {
      toast.error(t("sponsor.admin.unsupportedFormat"));
      return;
    }
    // Immediate local preview URL (revoked on cleanup / new file / dialog close).
    const localPreviewUrl = URL.createObjectURL(file);
    localObjectUrlsRef.current.add(localPreviewUrl);
    // Ratio hint (non-blocking)
    try {
      const dims = await new Promise<{ w: number; h: number }>((resolve) => {
        const img = new Image();
        img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
        img.onerror = () => resolve({ w: 0, h: 0 });
        img.src = localPreviewUrl;
      });
      if (dims.w > 0 && Math.abs(dims.w / dims.h - 4) > 0.6) {
        toast.warning(t("sponsor.admin.ratioWarning"));
      }
    } catch {
      /* ignore */
    }
    try {
      const tempId = editing.id ?? crypto.randomUUID();
      const { path, token } = await uploadFn({
        data: {
          clubId: activeClubId,
          sponsorId: tempId,
          fileName: file.name,
          contentType: file.type,
          size: file.size,
        },
      });
      const { error } = await supabase.storage
        .from("sponsor-logos")
        .uploadToSignedUrl(path, token, file, { contentType: file.type, upsert: true });
      if (error) throw error;
      setEditing((current) => {
        if (!current) return current;
        // Revoke any previous local preview URL for this editor.
        if (current.logoPreviewUrl) revokeLocalUrl(current.logoPreviewUrl);
        return { ...current, logoPath: path, logoPreviewUrl: localPreviewUrl };
      });
      toast.success(t("sponsor.admin.logoUploaded"));
    } catch (e: unknown) {
      revokeLocalUrl(localPreviewUrl);
      toast.error((e as Error)?.message ?? t("sponsor.admin.uploadError"));
    }
  }

  function exportCsv() {
    if (!stats) return;
    const rows = stats.map((s) => ({
      sponsor: s.name,
      period: rangeComputed.label,
      impressions: s.impressions,
      clicks: s.clicks,
      ctr: `${(s.ctr ?? 0).toFixed(2)}%`,
    }));
    const csv = toCsv(rows, [
      { key: "sponsor", header: t("sponsor.admin.colSponsor") },
      { key: "period", header: t("sponsor.admin.colPeriod") },
      {
        key: "impressions",
        header: t("sponsor.admin.colImpressions"),
      },
      { key: "clicks", header: t("sponsor.admin.colClicks") },
      { key: "ctr", header: t("sponsor.admin.colCtr") },
    ]);
    const slug = (club?.name ?? activeClubId ?? "club")
      .toString()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-");
    const yyyymmdd = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    downloadCsv(`clubero-sponsors-stats-${slug}-${yyyymmdd}.csv`, csv);
  }

  if (!roles.includes("admin")) return <Navigate to="/profile" replace />;

  return (
    <div className="px-5 py-4 space-y-6">
      <SettingsSubHeader
        title={t("sponsor.admin.title")}
        description={t("sponsor.admin.subtitle")}
      />

      <div className="flex justify-end">
        <Button
          onClick={() => {
            setEditing({
              name: "",
              targetUrl: "",
              logoPath: null,
              logoPreviewUrl: null,
              logoScale: SPONSOR_LOGO_DEFAULT_SCALE,
              isActive: true,
            });
            setDialogOpen(true);
          }}
        >
          <Plus className="mr-2 h-4 w-4" />
          {t("sponsor.admin.add")}
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : sponsors && sponsors.length > 0 ? (
        <ul className="space-y-2">
          {sponsors.map((s) => (
            <li
              key={s.id}
              className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3"
            >
              <div className="flex h-12 w-24 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white">
                {s.logo_signed_url ? (
                  <img
                    src={s.logo_signed_url}
                    alt={s.name}
                    className="max-h-full max-w-full object-contain"
                  />
                ) : (
                  <ImageIcon className="h-5 w-5 text-muted-foreground" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{s.name}</p>
                {s.target_url ? (
                  <a
                    href={s.target_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-0.5 flex items-center gap-1 truncate text-xs text-muted-foreground hover:text-primary"
                  >
                    {s.target_url}
                    <ExternalLink className="h-3 w-3 shrink-0" />
                  </a>
                ) : (
                  <p className="mt-0.5 truncate text-xs italic text-muted-foreground">
                    {t("sponsor.admin.noUrl")}
                  </p>
                )}
              </div>
              <Switch
                checked={s.is_active}
                onCheckedChange={(v) => {
                  updateFn({
                    data: {
                      sponsorId: s.id,
                      clubId: activeClubId!,
                      isActive: v,
                    },
                  })
                    .then(() => {
                      qc.invalidateQueries({ queryKey: ["admin-sponsors", activeClubId] });
                      qc.invalidateQueries({ queryKey: ["sponsors-home", activeClubId] });
                    })
                    .catch((e: Error) => toast.error(e.message));
                }}
              />
              <Button
                variant="ghost"
                size="icon"
                onClick={() => {
                  setEditing({
                    id: s.id,
                    name: s.name,
                    targetUrl: s.target_url ?? "",
                    logoPath: s.logo_url,
                    logoPreviewUrl: s.logo_signed_url ?? null,
                    logoScale: clampSponsorLogoScale(s.logo_scale),
                    isActive: s.is_active,
                  });
                  setDialogOpen(true);
                }}
              >
                <Pencil className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => {
                  if (confirm(t("sponsor.admin.confirmDelete"))) {
                    deleteMutation.mutate(s.id);
                  }
                }}
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          {t("sponsor.admin.empty")}
        </p>
      )}

      {/* Stats section */}
      <section className="rounded-2xl border border-border bg-card p-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-semibold">{t("sponsor.admin.statsTitle")}</h2>
          <div className="flex items-center gap-2">
            <Select value={range} onValueChange={(v) => setRange(v as Range)}>
              <SelectTrigger className="w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="today">{t("sponsor.admin.rangeToday")}</SelectItem>
                <SelectItem value="7d">{t("sponsor.admin.range7d")}</SelectItem>
                <SelectItem value="30d">{t("sponsor.admin.range30d")}</SelectItem>
                <SelectItem value="month">{t("sponsor.admin.rangeMonth")}</SelectItem>
                <SelectItem value="season">{t("sponsor.admin.rangeSeason")}</SelectItem>
                <SelectItem value="custom">{t("sponsor.admin.rangeCustom")}</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={exportCsv} disabled={!stats}>
              <Download className="mr-1.5 h-4 w-4" />
              {t("sponsor.admin.exportCsv")}
            </Button>
          </div>
        </div>
        {range === "custom" && (
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="flex-1 space-y-1">
              <Label className="text-xs text-muted-foreground" htmlFor="sponsor-from">
                {t("sponsor.admin.fromDate")}
              </Label>
              <Input
                id="sponsor-from"
                type="date"
                value={customFrom}
                max={customTo || undefined}
                onChange={(e) => {
                  const from = e.target.value;
                  setCustomFrom(from);
                  if (customTo && from > customTo) {
                    setCustomTo(from);
                  }
                }}
              />
            </div>
            <div className="flex-1 space-y-1">
              <Label className="text-xs text-muted-foreground" htmlFor="sponsor-to">
                {t("sponsor.admin.toDate")}
              </Label>
              <Input
                id="sponsor-to"
                type="date"
                value={customTo}
                min={customFrom || undefined}
                onChange={(e) => {
                  const to = e.target.value;
                  if (customFrom && to < customFrom) {
                    setCustomTo(customFrom);
                  } else {
                    setCustomTo(to);
                  }
                }}
              />
            </div>
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground">
                <th className="py-2">{t("sponsor.admin.colSponsor")}</th>
                <th className="py-2 text-right">{t("sponsor.admin.colImpressions")}</th>
                <th className="py-2 text-right">{t("sponsor.admin.colClicks")}</th>
                <th className="py-2 text-right">{t("sponsor.admin.colCtr")}</th>
              </tr>
            </thead>
            <tbody>
              {(stats ?? []).map((s) => (
                <tr key={s.sponsor_id} className="border-t border-border">
                  <td className="py-2">{s.name}</td>
                  <td className="py-2 text-right">{s.impressions}</td>
                  <td className="py-2 text-right">{s.clicks}</td>
                  <td className="py-2 text-right">{s.ctr.toFixed(1)}%</td>
                </tr>
              ))}
              {(!stats || stats.length === 0) && (
                <tr>
                  <td colSpan={4} className="py-6 text-center text-muted-foreground">
                    {t("sponsor.admin.noStats")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editing?.id ? t("sponsor.admin.editTitle") : t("sponsor.admin.addTitle")}
            </DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-4">
              <div>
                <Label>{t("sponsor.admin.name")}</Label>
                <Input
                  value={editing.name}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                  maxLength={120}
                />
              </div>
              <div>
                <Label>{t("sponsor.admin.targetUrlOptional")}</Label>
                <Input
                  type="url"
                  value={editing.targetUrl}
                  onChange={(e) => setEditing({ ...editing, targetUrl: e.target.value })}
                  placeholder="https://..."
                />
              </div>
              <div>
                <Label>{t("sponsor.admin.logo")}</Label>
                <Input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleLogoFile(f);
                  }}
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  {t("sponsor.admin.logoContrastHint")}
                </p>
              </div>

              {editing.logoPreviewUrl && (
                <div className="space-y-3">
                  <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                    {t("sponsor.admin.previewTitle")}
                  </Label>
                  <div className="overflow-hidden rounded-lg border border-border bg-background">
                    <SponsorBannerFrame label={t("sponsor.thanksLabel")}>
                      <SponsorLogo
                        src={editing.logoPreviewUrl}
                        alt={editing.name || t("sponsor.admin.previewAlt")}
                        maxHeight={
                          SPONSOR_LOGO_MAX_HEIGHT * clampSponsorLogoScale(editing.logoScale)
                        }
                        maxWidth={SPONSOR_LOGO_MAX_WIDTH * clampSponsorLogoScale(editing.logoScale)}
                      />
                    </SponsorBannerFrame>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm">{t("sponsor.admin.logoSize")}</Label>
                      <span className="text-xs tabular-nums text-muted-foreground">
                        {t("sponsor.admin.logoSizePercent", {
                          percent: Math.round(editing.logoScale * 100),
                        })}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {[
                        { key: "logoSizeSmall", value: 0.85, defaultValue: "Petit" },
                        {
                          key: "logoSizeDefault",
                          value: SPONSOR_LOGO_DEFAULT_SCALE,
                          defaultValue: "Standard",
                        },
                        { key: "logoSizeLarge", value: 1.2, defaultValue: "Grand" },
                      ].map((preset) => {
                        const active = Math.abs(editing.logoScale - preset.value) < 0.001;
                        return (
                          <Button
                            key={preset.key}
                            type="button"
                            size="sm"
                            variant={active ? "default" : "outline"}
                            onClick={() => setEditing({ ...editing, logoScale: preset.value })}
                          >
                            {t(`sponsor.admin.${preset.key}`, {
                              defaultValue: preset.defaultValue,
                            })}
                          </Button>
                        );
                      })}
                    </div>
                    <Slider
                      value={[Math.round(editing.logoScale * 100)]}
                      min={Math.round(SPONSOR_LOGO_MIN_SCALE * 100)}
                      max={Math.round(SPONSOR_LOGO_MAX_SCALE * 100)}
                      step={5}
                      onValueChange={([v]) =>
                        setEditing({
                          ...editing,
                          logoScale: clampSponsorLogoScale((v ?? 100) / 100),
                        })
                      }
                    />
                    <p className="text-xs text-muted-foreground">
                      {t("sponsor.admin.logoSizeHint")}
                    </p>
                  </div>
                </div>
              )}
              <div className="flex items-center gap-2">
                <Switch
                  checked={editing.isActive}
                  onCheckedChange={(v) => setEditing({ ...editing, isActive: v })}
                />
                <Label>{t("sponsor.admin.active")}</Label>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialogOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              onClick={() => {
                if (editing) {
                  const url = editing.targetUrl.trim();
                  if (url.length > 0 && !/^https?:\/\//i.test(url)) {
                    setEditing({ ...editing, targetUrl: `https://${url}` });
                  }
                }
                saveMutation.mutate();
              }}
              disabled={!editing || !editing.name.trim() || saveMutation.isPending}
            >
              {saveMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("sponsor.admin.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
