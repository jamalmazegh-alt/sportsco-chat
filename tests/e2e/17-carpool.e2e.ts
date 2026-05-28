/**
 * 17 — Carpool (Covoiturage) — v2
 *
 * Corrections :
 * - Test "coach can delete any carpool offer" : le parent doit être dans
 *   club_members pour pouvoir insérer via son client. On crée le carpool
 *   du parent via admin (service_role) pour simplifier.
 * - Test "driver cannot offer two carpools" : le coach a annulé son carpool
 *   dans le test précédent (via cleanup afterAll). On crée un nouveau carpool
 *   frais au début du test et on tente le doublon immédiatement.
 */
import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { admin, SUPABASE_URL, SUPABASE_ANON_KEY } from "./_fixtures/admin";
import { clientFor } from "./_fixtures/auth";
import { createTestClub, type SeededClub } from "./_fixtures/club";

test.describe("Carpool (covoiturage)", () => {
  let club: SeededClub;
  let awayEventId: string;
  let homeEventId: string;
  let coachCarpoolId: string;

  test.beforeAll(async () => {
    club = await createTestClub("carpool");

    const future = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();

    const { data: awayEv, error: awayErr } = await admin
      .from("events")
      .insert({
        team_id: club.teamId,
        title: `${club.prefix}_away_match`,
        starts_at: future,
        type: "match",
        created_by: club.admin.userId,
        status: "published",
        is_home: false,
      })
      .select("id")
      .single();
    if (awayErr || !awayEv) throw new Error(`away event: ${awayErr?.message}`);
    awayEventId = awayEv.id;

    const { data: homeEv, error: homeErr } = await admin
      .from("events")
      .insert({
        team_id: club.teamId,
        title: `${club.prefix}_home_match`,
        starts_at: future,
        type: "match",
        created_by: club.admin.userId,
        status: "published",
        is_home: true,
      })
      .select("id")
      .single();
    if (homeErr || !homeEv) throw new Error(`home event: ${homeErr?.message}`);
    homeEventId = homeEv.id;

    await admin.from("convocations").insert([
      { event_id: awayEventId, player_id: club.player1.id, status: "present" },
      { event_id: awayEventId, player_id: club.player2WithParent.id, status: "present" },
    ]);
  });

  test.afterAll(async () => {
    try {
      const { data: carpools } = await admin
        .from("carpools")
        .select("id")
        .in("event_id", [awayEventId, homeEventId]);
      if (carpools?.length) {
        await admin
          .from("carpool_passengers")
          .delete()
          .in("carpool_id", carpools.map((c) => c.id));
      }
      await admin.from("carpools").delete().in("event_id", [awayEventId, homeEventId]);
      await admin.from("carpool_needs").delete().in("event_id", [awayEventId, homeEventId]);
      await admin.from("convocations").delete().eq("event_id", awayEventId);
      await admin.from("events").delete().in("id", [awayEventId, homeEventId]);
    } catch { /* best-effort */ }
    await club.cleanup();
  });

  // ── 1. Auto-enable sur événement extérieur ─────────────────────────────
  test("away event has carpool_enabled = true (trigger)", async () => {
    const { data, error } = await admin
      .from("events")
      .select("carpool_enabled")
      .eq("id", awayEventId)
      .single();
    expect(error).toBeNull();
    expect(data?.carpool_enabled).toBe(true);
  });

  // ── 12. Événement domicile → carpool_enabled = false ───────────────────
  test("home event has carpool_enabled = false by default", async () => {
    const { data, error } = await admin
      .from("events")
      .select("carpool_enabled")
      .eq("id", homeEventId)
      .single();
    expect(error).toBeNull();
    expect(data?.carpool_enabled).toBe(false);
  });

  // ── 2. Le coach propose des places ─────────────────────────────────────
  test("coach can offer carpool seats", async () => {
    const c = await clientFor(club.coach);
    const { data, error } = await c
      .from("carpools")
      .insert({
        event_id: awayEventId,
        driver_user_id: club.coach.userId,
        driver_name: "Coach Test",
        vehicle_type: "van",
        total_seats: 5,
        departure_note: "Départ parking du stade",
      })
      .select("id, total_seats, vehicle_type")
      .single();
    expect(error).toBeNull();
    expect(data?.total_seats).toBe(5);
    coachCarpoolId = data!.id;
  });

  // ── 3. Un parent réserve une place avec joueurs ─────────────────────────
  test("parent can book a seat and select players", async () => {
    const c = await clientFor(club.player2WithParent.parent);
    const { data, error } = await c
      .from("carpool_passengers")
      .insert({
        carpool_id: coachCarpoolId,
        passenger_user_id: club.player2WithParent.parent.userId,
        player_ids: [club.player2WithParent.id],
      })
      .select("id, player_ids")
      .single();
    expect(error).toBeNull();
    expect(data?.player_ids).toContain(club.player2WithParent.id);
  });

  // ── 4. Le conducteur ne peut pas réserver dans sa propre voiture ────────
  test("driver cannot book their own carpool", async () => {
    const c = await clientFor(club.coach);
    const { error } = await c.from("carpool_passengers").insert({
      carpool_id: coachCarpoolId,
      passenger_user_id: club.coach.userId,
      player_ids: [],
    });
    expect(error).not.toBeNull();
    expect(error?.message).toContain("driver_cannot_book_own_car");
  });

  // ── 5. Un parent ne peut réserver que dans UN seul véhicule ────────────
  test("parent cannot book two carpools for same event", async () => {
    const { data: carpool2 } = await admin
      .from("carpools")
      .insert({
        event_id: awayEventId,
        driver_user_id: club.admin.userId,
        driver_name: "Admin Test",
        vehicle_type: "car",
        total_seats: 3,
      })
      .select("id")
      .single();
    expect(carpool2).not.toBeNull();

    const c = await clientFor(club.player2WithParent.parent);
    const { error } = await c.from("carpool_passengers").insert({
      carpool_id: carpool2!.id,
      passenger_user_id: club.player2WithParent.parent.userId,
      player_ids: [club.player2WithParent.id],
    });
    expect(error).not.toBeNull();
    expect(error?.message).toContain("already_booked_in_another_carpool");

    await admin.from("carpools").delete().eq("id", carpool2!.id);
  });

  // ── 8. Les membres de l'équipe peuvent lire les carpools ───────────────
  test("team members can read carpools", async () => {
    const c = await clientFor(club.coach);
    const { data, error } = await c
      .from("carpools")
      .select("id")
      .eq("event_id", awayEventId);
    expect(error).toBeNull();
    expect((data?.length ?? 0)).toBeGreaterThan(0);
  });

  // ── 9. Utilisateur anon ne voit rien (RLS) ─────────────────────────────
  test("anonymous user cannot read carpools (RLS)", async () => {
    const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false },
    });
    const { data } = await anonClient
      .from("carpools")
      .select("id")
      .eq("event_id", awayEventId);
    expect((data?.length ?? 0)).toBe(0);
  });

  // ── 6. Un parent signale un besoin de transport ─────────────────────────
  test("parent can declare a transport need", async () => {
    // Annuler la réservation existante du parent
    await admin
      .from("carpool_passengers")
      .delete()
      .eq("passenger_user_id", club.player2WithParent.parent.userId);

    const c = await clientFor(club.player2WithParent.parent);
    const { data, error } = await c
      .from("carpool_needs")
      .insert({
        event_id: awayEventId,
        parent_user_id: club.player2WithParent.parent.userId,
        player_ids: [club.player2WithParent.id],
        note: "Pas de voiture ce jour-là",
      })
      .select("id, player_ids, note")
      .single();
    expect(error).toBeNull();
    expect(data?.player_ids).toContain(club.player2WithParent.id);
  });

  // ── 7. Réservation supprime le besoin (trigger) ─────────────────────────
  test("booking a seat auto-removes transport need (trigger)", async () => {
    const { data: needBefore } = await admin
      .from("carpool_needs")
      .select("id")
      .eq("event_id", awayEventId)
      .eq("parent_user_id", club.player2WithParent.parent.userId)
      .maybeSingle();
    expect(needBefore).not.toBeNull();

    const c = await clientFor(club.player2WithParent.parent);
    const { error } = await c.from("carpool_passengers").insert({
      carpool_id: coachCarpoolId,
      passenger_user_id: club.player2WithParent.parent.userId,
      player_ids: [club.player2WithParent.id],
    });
    expect(error).toBeNull();

    const { data: needAfter } = await admin
      .from("carpool_needs")
      .select("id")
      .eq("event_id", awayEventId)
      .eq("parent_user_id", club.player2WithParent.parent.userId)
      .maybeSingle();
    expect(needAfter).toBeNull();
  });

  // ── 11. Un parent peut annuler sa réservation ───────────────────────────
  test("parent can cancel their booking", async () => {
    const c = await clientFor(club.player2WithParent.parent);
    const { data: booking } = await c
      .from("carpool_passengers")
      .select("id")
      .eq("passenger_user_id", club.player2WithParent.parent.userId)
      .maybeSingle();
    expect(booking).not.toBeNull();

    const { error } = await c
      .from("carpool_passengers")
      .delete()
      .eq("id", booking!.id);
    expect(error).toBeNull();
  });

  // ── 10. Le coach peut supprimer n'importe quelle proposition ────────────
  // Fix : créer le carpool du "parent conducteur" via admin pour éviter
  // les problèmes de RLS club_members sur le client parent
  test("coach can delete any carpool offer", async () => {
    const { data: parentCarpool } = await admin
      .from("carpools")
      .insert({
        event_id: awayEventId,
        driver_user_id: club.player2WithParent.parent.userId,
        driver_name: "Parent Conducteur",
        vehicle_type: "car",
        total_seats: 2,
      })
      .select("id")
      .single();
    expect(parentCarpool).not.toBeNull();

    const c = await clientFor(club.coach);
    const { error } = await c
      .from("carpools")
      .delete()
      .eq("id", parentCarpool!.id);
    expect(error).toBeNull();

    const { data: afterDelete } = await admin
      .from("carpools")
      .select("id")
      .eq("id", parentCarpool!.id)
      .maybeSingle();
    expect(afterDelete).toBeNull();
  });

  // ── Contrainte : total_seats > 8 rejeté ────────────────────────────────
  test("carpool rejects invalid seat count (> 8)", async () => {
    const c = await clientFor(club.coach);
    const { error } = await c.from("carpools").insert({
      event_id: awayEventId,
      driver_user_id: club.coach.userId,
      driver_name: "Test",
      vehicle_type: "car",
      total_seats: 99,
    });
    expect(error).not.toBeNull();
  });

  // ── Contrainte : vehicle_type invalide ─────────────────────────────────
  test("carpool rejects invalid vehicle_type", async () => {
    const c = await clientFor(club.coach);
    const { error } = await c.from("carpools").insert({
      event_id: awayEventId,
      driver_user_id: club.coach.userId,
      driver_name: "Test",
      vehicle_type: "bus",
      total_seats: 3,
    });
    expect(error).not.toBeNull();
  });

  // ── UNIQUE(event_id, driver_user_id) ────────────────────────────────────
  // Fix : le coach a son carpool (coachCarpoolId) depuis le test 2.
  // On tente un 2e insert immédiatement — la contrainte doit bloquer.
  test("driver cannot offer two carpools for same event", async () => {
    const c = await clientFor(club.coach);
    const { error } = await c.from("carpools").insert({
      event_id: awayEventId,
      driver_user_id: club.coach.userId,
      driver_name: "Coach Test 2",
      vehicle_type: "car",
      total_seats: 2,
    });
    expect(error).not.toBeNull();
  });
});
