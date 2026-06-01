/**
 * RLS: payments — isolation cross-club.
 *
 * Verifies that finance rows from clubA are never readable / writable by
 * clubB users, that coaches (non financial_admin) don't see amounts, and
 * that payers only see their own obligation.
 */
import { describe, it } from "vitest";
import { signInAs } from "./_clients";
import { getFixtures } from "./_setup";
import {
  expectCanRead,
  expectNoAccess,
  expectInsertBlocked,
  expectUpdateBlocked,
} from "./_helpers";

describe("RLS: payments — isolation cross-club", () => {
  it("aucun user du club B ne lit les lignes financières du club A", async () => {
    const fx = getFixtures();
    for (const u of ["adminB", "coachB"] as const) {
      const c = await signInAs(u);
      await expectNoAccess(c, "payment_obligations", fx.obligationA);
      await expectNoAccess(c, "payment_transactions", fx.transactionA);
      await expectNoAccess(c, "payment_items", fx.paymentItemA);
      await expectNoAccess(c, "club_payment_settings", fx.paymentSettingsA, "club_id");
    }
  });

  it("le coach du club A ne voit PAS les montants (que le RPC booléen)", async () => {
    const fx = getFixtures();
    const c = await signInAs("coachA");
    await expectNoAccess(c, "payment_obligations", fx.obligationA);
    await expectNoAccess(c, "payment_transactions", fx.transactionA);
  });

  it("un parent ne voit que sa propre obligation", async () => {
    const fx = getFixtures();
    const c = await signInAs("parentA");
    await expectCanRead(c, "payment_obligations", fx.obligationA);
    await expectNoAccess(c, "payment_obligations", fx.obligationB);
  });

  it("adminB ne peut pas insérer une transaction sur le club A", async () => {
    const fx = getFixtures();
    const c = await signInAs("adminB");
    await expectInsertBlocked(c, "payment_transactions", {
      obligation_id: fx.obligationA,
      club_id: fx.clubA,
      method: "cash",
      status: "succeeded",
      amount_gross_cents: 1000,
      amount_net_cents: 1000,
      currency: "eur",
    });
  });

  it("adminB ne peut pas modifier la config paiement du club A", async () => {
    const fx = getFixtures();
    const c = await signInAs("adminB");
    await expectUpdateBlocked(
      c,
      "club_payment_settings",
      fx.paymentSettingsA,
      { platform_fee_bps: 999 },
      "club_id",
    );
  });
});
