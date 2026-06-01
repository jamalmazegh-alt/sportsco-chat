/**
 * Vitest global setup — runs ONCE before any RLS test file.
 *
 * Seeds 8 users (2 clubs × {admin, coach, player, parent (clubA only)} +
 * 1 superadmin) plus the minimum domain rows needed by the suites. Persists
 * all IDs to a temp JSON so tests can read them via _setup.getFixtures().
 *
 * The returned teardown deletes everything by RUN_ID — even if individual
 * tests fail, cleanup runs.
 */
import { writeFileSync, existsSync, unlinkSync } from "fs";
import { admin } from "./_admin";
import { fixturesPath, PASSWORD, type Fixtures, type Role, type UserFixture } from "./_setup";

const RUN_ID = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const PREFIX = `__rls_${RUN_ID}`;

const ROLES: Role[] = [
  "adminA",
  "coachA",
  "playerA",
  "parentA",
  "adminB",
  "coachB",
  "playerB",
  "superadmin",
];

async function createUser(role: Role): Promise<UserFixture> {
  const email = `${PREFIX}_${role}@clubero-rls.test`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { rls_test_run: RUN_ID, role },
  });
  if (error || !data.user) {
    throw new Error(`createUser(${role}) failed: ${error?.message ?? "no user"}`);
  }
  return { email, password: PASSWORD, userId: data.user.id };
}

