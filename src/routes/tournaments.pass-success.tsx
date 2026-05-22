import { createFileRoute, Link } from "@tanstack/react-router";
import { CheckCircle2, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MarketingLayout } from "@/components/marketing/MarketingLayout";

export const Route = createFileRoute("/tournaments/pass-success")({
  component: PassSuccessPage,
  head: () => ({
    meta: [
      { title: "Pass tournoi confirmé — Clubero" },
      { name: "robots", content: "noindex" },
    ],
  }),
});

function PassSuccessPage() {
  return (
    <MarketingLayout>
      <section className="mx-auto max-w-2xl px-5 py-20 text-center lg:py-28">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
          <CheckCircle2 className="h-9 w-9 text-primary" />
        </div>
        <h1 className="mt-6 font-display text-3xl font-bold tracking-tight sm:text-4xl">
          Pass tournoi confirmé
        </h1>
        <p className="mt-4 text-muted-foreground">
          Merci pour votre achat. Vous allez recevoir votre reçu par e-mail et un
          lien pour créer votre tournoi avec Clubero Tournaments.
        </p>
        <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
          <Button asChild className="h-11">
            <Link to="/register">
              <Trophy className="h-4 w-4" />
              Créer mon tournoi
            </Link>
          </Button>
          <Button asChild variant="outline" className="h-11">
            <Link to="/">Retour à l'accueil</Link>
          </Button>
        </div>
      </section>
    </MarketingLayout>
  );
}
