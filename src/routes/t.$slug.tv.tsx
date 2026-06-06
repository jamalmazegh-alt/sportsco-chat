import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/t/$slug/tv")({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/tournament/$slug/tv",
      params: { slug: params.slug },
      replace: true,
    });
  },
  component: () => null,
});