async function seedAll(): Promise<Fixtures> {
  // 1. Users
  const users: Record<string, UserFixture> = {};
  for (const role of ROLES) {
    users[role] = await createUser(role);
  }

  // 2. Profiles (no auto-create trigger detected — insert manually)
  const profileRows = ROLES.map((role) => ({
    id: users[role].userId,
    full_name: `RLS Test ${role}`,
    first_name: "RLS",
    last_name: role,
  }));
  {
    const { error } = await admin.from("profiles").upsert(profileRows);
    if (error) throw new Error(`profiles upsert: ${error.message}`);
  }

  // 3. Super-admin row
  {
    const { error } = await admin
      .from("super_admins")
      .insert({ user_id: users.superadmin.userId });
    if (error) throw new Error(`super_admins insert: ${error.message}`);
  }

  // 4. Two clubs
  const { data: clubs, error: clubsErr } = await admin
    .from("clubs")
    .insert([
      { name: `${PREFIX}_clubA`, created_by: users.adminA.userId },
      { name: `${PREFIX}_clubB`, created_by: users.adminB.userId },
    ])
    .select("id, name");
  if (clubsErr || !clubs) throw new Error(`clubs insert: ${clubsErr?.message}`);
  const clubA = clubs.find((c) => c.name === `${PREFIX}_clubA`)!.id;
  const clubB = clubs.find((c) => c.name === `${PREFIX}_clubB`)!.id;

  // 5. club_members
  {
    // NOTE: club_members has BOTH `role` (single enum, legacy) AND `roles` (text[]).
    // RLS helpers like `has_club_role` check the `roles` array, while `is_team_coach`
    // checks the single `role`. Populate both to satisfy every policy path.
    const { error } = await admin.from("club_members").insert([
      { club_id: clubA, user_id: users.adminA.userId, role: "admin", roles: ["admin"] },
      { club_id: clubA, user_id: users.coachA.userId, role: "coach", roles: ["coach"] },
      { club_id: clubA, user_id: users.playerA.userId, role: "player", roles: ["player"] },
      { club_id: clubA, user_id: users.parentA.userId, role: "parent", roles: ["parent"] },
      { club_id: clubB, user_id: users.adminB.userId, role: "admin", roles: ["admin"] },
      { club_id: clubB, user_id: users.coachB.userId, role: "coach", roles: ["coach"] },
      { club_id: clubB, user_id: users.playerB.userId, role: "player", roles: ["player"] },
    ]);
    if (error) throw new Error(`club_members insert: ${error.message}`);
  }

  // 6. Teams (one per club)
  const { data: teams, error: teamsErr } = await admin
    .from("teams")
    .insert([
      { club_id: clubA, name: `${PREFIX}_teamA`, sport: "football" },
      { club_id: clubB, name: `${PREFIX}_teamB`, sport: "football" },
    ])
    .select("id, club_id");
  if (teamsErr || !teams) throw new Error(`teams insert: ${teamsErr?.message}`);
  const teamA = teams.find((t) => t.club_id === clubA)!.id;
  const teamB = teams.find((t) => t.club_id === clubB)!.id;

  // 7. Players (one per club, linked to player user)
  const { data: players, error: playersErr } = await admin
    .from("players")
    .insert([
      {
        club_id: clubA,
        first_name: "Player",
        last_name: "A",
        user_id: users.playerA.userId,
      },
      {
        club_id: clubB,
        first_name: "Player",
        last_name: "B",
        user_id: users.playerB.userId,
      },
    ])
    .select("id, club_id");
  if (playersErr || !players) throw new Error(`players insert: ${playersErr?.message}`);
  const playerA = players.find((p) => p.club_id === clubA)!.id;
  const playerB = players.find((p) => p.club_id === clubB)!.id;

  // 8. team_members
  {
    const { error } = await admin.from("team_members").insert([
      { team_id: teamA, player_id: playerA, user_id: users.playerA.userId, role: "player" },
      { team_id: teamA, user_id: users.coachA.userId, role: "coach" },
      { team_id: teamB, player_id: playerB, user_id: users.playerB.userId, role: "player" },
      { team_id: teamB, user_id: users.coachB.userId, role: "coach" },
    ]);
    if (error) throw new Error(`team_members insert: ${error.message}`);
  }

  // 9. player_parents (parentA → playerA)
  {
    const { error } = await admin.from("player_parents").insert({
      player_id: playerA,
      parent_user_id: users.parentA.userId,
      can_respond: true,
    });
    if (error) throw new Error(`player_parents insert: ${error.message}`);
  }

  // 10. Subscriptions — must exist BEFORE events because a trigger enforces
  // `club_has_active_subscription` on events insert. Use trialing with a
  // future trial_end so the helper returns true.
  async function ensureSubscription(clubId: string): Promise<string> {
    const trialEnd = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString();
    const { data, error } = await admin
      .from("subscriptions")
      .upsert(
        { club_id: clubId, status: "trialing", trial_end: trialEnd },
        { onConflict: "club_id" },
      )
      .select("id")
      .single();
    if (error || !data) {
      const { data: existing } = await admin
        .from("subscriptions")
        .select("id")
        .eq("club_id", clubId)
        .maybeSingle();
      if (!existing) throw new Error(`subscriptions ensure: ${error?.message}`);
      return existing.id;
    }
    return data.id;
  }
  const subscriptionA = await ensureSubscription(clubA);
  const subscriptionB = await ensureSubscription(clubB);

  // 11. Events (one per team, in the future)
  const future = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
  const { data: events, error: eventsErr } = await admin
    .from("events")
    .insert([
      {
        team_id: teamA,
        title: `${PREFIX}_eventA`,
        starts_at: future,
        type: "training",
        created_by: users.coachA.userId,
        status: "published",
      },
      {
        team_id: teamB,
        title: `${PREFIX}_eventB`,
        starts_at: future,
        type: "training",
        created_by: users.coachB.userId,
        status: "published",
      },
    ])
    .select("id, team_id");
  if (eventsErr || !events) throw new Error(`events insert: ${eventsErr?.message}`);
  const eventA = events.find((e) => e.team_id === teamA)!.id;
  const eventB = events.find((e) => e.team_id === teamB)!.id;

  // 11. Convocation (playerA in eventA)
  const { data: convocs, error: convErr } = await admin
    .from("convocations")
    .insert({ event_id: eventA, player_id: playerA, status: "pending" })
    .select("id")
    .single();
  if (convErr || !convocs) throw new Error(`convocations insert: ${convErr?.message}`);
  const convocationA = convocs.id;

  // 12. Notification (owned by adminA)
  const { data: notif, error: notifErr } = await admin
    .from("notifications")
    .insert({
      user_id: users.adminA.userId,
      type: "system",
      title: `${PREFIX}_notif`,
    })
    .select("id")
    .single();
  if (notifErr || !notif) throw new Error(`notifications insert: ${notifErr?.message}`);
  const notificationA = notif.id;






  // 14. Support tickets (one from adminA, one from playerA)
  const { data: tickets, error: ticketsErr } = await admin
    .from("support_tickets")
    .insert([
      {
        user_id: users.adminA.userId,
        club_id: clubA,
        subject: `${PREFIX}_ticketAdminA`,
        description: "Test ticket from adminA",
      },
      {
        user_id: users.playerA.userId,
        club_id: clubA,
        subject: `${PREFIX}_ticketPlayerA`,
        description: "Test ticket from playerA",
      },
    ])
    .select("id, user_id");
  if (ticketsErr || !tickets) throw new Error(`support_tickets insert: ${ticketsErr?.message}`);
  const ticketA = tickets.find((t) => t.user_id === users.adminA.userId)!.id;
  const ticketSuperOnly = tickets.find((t) => t.user_id === users.playerA.userId)!.id;

  // 15. Support message (in ticketA, from adminA)
  const { data: msg, error: msgErr } = await admin
    .from("support_messages")
    .insert({
      ticket_id: ticketA,
      sender_id: users.adminA.userId,
      sender_role: "user",
      body: "First message",
    })
    .select("id")
    .single();
  if (msgErr || !msg) throw new Error(`support_messages insert: ${msgErr?.message}`);
  const messageA = msg.id;

  // 16. Data export request (adminA)
  const { data: exp, error: expErr } = await admin
    .from("data_export_requests")
    .insert({ user_id: users.adminA.userId })
    .select("id")
    .single();
  if (expErr || !exp) throw new Error(`data_export_requests insert: ${expErr?.message}`);
  const exportRequestA = exp.id;

  // 17. Account deletion request (adminA)
  const { data: del, error: delErr } = await admin
    .from("account_deletion_requests")
    .insert({ user_id: users.adminA.userId })
    .select("id")
    .single();
  if (delErr || !del) throw new Error(`account_deletion_requests insert: ${delErr?.message}`);
  const deletionRequestA = del.id;

  // 18. Audit log (adminA, scoped to clubA)
  const { data: aud, error: audErr } = await admin
    .from("audit_logs")
    .insert({
      actor_user_id: users.adminA.userId,
      club_id: clubA,
      action: "test_seed",
      entity_type: "club",
      entity_id: clubA,
    })
    .select("id")
    .single();
  if (audErr || !aud) throw new Error(`audit_logs insert: ${audErr?.message}`);
  const auditLogA = aud.id;

  // 19. Payments — seasons, item, obligations, transaction, settings
  const today = new Date();
  const startDate = `${today.getUTCFullYear()}-01-01`;
  const endDate = `${today.getUTCFullYear()}-12-31`;
  const { data: seasonsRows, error: seasonsErr } = await admin
    .from("seasons")
    .insert([
      { club_id: clubA, label: `${PREFIX}_seasonA`, start_date: startDate, end_date: endDate, is_current: true },
      { club_id: clubB, label: `${PREFIX}_seasonB`, start_date: startDate, end_date: endDate, is_current: true },
    ])
    .select("id, club_id");
  if (seasonsErr || !seasonsRows) throw new Error(`seasons insert: ${seasonsErr?.message}`);
  const seasonA = seasonsRows.find((s) => s.club_id === clubA)!.id;
  const seasonB = seasonsRows.find((s) => s.club_id === clubB)!.id;

  const { data: piRow, error: piErr } = await admin
    .from("payment_items")
    .insert({
      club_id: clubA,
      season_id: seasonA,
      type: "membership",
      title: `${PREFIX}_itemA`,
      amount_cents: 10000,
      provider: "stripe",
      created_by: users.adminA.userId,
    })
    .select("id")
    .single();
  if (piErr || !piRow) throw new Error(`payment_items insert: ${piErr?.message}`);
  const paymentItemA = piRow.id;

  const { data: poRows, error: poErr } = await admin
    .from("payment_obligations")
    .insert([
      {
        payment_item_id: paymentItemA,
        club_id: clubA,
        player_id: playerA,
        payer_user_id: users.parentA.userId,
        amount_due_cents: 10000,
      },
    ])
    .select("id")
    .single();
  if (poErr || !poRows) throw new Error(`payment_obligations A insert: ${poErr?.message}`);
  const obligationA = poRows.id;

  // obligationB: clubB needs its own item first
  const { data: piB, error: piBErr } = await admin
    .from("payment_items")
    .insert({
      club_id: clubB,
      season_id: seasonB,
      type: "membership",
      title: `${PREFIX}_itemB`,
      amount_cents: 5000,
      provider: "stripe",
      created_by: users.adminB.userId,
    })
    .select("id")
    .single();
  if (piBErr || !piB) throw new Error(`payment_items B insert: ${piBErr?.message}`);
  const { data: poB, error: poBErr } = await admin
    .from("payment_obligations")
    .insert({
      payment_item_id: piB.id,
      club_id: clubB,
      player_id: playerB,
      amount_due_cents: 5000,
    })
    .select("id")
    .single();
  if (poBErr || !poB) throw new Error(`payment_obligations B insert: ${poBErr?.message}`);
  const obligationB = poB.id;

  const { data: txRow, error: txErr } = await admin
    .from("payment_transactions")
    .insert({
      obligation_id: obligationA,
      club_id: clubA,
      method: "cash",
      status: "succeeded",
      amount_gross_cents: 5000,
      amount_net_cents: 5000,
    })
    .select("id")
    .single();
  if (txErr || !txRow) throw new Error(`payment_transactions insert: ${txErr?.message}`);
  const transactionA = txRow.id;

  {
    const { error } = await admin
      .from("club_payment_settings")
      .upsert({ club_id: clubA, platform_fee_bps: 0 }, { onConflict: "club_id" });
    if (error) throw new Error(`club_payment_settings insert: ${error.message}`);
  }
  const paymentSettingsA = clubA;

  return {
    runId: RUN_ID,
    users: users as Fixtures["users"],
    clubA,
    clubB,
    teamA,
    teamB,
    playerA,
    playerB,
    eventA,
    eventB,
    convocationA,
    notificationA,
    subscriptionA,
    subscriptionB,
    ticketA,
    ticketSuperOnly,
    messageA,
    exportRequestA,
    deletionRequestA,
    auditLogA,
    seasonA,
    seasonB,
    paymentItemA,
    obligationA,
    obligationB,
    transactionA,
    paymentSettingsA,
  };
}

