import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/admin/users/$userId")({
  component: () => <Navigate to="/admin/users" replace />,
});
