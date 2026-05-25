import { useEffect, useState, type FormEvent } from "react";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Loader2, Trophy, AlertCircle, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SportSelect } from "@/components/sport-select";
import { TournamentPassButton } from "@/modules/tournaments/components/TournamentPassButton";
import i18nInstance from "@/lib/i18n";
import {
  listMyAvailablePasses,
  createTournamentFromPass,
  confirmPassSession,
} from "@/modules/tournaments/passes.functions";

export const Route = createFileRoute("/_authenticated/tournaments/new-from-pass")({
  component: NewFromPassPage,
  validateSearch: (s: Record<string, unknown>) => ({
    pass: typeof s.pass === "string" ? s.pass : undefined,
    session_id: typeof s.session_id === "string" ? s.session_id : undefined,
  }),
  head: () => ({
    meta: [{ title: i18nInstance.t("newFromPass.metaTitle", { ns: "tournaments" }) }],
  }),
});

type Format = "group" | "knockout" | "mixed";

function NewFromPassPage() {
  const { t } = useTranslation("tournaments");
  const navigate = useNavigate();
  const search = Route.useSearch();
  const justPaid = search.pass === "success";
  const listFn = useServerFn(listMyAvailablePasses);
  const createFn = useServerFn(createTournamentFromPass);

  const passesQ = useQuery({
    queryKey: ["my-tournament-passes"],
    queryFn: () => listFn({ data: undefined as never }),
    // After Stripe redirect, poll until the webhook marks the pass as paid.
    refetchInterval: (q) => {
      const data = q.state.data as { passes?: unknown[] } | undefined;
      if (!justPaid) return false;
      if (data?.passes && data.passes.length > 0) return false;
      return 2000;
    },
  });

  const [name, setName] = useState("");
  const [sport, setSport] = useState("football");
  const [category, setCategory] = useState("");
  const [startsOn, setStartsOn] = useState("");
  const [endsOn, setEndsOn] = useState("");
  const [location, setLocation] = useState("");
  const [format, setFormat] = useState<Format>("mixed");
  const [numTeams, setNumTeams] = useState(8);

  const create = useMutation({
    mutationFn: (passId: string) =>
      createFn({
        data: {
          pass_id: passId,
          name: name.trim(),
          sport,
          category: category || null,
          starts_on: startsOn,
          ends_on: endsOn || null,
          format,
          num_teams: numTeams,
          location: location || null,
        },
      }),
    onSuccess: (res) => {
      toast.success(t("newFromPass.createdToast"));
      navigate({
        to: "/tournaments/$tournamentId",
        params: { tournamentId: res.tournament.id },
      });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const passes = passesQ.data?.passes ?? [];
  const pass = passes[0];

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!pass) return;
    if (!name.trim() || !startsOn) {
      toast.error(t("newFromPass.missingFields"));
      return;
    }
    create.mutate(pass.id);
  }

  if (passesQ.isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!pass && justPaid) {
    return (
      <div className="mx-auto max-w-xl px-5 py-16 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
          <Loader2 className="h-7 w-7 animate-spin text-primary" />
        </div>
        <h1 className="mt-5 font-display text-2xl font-bold">
          {t("newFromPass.validatingTitle")}
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">
          {t("newFromPass.validatingBody")}
        </p>
      </div>
    );
  }

  if (!pass) {
    return (
      <div className="mx-auto max-w-xl px-5 py-16 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-muted">
          <AlertCircle className="h-7 w-7 text-muted-foreground" />
        </div>
        <h1 className="mt-5 font-display text-2xl font-bold">{t("newFromPass.noPassTitle")}</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          {t("newFromPass.noPassBody")}
        </p>
        <div className="mt-6 flex flex-col items-center gap-3">
          <TournamentPassButton
            variant="default"
            label={t("newFromPass.buyPass")}
          />
          <Button asChild variant="ghost" size="sm">
            <Link to="/tournaments">{t("newFromPass.backToTournaments")}</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-5 py-10">
      <div className="mb-8 flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/10">
          <Trophy className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="font-display text-2xl font-bold">{t("newFromPass.heading")}</h1>
          <p className="text-sm text-muted-foreground">
            {t("newFromPass.passValidatedFor", { email: pass.email })}
          </p>
        </div>
      </div>

      <form onSubmit={onSubmit} className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="name">{t("newFromPass.name")}</Label>
          <Input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("newFromPass.namePlaceholder")}
            required
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>{t("newFromPass.sport")}</Label>
            <SportSelect value={sport} onValueChange={setSport} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="category">{t("newFromPass.category")}</Label>
            <Input
              id="category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder={t("newFromPass.categoryPlaceholder")}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="starts">{t("newFromPass.startDate")}</Label>
            <Input
              id="starts"
              type="date"
              value={startsOn}
              onChange={(e) => setStartsOn(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ends">{t("newFromPass.endDate")}</Label>
            <Input
              id="ends"
              type="date"
              value={endsOn}
              onChange={(e) => setEndsOn(e.target.value)}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="location">{t("newFromPass.location")}</Label>
          <Input
            id="location"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder={t("newFromPass.locationPlaceholder")}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="format">{t("newFromPass.format")}</Label>
            <select
              id="format"
              value={format}
              onChange={(e) => setFormat(e.target.value as Format)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="group">{t("newFromPass.formatGroup")}</option>
              <option value="knockout">{t("newFromPass.formatKnockout")}</option>
              <option value="mixed">{t("newFromPass.formatMixed")}</option>
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="num">{t("newFromPass.numTeams")}</Label>
            <Input
              id="num"
              type="number"
              min={2}
              max={64}
              value={numTeams}
              onChange={(e) => setNumTeams(parseInt(e.target.value) || 8)}
            />
          </div>
        </div>

        <div className="rounded-lg bg-muted/40 p-4 text-xs text-muted-foreground">
          {t("newFromPass.consumeHint")}
        </div>

        <Button type="submit" disabled={create.isPending} className="w-full h-11">
          {create.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          {t("newFromPass.submit")}
        </Button>
      </form>
    </div>
  );
}