async function teardownAll(fx: Fixtures) {
  // Most child rows cascade via club_id / event_id ownership chains, but we
  // delete explicitly to avoid relying on ON DELETE CASCADE we don't control.

  await admin.from("support_messages").delete().eq("ticket_id", fx.ticketA);
  await admin
    .from("support_tickets")
    .delete()
    .in("id", [fx.ticketA, fx.ticketSuperOnly]);
  await admin.from("audit_logs").delete().eq("id", fx.auditLogA);
  await admin.from("data_export_requests").delete().eq("id", fx.exportRequestA);
  await admin
    .from("account_deletion_requests")
    .delete()
    .eq("id", fx.deletionRequestA);
  await admin.from("notifications").delete().eq("id", fx.notificationA);
  await admin
    .from("subscriptions")
    .delete()
    .in("id", [fx.subscriptionA, fx.subscriptionB]);
  await admin
    .from("convocations")
    .delete()
    .in("event_id", [fx.eventA, fx.eventB]);
  await admin.from("events").delete().in("id", [fx.eventA, fx.eventB]);
  await admin
    .from("team_members")
    .delete()
    .in("team_id", [fx.teamA, fx.teamB]);
  await admin
    .from("player_parents")
    .delete()
    .eq("parent_user_id", fx.users.parentA.userId);
  await admin.from("players").delete().in("id", [fx.playerA, fx.playerB]);
  await admin.from("teams").delete().in("id", [fx.teamA, fx.teamB]);
  await admin.from("club_members").delete().in("club_id", [fx.clubA, fx.clubB]);
  await admin.from("clubs").delete().in("id", [fx.clubA, fx.clubB]);
  await admin
    .from("super_admins")
    .delete()
    .eq("user_id", fx.users.superadmin.userId);

  // Profiles + auth users last
  const userIds = Object.values(fx.users).map((u) => u.userId);
  await admin.from("profiles").delete().in("id", userIds);
  for (const uid of userIds) {
    await admin.auth.admin.deleteUser(uid).catch(() => {
      /* best effort */
    });
  }
}

export default async function () {
  // eslint-disable-next-line no-console
  console.log(`[rls] Seeding fixtures (run ${RUN_ID})...`);
  const fx = await seedAll();
  writeFileSync(fixturesPath(), JSON.stringify(fx, null, 2));
  // eslint-disable-next-line no-console
  console.log(`[rls] Seed complete. Fixtures at ${fixturesPath()}.`);

  return async () => {
    // eslint-disable-next-line no-console
    console.log(`[rls] Tearing down fixtures (run ${RUN_ID})...`);
    try {
      await teardownAll(fx);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error(`[rls] Teardown error:`, e);
    }
    if (existsSync(fixturesPath())) unlinkSync(fixturesPath());
    // eslint-disable-next-line no-console
    console.log(`[rls] Teardown complete.`);
  };
}
