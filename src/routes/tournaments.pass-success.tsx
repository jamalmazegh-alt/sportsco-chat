import { createFileRoute, Link } from "@tanstack/react-router";
import { CheckCircle2, Trophy } from "lucide-react";
import { useTranslation } from "react-i18next";
import i18n from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { MarketingLayout } from "@/components/marketing/MarketingLayout";

export const Route = createFileRoute("/tournaments/pass-success")({
  component: PassSuccessPage,
  head: () => ({
    meta: [
      { title: i18n.t("passSuccess.metaTitle", { ns: "tournaments" }) },
      { name: "robots", content: "noindex" },
    ],
  }),
});

function PassSuccessPage() {
  const { t } = useTranslation("tournaments");
  return (
    <MarketingLayout>
      <section className="mx-auto max-w-2xl px-5 py-20 text-center lg:py-28">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
          <CheckCircle2 className="h-9 w-9 text-primary" />
        </div>
        <h1 className="mt-6 font-display text-3xl font-bold tracking-tight sm:text-4xl">
          {t("passSuccess.heading")}
        </h1>
        <p className="mt-4 text-muted-foreground">{t("passSuccess.body")}</p>
        <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
          <Button asChild className="h-11">
            <Link to="/register">
              <Trophy className="h-4 w-4" />
              {t("passSuccess.createAccount")}
            </Link>
          </Button>
          <Button asChild variant="outline" className="h-11">
            <Link to="/login">{t("passSuccess.haveAccount")}</Link>
          </Button>
        </div>
      </section>
    </MarketingLayout>
  );
}
