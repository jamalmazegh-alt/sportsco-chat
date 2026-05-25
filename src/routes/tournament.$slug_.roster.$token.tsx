import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import i18n from "@/lib/i18n";
import { Loader2, ArrowLeft, Plus, Trash2, CheckCircle2, Star, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/tournament/$slug_/roster/$token")({
  component: RosterPage,
  head: ({ params }) => ({
    meta: [
      {
        title: i18n.t("roster.metaTitle", {
          ns: "tournaments",
          defaultValue: "Composition de l'effectif",
          slug: params.slug,
        }),
      },
    ],
  }),
});

type Player = {
  id?: string;
  first_name: string;
  last_name: string;
  jersey_number: string;
  position: string;
  is_captain: boolean;
};

function RosterPage() {
  const { slug, token } = Route.useParams();
  const { t } = useTranslation("tournaments");
  const [players, setPlayers] = useState<Player[]>([]);
  const [saving, setSaving] = useState(false);

  const q = useQuery({
    queryKey: ["roster", token],
    queryFn: async () => {
      const res = await fetch(`/api/public/tournament-roster?token=${encodeURIComponent(token)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Failed");
      return data.registration as {
        registration_id: string;
        tournament_name: string;
        tournament_slug: string;
        team_name: string;
        contact_name: string;
        status: "pending" | "approved" | "rejected";
        tournament_team_id: string | null;
        roster_submitted_at: string | null;
        players: Array<{
          id?: string;
          first_name: string;
          last_name: string;
          jersey_number: number | null;
          position: string | null;
          is_captain: boolean | null;
        }>;
      };
    },
  });

  useEffect(() => {
    if (q.data?.players) {
      setPlayers(
        q.data.players.map((p) => ({
          id: p.id,
          first_name: p.first_name ?? "",
          last_name: p.last_name ?? "",
          jersey_number: p.jersey_number != null ? String(p.jersey_number) : "",
          position: p.position ?? "",
          is_captain: !!p.is_captain,
        })),
      );
    }
  }, [q.data]);

  if (q.isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }
  if (q.isError || !q.data) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="text-center space-y-2 max-w-md">
          <ShieldAlert className="h-10 w-10 mx-auto text-muted-foreground" />
          <p className="text-lg font-medium">{t("roster.invalidTitle", { defaultValue: "Lien invalide" })}</p>
          <p className="text-sm text-muted-foreground">
            {t("roster.invalidBody", { defaultValue: "Ce lien d'effectif est invalide ou a expiré." })}
          </p>
        </div>
      </div>
    );
  }

  const reg = q.data;
  const approved = reg.status === "approved" && !!reg.tournament_team_id;

  async function onSave(e: FormEvent) {
    e.preventDefault();
    if (!approved) return;
    setSaving(true);
    try {
      const res = await fetch("/api/public/tournament-roster", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          players: players
            .filter((p) => p.first_name.trim() && p.last_name.trim())
            .map((p) => ({
              first_name: p.first_name.trim(),
              last_name: p.last_name.trim(),
              jersey_number: p.jersey_number ? parseInt(p.jersey_number, 10) : null,
              position: p.position.trim() || null,
              is_captain: p.is_captain,
            })),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error ?? t("common.error", { defaultValue: "Erreur" }));
        return;
      }
      toast.success(t("roster.saved", { defaultValue: "Effectif enregistré" }));
      q.refetch();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto p-5 pb-12">
      <Link
        to="/tournament/$slug"
        params={{ slug }}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-3"
      >
        <ArrowLeft className="h-4 w-4" />
        {t("register.backTournament")}
      </Link>
      <h1 className="text-2xl font-semibold mb-1">
        {t("roster.heading", { defaultValue: "Composition — {{team}}", team: reg.team_name })}
      </h1>
      <p className="text-sm text-muted-foreground mb-4">{reg.tournament_name}</p>

      {!approved ? (
        <div className="rounded-md border bg-muted/40 p-4 text-sm">
          <p className="font-medium mb-1">
            {t("roster.pendingTitle", { defaultValue: "Candidature en cours de validation" })}
          </p>
          <p className="text-muted-foreground">
            {t("roster.pendingBody", {
              defaultValue:
                "Dès que l'organisation aura validé votre inscription, vous pourrez ajouter ou modifier vos joueurs depuis ce même lien.",
            })}
          </p>
        </div>
      ) : (
        <form onSubmit={onSave} className="space-y-4">
          <div className="flex items-center justify-between">
            <Label>{t("roster.playersLabel", { defaultValue: "Joueurs ({{count}})", count: players.length })}</Label>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() =>
                setPlayers([
                  ...players,
                  { first_name: "", last_name: "", jersey_number: "", position: "", is_captain: false },
                ])
              }
            >
              <Plus className="h-4 w-4" />
              {t("register.addPlayer", { defaultValue: "Ajouter" })}
            </Button>
          </div>

          {players.length === 0 && (
            <p className="text-sm text-muted-foreground italic">
              {t("roster.empty", { defaultValue: "Aucun joueur pour le moment. Cliquez sur Ajouter." })}
            </p>
          )}

          <div className="space-y-2">
            {players.map((p, i) => (
              <div key={i} className="rounded-md border p-3 space-y-2">
                <div className="grid grid-cols-12 gap-2">
                  <Input
                    className="col-span-6 sm:col-span-5"
                    placeholder={t("register.fields.firstName")}
                    value={p.first_name}
                    onChange={(e) => {
                      const next = [...players];
                      next[i].first_name = e.target.value;
                      setPlayers(next);
                    }}
                  />
                  <Input
                    className="col-span-6 sm:col-span-5"
                    placeholder={t("register.fields.lastName")}
                    value={p.last_name}
                    onChange={(e) => {
                      const next = [...players];
                      next[i].last_name = e.target.value;
                      setPlayers(next);
                    }}
                  />
                  <Input
                    className="col-span-4 sm:col-span-1"
                    placeholder="#"
                    inputMode="numeric"
                    value={p.jersey_number}
                    onChange={(e) => {
                      const next = [...players];
                      next[i].jersey_number = e.target.value.replace(/[^0-9]/g, "");
                      setPlayers(next);
                    }}
                  />
                  <Input
                    className="col-span-7 sm:col-span-5"
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
                    size="sm"
                    variant={p.is_captain ? "default" : "outline"}
                    className="col-span-7 sm:col-span-5 gap-1"
                    onClick={() => {
                      const next = players.map((pp, j) => ({ ...pp, is_captain: j === i ? !pp.is_captain : false }));
                      setPlayers(next);
                    }}
                  >
                    <Star className="h-3.5 w-3.5" />
                    {p.is_captain
                      ? t("roster.captain", { defaultValue: "Capitaine" })
                      : t("roster.setCaptain", { defaultValue: "Définir capitaine" })}
                  </Button>
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
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between pt-2">
            {reg.roster_submitted_at && (
              <p className="text-xs text-muted-foreground inline-flex items-center gap-1">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                {t("roster.lastSaved", {
                  defaultValue: "Dernier enregistrement : {{date}}",
                  date: new Date(reg.roster_submitted_at).toLocaleString(),
                })}
              </p>
            )}
            <Button type="submit" disabled={saving} className="ml-auto">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : t("roster.save", { defaultValue: "Enregistrer" })}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
