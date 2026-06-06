import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/t/$slug/register")({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/tournament/$slug/register",
      params: { slug: params.slug },
      replace: true,
    });
  },
  component: () => null,
});
