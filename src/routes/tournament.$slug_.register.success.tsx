import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { CheckCircle2, Loader2, Trophy } from "lucide-react";
import i18n from "@/lib/i18n";
import { confirmRegistrationSession } from "@/modules/tournaments/tournament-payments.functions";

export const Route = createFileRoute("/tournament/$slug_/register/success")({
  validateSearch: (s: Record<string, unknown>) => ({
    session_id:
      typeof s.session_id === "string" && s.session_id.length >= 8
        ? s.session_id
        : undefined,
  }),
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
  const { session_id: sessionId } = Route.useSearch();
  const { t } = useTranslation("tournaments");
  const confirmFn = useServerFn(confirmRegistrationSession);
  const [settling, setSettling] = useState(!!sessionId);
  const [settled, setSettled] = useState(false);

  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    let attempts = 0;

    async function settle() {
      while (!cancelled && attempts < 12) {
        attempts += 1;
        try {
          const res = await confirmFn({ data: { session_id: sessionId! } });
          if (res.paid) {
            if (!cancelled) {
              setSettled(true);
              setSettling(false);
            }
            return;
          }
        } catch {
          /* retry — Stripe or DB may still be catching up */
        }
        await new Promise((r) => setTimeout(r, 2000));
      }
      if (!cancelled) setSettling(false);
    }

    void settle();
    return () => {
      cancelled = true;
    };
  }, [sessionId, confirmFn]);

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="max-w-md text-center space-y-4">
        <div className="mx-auto h-16 w-16 rounded-full bg-emerald-500/15 flex items-center justify-center">
          {settling && !settled ? (
            <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
          ) : (
            <CheckCircle2 className="h-8 w-8 text-emerald-600" />
          )}
        </div>
        <h1 className="text-2xl font-semibold">{t("register.success.title")}</h1>
        <p className="text-sm text-muted-foreground">
          {settling && !settled
            ? t("register.success.settling", {
                defaultValue:
                  "Paiement reçu — finalisation de votre inscription…",
              })
            : t("register.success.body")}
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
