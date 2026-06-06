import { createFileRoute, redirect } from "@tanstack/react-router";

/** Legacy QA/docs URL — club creation is gated in /_authenticated (NoMembershipScreen). */
export const Route = createFileRoute("/club/create")({
  beforeLoad: () => {
    throw redirect({ to: "/home", replace: true });
  },
  component: () => null,
});
