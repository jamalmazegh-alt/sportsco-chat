import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/superadmin/settings")({
  component: () => (
    <div className="p-6 md:p-8 max-w-3xl">
      <h1 className="text-xl font-semibold">Platform settings</h1>
      <p className="text-sm text-muted-foreground mt-1">
        Coming soon — feature flags, super-admin roster, environment info.
      </p>
    </div>
  ),
});
