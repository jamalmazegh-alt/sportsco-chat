import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import { listClubVenues, type ClubVenueWithFacilities } from "@/lib/venues.functions";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function VenueFacilityPicker({
  clubId,
  venueId,
  facilityId,
  onChange,
}: {
  clubId: string;
  venueId: string | null;
  facilityId: string | null;
  onChange: (next: { venueId: string | null; facilityId: string | null }) => void;
}) {
  const { t } = useTranslation("camps");
  const listFn = useServerFn(listClubVenues);
  const { data: venues } = useQuery({
    queryKey: ["club-venues", clubId],
    queryFn: () => listFn({ data: { clubId } }),
    enabled: !!clubId,
  });

  const list = (venues ?? []) as ClubVenueWithFacilities[];
  const selectedVenue = list.find((v) => v.id === venueId);
  const facilities = selectedVenue?.facilities ?? [];

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-1.5">
        <Label>{t("form.venue", { defaultValue: "Lieu" })}</Label>
        <Select
          value={venueId ?? "__none"}
          onValueChange={(v) =>
            onChange({ venueId: v === "__none" ? null : v, facilityId: null })
          }
        >
          <SelectTrigger>
            <SelectValue placeholder={t("form.venuePlaceholder", { defaultValue: "Choisir un lieu" })} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none">
              {t("form.venueNone", { defaultValue: "— Aucun —" })}
            </SelectItem>
            {list.map((v) => (
              <SelectItem key={v.id} value={v.id}>
                {v.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label>{t("form.facility", { defaultValue: "Terrain / installation" })}</Label>
        <Select
          value={facilityId ?? "__none"}
          onValueChange={(v) => onChange({ venueId, facilityId: v === "__none" ? null : v })}
          disabled={!venueId || facilities.length === 0}
        >
          <SelectTrigger>
            <SelectValue placeholder={t("form.facilityPlaceholder", { defaultValue: "Optionnel" })} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none">
              {t("form.facilityNone", { defaultValue: "— Aucun —" })}
            </SelectItem>
            {facilities.map((f) => (
              <SelectItem key={f.id} value={f.id}>
                {f.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
