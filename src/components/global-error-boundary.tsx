import { Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Sentry } from "@/lib/sentry";

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
  const { t } = useTranslation("common");
  useEffect(() => {
    if (error) Sentry.captureException(error);
  }, [error]);
  return (
    <div className="min-h-[60vh] flex items-center justify-center px-6 py-12">
      <div className="max-w-md w-full text-center space-y-4">
        <div className="mx-auto h-12 w-12 rounded-full bg-destructive/10 flex items-center justify-center">
          <AlertTriangle className="h-6 w-6 text-destructive" />
        </div>
        <h1 className="text-xl font-semibold">{t("common.errorTitle")}</h1>
        <p className="text-sm text-muted-foreground">
          {t("common.errorSubtitle")}
        </p>
        {isDev && error?.message ? (
          <pre className="text-left text-xs bg-muted rounded-md p-3 overflow-auto max-h-48">
            {error.message}
          </pre>
        ) : null}
        <div className="flex gap-2 justify-center pt-2">
          {reset ? (
            <Button variant="outline" onClick={() => reset()}>
              {t("common.retry")}
            </Button>
          ) : null}
          <Button asChild>
            <Link to="/">{t("nav.home")}</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
