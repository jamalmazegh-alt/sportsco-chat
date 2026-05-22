import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/t/$slug")({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/tournament/$slug",
      params: { slug: params.slug },
      replace: true,
    });
  },
  component: () => null,
});
