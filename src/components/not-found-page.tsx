import { Link, useRouter } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Compass, Home } from "lucide-react";

export function NotFoundPage() {
  const { t } = useTranslation("common");
  const router = useRouter();

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-6 py-12">
      <div className="max-w-md w-full text-center space-y-5">
        <div className="mx-auto h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center">
          <Compass className="h-7 w-7 text-primary" />
        </div>
        <div className="space-y-1">
          <p className="text-sm font-medium text-muted-foreground tracking-wider">
            {t("notFound.code")}
          </p>
          <h1 className="text-2xl font-semibold">{t("notFound.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("notFound.subtitle")}</p>
        </div>
        <div className="flex gap-2 justify-center pt-2">
          <Button variant="outline" onClick={() => router.history.back()}>
            {t("common.back")}
          </Button>
          <Button asChild>
            <Link to="/">
              <Home className="h-4 w-4 mr-1.5" />
              {t("nav.home")}
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
