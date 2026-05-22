import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";

interface Props {
  error?: Error;
  reset?: () => void;
}

/**
 * Global fallback used as `defaultErrorComponent` on the router.
 * Keeps tone friendly and offers retry + home navigation. Avoids
 * leaking stack traces in production.
 */
export function GlobalErrorBoundary({ error, reset }: Props) {
  const isDev = import.meta.env.DEV;
  return (
    <div className="min-h-[60vh] flex items-center justify-center px-6 py-12">
      <div className="max-w-md w-full text-center space-y-4">
        <div className="mx-auto h-12 w-12 rounded-full bg-destructive/10 flex items-center justify-center">
          <AlertTriangle className="h-6 w-6 text-destructive" />
        </div>
        <h1 className="text-xl font-semibold">Une erreur est survenue</h1>
        <p className="text-sm text-muted-foreground">
          Quelque chose s'est mal passé. Vous pouvez réessayer ou revenir à l'accueil.
        </p>
        {isDev && error?.message ? (
          <pre className="text-left text-xs bg-muted rounded-md p-3 overflow-auto max-h-48">
            {error.message}
          </pre>
        ) : null}
        <div className="flex gap-2 justify-center pt-2">
          {reset ? (
            <Button variant="outline" onClick={() => reset()}>
              Réessayer
            </Button>
          ) : null}
          <Button asChild>
            <Link to="/">Accueil</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
