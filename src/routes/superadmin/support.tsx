import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/superadmin/support")({
  component: () => (
    <div className="p-6 md:p-8 max-w-3xl">
      <h1 className="text-xl font-semibold">Support tools</h1>
      <p className="text-sm text-muted-foreground mt-1">
        Coming in Phase 4 — secure impersonation, read-only club data shortcuts,
        communication history.
      </p>
    </div>
  ),
});
