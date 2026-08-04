/**
 * VenuePicker — shared control injected in EventFormSheet and EventWizard.
 *
 * Behavior:
 *  - 0 venues: renders nothing (caller falls back to free-text address).
 *  - 1 venue + 1 facility: auto-fills silently (no dropdown UI) when the caller
 *    opts into defaults.
 *  - Otherwise: hierarchical selectors (venue → facility). Facility is optional
 *    if the venue has none. On mount, the default venue/facility (if any) is
 *    preselected. All writes flow through the caller's onChange, which is
 *    responsible for feeding buildEventPayload via the caller's state.
 */

import { useEffect, useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import { MapPin } from "lucide-react";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { listClubVenues, type ClubVenueWithFacilities } from "@/lib/venues.functions";
import { toGoogleMapsUrl } from "@/lib/events/event-payload";

export interface VenuePickerValue {
  venueId: string | null;
  facilityId: string | null;
  location: string; // resolved address (venue.address + optional " – facility.name")
  locationUrl: string | null; // toGoogleMapsUrl of the resolved address
}

const NO_FACILITY_VALUE = "__none__";

interface Props {
  clubId: string | undefined;
  venueId: string | null;
  facilityId: string | null;
  onChange: (v: VenuePickerValue | null) => void;
  /** When true, apply defaults on first render even if venueId is already set. */
  autoApplyDefaults?: boolean;
}

function resolvedLocation(venue: ClubVenueWithFacilities, facility: { name: string } | null) {
  return facility ? `${venue.address} – ${facility.name}` : venue.address;
}

function buildValue(
  venues: ClubVenueWithFacilities[],
  venueId: string | null,
  facilityId: string | null,
): VenuePickerValue | null {
  const venue = venues.find((v) => v.id === venueId) ?? null;
  if (!venue) return null;
  const facility = venue.facilities.find((f) => f.id === facilityId) ?? null;
  const location = resolvedLocation(venue, facility);
  return {
    venueId: venue.id,
    facilityId: facility?.id ?? null,
    location,
    locationUrl: toGoogleMapsUrl(location),
  };
}

export function VenuePicker({ clubId, venueId, facilityId, onChange, autoApplyDefaults }: Props) {
  const { t } = useTranslation();
  const listFn = useServerFn(listClubVenues);

  const { data: venues } = useQuery({
    queryKey: ["club-venues", clubId],
    queryFn: () => listFn({ data: { clubId: clubId! } }),
    enabled: !!clubId,
    staleTime: 60_000,
  });

  const list = venues ?? [];
  const initializedRef = useRef(false);

  const totalFacilities = useMemo(() => list.reduce((n, v) => n + v.facilities.length, 0), [list]);
  const isSingleSingle = list.length === 1 && list[0].facilities.length === 1;

  // Auto-fill on first load: pick defaults (venue.is_default → first; then
  // facility.is_default if present). Also handles the "1 site + 1 terrain" case.
  useEffect(() => {
    if (initializedRef.current) return;
    if (!clubId || list.length === 0) return;
    if (venueId) {
      initializedRef.current = true;
      const current = buildValue(list, venueId, facilityId);
      if (current) onChange(current);
      return;
    }
    // Only auto-apply the club default when the caller explicitly opts in
    // (typically: create flow with no existing location). In edit / prefilled
    // cases, never override the current selection — even if venueId is still
    // null while the parent form is hydrating.
    if (!autoApplyDefaults) {
      initializedRef.current = true;
      return;
    }
    const venue = list.find((v) => v.is_default) ?? list[0];
    const facility =
      venue.facilities.find((f) => f.is_default) ?? (isSingleSingle ? venue.facilities[0] : null);
    initializedRef.current = true;
    onChange(buildValue(list, venue.id, facility?.id ?? null));
  }, [list, clubId, venueId, facilityId, autoApplyDefaults, isSingleSingle, onChange]);

  if (!clubId) return null;
  if (list.length === 0) return null;

  // 1 venue + 1 facility: silent auto-fill, tiny read-only banner.
  if (isSingleSingle) {
    const venue = list[0];
    const facility = venue.facilities[0];
    return (
      <div className="rounded-xl border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground flex items-start gap-2">
        <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>
          <span className="font-medium text-foreground">{venue.name}</span>
          {" · "}
          {facility.name}
        </span>
      </div>
    );
  }

  const selectedVenue = list.find((v) => v.id === venueId) ?? null;

  return (
    <div className="space-y-2">
      <div className="space-y-1.5">
        <Label className="text-xs">{t("venues.picker.siteLabel")}</Label>
        <Select
          value={venueId ?? ""}
          onValueChange={(v) => {
            const venue = list.find((x) => x.id === v);
            if (!venue) return;
            const facility = venue.facilities.find((f) => f.is_default) ?? null;
            onChange(buildValue(list, venue.id, facility?.id ?? null));
          }}
        >
          <SelectTrigger>
            <SelectValue placeholder={t("venues.picker.sitePlaceholder")} />
          </SelectTrigger>
          <SelectContent>
            {list.map((v) => (
              <SelectItem key={v.id} value={v.id}>
                📍 {v.name}
                {v.is_default ? " ★" : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {selectedVenue && selectedVenue.facilities.length > 0 && (
        <div className="space-y-1.5">
          <Label className="text-xs">{t("venues.picker.facilityLabel")}</Label>
          <Select
            value={facilityId ?? NO_FACILITY_VALUE}
            onValueChange={(v) =>
              onChange(buildValue(list, selectedVenue.id, v === NO_FACILITY_VALUE ? null : v))
            }
          >
            <SelectTrigger>
              <SelectValue placeholder={t("venues.picker.facilityPlaceholder")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_FACILITY_VALUE}>
                {t("venues.picker.noFacilityOption")}
              </SelectItem>
              {selectedVenue.facilities.map((f) => (
                <SelectItem key={f.id} value={f.id}>
                  {f.name}
                  {f.is_default ? " ★" : ""}
                  {f.surface_type ? ` · ${f.surface_type}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {totalFacilities === 0 && (
        <p className="text-[11px] text-muted-foreground">{t("venues.picker.noFacilitiesHint")}</p>
      )}
    </div>
  );
}
