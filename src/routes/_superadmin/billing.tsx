import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { listSubscriptions } from "@/lib/superadmin.functions";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/_superadmin/billing")({
  component: SuperAdminBilling,
});

type Sub = {
  id: string;
  club_id: string;
  club_name: string;
  status: string;
  plan: string | null;
  trial_end: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
};

function SuperAdminBilling() {
  const [items, setItems] = useState<Sub[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listSubscriptions({ data: { limit: 200 } })
      .then((r) => setItems(r.items as Sub[]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="p-6 md:p-8 max-w-7xl">
      <header className="mb-5">
        <h1 className="text-xl font-semibold">Billing & subscriptions</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          All Stripe subscriptions across the platform.
        </p>
      </header>

      <div className="rounded-lg border border-border overflow-hidden bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs text-muted-foreground">
            <tr>
              <th className="text-left font-medium px-3 py-2">Club</th>
              <th className="text-left font-medium px-3 py-2">Status</th>
              <th className="text-left font-medium px-3 py-2 hidden md:table-cell">Plan</th>
              <th className="text-left font-medium px-3 py-2 hidden md:table-cell">Trial end</th>
              <th className="text-left font-medium px-3 py-2 hidden md:table-cell">Period end</th>
              <th className="text-left font-medium px-3 py-2 hidden md:table-cell">Cancel?</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">
                <Loader2 className="h-4 w-4 inline animate-spin mr-2" /> Loading…
              </td></tr>
            )}
            {!loading && items.length === 0 && (
              <tr><td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">No subscriptions.</td></tr>
            )}
            {!loading && items.map((s) => (
              <tr key={s.id} className="border-t border-border">
                <td className="px-3 py-2">{s.club_name}</td>
                <td className="px-3 py-2 text-xs">{s.status}</td>
                <td className="px-3 py-2 hidden md:table-cell">{s.plan ?? "—"}</td>
                <td className="px-3 py-2 hidden md:table-cell text-muted-foreground">{s.trial_end ? new Date(s.trial_end).toLocaleDateString() : "—"}</td>
                <td className="px-3 py-2 hidden md:table-cell text-muted-foreground">{s.current_period_end ? new Date(s.current_period_end).toLocaleDateString() : "—"}</td>
                <td className="px-3 py-2 hidden md:table-cell">{s.cancel_at_period_end ? "yes" : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
