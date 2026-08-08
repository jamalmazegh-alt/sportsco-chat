/**
 * Superadmin — géolocalisation des lieux de club.
 *
 * Les coordonnées d'un lieu ne servent qu'à une chose : aller chercher la
 * météo du jour de l'événement. Elles sont résolues automatiquement à
 * l'enregistrement d'un lieu, mais les lieux créés avant ce mécanisme n'en ont
 * pas, et un géocodeur peut échouer sur une adresse mal saisie.
 *
 * Rattraper cela n'a rien à voir avec la gestion d'un club : c'est de la
 * maintenance de plateforme, opaque pour un administrateur de club. L'outil
 * vit donc ici, côté superadmin, et travaille sur tous les clubs à la fois.
 *
 * Lecture comme écriture en service_role : il faut voir les lieux de tous les
 * clubs, ce qu'aucune politique RLS n'autorise. `assertSuperAdmin` garde la
 * porte, et aucun identifiant fourni par l'appelant n'élargit la portée.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { assertSuperAdmin } from "@/lib/authz.server";
import { geocodeAddress } from "@/lib/geocode/geocode.server";

/**
 * Nombre de lieux traités par appel. Les géocodeurs publics limitent le débit
 * et on s'impose une pause entre deux adresses : sans plafond, un parc un peu
 * fourni dépasserait le temps imparti à une requête. Le panneau relance tant
 * qu'il reste des lieux à résoudre.
 */
const BATCH_SIZE = 25;

/** Nominatim tolère une requête par seconde. On reste en deçà. */
const PAUSE_MS = 1_100;

export interface VenueGeocodeStatus {
  total: number;
  missing: number;
  /** Clubs concernés, du plus incomplet au moins incomplet. */
  clubs: Array<{ clubId: string; clubName: string; missing: number }>;
}

export const getVenueGeocodeStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<VenueGeocodeStatus> => {
    await assertSuperAdmin(context.userId);

    const { data: venues, error } = await supabaseAdmin
      .from("club_venues")
      .select("id, club_id, latitude, longitude");
    if (error) throw new Error(error.message);

    const rows = venues ?? [];
    const missingByClub = new Map<string, number>();
    for (const v of rows) {
      if (v.latitude !== null && v.longitude !== null) continue;
      missingByClub.set(v.club_id, (missingByClub.get(v.club_id) ?? 0) + 1);
    }

    const names = new Map<string, string>();
    if (missingByClub.size > 0) {
      const { data: clubs } = await supabaseAdmin
        .from("clubs")
        .select("id, name")
        .in("id", Array.from(missingByClub.keys()));
      for (const c of clubs ?? []) names.set(c.id, c.name);
    }

    return {
      total: rows.length,
      missing: Array.from(missingByClub.values()).reduce((a, b) => a + b, 0),
      clubs: Array.from(missingByClub.entries())
        .map(([clubId, missing]) => ({
          clubId,
          clubName: names.get(clubId) ?? clubId,
          missing,
        }))
        .sort((a, b) => b.missing - a.missing),
    };
  });

export interface VenueGeocodeRunResult {
  processed: number;
  resolved: number;
  failed: number;
  /** Lieux encore sans coordonnées après ce lot. */
  remaining: number;
  /** Adresses non résolues, pour que le superadmin sache lesquelles corriger. */
  unresolved: Array<{ venueId: string; name: string; address: string | null }>;
}

export const backfillVenueCoordinates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ clubId: z.string().uuid().optional() })
      .default({})
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }): Promise<VenueGeocodeRunResult> => {
    await assertSuperAdmin(context.userId);

    let query = supabaseAdmin
      .from("club_venues")
      .select("id, club_id, name, address, city, postal_code, country, latitude, longitude");
    if (data.clubId) query = query.eq("club_id", data.clubId);
    const { data: venues, error } = await query;
    if (error) throw new Error(error.message);

    const pending = (venues ?? []).filter((v) => v.latitude === null || v.longitude === null);
    const batch = pending.slice(0, BATCH_SIZE);

    let resolved = 0;
    const unresolved: VenueGeocodeRunResult["unresolved"] = [];

    // En série, avec une pause : les géocodeurs publics coupent les rafales, et
    // un lot refusé pour cause de débit ne se distingue pas d'une adresse
    // introuvable — on préfère être lent et fiable.
    for (let i = 0; i < batch.length; i++) {
      const v = batch[i];
      if (i > 0) await sleep(PAUSE_MS);

      const geo = v.address
        ? await geocodeAddress({
            address: v.address,
            city: v.city,
            postalCode: v.postal_code,
            country: v.country,
          })
        : null;

      if (!geo) {
        unresolved.push({ venueId: v.id, name: v.name, address: v.address });
        continue;
      }

      const { error: updateError } = await supabaseAdmin
        .from("club_venues")
        .update({ latitude: geo.latitude, longitude: geo.longitude })
        .eq("id", v.id);
      if (updateError) unresolved.push({ venueId: v.id, name: v.name, address: v.address });
      else resolved += 1;
    }

    return {
      processed: batch.length,
      resolved,
      failed: unresolved.length,
      remaining: pending.length - resolved,
      unresolved,
    };
  });

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
