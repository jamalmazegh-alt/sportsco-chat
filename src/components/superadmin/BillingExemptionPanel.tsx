import { BillingExemptionActions, type BillingExemptionSub } from "./BillingExemptionActions";

export function BillingExemptionPanel({
  clubId,
  clubName,
  subscription,
  onUpdated,
}: {
  clubId: string;
  clubName: string;
  subscription: BillingExemptionSub | null | undefined;
  onUpdated: () => void;
}) {
  return (
    <section className="rounded-xl border border-border bg-card p-4 space-y-3">
      <BillingExemptionActions
        clubId={clubId}
        clubName={clubName}
        subscription={subscription}
        onUpdated={onUpdated}
      />
    </section>
  );
}
