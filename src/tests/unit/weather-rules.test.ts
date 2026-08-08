import { describe, it, expect } from "vitest";
import {
  buildEventWeather,
  daysUntil,
  isCacheFresh,
  isValidCoordinate,
  pickAlert,
  resolveEventCoordinates,
  shouldFetchWeather,
  weatherAvailability,
  weatherCacheKey,
  weatherKindFromCode,
  forecastAvailableFrom,
} from "@/lib/weather/rules";
import { buildOpenMeteoUrl, mapOpenMeteoHourly } from "@/lib/weather/open-meteo";
import type { WeatherHour } from "@/lib/weather/types";

const NOW = new Date("2026-03-11T09:00:00Z");

function hour(time: string, patch: Partial<WeatherHour> = {}): WeatherHour {
  return {
    time,
    temperature: 15,
    feelsLike: 14,
    precipitation: 10,
    windSpeed: 12,
    kind: "cloudy",
    ...patch,
  };
}

describe("weatherCacheKey", () => {
  it("rounds coordinates so nearby pitches share one cache entry", () => {
    const a = weatherCacheKey(43.4567, 5.2489, new Date("2026-03-14T15:00:00Z"));
    const b = weatherCacheKey(43.4571, 5.2492, new Date("2026-03-14T22:00:00Z"));
    expect(a).toBe("43.46:5.25:2026-03-14");
    expect(b).toBe(a);
  });

  it("separates entries for different days", () => {
    const a = weatherCacheKey(43.46, 5.25, new Date("2026-03-14T15:00:00Z"));
    const b = weatherCacheKey(43.46, 5.25, new Date("2026-03-15T15:00:00Z"));
    expect(a).not.toBe(b);
  });
});

describe("isCacheFresh", () => {
  it("accepts an entry inside the TTL and rejects an older one", () => {
    expect(isCacheFresh(new Date("2026-03-11T07:00:00Z"), NOW)).toBe(true);
    expect(isCacheFresh(new Date("2026-03-11T05:00:00Z"), NOW)).toBe(false);
  });

  it("rejects a timestamp in the future — a clock skew must not pin a stale entry", () => {
    expect(isCacheFresh(new Date("2026-03-11T10:00:00Z"), NOW)).toBe(false);
  });
});

describe("shouldFetchWeather", () => {
  const coords = { latitude: 43.46, longitude: 5.25 };

  it("fetches inside the ten-day horizon", () => {
    expect(
      shouldFetchWeather(
        { status: "published", startsAt: new Date("2026-03-14T15:00:00Z"), ...coords },
        NOW,
      ),
    ).toBe(true);
  });

  it("declines beyond the horizon, where no forecast is reliable", () => {
    expect(
      shouldFetchWeather(
        { status: "published", startsAt: new Date("2026-03-22T15:00:00Z"), ...coords },
        NOW,
      ),
    ).toBe(false);
  });

  it("declines for past events but still covers today", () => {
    expect(
      shouldFetchWeather(
        { status: "published", startsAt: new Date("2026-03-10T15:00:00Z"), ...coords },
        NOW,
      ),
    ).toBe(false);
    expect(
      shouldFetchWeather(
        { status: "published", startsAt: new Date("2026-03-11T20:00:00Z"), ...coords },
        NOW,
      ),
    ).toBe(true);
  });

  it("declines for a cancelled event", () => {
    expect(
      shouldFetchWeather(
        { status: "cancelled", startsAt: new Date("2026-03-14T15:00:00Z"), ...coords },
        NOW,
      ),
    ).toBe(false);
  });

  it("declines without usable coordinates", () => {
    const startsAt = new Date("2026-03-14T15:00:00Z");
    expect(
      shouldFetchWeather({ status: "published", startsAt, latitude: null, longitude: null }, NOW),
    ).toBe(false);
    expect(
      shouldFetchWeather({ status: "published", startsAt, latitude: 0, longitude: 0 }, NOW),
    ).toBe(false);
  });
});

describe("daysUntil", () => {
  it("counts civil days, not elapsed hours", () => {
    // 23:00 aujourd'hui et 01:00 demain sont à 2 h d'écart mais un jour d'écart.
    expect(daysUntil(new Date("2026-03-11T23:00:00Z"), NOW)).toBe(0);
    expect(daysUntil(new Date("2026-03-12T01:00:00Z"), NOW)).toBe(1);
    expect(daysUntil(new Date("2026-03-10T23:00:00Z"), NOW)).toBe(-1);
  });
});

