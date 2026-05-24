import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import i18n from "@/lib/i18n";
import { Trophy, Loader2, ArrowLeft, Plus, Trash2 } from "lucide-react";
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

type Player = { first_name: string; last_name: string; jersey_number: string; position: string };

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
  const [players, setPlayers] = useState<Player[]>([]);
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

  const collectPlayers = !!reg.collectPlayers;

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
          players: collectPlayers
            ? players
                .filter((p) => p.first_name.trim() && p.last_name.trim())
                .map((p) => ({
                  first_name: p.first_name.trim(),
                  last_name: p.last_name.trim(),
                  jersey_number: p.jersey_number
                    ? parseInt(p.jersey_number, 10)
                    : null,
                  position: p.position.trim() || null,
                }))
            : [],
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error ?? t("common.error"));
        return;
      }
      // If online payment required, redirect to Stripe Checkout
      if (data.checkout_url) {
        toast.success(t("register.redirectingToPayment"));
        window.location.href = data.checkout_url;
        return;
      }
      toast.success(
        data.requires_approval ? t("register.pending") : t("register.confirmed"),
      );
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

        {collectPlayers && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>{t("register.fields.players", { count: players.length })}</Label>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() =>
                  setPlayers([
                    ...players,
                    { first_name: "", last_name: "", jersey_number: "", position: "" },
                  ])
                }
              >
                <Plus className="h-4 w-4" />
                {t("register.addPlayer")}
              </Button>
            </div>
            {players.map((p, i) => (
              <div key={i} className="grid grid-cols-12 gap-2 items-center">
                <Input
                  className="col-span-4"
                  placeholder={t("register.fields.firstName")}
                  value={p.first_name}
                  onChange={(e) => {
                    const next = [...players];
                    next[i].first_name = e.target.value;
                    setPlayers(next);
                  }}
                />
                <Input
                  className="col-span-4"
                  placeholder={t("register.fields.lastName")}
                  value={p.last_name}
                  onChange={(e) => {
                    const next = [...players];
                    next[i].last_name = e.target.value;
                    setPlayers(next);
                  }}
                />
                <Input
                  className="col-span-1"
                  placeholder={t("register.fields.jerseyShort")}
                  value={p.jersey_number}
                  onChange={(e) => {
                    const next = [...players];
                    next[i].jersey_number = e.target.value;
                    setPlayers(next);
                  }}
                />
                <Input
                  className="col-span-2"
                  placeholder={t("register.fields.position")}
                  value={p.position}
                  onChange={(e) => {
                    const next = [...players];
                    next[i].position = e.target.value;
                    setPlayers(next);
                  }}
                />
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="col-span-1"
                  onClick={() => setPlayers(players.filter((_, j) => j !== i))}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            ))}
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
