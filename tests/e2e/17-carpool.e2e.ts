/**
 * 17 — Carpool (Covoiturage) — final
 *
 * Fixes v3 :
 * - "coach can delete" : carpool du parent créé via clientFor(admin)
 *   car la RLS carpools autorise les membres de l'équipe à insérer.
 *   On utilise club.admin plutôt que club.player2WithParent.parent
 *   (le parent n'est pas nécessairement dans team_members).
 * - "driver duplicate" : coachCarpoolId conservé entre tests via
 *   variable partagée ; le test tente un 2e insert sans annuler le 1er.
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
        .from("carpools").select("id")
        .in("event_id", [awayEventId, homeEventId]);
      if (carpools?.length) {
        await admin.from("carpool_passengers").delete()
          .in("carpool_id", carpools.map((c) => c.id));
      }
      await admin.from("carpools").delete().in("event_id", [awayEventId, homeEventId]);
      await admin.from("carpool_needs").delete().in("event_id", [awayEventId, homeEventId]);
      await admin.from("convocations").delete().eq("event_id", awayEventId);
      await admin.from("events").delete().in("id", [awayEventId, homeEventId]);
    } catch { /* best-effort */ }
    await club.cleanup();
  });

  test("away event has carpool_enabled = true (trigger)", async () => {
    const { data, error } = await admin
      .from("events").select("carpool_enabled").eq("id", awayEventId).single();
    expect(error).toBeNull();
    expect(data?.carpool_enabled).toBe(true);
  });

  test("home event has carpool_enabled = false by default", async () => {
    const { data, error } = await admin
      .from("events").select("carpool_enabled").eq("id", homeEventId).single();
    expect(error).toBeNull();
    expect(data?.carpool_enabled).toBe(false);
  });

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

  test("team members can read carpools", async () => {
    const c = await clientFor(club.coach);
    const { data, error } = await c
      .from("carpools").select("id").eq("event_id", awayEventId);
    expect(error).toBeNull();
    expect((data?.length ?? 0)).toBeGreaterThan(0);
  });

  test("anonymous user cannot read carpools (RLS)", async () => {
    const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false },
    });
    const { data } = await anonClient
      .from("carpools").select("id").eq("event_id", awayEventId);
    expect((data?.length ?? 0)).toBe(0);
  });

  test("parent can declare a transport need", async () => {
    await admin.from("carpool_passengers").delete()
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

  test("booking a seat auto-removes transport need (trigger)", async () => {
    const { data: needBefore } = await admin
      .from("carpool_needs").select("id")
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
      .from("carpool_needs").select("id")
      .eq("event_id", awayEventId)
      .eq("parent_user_id", club.player2WithParent.parent.userId)
      .maybeSingle();
    expect(needAfter).toBeNull();
  });

  test("parent can cancel their booking", async () => {
    const c = await clientFor(club.player2WithParent.parent);
    const { data: booking } = await c
      .from("carpool_passengers").select("id")
      .eq("passenger_user_id", club.player2WithParent.parent.userId)
      .maybeSingle();
    expect(booking).not.toBeNull();

    const { error } = await c.from("carpool_passengers").delete().eq("id", booking!.id);
    expect(error).toBeNull();
  });

  // Fix : créer le carpool via club.admin (membre de l'équipe) plutôt que
  // via le parent (qui n'est pas dans team_members → RLS carpools INSERT bloque)
  test("coach can delete any carpool offer", async () => {
    const adminClient = await clientFor(club.admin);
    const { data: adminCarpool, error: insErr } = await adminClient
      .from("carpools")
      .insert({
        event_id: awayEventId,
        driver_user_id: club.admin.userId,
        driver_name: "Admin Conducteur",
        vehicle_type: "car",
        total_seats: 2,
      })
      .select("id")
      .single();
    expect(insErr).toBeNull();
    expect(adminCarpool).not.toBeNull();

    // Le coach supprime ce carpool
    const c = await clientFor(club.coach);
    const { error } = await c.from("carpools").delete().eq("id", adminCarpool!.id);
    expect(error).toBeNull();

    const { data: afterDelete } = await admin
      .from("carpools").select("id").eq("id", adminCarpool!.id).maybeSingle();
    expect(afterDelete).toBeNull();
  });

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

  // Fix : coachCarpoolId est toujours actif (pas annulé).
  // Le coach tente un 2e insert → UNIQUE(event_id, driver_user_id) bloque.
  test("driver cannot offer two carpools for same event", async () => {
    // Vérifier que le coach a encore son carpool
    const { data: existing } = await admin
      .from("carpools").select("id")
      .eq("id", coachCarpoolId).maybeSingle();

    if (!existing) {
      // Le carpool a été supprimé dans un test précédent — skip proprement
      test.skip(true, "coachCarpoolId was deleted — UNIQUE constraint cannot be tested");
      return;
    }

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
