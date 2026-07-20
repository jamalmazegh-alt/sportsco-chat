import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Bell, Smartphone, Zap } from "lucide-react";
import { InstallAppButton } from "@/components/pwa/InstallAppButton";

export const Route = createFileRoute("/install")({
  head: () => ({
    meta: [
      { title: "Installer Clubero sur votre téléphone" },
      {
        name: "description",
        content:
          "Installez Clubero en un tap sur iPhone ou Android pour recevoir vos convocations, rappels et notifications en temps réel.",
      },
      { property: "og:title", content: "Installer Clubero sur votre téléphone" },
      {
        property: "og:description",
        content:
          "Convocations, présences et rappels en temps réel — installez Clubero sur votre écran d'accueil.",
      },
    ],
  }),
  component: InstallPage,
});

function InstallPage() {
  return (
    <div className="min-h-dvh bg-gradient-to-b from-[#070D1B] to-[#0B1730] text-white">
      <div className="mx-auto max-w-lg px-5 pt-6 pb-16">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-sm text-white/70 hover:text-white transition"
        >
          <ArrowLeft className="h-4 w-4" /> Retour
        </Link>

        <div className="mt-8 text-center">
          <div className="mx-auto h-16 w-16 rounded-2xl bg-gradient-to-br from-[#1d7a45] to-[#15583a] flex items-center justify-center shadow-lg">
            <Smartphone className="h-8 w-8 text-white" />
          </div>
          <h1 className="mt-5 text-2xl font-bold">Installer Clubero</h1>
          <p className="mt-2 text-sm text-white/70">
            L'app s'installe en 1 tap depuis votre navigateur — pas besoin de passer par l'App Store
            ou Google Play.
          </p>
        </div>

        <div className="mt-8 flex justify-center">
          <InstallAppButton alwaysShow label="Installer sur mon téléphone" className="px-6 py-3" />
        </div>

        <ul className="mt-10 space-y-4">
          <li className="flex gap-3">
            <span className="h-9 w-9 shrink-0 rounded-lg bg-white/10 flex items-center justify-center">
              <Bell className="h-4 w-4 text-emerald-300" />
            </span>
            <div>
              <p className="text-sm font-semibold">Notifications en temps réel</p>
              <p className="text-xs text-white/60 mt-0.5">
                Convocations, rappels et messages coach dès qu'ils sont envoyés.
              </p>
            </div>
          </li>
          <li className="flex gap-3">
            <span className="h-9 w-9 shrink-0 rounded-lg bg-white/10 flex items-center justify-center">
              <Zap className="h-4 w-4 text-emerald-300" />
            </span>
            <div>
              <p className="text-sm font-semibold">Ouverture instantanée</p>
              <p className="text-xs text-white/60 mt-0.5">
                Une icône sur l'écran d'accueil, comme une vraie app.
              </p>
            </div>
          </li>
          <li className="flex gap-3">
            <span className="h-9 w-9 shrink-0 rounded-lg bg-white/10 flex items-center justify-center">
              <Smartphone className="h-4 w-4 text-emerald-300" />
            </span>
            <div>
              <p className="text-sm font-semibold">iPhone &amp; Android</p>
              <p className="text-xs text-white/60 mt-0.5">
                Compatible Safari (iOS 16.4+) et Chrome / Edge / Samsung Internet sur Android.
              </p>
            </div>
          </li>
        </ul>

        <div className="mt-10 rounded-xl border border-white/10 bg-white/5 p-4 text-xs text-white/70">
          <p className="font-semibold text-white mb-1">Déjà installée ?</p>
          <p>
            Ouvrez Clubero depuis l'icône sur votre écran d'accueil pour activer les notifications.
          </p>
        </div>
      </div>
    </div>
  );
}
