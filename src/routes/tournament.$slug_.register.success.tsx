import { createFileRoute, Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { CheckCircle2, Trophy } from "lucide-react";
import i18n from "@/lib/i18n";

export const Route = createFileRoute("/tournament/$slug_/register/success")({
  component: RegisterSuccessPage,
  head: ({ params }) => ({
    meta: [
      {
        title: i18n.t("register.success.metaTitle", {
          ns: "tournaments",
          slug: params.slug,
        }),
      },
    ],
  }),
});

function RegisterSuccessPage() {
  const { slug } = Route.useParams();
  const { t } = useTranslation("tournaments");

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="max-w-md text-center space-y-4">
        <div className="mx-auto h-16 w-16 rounded-full bg-emerald-500/15 flex items-center justify-center">
          <CheckCircle2 className="h-8 w-8 text-emerald-600" />
        </div>
        <h1 className="text-2xl font-semibold">{t("register.success.title")}</h1>
        <p className="text-sm text-muted-foreground">
          {t("register.success.body")}
        </p>
        <Link
          to="/tournament/$slug"
          params={{ slug }}
          className="inline-flex items-center gap-2 text-sm text-primary underline"
        >
          <Trophy className="h-4 w-4" />
          {t("register.backTournament")}
        </Link>
      </div>
    </div>
  );
}
