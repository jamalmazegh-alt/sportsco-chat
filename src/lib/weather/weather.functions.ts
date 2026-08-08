import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { fetchOpenMeteoHourly, mapOpenMeteoHourly } from "./open-meteo";
import type { OpenMeteoResponse } from "./open-meteo";
import {
  buildEventWeather,
  forecastAvailableFrom,
  isCacheFresh,
  weatherAvailability,
  weatherCacheKey,
} from "./rules";
import type { EventWeatherResult } from "./types";

/**
 * Météo des événements, par lot.
 *
 * La liste affiche des dizaines de cartes : une requête par carte serait à la
 * fois lente et un bon moyen d'épuiser le quota. Cette fonction prend tous les
 * identifiants d'un coup, regroupe les événements par (lieu arrondi, jour), et
 * ne sort sur le réseau que pour les combinaisons absentes du cache.
 *
 * Lecture des événements via le client authentifié — donc soumise à RLS, un
 * appelant ne peut pas sonder un événement qu'il ne voit pas. Le cache, lui,
 * est manipulé en service_role : il ne contient que des coordonnées arrondies
 * et une prévision publique, et n'est jamais exposé aux clients.
 */

const InputSchema = z.object({
  eventIds: z.array(z.string().uuid()).min(1).max(100),
});

/** Une entrée par identifiant demandé. Absente = rien à afficher du tout. */
export type EventsWeather = Record<string, EventWeatherResult | null>;

interface EventRow {
  id: string;
  starts_at: string;
  ends_at: string | null;
  convocation_time: string | null;
  status: string;
  venue_id: string | null;
}

export const getEventsWeather = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data, context }): Promise<EventsWeather> => {
    const { supabase } = context;
    const now = new Date();
    const out: EventsWeather = {};

    const { data: events, error } = await supabase
      .from("events")
      .select("id, starts_at, ends_at, convocation_time, status, venue_id")
      .in("id", data.eventIds)
      .is("deleted_at", null);
    if (error || !events) return out;

    const rows = events as EventRow[];
    const venueIds = Array.from(
      new Set(rows.map((e) => e.venue_id).filter((v): v is string => !!v)),
    );

    const coordsByVenue = new Map<string, { latitude: number | null; longitude: number | null }>();
    if (venueIds.length > 0) {
      const { data: venues } = await supabase
        .from("club_venues")
        .select("id, latitude, longitude")
        .in("id", venueIds);
      for (const v of venues ?? []) {
        coordsByVenue.set(v.id, { latitude: v.latitude, longitude: v.longitude });
      }
    }

    // Regroupement par clé de cache : plusieurs événements d'un même club le
    // même jour partagent une seule prévision.
    interface Group {
      latitude: number;
      longitude: number;
      day: Date;
      events: EventRow[];
    }
    const groups = new Map<string, Group>();
    for (const e of rows) {
      const coords = e.venue_id ? coordsByVenue.get(e.venue_id) : undefined;
      const startsAt = new Date(e.starts_at);
      const reason = weatherAvailability(
        {
          status: e.status,
          startsAt,
          latitude: coords?.latitude,
          longitude: coords?.longitude,
        },
        now,
      );
      if (reason === "silent") continue;
      if (reason !== null) {
        out[e.id] =
          reason === "beyond_horizon"
            ? { ok: false, reason, availableFrom: forecastAvailableFrom(startsAt).toISOString() }
            : { ok: false, reason };
        continue;
      }
      const key = weatherCacheKey(coords!.latitude!, coords!.longitude!, startsAt);
      // Tant que la prévision n'est pas résolue, l'événement est en erreur :
      // un groupe qui échoue laisse ainsi le bon message plutôt qu'un blanc.
      out[e.id] = { ok: false, reason: "provider_error" };
      const group = groups.get(key);
      if (group) group.events.push(e);
      else
        groups.set(key, {
          latitude: coords!.latitude!,
          longitude: coords!.longitude!,
          day: startsAt,
          events: [e],
        });
    }
    if (groups.size === 0) return out;

    const payloads = await loadPayloads(groups, now);

    for (const [key, group] of groups) {
      const entry = payloads.get(key);
      if (!entry) continue;
      const hours = mapOpenMeteoHourly(entry.payload);
      if (hours.length === 0) continue;
      for (const e of group.events) {
        const weather = buildEventWeather(hours, {
          startsAt: new Date(e.starts_at),
          endsAt: e.ends_at ? new Date(e.ends_at) : null,
          convocationAt: e.convocation_time ? new Date(e.convocation_time) : null,
          fetchedAt: entry.fetchedAt,
        });
        if (weather) out[e.id] = { ok: true, weather };
      }
    }

    return out;
  });

