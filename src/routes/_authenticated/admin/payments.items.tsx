import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, useMyRoles } from "@/lib/auth-context";
import { listSeasons } from "@/lib/seasons.functions";
import {
  listPaymentItems,
  createPaymentItem,
  deletePaymentItem,
  updatePaymentItem,
} from "@/lib/payment-items.functions";
import { sendItemRemindersNow } from "@/lib/payment-reminders.functions";
import { BackLink } from "@/components/back-link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Loader2,
  Plus,
  Trash2,
  Receipt,
  Users,
  User,
  Building2,
  CheckCircle2,
  XCircle,
  BanknoteArrowDown,
  BellRing,
} from "lucide-react";
import { toast } from "sonner";
import { CollectPaymentDialog } from "@/components/admin/CollectPaymentDialog";
import i18nInstance from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/admin/payments/items")({
  component: PaymentItemsPage,
  validateSearch: z.object({ season: z.string().uuid().optional() }),
  head: () => ({
    meta: [
      {
        title:
          i18nInstance.t("meta.adminPayments.title") +
          " — " +
          i18nInstance.t("fundraising.metaSuffix"),
      },
      { name: "robots", content: "noindex" },
    ],
  }),
});

const TYPE_LABELS: Record<string, string> = {
  membership: "Adhésion",
  license: "Licence",
  equipment: "Équipement",
  trip: "Déplacement",
  tournament: "Tournoi",
  fundraising: "Collecte",
  other: "Autre",
};
const PROVIDER_LABELS: Record<string, string> = {
  stripe: "Stripe",
  helloasso: "HelloAsso",
  cash: "Espèces",
  cheque: "Chèque",
  bank_transfer: "Virement",
  manual: "Manuel",
};
const STATUS_COLORS: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  open: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  closed: "bg-slate-500/10 text-slate-700 dark:text-slate-400",
  cancelled: "bg-destructive/10 text-destructive",
};

