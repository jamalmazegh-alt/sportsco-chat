import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import i18n from "@/lib/i18n";
import { Trophy, Loader2, ArrowLeft, Info } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { getPublicTournament } from "@/modules/tournaments/tournaments-public.functions";

export const Route = createFileRoute("/tournament/$slug_/register")({
  component: RegisterPage,
  head: ({ params }) => ({
    meta: [
      {
        title: i18n.t("register.metaTitle", {
          ns: "tournaments",
          slug: params.slug,
        }),
      },
    ],
  }),
});

function RegisterPage() {
  const { slug } = Route.useParams();
  const navigate = useNavigate();
  const { t } = useTranslation("tournaments");
  const fn = useServerFn(getPublicTournament);
  const q = useQuery({
    queryKey: ["public-tournament", slug],
    queryFn: () => fn({ data: { slug } }),
  });

  const [teamName, setTeamName] = useState("");
  const [shortName, setShortName] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (q.isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  const reg = (q.data?.tournament as any)?.settings?.registration ?? {};
  if (!q.data || !reg.enabled) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="text-center space-y-2 max-w-md">
          <Trophy className="h-10 w-10 mx-auto text-muted-foreground" />
          <p className="text-lg font-medium">{t("register.unavailableTitle")}</p>
          <p className="text-sm text-muted-foreground">{t("register.unavailableBody")}</p>
          <Link
            to="/tournament/$slug"
            params={{ slug }}
            className="text-sm text-primary underline"
          >
            {t("register.backTournament")}
          </Link>
        </div>
      </div>
    );
  }

  const now = Date.now();
  if (reg.opensAt && new Date(reg.opensAt).getTime() > now) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <p className="text-sm text-muted-foreground">
          {t("register.opensOn", {
            date: new Date(reg.opensAt).toLocaleString(),
          })}
        </p>
      </div>
    );
  }
  if (reg.closesAt && new Date(reg.closesAt).getTime() < now) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <p className="text-sm text-muted-foreground">{t("register.closed")}</p>
      </div>
    );
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!teamName.trim() || !contactName.trim() || !contactEmail.trim()) {
      toast.error(t("register.missingRequired"));
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/public/tournament-registration", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tournament_slug: slug,
          team_name: teamName.trim(),
          short_name: shortName.trim() || null,
          contact_name: contactName.trim(),
          contact_email: contactEmail.trim(),
          contact_phone: contactPhone.trim() || null,
          notes: notes.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error ?? t("common.error"));
        return;
      }
      if (data.checkout_url) {
        toast.success(t("register.redirectingToPayment"));
        window.location.href = data.checkout_url;
        return;
      }
      toast.success(
        data.requires_approval ? t("register.pending") : t("register.confirmed"),
      );
      // If we got a roster URL and the team is auto-approved, send them to the roster page directly
      if (data.roster_url && !data.requires_approval) {
        const path = new URL(data.roster_url).pathname;
        window.location.href = path;
        return;
      }
      navigate({ to: "/tournament/$slug", params: { slug } });
    } catch (err: any) {
      toast.error(err?.message ?? t("common.networkError"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-xl mx-auto p-5 pb-12">
      <Link
        to="/tournament/$slug"
        params={{ slug }}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-3"
      >
        <ArrowLeft className="h-4 w-4" />
        {t("register.backTournament")}
      </Link>
      <h1 className="text-2xl font-semibold mb-1">
        {t("register.heading", { name: q.data.tournament.name })}
      </h1>
      {reg.publicMessage && (
        <p className="text-sm text-muted-foreground mb-4">{reg.publicMessage}</p>
      )}

      <form onSubmit={onSubmit} className="space-y-4 mt-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2 space-y-1.5">
            <Label>{t("register.fields.teamName")}</Label>
            <Input
              value={teamName}
              onChange={(e) => setTeamName(e.target.value)}
              required
              maxLength={120}
            />
          </div>
          <div className="space-y-1.5">
            <Label>{t("register.fields.shortName")}</Label>
            <Input
              value={shortName}
              onChange={(e) => setShortName(e.target.value)}
              maxLength={20}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>{t("register.fields.contactName")}</Label>
            <Input
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
              required
              maxLength={120}
            />
          </div>
          <div className="space-y-1.5">
            <Label>{t("register.fields.phone")}</Label>
            <Input
              value={contactPhone}
              onChange={(e) => setContactPhone(e.target.value)}
              maxLength={40}
            />
          </div>
          <div className="col-span-2 space-y-1.5">
            <Label>{t("register.fields.email")}</Label>
            <Input
              type="email"
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
              required
              maxLength={255}
            />
          </div>
        </div>

        {reg.collectPlayers && (
          <div className="flex items-start gap-2 rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground">
            <Info className="h-4 w-4 mt-0.5 shrink-0" />
            <span>{t("register.rosterLater")}</span>
          </div>
        )}

        <div className="space-y-1.5">
          <Label>{t("register.fields.notes")}</Label>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            maxLength={2000}
          />
        </div>

        <Button type="submit" className="w-full" disabled={submitting}>
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : t("register.submit")}
        </Button>
      </form>
    </div>
  );
}