interface CachedPayload {
  payload: OpenMeteoResponse;
  fetchedAt: Date;
}

interface WeatherCacheRow {
  cache_key: string;
  latitude: number;
  longitude: number;
  forecast_date: string;
  payload: OpenMeteoResponse;
  fetched_at: string;
}

/**
 * `weather_cache` n'apparaît pas dans `integrations/supabase/types.ts` : ce
 * fichier est généré depuis la base, et la migration de cette branche n'y est
 * pas encore appliquée. Le temps que `supabase gen types` soit rejoué après
 * déploiement, on passe par cet accès typé à la main — la forme des lignes est
 * décrite par `WeatherCacheRow`, elle n'est donc pas perdue pour autant.
 */
function weatherCacheTable() {
  return (
    supabaseAdmin as unknown as {
      from: (table: "weather_cache") => {
        select: (columns: string) => {
          in: (
            column: string,
            values: string[],
          ) => PromiseLike<{ data: WeatherCacheRow[] | null; error: { message: string } | null }>;
        };
        upsert: (
          rows: WeatherCacheRow[],
          options: { onConflict: string },
        ) => PromiseLike<{ error: { message: string } | null }>;
      };
    }
  ).from("weather_cache");
}

/**
 * Résout chaque groupe depuis le cache, et n'appelle le fournisseur que pour
 * les manquants. Un échec réseau sur un groupe n'en fait pas échouer d'autres :
 * la carte concernée n'affichera simplement pas de météo.
 */
async function loadPayloads(
  groups: Map<string, { latitude: number; longitude: number; day: Date }>,
  now: Date,
): Promise<Map<string, CachedPayload>> {
  const resolved = new Map<string, CachedPayload>();
  const keys = Array.from(groups.keys());

  const { data: cached } = await weatherCacheTable()
    .select("cache_key, payload, fetched_at")
    .in("cache_key", keys);

  const stale: string[] = [...keys];
  for (const row of cached ?? []) {
    const fetchedAt = new Date(row.fetched_at);
    if (!isCacheFresh(fetchedAt, now)) continue;
    resolved.set(row.cache_key, { payload: row.payload, fetchedAt });
    const i = stale.indexOf(row.cache_key);
    if (i >= 0) stale.splice(i, 1);
  }

  if (stale.length === 0) return resolved;

  const apiKey = process.env.OPEN_METEO_API_KEY ?? null;
  const fetched = await Promise.allSettled(
    stale.map(async (key) => {
      const g = groups.get(key)!;
      const { payload } = await fetchOpenMeteoHourly(g.latitude, g.longitude, { apiKey });
      return { key, payload, group: g };
    }),
  );

  const toStore: WeatherCacheRow[] = [];
  for (const r of fetched) {
    if (r.status !== "fulfilled") {
      console.error("[weather] forecast fetch failed", r.reason);
      continue;
    }
    resolved.set(r.value.key, { payload: r.value.payload, fetchedAt: now });
    toStore.push({
      cache_key: r.value.key,
      latitude: r.value.group.latitude,
      longitude: r.value.group.longitude,
      forecast_date: r.value.group.day.toISOString().slice(0, 10),
      payload: r.value.payload,
      fetched_at: now.toISOString(),
    });
  }

  if (toStore.length > 0) {
    const { error } = await weatherCacheTable().upsert(toStore, { onConflict: "cache_key" });
    // Un cache non écrit dégrade la performance, pas le résultat : on continue.
    if (error) console.error("[weather] cache write failed", error.message);
  }

  return resolved;
}
