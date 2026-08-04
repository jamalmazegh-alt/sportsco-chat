import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import i18nInstance from "@/lib/i18n";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Loader2,
  Plus,
  Pencil,
  Trash2,
  Star,
  StarOff,
  ChevronUp,
  ChevronDown,
  MapPin,
} from "lucide-react";
import { useAuth, useMyRoles } from "@/lib/auth-context";
import { SettingsSubHeader } from "@/components/admin/settings-shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  listClubVenues,
  createVenue,
  updateVenue,
  deleteVenue,
  setDefaultVenue,
  reorderVenues,
  createFacility,
  updateFacility,
  deleteFacility,
  setDefaultFacility,
  reorderFacilities,
  type ClubVenueWithFacilities,
  type ClubFacility,
} from "@/lib/venues.functions";
import { AddressField } from "@/components/event-form-sheet";

export const Route = createFileRoute("/_authenticated/admin/settings/venues")({
  component: VenuesSettingsPage,
  head: () => ({
    meta: [
      {
        title: i18nInstance.t("meta.adminVenues.title"),
      },
      {
        name: "description",
        content: i18nInstance.t("meta.adminVenues.description"),
      },
    ],
  }),
});

function VenuesSettingsPage() {
  const { t } = useTranslation();
  const { activeClubId } = useAuth();
  const roles = useMyRoles();
  const qc = useQueryClient();

  const listFn = useServerFn(listClubVenues);
  const createVenueFn = useServerFn(createVenue);
  const updateVenueFn = useServerFn(updateVenue);
  const deleteVenueFn = useServerFn(deleteVenue);
  const setDefaultVenueFn = useServerFn(setDefaultVenue);
  const reorderVenuesFn = useServerFn(reorderVenues);
  const createFacilityFn = useServerFn(createFacility);
  const updateFacilityFn = useServerFn(updateFacility);
  const deleteFacilityFn = useServerFn(deleteFacility);
  const setDefaultFacilityFn = useServerFn(setDefaultFacility);
  const reorderFacilitiesFn = useServerFn(reorderFacilities);

  const { data: venues, isLoading } = useQuery({
    queryKey: ["club-venues", activeClubId],
    queryFn: () => listFn({ data: { clubId: activeClubId! } }),
    enabled: !!activeClubId,
  });

  function invalidate() {
    qc.invalidateQueries({ queryKey: ["club-venues", activeClubId] });
  }

  const [venueEdit, setVenueEdit] = useState<Partial<ClubVenueWithFacilities> | null>(null);
  const [facilityEdit, setFacilityEdit] = useState<
    (Partial<ClubFacility> & { venue_id: string }) | null
  >(null);

  const saveVenueMutation = useMutation({
    mutationFn: async (input: Partial<ClubVenueWithFacilities>) => {
      if (input.id) {
        return updateVenueFn({
          data: {
            venueId: input.id,
            clubId: activeClubId!,
            name: input.name,
            address: input.address,
            notes: input.notes ?? null,
            isDefault: input.is_default,
          },
        });
      }
      return createVenueFn({
        data: {
          clubId: activeClubId!,
          name: input.name!,
          address: input.address!,
          notes: input.notes ?? null,
          isDefault: input.is_default,
        },
      });
    },
    onSuccess: () => {
      invalidate();
      setVenueEdit(null);
      toast.success(t("common.saved"));
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveFacilityMutation = useMutation({
    mutationFn: async (input: Partial<ClubFacility> & { venue_id: string }) => {
      if (input.id) {
        return updateFacilityFn({
          data: {
            facilityId: input.id,
            venueId: input.venue_id,
            name: input.name,
            surfaceType: input.surface_type ?? null,
            sport: input.sport ?? null,
            isDefault: input.is_default,
          },
        });
      }
      return createFacilityFn({
        data: {
          venueId: input.venue_id,
          name: input.name!,
          surfaceType: input.surface_type ?? null,
          sport: input.sport ?? null,
          isDefault: input.is_default,
        },
      });
    },
    onSuccess: () => {
      invalidate();
      setFacilityEdit(null);
      toast.success(t("common.saved"));
    },
    onError: (e: Error) => toast.error(e.message),
  });

  async function onDeleteVenue(v: ClubVenueWithFacilities) {
    if (!confirm(t("venues.confirmDeleteSite"))) return;
    try {
      await deleteVenueFn({ data: { venueId: v.id, clubId: activeClubId! } });
      invalidate();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }
  async function onDeleteFacility(f: ClubFacility) {
    if (!confirm(t("venues.confirmDeleteField"))) return;
    try {
      await deleteFacilityFn({ data: { facilityId: f.id, venueId: f.venue_id } });
      invalidate();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function moveVenue(index: number, dir: -1 | 1) {
    if (!venues) return;
    const next = [...venues];
    const j = index + dir;
    if (j < 0 || j >= next.length) return;
    [next[index], next[j]] = [next[j], next[index]];
    await reorderVenuesFn({
      data: { clubId: activeClubId!, orderedIds: next.map((v) => v.id) },
    });
    invalidate();
  }
  async function moveFacility(venueId: string, list: ClubFacility[], index: number, dir: -1 | 1) {
    const next = [...list];
    const j = index + dir;
    if (j < 0 || j >= next.length) return;
    [next[index], next[j]] = [next[j], next[index]];
    await reorderFacilitiesFn({ data: { venueId, orderedIds: next.map((f) => f.id) } });
    invalidate();
  }

  if (!roles.includes("admin")) return <Navigate to="/profile" replace />;

  return (
    <div className="pb-24">
      <SettingsSubHeader title={t("venues.pageTitle")} description={t("venues.pageSubtitle")} />

      <div className="px-5 py-4 space-y-3">
        <Button
          size="sm"
          onClick={() =>
            setVenueEdit({
              name: "",
              address: "",
              notes: null,
              is_default: (venues?.length ?? 0) === 0,
            })
          }
        >
          <Plus className="h-4 w-4 mr-1" />
          {t("venues.addSite")}
        </Button>

        {isLoading && (
          <div className="flex justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          </div>
        )}

        {!isLoading && (venues?.length ?? 0) === 0 && (
          <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            {t("venues.emptyState")}
          </div>
        )}

        <div className="space-y-3">
          {(venues ?? []).map((v, vi) => (
            <div key={v.id} className="rounded-2xl border border-border bg-card">
              <div className="flex items-start gap-2 p-4">
                <MapPin className="h-4 w-4 mt-1 text-muted-foreground" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold truncate">{v.name}</p>
                    {v.is_default && (
                      <span className="text-[10px] bg-primary/10 text-primary rounded px-1.5 py-0.5">
                        {t("venues.defaultBadge")}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground truncate">{v.address}</p>
                </div>
                <div className="flex items-center gap-1">
                  <Button size="icon" variant="ghost" onClick={() => moveVenue(vi, -1)}>
                    <ChevronUp className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => moveVenue(vi, 1)}>
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() =>
                      v.is_default
                        ? updateVenueFn({
                            data: { venueId: v.id, clubId: activeClubId!, isDefault: false },
                          }).then(invalidate)
                        : setDefaultVenueFn({
                            data: { venueId: v.id, clubId: activeClubId! },
                          }).then(invalidate)
                    }
                    title={t("venues.toggleDefault")}
                  >
                    {v.is_default ? <StarOff className="h-4 w-4" /> : <Star className="h-4 w-4" />}
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => setVenueEdit(v)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => onDeleteVenue(v)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>

              <div className="border-t border-border px-4 py-3 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {t("venues.facilitiesTitle")}
                  </p>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      setFacilityEdit({
                        venue_id: v.id,
                        name: "",
                        surface_type: null,
                        sport: null,
                        is_default: v.facilities.length === 0,
                      })
                    }
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    {t("venues.addField")}
                  </Button>
                </div>
                {v.facilities.length === 0 && (
                  <p className="text-xs text-muted-foreground">{t("venues.noFacilities")}</p>
                )}
                <ul className="space-y-1">
                  {v.facilities.map((f, fi) => (
                    <li
                      key={f.id}
                      className="flex items-center gap-2 rounded-xl border border-border/60 px-3 py-2 text-sm"
                    >
                      <span className="flex-1 min-w-0 truncate">
                        └ {f.name}
                        {f.surface_type && (
                          <span className="text-xs text-muted-foreground"> · {f.surface_type}</span>
                        )}
                        {f.is_default && (
                          <span className="ml-2 text-[10px] bg-primary/10 text-primary rounded px-1.5 py-0.5">
                            {t("venues.defaultBadge")}
                          </span>
                        )}
                      </span>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => moveFacility(v.id, v.facilities, fi, -1)}
                      >
                        <ChevronUp className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => moveFacility(v.id, v.facilities, fi, 1)}
                      >
                        <ChevronDown className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() =>
                          f.is_default
                            ? updateFacilityFn({
                                data: {
                                  facilityId: f.id,
                                  venueId: f.venue_id,
                                  isDefault: false,
                                },
                              }).then(invalidate)
                            : setDefaultFacilityFn({
                                data: { facilityId: f.id, venueId: f.venue_id },
                              }).then(invalidate)
                        }
                      >
                        {f.is_default ? (
                          <StarOff className="h-4 w-4" />
                        ) : (
                          <Star className="h-4 w-4" />
                        )}
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => setFacilityEdit({ ...f, venue_id: v.id })}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => onDeleteFacility(f)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ))}
        </div>
      </div>

      <VenueEditDialog
        value={venueEdit}
        onClose={() => setVenueEdit(null)}
        onSave={(v) => saveVenueMutation.mutate(v)}
        saving={saveVenueMutation.isPending}
      />
      <FacilityEditDialog
        value={facilityEdit}
        onClose={() => setFacilityEdit(null)}
        onSave={(f) => saveFacilityMutation.mutate(f)}
        saving={saveFacilityMutation.isPending}
      />
    </div>
  );
}

function VenueEditDialog({
  value,
  onClose,
  onSave,
  saving,
}: {
  value: Partial<ClubVenueWithFacilities> | null;
  onClose: () => void;
  onSave: (v: Partial<ClubVenueWithFacilities>) => void;
  saving: boolean;
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<Partial<ClubVenueWithFacilities>>(value ?? {});
  useEffect(() => {
    setDraft(value ?? {});
  }, [value]);
  if (!value) return null;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{value.id ? t("venues.editSite") : t("venues.addSite")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>{t("venues.field.name")}</Label>
            <Input
              value={draft.name ?? ""}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              placeholder="Stade municipal"
            />
          </div>
          <AddressField
            label={t("venues.field.address")}
            value={draft.address ?? ""}
            onValueChange={(v: string) => setDraft({ ...draft, address: v })}
            onPlaceUrl={() => {}}
            placeholder="12 rue du Stade, 75000 Paris"
            helper=""
          />
          <div className="space-y-1.5">
            <Label>{t("venues.field.notes")}</Label>
            <Textarea
              rows={2}
              value={draft.notes ?? ""}
              onChange={(e) => setDraft({ ...draft, notes: e.target.value || null })}
            />
          </div>
          <div className="flex items-center justify-between">
            <Label>{t("venues.field.isDefault")}</Label>
            <Switch
              checked={!!draft.is_default}
              onCheckedChange={(v) => setDraft({ ...draft, is_default: v })}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button
            onClick={() => onSave(draft)}
            disabled={saving || !draft.name?.trim() || !draft.address?.trim()}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : t("common.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FacilityEditDialog({
  value,
  onClose,
  onSave,
  saving,
}: {
  value: (Partial<ClubFacility> & { venue_id: string }) | null;
  onClose: () => void;
  onSave: (v: Partial<ClubFacility> & { venue_id: string }) => void;
  saving: boolean;
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<Partial<ClubFacility> & { venue_id: string }>(
    value ?? { venue_id: "" },
  );
  useEffect(() => {
    setDraft(value ?? { venue_id: "" });
  }, [value]);
  if (!value) return null;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{value.id ? t("venues.editField") : t("venues.addField")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>{t("venues.field.name")}</Label>
            <Input
              value={draft.name ?? ""}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              placeholder="Terrain d'honneur"
            />
          </div>
          <div className="space-y-1.5">
            <Label>{t("venues.field.surface")}</Label>
            <Input
              value={draft.surface_type ?? ""}
              onChange={(e) => setDraft({ ...draft, surface_type: e.target.value || null })}
              placeholder={t("venues.surfacePlaceholder")}
            />
          </div>
          <div className="space-y-1.5">
            <Label>{t("venues.field.sport")}</Label>
            <Input
              value={draft.sport ?? ""}
              onChange={(e) => setDraft({ ...draft, sport: e.target.value || null })}
            />
          </div>
          <div className="flex items-center justify-between">
            <Label>{t("venues.field.isDefaultField")}</Label>
            <Switch
              checked={!!draft.is_default}
              onCheckedChange={(v) => setDraft({ ...draft, is_default: v })}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button onClick={() => onSave(draft)} disabled={saving || !draft.name?.trim()}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : t("common.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
