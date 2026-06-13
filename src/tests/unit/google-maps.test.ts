import { describe, expect, it } from "vitest";
import { googleMapsSearchUrl } from "@/lib/google-maps";

describe("googleMapsSearchUrl", () => {
  it("returns null for empty location", () => {
    expect(googleMapsSearchUrl("")).toBeNull();
    expect(googleMapsSearchUrl("   ")).toBeNull();
    expect(googleMapsSearchUrl(null)).toBeNull();
  });

  it("encodes address for Maps search API", () => {
    const url = googleMapsSearchUrl("Stade Municipal, Paris 15e");
    expect(url).toBe(
      "https://www.google.com/maps/search/?api=1&query=Stade%20Municipal%2C%20Paris%2015e",
    );
  });

  it("passes through existing Google Maps URLs", () => {
    const existing = "https://www.google.com/maps/place/Paris";
    expect(googleMapsSearchUrl(existing)).toBe(existing);
  });
});