describe("isValidCoordinate", () => {
  it("rejects null island, out-of-range values and non-numbers", () => {
    expect(isValidCoordinate(0, 0)).toBe(false);
    expect(isValidCoordinate(91, 5)).toBe(false);
    expect(isValidCoordinate(43, 181)).toBe(false);
    expect(isValidCoordinate(null, 5)).toBe(false);
    expect(isValidCoordinate(Number.NaN, 5)).toBe(false);
    expect(isValidCoordinate(43.46, 5.25)).toBe(true);
  });
});

describe("pickAlert", () => {
  it("raises rain from 60% and keeps quiet below", () => {
    expect(pickAlert(hour("t", { precipitation: 60 }))).toBe("rain");
    expect(pickAlert(hour("t", { precipitation: 59 }))).toBeNull();
  });

  it("raises wind, cold and heat on their own thresholds", () => {
    expect(pickAlert(hour("t", { windSpeed: 40 }))).toBe("wind");
    expect(pickAlert(hour("t", { feelsLike: 3 }))).toBe("cold");
    expect(pickAlert(hour("t", { feelsLike: 33 }))).toBe("heat");
  });

  it("puts rain first when several thresholds trip at once", () => {
    expect(pickAlert(hour("t", { precipitation: 80, windSpeed: 50, feelsLike: 1 }))).toBe("rain");
  });
});

describe("weatherKindFromCode", () => {
  it("maps the WMO ranges", () => {
    expect(weatherKindFromCode(0)).toBe("clear");
    expect(weatherKindFromCode(2)).toBe("partly");
    expect(weatherKindFromCode(3)).toBe("cloudy");
    expect(weatherKindFromCode(48)).toBe("fog");
    expect(weatherKindFromCode(61)).toBe("rain");
    expect(weatherKindFromCode(81)).toBe("rain");
    expect(weatherKindFromCode(73)).toBe("snow");
    expect(weatherKindFromCode(99)).toBe("storm");
  });
});

describe("buildEventWeather", () => {
  const hours = [
    hour("2026-03-14T12:00:00.000Z", { temperature: 16 }),
    hour("2026-03-14T13:00:00.000Z", { temperature: 15 }),
    hour("2026-03-14T14:00:00.000Z", { temperature: 15 }),
    hour("2026-03-14T15:00:00.000Z", { temperature: 14, precipitation: 70 }),
    hour("2026-03-14T16:00:00.000Z", { temperature: 13, precipitation: 65 }),
    hour("2026-03-14T17:00:00.000Z", { temperature: 13 }),
    hour("2026-03-14T18:00:00.000Z", { temperature: 12 }),
    hour("2026-03-14T19:00:00.000Z", { temperature: 12 }),
    hour("2026-03-14T20:00:00.000Z", { temperature: 11 }),
  ];
  const fetchedAt = new Date("2026-03-11T08:20:00Z");

  it("covers the meeting time through the estimated end", () => {
    const w = buildEventWeather(hours, {
      startsAt: new Date("2026-03-14T15:00:00Z"),
      endsAt: new Date("2026-03-14T16:45:00Z"),
      convocationAt: new Date("2026-03-14T13:30:00Z"),
      fetchedAt,
    });
    expect(w).not.toBeNull();
    expect(w!.hours.map((h) => h.time)).toEqual([
      "2026-03-14T13:00:00.000Z",
      "2026-03-14T14:00:00.000Z",
      "2026-03-14T15:00:00.000Z",
      "2026-03-14T16:00:00.000Z",
    ]);
  });

  it("points `at` and `keyIndex` at the kickoff hour", () => {
    const w = buildEventWeather(hours, {
      startsAt: new Date("2026-03-14T15:20:00Z"),
      endsAt: new Date("2026-03-14T16:45:00Z"),
      convocationAt: new Date("2026-03-14T13:30:00Z"),
      fetchedAt,
    });
    expect(w!.at.time).toBe("2026-03-14T15:00:00.000Z");
    expect(w!.hours[w!.keyIndex].time).toBe("2026-03-14T15:00:00.000Z");
  });

  it("carries the alert of the kickoff hour, not of the window", () => {
    const w = buildEventWeather(hours, {
      startsAt: new Date("2026-03-14T15:00:00Z"),
      endsAt: new Date("2026-03-14T16:45:00Z"),
      fetchedAt,
    });
    expect(w!.alert).toBe("rain");

    const dry = buildEventWeather(hours, {
      startsAt: new Date("2026-03-14T17:00:00Z"),
      endsAt: new Date("2026-03-14T18:00:00Z"),
      fetchedAt,
    });
    expect(dry!.alert).toBeNull();
  });

  it("extends forward when the end time is unknown", () => {
    const w = buildEventWeather(hours, {
      startsAt: new Date("2026-03-14T15:00:00Z"),
      endsAt: null,
      fetchedAt,
    });
    expect(w!.hours.map((h) => h.time)).toEqual([
      "2026-03-14T15:00:00.000Z",
      "2026-03-14T16:00:00.000Z",
      "2026-03-14T17:00:00.000Z",
      "2026-03-14T18:00:00.000Z",
      "2026-03-14T19:00:00.000Z",
    ]);
  });

  it("never extends past a known end — the strip covers the event, not the evening", () => {
    const w = buildEventWeather(hours, {
      startsAt: new Date("2026-03-14T15:00:00Z"),
      endsAt: new Date("2026-03-14T16:45:00Z"),
      fetchedAt,
    });
    expect(w!.hours.map((h) => h.time)).toEqual([
      "2026-03-14T15:00:00.000Z",
      "2026-03-14T16:00:00.000Z",
    ]);
  });

  it("caps a long event so the strip stays readable, keeping the kickoff inside", () => {
    const w = buildEventWeather(hours, {
      startsAt: new Date("2026-03-14T15:00:00Z"),
      endsAt: new Date("2026-03-14T18:00:00Z"),
      convocationAt: new Date("2026-03-14T12:00:00Z"),
      fetchedAt,
      maxHours: 5,
    });
    expect(w!.hours.length).toBe(5);
    expect(w!.hours[w!.keyIndex].time).toBe("2026-03-14T15:00:00.000Z");
  });

  it("returns null when the provider does not cover the kickoff hour", () => {
    const w = buildEventWeather(hours, {
      startsAt: new Date("2026-03-20T15:00:00Z"),
      fetchedAt,
    });
    expect(w).toBeNull();
  });
});

