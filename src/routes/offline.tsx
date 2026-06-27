import { createFileRoute } from "@tanstack/react-router";
import cluberoLogo from "@/assets/clubero-logo.png";

export const Route = createFileRoute("/offline")({
  component: OfflinePage,
  head: () => ({
    meta: [
      { title: "Hors ligne — Clubero" },
      { name: "description", content: "Vous êtes hors ligne." },
      { name: "robots", content: "noindex" },
    ],
  }),
});

function OfflinePage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 bg-white text-center">
      <img src={cluberoLogo} alt="Clubero" className="h-20 w-auto mb-6" />
      <h1 className="text-2xl font-bold text-[#1d7a45] mb-2">Vous êtes hors ligne</h1>
      <p className="text-sm text-gray-600 max-w-sm">
        Reconnectez-vous à internet pour accéder à Clubero.
      </p>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="mt-8 px-5 py-2.5 rounded-xl bg-gradient-to-br from-[#1d7a45] to-[#15583a] text-white text-sm font-semibold shadow-md hover:opacity-90 transition"
      >
        Réessayer
      </button>
    </div>
  );
}
