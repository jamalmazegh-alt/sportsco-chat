import { lazy, Suspense, type ReactNode } from "react";
import { MarketingHeader } from "./MarketingHeader";
import { MarketingFooter } from "./MarketingFooter";
import { MarketingCtaBanner } from "./MarketingCtaBanner";

// Chargé à la demande : le widget démarre fermé — l'utilisateur ne voit qu'un
// bouton flottant — mais il tire `ai-elements/message`, donc `@streamdown/mermaid`
// et ses 2,5 Mo de bibliothèque de diagrammes. En import statique, ce poids
// entrait dans le chemin de démarrage de TOUTES les pages marketing, y compris
// l'écran d'entrée de l'application native, avant le premier rendu.
const MarketingChatWidget = lazy(() =>
  import("./MarketingChatWidget").then((m) => ({ default: m.MarketingChatWidget })),
);

export function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <MarketingHeader />
      <main className="flex-1">{children}</main>
      <MarketingCtaBanner />
      <MarketingFooter />
      {/* Pas de repli visuel : le widget n'est qu'un bouton flottant, son
          apparition différée de quelques centaines de millisecondes passe
          inaperçue, là où un squelette attirerait l'œil pour rien. */}
      <Suspense fallback={null}>
        <MarketingChatWidget />
      </Suspense>
    </div>
  );
}
