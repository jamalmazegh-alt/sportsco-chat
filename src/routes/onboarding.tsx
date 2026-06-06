import { createFileRoute, redirect } from "@tanstack/react-router";

/** Legacy QA/docs URL — club setup lives in /_authenticated when memberships is empty. */
export const Route = createFileRoute("/onboarding")({
  beforeLoad: () => {
    throw redirect({ to: "/home", replace: true });
  },
  component: () => null,
});
