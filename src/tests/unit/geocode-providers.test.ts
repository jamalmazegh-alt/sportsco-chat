import { describe, it, expect } from "vitest";
import {
  buildBanUrl,
  buildNominatimUrl,
  formatQuery,
  mapBanResponse,
  mapNominatimResponse,
  usesFrenchAddressBase,
} from "@/lib/geocode/providers";

describe("usesFrenchAddressBase", () => {
  it("routes French and unspecified countries to the national address base", () => {
    expect(usesFrenchAddressBase("France")).toBe(true);
    expect(usesFrenchAddressBase("fr")).toBe(true);
    expect(usesFrenchAddressBase("")).toBe(true);
    expect(usesFrenchAddressBase(null)).toBe(true);
    expect(usesFrenchAddressBase(undefined)).toBe(true);
  });

  it("routes everything else to the worldwide provider", () => {
    expect(usesFrenchAddressBase("Belgique")).toBe(false);
    expect(usesFrenchAddressBase("Spain")).toBe(false);
  });
});

describe("formatQuery", () => {
  it("builds one line from the parts, skipping the empty ones", () => {
    expect(
      formatQuery({ address: "12 avenue des Sports", city: "Vitrolles", postalCode: "13127" }),
    ).toBe("12 avenue des Sports, 13127, Vitrolles");
  });

  it("keeps the country when there is one", () => {
    expect(formatQuery({ address: "Rue Neuve 1", city: "Bruxelles", country: "Belgique" })).toBe(
      "Rue Neuve 1, Bruxelles, Belgique",
    );
  });

  it("collapses stray whitespace", () => {
    expect(formatQuery({ address: "  12   avenue  des Sports ", city: " Vitrolles " })).toBe(
      "12 avenue des Sports, Vitrolles",
    );
  });
});

describe("buildBanUrl / buildNominatimUrl", () => {
  it("encodes the query and asks for a single result", () => {
    const ban = buildBanUrl("12 avenue des Sports, Vitrolles");
    expect(ban).toContain("api-adresse.data.gouv.fr");
    expect(ban).toContain("limit=1");
    expect(ban).toContain("avenue+des+Sports");

    const nominatim = buildNominatimUrl("Rue Neuve 1, Bruxelles");
    expect(nominatim).toContain("nominatim.openstreetmap.org");
    expect(nominatim).toContain("format=jsonv2");
    expect(nominatim).toContain("limit=1");
  });
});

describe("mapBanResponse", () => {
  it("reads GeoJSON coordinates as [longitude, latitude], not the reverse", () => {
    const r = mapBanResponse({
      features: [
        {
          geometry: { coordinates: [5.2489, 43.4567] },
          properties: { label: "12 Avenue des Sports 13127 Vitrolles", score: 0.92 },
        },
      ],
    });
    expect(r).toEqual({
      latitude: 43.4567,
      longitude: 5.2489,
      label: "12 Avenue des Sports 13127 Vitrolles",
      provider: "ban",
    });
  });

  it("rejects a weak match rather than dropping a pin on the town centre", () => {
    expect(
      mapBanResponse({
        features: [{ geometry: { coordinates: [5.24, 43.45] }, properties: { score: 0.2 } }],
      }),
    ).toBeNull();
  });

  it("returns null on an empty or malformed payload", () => {
    expect(mapBanResponse({})).toBeNull();
    expect(mapBanResponse({ features: [] })).toBeNull();
    expect(mapBanResponse({ features: [{ geometry: { coordinates: [5.24] } }] })).toBeNull();
    expect(
      mapBanResponse({ features: [{ geometry: { coordinates: ["5.24", "43.45"] } }] }),
    ).toBeNull();
  });
});

describe("mapNominatimResponse", () => {
  it("parses the string coordinates", () => {
    expect(
      mapNominatimResponse([
        { lat: "50.8467", lon: "4.3525", display_name: "Rue Neuve, Bruxelles" },
      ]),
    ).toEqual({
      latitude: 50.8467,
      longitude: 4.3525,
      label: "Rue Neuve, Bruxelles",
      provider: "nominatim",
    });
  });

  it("returns null on an empty list or unparseable coordinates", () => {
    expect(mapNominatimResponse([])).toBeNull();
    expect(mapNominatimResponse([{ lat: "abc", lon: "4.35" }])).toBeNull();
  });
});