function PaymentItemsPage() {
  const { t } = useTranslation();
  const { activeClubId } = useAuth();
  const roles = useMyRoles();
  const search = Route.useSearch();
  const nav = Route.useNavigate();

  if (!roles.includes("admin") && !roles.includes("financial_admin")) {
    return <Navigate to="/profile" replace />;
  }
  if (!activeClubId) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  const listSeasonsFn = useServerFn(listSeasons);
  const listItemsFn = useServerFn(listPaymentItems);
  const deleteFn = useServerFn(deletePaymentItem);
  const updateFn = useServerFn(updatePaymentItem);
  const qc = useQueryClient();
  const [collectFor, setCollectFor] = useState<
    { id: string; title: string } | null
  >(null);

  const seasonsQ = useQuery({
    queryKey: ["seasons", activeClubId],
    queryFn: () => listSeasonsFn({ data: { clubId: activeClubId } }),
  });

  const currentSeason = useMemo(() => {
    const s = seasonsQ.data?.seasons ?? [];
    if (search.season) return s.find((x) => x.id === search.season) ?? null;
    return s.find((x) => x.is_current) ?? s[0] ?? null;
  }, [seasonsQ.data, search.season]);

  const itemsQ = useQuery({
    queryKey: ["payment-items", activeClubId, currentSeason?.id],
    enabled: !!currentSeason,
    queryFn: () =>
      listItemsFn({
        data: { clubId: activeClubId, seasonId: currentSeason!.id },
      }),
  });

  const remove = useMutation({
    mutationFn: (itemId: string) =>
      deleteFn({ data: { clubId: activeClubId, itemId } }),
    onSuccess: () => {
      toast.success(t("fundraising.deleted"));
      qc.invalidateQueries({ queryKey: ["payment-items"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: "open" | "closed" }) =>
      updateFn({
        data: { clubId: activeClubId, itemId: id, patch: { status } },
      }),
    onSuccess: () => {
      toast.success(t("fundraising.statusUpdated"));
      qc.invalidateQueries({ queryKey: ["payment-items"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remindFn = useServerFn(sendItemRemindersNow);
  const remind = useMutation({
    mutationFn: (itemId: string) => remindFn({ data: { paymentItemId: itemId } }),
    onSuccess: (res) => toast.success(t("fundraising.remindersSent", { count: res.sent })),
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="px-5 py-4 space-y-5 max-w-5xl">
      <BackLink to="/admin" label={t("common.back")} />

      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Receipt className="h-6 w-6 text-primary" />
            {t("fundraising.title")}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t("fundraising.subtitle")}
          </p>
        </div>
        <div className="flex items-end gap-2">
          {seasonsQ.data && seasonsQ.data.seasons.length > 0 && (
            <div className="space-y-1">
              <Label className="text-xs">Saison</Label>
              <Select
                value={currentSeason?.id ?? ""}
                onValueChange={(v) =>
                  nav({ search: { season: v }, replace: true })
                }
              >
                <SelectTrigger className="w-44">
                  <SelectValue placeholder="Saison" />
                </SelectTrigger>
                <SelectContent>
                  {seasonsQ.data.seasons.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.label}
                      {s.is_current ? " (en cours)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {currentSeason && (
            <CreateItemDialog
              clubId={activeClubId}
              seasonId={currentSeason.id}
              onCreated={() =>
                qc.invalidateQueries({ queryKey: ["payment-items"] })
              }
            />
          )}
        </div>
      </header>

      {seasonsQ.data && seasonsQ.data.seasons.length === 0 && (
        <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center">
          <p className="text-sm font-medium">Aucune saison configurée</p>
          <p className="text-xs text-muted-foreground mt-1">
            Créez une saison avant d'ajouter des collectes de fonds.
          </p>
          <Button asChild size="sm" className="mt-3">
            <Link
              to="/admin/settings/payments"
              search={{ tab: "seasons" }}
            >
              Configurer les saisons
            </Link>
          </Button>
        </div>
      )}

      {itemsQ.isLoading && (
        <div className="flex justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        </div>
      )}

      {itemsQ.data && itemsQ.data.items.length === 0 && (
        <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
          Aucune collecte de fonds pour cette saison.
        </div>
      )}

      <ul className="space-y-3">
        {itemsQ.data?.items.map((it) => (
          <li
            key={it.id}
            className="rounded-2xl border border-border bg-card p-4 flex flex-wrap items-start gap-4"
          >
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-semibold truncate">{it.title}</p>
                <Badge variant="secondary" className="text-[10px]">
                  {TYPE_LABELS[it.type] ?? it.type}
                </Badge>
                <span
                  className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded ${STATUS_COLORS[it.status]}`}
                >
                  {it.status}
                </span>
                {it.allow_partial && (
                  <Badge variant="outline" className="text-[10px]">
                    Partiel OK
                  </Badge>
                )}
              </div>
              {it.description && (
                <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                  {it.description}
                </p>
              )}
              <p className="text-xs text-muted-foreground mt-1">
                {PROVIDER_LABELS[it.provider] ?? it.provider}
                {it.due_date ? ` · échéance ${it.due_date}` : ""}
              </p>
            </div>
            <div className="text-right">
              <p className="text-base font-bold">
                {(it.amount_cents / 100).toFixed(2)}{" "}
                {(it.currency || "eur").toUpperCase()}
              </p>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCollectFor({ id: it.id, title: it.title })}
              >
                <BanknoteArrowDown className="h-3.5 w-3.5" /> Suivi
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  if (confirm(`Envoyer un rappel pour "${it.title}" maintenant ?`)) {
                    remind.mutate(it.id);
                  }
                }}
                disabled={remind.isPending}
                title="Relancer maintenant"
              >
                <BellRing className="h-3.5 w-3.5" />
              </Button>
              {it.status === "open" ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    toggleStatus.mutate({ id: it.id, status: "closed" })
                  }
                  disabled={toggleStatus.isPending}
                >
                  <XCircle className="h-3.5 w-3.5" /> Fermer
                </Button>
              ) : it.status === "closed" ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    toggleStatus.mutate({ id: it.id, status: "open" })
                  }
                  disabled={toggleStatus.isPending}
                >
                  <CheckCircle2 className="h-3.5 w-3.5" /> Rouvrir
                </Button>
              ) : null}
              <Button
                variant="ghost"
                size="icon"
                className="text-destructive hover:text-destructive"
                onClick={() => {
                  if (confirm(`Supprimer "${it.title}" ?`)) remove.mutate(it.id);
                }}
                disabled={remove.isPending}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </li>
        ))}
      </ul>

      {collectFor && (
        <CollectPaymentDialog
          clubId={activeClubId}
          itemId={collectFor.id}
          itemTitle={collectFor.title}
          open
          onOpenChange={(v) => !v && setCollectFor(null)}
        />
      )}
    </div>
  );
}

/* ---------------------------- Create dialog ---------------------------- */

function CreateItemDialog({
  clubId,
  seasonId,
  onCreated,
}: {
  clubId: string;
  seasonId: string;
  onCreated: () => void;
}) {
  const createFn = useServerFn(createPaymentItem);
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<
    "membership" | "license" | "equipment" | "trip" | "tournament" | "fundraising" | "other"
  >("license");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("0.00");
  const [dueDate, setDueDate] = useState("");
  const [provider, setProvider] = useState<
    "stripe" | "helloasso" | "cash" | "cheque" | "bank_transfer" | "manual"
  >("stripe");
  const [allowPartial, setAllowPartial] = useState(false);
  const [targetKind, setTargetKind] = useState<"club" | "team" | "player">(
    "team",
  );
  const [selectedTeams, setSelectedTeams] = useState<string[]>([]);
  const [selectedPlayers, setSelectedPlayers] = useState<string[]>([]);

  // Load teams & players from supabase directly (member-visible)
  const teamsQ = useQuery({
    queryKey: ["club-teams", clubId],
    enabled: open,
    queryFn: async () => {
      const { data } = await supabase
        .from("teams")
        .select("id, name")
        .eq("club_id", clubId)
        .is("deleted_at", null)
        .order("name");
      return data ?? [];
    },
  });

  const playersQ = useQuery({
    queryKey: ["club-players", clubId],
    enabled: open && targetKind === "player",
    queryFn: async () => {
      const { data } = await supabase
        .from("players")
        .select("id, first_name, last_name")
        .eq("club_id", clubId)
        .is("deleted_at", null)
        .order("last_name");
      return data ?? [];
    },
  });

  const create = useMutation({
    mutationFn: () => {
      const target =
        targetKind === "club"
          ? { kind: "club" as const }
          : targetKind === "team"
            ? { kind: "team" as const, team_ids: selectedTeams }
            : { kind: "player" as const, player_ids: selectedPlayers };
      return createFn({
        data: {
          clubId,
          item: {
            season_id: seasonId,
            type,
            title: title.trim(),
            description: description.trim() || null,
            amount_cents: Math.round(parseFloat(amount || "0") * 100),
            currency: "eur",
            due_date: dueDate || null,
            provider,
            allow_partial: allowPartial,
            status: "open",
          },
          target,
        },
      });
    },
    onSuccess: () => {
      toast.success("Collecte créée — les membres concernés vont recevoir un email");
      setOpen(false);
      // reset
      setTitle("");
      setDescription("");
      setAmount("0.00");
      setDueDate("");
      setSelectedTeams([]);
      setSelectedPlayers([]);
      onCreated();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const canSubmit =
    title.trim().length > 0 &&
    parseFloat(amount || "0") >= 0 &&
    (targetKind === "club" ||
      (targetKind === "team" && selectedTeams.length > 0) ||
      (targetKind === "player" && selectedPlayers.length > 0));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4" /> Nouvelle collecte
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Créer une collecte de fonds</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Type</Label>
              <Select value={type} onValueChange={(v) => setType(v as typeof type)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(TYPE_LABELS).map(([v, l]) => (
                    <SelectItem key={v} value={v}>{l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Mode de paiement par défaut</Label>
              <Select value={provider} onValueChange={(v) => setProvider(v as typeof provider)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(PROVIDER_LABELS).map(([v, l]) => (
                    <SelectItem key={v} value={v}>{l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Intitulé</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Licence FFF 2025/2026"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Description (optionnel)</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="Détails ou conditions"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Montant (EUR)</Label>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Échéance (optionnel)</Label>
              <Input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>
            <div className="space-y-1.5 flex flex-col">
              <Label className="text-xs">Paiement partiel</Label>
              <div className="flex items-center gap-2 h-9">
                <Switch checked={allowPartial} onCheckedChange={setAllowPartial} />
                <span className="text-xs text-muted-foreground">
                  Autorisé
                </span>
              </div>
            </div>
          </div>

          <div className="space-y-2 pt-2 border-t border-border">
            <Label className="text-xs font-semibold">Affecter à</Label>
            <div className="grid grid-cols-3 gap-2">
              <TargetButton
                active={targetKind === "club"}
                onClick={() => setTargetKind("club")}
                icon={<Building2 className="h-4 w-4" />}
                label="Tout le club"
              />
              <TargetButton
                active={targetKind === "team"}
                onClick={() => setTargetKind("team")}
                icon={<Users className="h-4 w-4" />}
                label="Équipes"
              />
              <TargetButton
                active={targetKind === "player"}
                onClick={() => setTargetKind("player")}
                icon={<User className="h-4 w-4" />}
                label="Joueurs"
              />
            </div>

            {targetKind === "team" && (
              <div className="rounded-md border border-border max-h-48 overflow-y-auto divide-y divide-border">
                {teamsQ.data?.length === 0 && (
                  <p className="text-xs text-muted-foreground p-3">
                    Aucune équipe.
                  </p>
                )}
                {teamsQ.data?.map((tm) => (
                  <CheckboxRow
                    key={tm.id}
                    label={tm.name}
                    checked={selectedTeams.includes(tm.id)}
                    onChange={(c) =>
                      setSelectedTeams((s) =>
                        c ? [...s, tm.id] : s.filter((x) => x !== tm.id),
                      )
                    }
                  />
                ))}
              </div>
            )}

            {targetKind === "player" && (
              <div className="rounded-md border border-border max-h-48 overflow-y-auto divide-y divide-border">
                {playersQ.data?.length === 0 && (
                  <p className="text-xs text-muted-foreground p-3">
                    Aucun joueur.
                  </p>
                )}
                {playersQ.data?.map((p) => (
                  <CheckboxRow
                    key={p.id}
                    label={`${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() || "—"}
                    checked={selectedPlayers.includes(p.id)}
                    onChange={(c) =>
                      setSelectedPlayers((s) =>
                        c ? [...s, p.id] : s.filter((x) => x !== p.id),
                      )
                    }
                  />
                ))}
              </div>
            )}

            {targetKind === "club" && (
              <p className="text-xs text-muted-foreground">
                Une obligation sera créée pour chaque joueur actif du club.
              </p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Annuler
          </Button>
          <Button
            onClick={() => create.mutate()}
            disabled={!canSubmit || create.isPending}
          >
            {create.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              "Créer et assigner"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TargetButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center justify-center gap-2 rounded-md border px-3 py-2 text-xs font-medium transition-colors ${
        active
          ? "border-primary bg-primary/10 text-primary"
          : "border-border bg-card hover:bg-muted"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function CheckboxRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-muted/50">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 rounded border-input accent-primary"
      />
      <span className="flex-1 truncate">{label}</span>
    </label>
  );
}
