import { createFileRoute, Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getClubRoster, type ClubRosterRow } from "@/lib/superadmin/observability.functions";
import { StatusBadge } from "@/lib/superadmin/ui";
import { Loader2, Users, ChevronDown, ChevronRight } from "lucide-react";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/superadmin/clubs/$clubId_/roster")({
  component: ClubRosterPage,
});

function fmt(iso: string | null) {
  return iso ? new Date(iso).toLocaleDateString() : "—";
}

function ClubRosterPage() {
  const { t } = useTranslation();
  const { clubId } = Route.useParams();
  const [q, setQ] = useState("");
  const { data, isLoading } = useQuery({
    queryKey: ["superadmin", "club-roster", clubId],
    queryFn: () => getClubRoster({ data: { clubId } }),
  });
  const rows = data?.rows ?? [];

  const grouped = useMemo(() => {
    const qq = q.trim().toLowerCase();
    const filtered = qq
      ? rows.filter((r) =>
          `${r.player_first_name} ${r.player_last_name} ${r.player_email ?? ""} ${r.parents
            .map((p) => `${p.full_name ?? ""} ${p.email ?? ""}`)
            .join(" ")}`
            .toLowerCase()
            .includes(qq),
        )
      : rows;
    const map = new Map<
      string,
      {
        team_id: string;
        team_name: string;
        team_age_group: string | null;
        players: ClubRosterRow[];
      }
    >();
    for (const r of filtered) {
      const g = map.get(r.team_id) ?? {
        team_id: r.team_id,
        team_name: r.team_name,
        team_age_group: r.team_age_group,
        players: [],
      };
      g.players.push(r);
      map.set(r.team_id, g);
    }
    return [...map.values()];
  }, [rows, q]);

  return (
    <div className="p-6 md:p-8 max-w-6xl">
      <header className="mb-5">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
          <Users className="h-3.5 w-3.5" /> {t("superadmin.roster.eyebrow")}
        </div>
        <div className="flex items-center justify-between gap-3 mt-1">
          <div>
            <h1 className="text-xl font-semibold">{t("superadmin.roster.title")}</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {t("superadmin.roster.subtitle")}
            </p>
          </div>
          <Input
            placeholder={t("superadmin.roster.searchPlaceholder")}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="h-8 w-72"
          />
        </div>
        <Link
          to="/superadmin/clubs/$clubId"
          params={{ clubId }}
          className="text-xs text-muted-foreground hover:underline"
        >
          {t("superadmin.roster.backToClub")}
        </Link>
      </header>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="space-y-4">
          {grouped.map((g) => (
            <TeamBlock key={g.team_id} team={g} />
          ))}
          {grouped.length === 0 && (
            <div className="rounded-lg border border-border p-8 text-center text-sm text-muted-foreground">
              {t("superadmin.roster.empty")}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function TeamBlock({
  team,
}: {
  team: {
    team_id: string;
    team_name: string;
    team_age_group: string | null;
    players: ClubRosterRow[];
  };
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(true);
  return (
    <div className="rounded-lg border border-border overflow-hidden bg-card">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-4 py-3 hover:bg-muted/40 text-left"
      >
        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        <div className="flex-1 min-w-0">
          <div className="font-medium">{team.team_name}</div>
          {team.team_age_group && (
            <div className="text-xs text-muted-foreground">{team.team_age_group}</div>
          )}
        </div>
        <div className="text-xs text-muted-foreground">{team.players.length} joueurs</div>
      </button>
      {open && (
        <div className="divide-y divide-border">
          {team.players.map((p) => (
            <PlayerRow key={p.player_id} p={p} />
          ))}
        </div>
      )}
    </div>
  );
}

function PlayerRow({ p }: { p: ClubRosterRow }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const active = !!p.player_user_id && !!p.player_last_sign_in_at;
  return (
    <div className="bg-background">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-muted/20 text-left"
      >
        {open ? (
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
        )}
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium">
            {p.player_first_name} {p.player_last_name}
          </div>
          <div className="text-xs text-muted-foreground truncate">
            {p.player_birth_date && `né(e) ${fmt(p.player_birth_date)} · `}
            {p.player_email ?? "pas d'email"}
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {p.player_child_platform_access && (
            <StatusBadge tone="info">{t("superadmin.roster.childAccess")}</StatusBadge>
          )}
          {active ? (
            <StatusBadge tone="success">{t("superadmin.roster.activeAccount")}</StatusBadge>
          ) : p.player_user_id ? (
            <StatusBadge tone="warn">{t("superadmin.roster.neverLoggedIn")}</StatusBadge>
          ) : p.player_last_invite_at ? (
            <StatusBadge tone="info">{t("superadmin.roster.invited")}</StatusBadge>
          ) : (
            <StatusBadge tone="muted">{t("superadmin.roster.noAccount")}</StatusBadge>
          )}
          <StatusBadge tone="muted">{p.parents.length} parent(s)</StatusBadge>
        </div>
        <Link
          to="/superadmin/players/$playerId/audit"
          params={{ playerId: p.player_id }}
          className="text-xs text-primary hover:underline ml-2"
          onClick={(e) => e.stopPropagation()}
        >
          historique →
        </Link>
      </button>
      {open && p.parents.length > 0 && (
        <div className="bg-muted/20 px-8 py-2 space-y-1.5">
          {p.parents.map((par) => (
            <div key={par.id} className="flex items-center gap-3 text-sm">
              <div className="flex-1 min-w-0">
                <div className="truncate">{par.full_name ?? "(sans nom)"}</div>
                <div className="text-xs text-muted-foreground truncate">
                  {par.email ?? "pas d'email"} {par.phone && `· ${par.phone}`}
                </div>
              </div>
              {par.account_active && par.last_sign_in_at ? (
                <StatusBadge tone="success">{t("superadmin.roster.activeAccount")}</StatusBadge>
              ) : par.account_active ? (
                <StatusBadge tone="warn">{t("superadmin.roster.neverLoggedIn")}</StatusBadge>
              ) : par.last_invite_at ? (
                <StatusBadge tone="info">
                  {t("superadmin.roster.invitedAt", { date: fmt(par.last_invite_at) })}
                </StatusBadge>
              ) : (
                <StatusBadge tone="muted">{t("superadmin.roster.noAccount")}</StatusBadge>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