describe("mapOpenMeteoHourly", () => {
  it("reads the parallel arrays and stamps times as UTC", () => {
    const hoursOut = mapOpenMeteoHourly({
      hourly: {
        time: ["2026-03-14T15:00", "2026-03-14T16:00"],
        temperature_2m: [14.4, 13.2],
        apparent_temperature: [11.3, 10.8],
        precipitation_probability: [70, 65],
        wind_speed_10m: [24.6, 22.1],
        weather_code: [61, 3],
      },
    });
    expect(hoursOut).toEqual([
      {
        time: "2026-03-14T15:00:00.000Z",
        temperature: 14,
        feelsLike: 11,
        precipitation: 70,
        windSpeed: 25,
        kind: "rain",
      },
      {
        time: "2026-03-14T16:00:00.000Z",
        temperature: 13,
        feelsLike: 11,
        precipitation: 65,
        windSpeed: 22,
        kind: "cloudy",
      },
    ]);
  });

  it("drops slots without a temperature instead of inventing 0 °C", () => {
    const hoursOut = mapOpenMeteoHourly({
      hourly: {
        time: ["2026-03-14T15:00", "2026-03-14T16:00"],
        temperature_2m: [null, 13.2],
        apparent_temperature: [null, 10.8],
      },
    });
    expect(hoursOut).toHaveLength(1);
    expect(hoursOut[0].time).toBe("2026-03-14T16:00:00.000Z");
  });

  it("falls back to neutral values that never trip an alert on their own", () => {
    const [only] = mapOpenMeteoHourly({
      hourly: { time: ["2026-03-14T15:00"], temperature_2m: [14] },
    });
    expect(only.feelsLike).toBe(14);
    expect(only.precipitation).toBe(0);
    expect(only.windSpeed).toBe(0);
    expect(pickAlert(only)).toBeNull();
  });

  it("returns an empty list on an empty or malformed payload", () => {
    expect(mapOpenMeteoHourly({})).toEqual([]);
    expect(mapOpenMeteoHourly({ hourly: { time: [] } })).toEqual([]);
  });
});

describe("buildOpenMeteoUrl", () => {
  it("asks for UTC so provider times line up with our timestamps", () => {
    const url = buildOpenMeteoUrl(43.4567, 5.2489);
    expect(url).toContain("timezone=UTC");
    expect(url).toContain("latitude=43.4567");
    expect(url).toContain("wind_speed_10m");
    expect(url).not.toContain("apikey");
  });

  it("switches to the customer host when a commercial key is configured", () => {
    const url = buildOpenMeteoUrl(43.46, 5.25, { apiKey: "k-123" });
    expect(url).toContain("customer-api.open-meteo.com");
    expect(url).toContain("apikey=k-123");
  });
});

