import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  createRootRouteWithContext,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider } from "@/lib/auth-context";
import "@/lib/i18n";

import appCss from "../styles.css?url";

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      {
        name: "viewport",
        content:
          "width=device-width, initial-scale=1, viewport-fit=cover, maximum-scale=1",
      },
      { title: "Clubero — Team coordination, made simple" },
      {
        name: "description",
        content:
          "Clubero is a fast, mobile-first app for sports clubs to coordinate events, convocations and attendance in seconds.",
      },
      { name: "theme-color", content: "#7cc142" },
      { property: "og:title", content: "Clubero — Team coordination, made simple" },
      {
        property: "og:description",
        content:
          "Stop chasing parents in WhatsApp. Convocations, attendance, and reminders in one tap.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:title", content: "Clubero — Team coordination, made simple" },
      { name: "description", content: "Playbook Chat simplifies sports team management with real-time, conversational communication." },
      { property: "og:description", content: "Playbook Chat simplifies sports team management with real-time, conversational communication." },
      { name: "twitter:description", content: "Playbook Chat simplifies sports team management with real-time, conversational communication." },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/722a5ec1-bb35-45af-afa2-b30c3e57afe5/id-preview-74904768--619b13f2-91ef-4dee-b96c-f49b38d86b39.lovable.app-1778759973155.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/722a5ec1-bb35-45af-afa2-b30c3e57afe5/id-preview-74904768--619b13f2-91ef-4dee-b96c-f49b38d86b39.lovable.app-1778759973155.png" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      {
        rel: "preconnect",
        href: "https://fonts.gstatic.com",
        crossOrigin: "anonymous",
      },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=DM+Sans:wght@500;600;700&family=Inter:wght@400;500;600;700&display=swap",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Outlet />
        <Toaster position="top-center" />
      </AuthProvider>
    </QueryClientProvider>
  );
}
