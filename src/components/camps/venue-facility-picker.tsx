import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import { MapPin, Home } from "lucide-react";
import { listClubVenues, type ClubVenueWithFacilities } from "@/lib/venues.functions";
import { Label } from "@/components/ui/label";
import { LocationAutocomplete } from "@/components/location-autocomplete";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export type VenuePickerValue = {
  venueId: string | null;
  facilityId: string | null;
  externalLocation: string | null;
};

export function VenueFacilityPicker({
  clubId,
  venueId,
  facilityId,
  externalLocation,
  onChange,
}: {
  clubId: string;
  venueId: string | null;
  facilityId: string | null;
  externalLocation: string | null;
  onChange: (next: VenuePickerValue) => void;
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

  // Mode is tracked locally so the user can switch to "external" before typing.
  const [mode, setModeState] = useState<"home" | "external">(
    externalLocation !== null && externalLocation !== "" && !venueId ? "external" : "home",
  );

  function setMode(next: "home" | "external") {
    setModeState(next);
    if (next === "home") {
      onChange({ venueId, facilityId, externalLocation: null });
    } else {
      onChange({ venueId: null, facilityId: null, externalLocation: externalLocation ?? "" });
    }
  }

  return (
    <div className="space-y-4">
      {/* Mode toggle */}
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => setMode("home")}
          className={cn(
            "flex items-center gap-2 rounded-lg border p-3 text-left text-sm transition",
            mode === "home"
              ? "border-primary bg-primary/5 ring-1 ring-primary"
              : "border-border hover:bg-muted/50",
          )}
        >
          <Home className="h-4 w-4 shrink-0" />
          <div>
            <div className="font-medium">{t("form.venueModeHome")}</div>
            <div className="text-[11px] text-muted-foreground">{t("form.venueModeHomeHint")}</div>
          </div>
        </button>
        <button
          type="button"
          onClick={() => setMode("external")}
          className={cn(
            "flex items-center gap-2 rounded-lg border p-3 text-left text-sm transition",
            mode === "external"
              ? "border-primary bg-primary/5 ring-1 ring-primary"
              : "border-border hover:bg-muted/50",
          )}
        >
          <MapPin className="h-4 w-4 shrink-0" />
          <div>
            <div className="font-medium">{t("form.venueModeExternal")}</div>
            <div className="text-[11px] text-muted-foreground">
              {t("form.venueModeExternalHint")}
            </div>
          </div>
        </button>
      </div>

      {mode === "home" ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>{t("form.venue")}</Label>
            <Select
              value={venueId ?? "__none"}
              onValueChange={(v) =>
                onChange({
                  venueId: v === "__none" ? null : v,
                  facilityId: null,
                  externalLocation: null,
                })
              }
            >
              <SelectTrigger>
                <SelectValue placeholder={t("form.venuePlaceholder")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">{t("form.venueNone")}</SelectItem>
                {list.map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    {v.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>{t("form.facility")}</Label>
            <Select
              value={facilityId ?? "__none"}
              onValueChange={(v) =>
                onChange({
                  venueId,
                  facilityId: v === "__none" ? null : v,
                  externalLocation: null,
                })
              }
              disabled={!venueId || facilities.length === 0}
            >
              <SelectTrigger>
                <SelectValue placeholder={t("form.facilityPlaceholder")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">{t("form.facilityNone")}</SelectItem>
                {facilities.map((f) => (
                  <SelectItem key={f.id} value={f.id}>
                    {f.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      ) : (
        <div className="space-y-1.5">
          <Label>{t("form.externalAddress")}</Label>
          <LocationAutocomplete
            value={externalLocation ?? ""}
            onChange={(v) =>
              onChange({
                venueId: null,
                facilityId: null,
                externalLocation: v,
              })
            }
            placeholder={t("form.externalAddressPlaceholder")}
          />
          <p className="text-[11px] text-muted-foreground">{t("form.externalAddressHint")}</p>
        </div>
      )}
    </div>
  );
}
