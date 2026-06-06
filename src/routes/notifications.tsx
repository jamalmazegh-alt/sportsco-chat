import { createFileRoute, redirect } from "@tanstack/react-router";

/** No dedicated notifications page yet — in-app feed is surfaced on /home. */
export const Route = createFileRoute("/notifications")({
  beforeLoad: () => {
    throw redirect({ to: "/home", replace: true });
  },
  component: () => null,
});