describe("weatherAvailability", () => {
  const coords = { latitude: 43.46, longitude: 5.25 };
  const startsAt = new Date("2026-03-14T15:00:00Z");

  it("says nothing is wrong when the forecast is fetchable", () => {
    expect(weatherAvailability({ status: "published", startsAt, ...coords }, NOW)).toBeNull();
  });

  it("distinguishes too-far from a genuine failure", () => {
    expect(
      weatherAvailability(
        { status: "published", startsAt: new Date("2026-03-30T15:00:00Z"), ...coords },
        NOW,
      ),
    ).toBe("beyond_horizon");
  });

  it("names a missing venue location, which staff can act on", () => {
    expect(
      weatherAvailability({ status: "published", startsAt, latitude: null, longitude: null }, NOW),
    ).toBe("no_location");
  });

  it("stays silent on past and cancelled events — a message there is noise", () => {
    expect(
      weatherAvailability(
        { status: "published", startsAt: new Date("2026-03-01T15:00:00Z"), ...coords },
        NOW,
      ),
    ).toBe("silent");
    expect(weatherAvailability({ status: "cancelled", startsAt, ...coords }, NOW)).toBe("silent");
  });

  it("prefers silence over a location complaint on a cancelled event", () => {
    expect(
      weatherAvailability({ status: "cancelled", startsAt, latitude: null, longitude: null }, NOW),
    ).toBe("silent");
  });

  it("agrees with shouldFetchWeather", () => {
    const ev = { status: "published", startsAt, ...coords };
    expect(shouldFetchWeather(ev, NOW)).toBe(weatherAvailability(ev, NOW) === null);
  });
});

describe("forecastAvailableFrom", () => {
  it("returns the day the forecast starts existing — the event minus the horizon", () => {
    expect(forecastAvailableFrom(new Date("2026-03-14T15:00:00Z")).toISOString()).toBe(
      "2026-03-04T15:00:00.000Z",
    );
  });
});

describe("resolveEventCoordinates", () => {
  const stade = {
    id: "v1",
    name: "Stade des Lilas",
    address: "12 avenue des Sports, Vitrolles",
    latitude: 43.46,
    longitude: 5.25,
    isDefault: true,
  };
  const gymnase = {
    id: "v2",
    name: "Gymnase Nord",
    address: "3 rue du Nord",
    latitude: 43.5,
    longitude: 5.3,
    isDefault: false,
  };
  const venues = [stade, gymnase];

  it("prefers the explicit venue link", () => {
    const r = resolveEventCoordinates(
      { venueId: "v2", location: "Stade des Lilas", isHome: true },
      venues,
    );
    expect(r).toEqual({ latitude: 43.5, longitude: 5.3, via: "venue_id" });
  });

  it("falls back to matching the free-text location by venue name", () => {
    // Cas réel : l'assistant efface venue_id dès qu'on touche au champ adresse.
    const r = resolveEventCoordinates(
      { venueId: null, location: "Stade des Lilas, Vitrolles", isHome: true },
      venues,
    );
    expect(r).toEqual({ latitude: 43.46, longitude: 5.25, via: "location_match" });
  });

  it("ignores accents and case when matching", () => {
    const r = resolveEventCoordinates(
      { venueId: null, location: "GYMNASE NORD", isHome: null },
      venues,
    );
    expect(r?.via).toBe("location_match");
    expect(r?.latitude).toBe(43.5);
  });

  it("falls back to the club's default venue for a home event", () => {
    const r = resolveEventCoordinates(
      { venueId: null, location: "Terrain annexe", isHome: true },
      venues,
    );
    expect(r).toEqual({ latitude: 43.46, longitude: 5.25, via: "default_venue" });
  });

  it("never guesses for an away event — a wrong forecast is worse than none", () => {
    expect(
      resolveEventCoordinates(
        { venueId: null, location: "Chez l'adversaire", isHome: false },
        venues,
      ),
    ).toBeNull();
  });

  it("ignores venues that have no usable coordinates", () => {
    const ungeocoded = [{ ...stade, latitude: null, longitude: null }];
    expect(
      resolveEventCoordinates(
        { venueId: "v1", location: "Stade des Lilas", isHome: true },
        ungeocoded,
      ),
    ).toBeNull();
  });

  it("returns null when the club has no venue at all", () => {
    expect(resolveEventCoordinates({ venueId: null, location: "X", isHome: true }, [])).toBeNull();
  });
});
