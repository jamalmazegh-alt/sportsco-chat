import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { listAllClubs } from "@/lib/superadmin.functions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Loader2, Mail, Phone, Search, ShieldCheck, User2 } from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { EXEMPT_REASON_LABELS, type ExemptReason, isBillingExempt } from "@/lib/has-paid-access";

export const Route = createFileRoute("/superadmin/clubs/")({
  component: SuperAdminClubs,
});

type Subscription = {
  status: string;
  trial_end: string | null;
  current_period_end: string | null;
  exempt_from_billing?: boolean | null;
  exempt_reason?: string | null;
  exempt_until?: string | null;
};

type Club = {
  id: string;
  name: string;
  created_at: string;
  member_count: number;
  archived_at: string | null;
  is_personal: boolean;
  subscription: Subscription | null;
  contact_name: string | null;
  contact_phone: string | null;
  contact_email: string | null;
};

type BillingPill = {
  label: string;
  emoji: string;
  cls: string;
};

function billingPill(sub: Subscription | null): BillingPill {
  if (sub && isBillingExempt(sub)) {
    return {
      label: "Exempté",
      emoji: "🛡️",
      cls: "bg-[#eff6ff] text-[#2563eb] border-[#bfdbfe]",
    };
  }
  if (!sub) {
    return {
      label: "Aucun abonnement",
      emoji: "—",
      cls: "bg-[#f8fafc] text-[#94a3b8] border-[#e2e8f0]",
    };
  }
  const s = sub.status;
  if (s === "active" || s === "trialing") {
    return {
      label: s === "trialing" ? "Essai" : "Actif",
      emoji: "✅",
      cls: "bg-[#f0fdf4] text-[#16a34a] border-[#86efac]",
    };
  }
  if (s === "past_due" || s === "incomplete") {
    return {
      label: s === "past_due" ? "Impayé" : "Incomplet",
      emoji: "⚠️",
      cls: "bg-[#fffbeb] text-[#d97706] border-[#fde68a]",
    };
  }
  if (s === "canceled") {
    return {
      label: "Inactif",
      emoji: "⚠️",
      cls: "bg-[#fff5f5] text-[#ef4444] border-[#fecaca]",
    };
  }
  return {
    label: s,
    emoji: "—",
    cls: "bg-[#f8fafc] text-[#94a3b8] border-[#e2e8f0]",
  };
}

function SuperAdminClubs() {
  const [search, setSearch] = useState("");
  const [includePersonal, setIncludePersonal] = useState(false);
  const [includeSystem, setIncludeSystem] = useState(false);
  const [clubs, setClubs] = useState<Club[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshKey] = useState(0);

  const reload = useCallback(() => {}, []);
  void reload;

  useEffect(() => {
    setLoading(true);
    const t = setTimeout(() => {
      listAllClubs({
        data: {
          search: search || undefined,
          limit: 50,
          offset: 0,
          include_personal: includePersonal,
          include_system: includeSystem,
        },
      })
        .then((r) => {
          setClubs(r.items as Club[]);
          setTotal(r.total);
        })
        .finally(() => setLoading(false));
    }, 250);
    return () => clearTimeout(t);
  }, [search, includePersonal, includeSystem, refreshKey]);

  return (
    <div className="p-4 sm:p-6 md:p-8 max-w-7xl">
      <header className="mb-5 flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold">Clubs</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {total} club{total === 1 ? "" : "s"}
            {!includePersonal && " (hors orgas libres)"}
            {!includeSystem && " (hors fixtures de test)"}
          </p>
        </div>
        <div className="flex items-end gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <Switch
              id="inc-personal"
              checked={includePersonal}
              onCheckedChange={setIncludePersonal}
            />
            <Label htmlFor="inc-personal" className="text-xs cursor-pointer">
              Orgas libres
            </Label>
          </div>
          <div className="flex items-center gap-2">
            <Switch id="inc-system" checked={includeSystem} onCheckedChange={setIncludeSystem} />
            <Label htmlFor="inc-system" className="text-xs cursor-pointer">
              Test/RLS
            </Label>
          </div>
          <div className="relative w-full sm:w-72">
            <Search className="h-4 w-4 absolute left-2.5 top-2.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher un club…"
              className="pl-9 h-9"
            />
          </div>
        </div>
      </header>

      {/* Desktop table */}
      <div className="hidden md:block rounded-lg border border-border overflow-hidden bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs text-muted-foreground">
            <tr>
              <th className="text-left font-medium px-3 py-2">Club</th>
              <th className="text-left font-medium px-3 py-2">Contact</th>
              <th className="text-left font-medium px-3 py-2">Membres</th>
              <th className="text-left font-medium px-3 py-2">Facturation</th>
              <th className="text-left font-medium px-3 py-2 hidden lg:table-cell">Créé le</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">
                  <Loader2 className="h-4 w-4 inline animate-spin mr-2" />
                  Chargement…
                </td>
              </tr>
            )}
            {!loading && clubs.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">
                  Aucun club trouvé.
                </td>
              </tr>
            )}
            {!loading &&
              clubs.map((c) => {
                const pill = billingPill(c.subscription);
                const isTest = c.name.startsWith("__rls_") || c.name.startsWith("__e2e_");
                const exempt = c.subscription && isBillingExempt(c.subscription);
                return (
                  <tr
                    key={c.id}
                    className="border-t border-border hover:bg-muted/30 cursor-pointer transition-colors"
                  >
                    <td className="px-3 py-2.5">
                      <Link
                        to="/superadmin/clubs/$clubId"
                        params={{ clubId: c.id }}
                        className="font-medium hover:underline block"
                      >
                        {c.name}
                      </Link>
                      <div className="flex items-center gap-1 mt-0.5">
                        {c.is_personal && (
                          <span className="inline-flex items-center rounded-full bg-pink-500/10 text-pink-700 dark:text-pink-400 px-2 py-0.5 text-[10px]">
                            orga libre
                          </span>
                        )}
                        {isTest && (
                          <span className="inline-flex items-center rounded-full bg-muted text-muted-foreground px-2 py-0.5 text-[10px]">
                            test
                          </span>
                        )}
                        {c.archived_at && (
                          <span className="inline-flex items-center rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-400 px-2 py-0.5 text-[10px]">
                            archivé
                          </span>
                        )}
                        <span className="text-[10px] font-mono text-muted-foreground/70 ml-1">
                          {c.id.slice(0, 8)}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 align-top">
                      {c.contact_name || c.contact_email || c.contact_phone ? (
                        <div className="space-y-0.5 text-xs">
                          {c.contact_name && (
                            <div className="flex items-center gap-1.5 font-medium">
                              <User2 className="h-3 w-3 text-muted-foreground" />
                              {c.contact_name}
                            </div>
                          )}
                          {c.contact_email && (
                            <a
                              href={`mailto:${c.contact_email}`}
                              onClick={(e) => e.stopPropagation()}
                              className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground hover:underline"
                            >
                              <Mail className="h-3 w-3" />
                              {c.contact_email}
                            </a>
                          )}
                          {c.contact_phone && (
                            <a
                              href={`tel:${c.contact_phone}`}
                              onClick={(e) => e.stopPropagation()}
                              className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground hover:underline"
                            >
                              <Phone className="h-3 w-3" />
                              {c.contact_phone}
                            </a>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 tabular-nums">{c.member_count}</td>
                    <td className="px-3 py-2.5">
                      <Link
                        to="/superadmin/clubs/$clubId"
                        params={{ clubId: c.id }}
                        className="block"
                      >
                        <span
                          className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${pill.cls}`}
                        >
                          <span>{pill.emoji}</span>
                          {pill.label}
                        </span>
                        {exempt && c.subscription?.exempt_reason && (
                          <div className="text-[10px] text-muted-foreground mt-0.5">
                            {EXEMPT_REASON_LABELS[c.subscription.exempt_reason as ExemptReason] ??
                              c.subscription.exempt_reason}
                            {c.subscription.exempt_until && (
                              <>
                                {" · jusqu'au "}
                                {format(new Date(c.subscription.exempt_until), "d MMM yyyy", {
                                  locale: fr,
                                })}
                              </>
                            )}
                          </div>
                        )}
                      </Link>
                    </td>
                    <td className="px-3 py-2.5 hidden lg:table-cell text-muted-foreground">
                      {new Date(c.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>

      {/* Mobile card list */}
      <div className="md:hidden space-y-2">
        {loading && (
          <div className="text-center text-sm text-muted-foreground py-8">
            <Loader2 className="h-4 w-4 inline animate-spin mr-2" /> Chargement…
          </div>
        )}
        {!loading && clubs.length === 0 && (
          <div className="text-center text-sm text-muted-foreground py-8">Aucun club trouvé.</div>
        )}
        {!loading &&
          clubs.map((c) => {
            const pill = billingPill(c.subscription);
            const exempt = c.subscription && isBillingExempt(c.subscription);
            return (
              <Link
                key={c.id}
                to="/superadmin/clubs/$clubId"
                params={{ clubId: c.id }}
                className="block rounded-xl border border-border bg-card p-3 active:bg-muted/40"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold truncate flex items-center gap-1.5">
                      {c.name}
                      {exempt && <ShieldCheck className="h-3.5 w-3.5 text-[#2563eb]" />}
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      {c.member_count} membre{c.member_count > 1 ? "s" : ""} ·{" "}
                      {new Date(c.created_at).toLocaleDateString()}
                    </div>
                  </div>
                  <span
                    className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium shrink-0 ${pill.cls}`}
                  >
                    <span>{pill.emoji}</span>
                    {pill.label}
                  </span>
                </div>
                {(c.contact_name || c.contact_email || c.contact_phone) && (
                  <div className="mt-2 pt-2 border-t border-border space-y-1 text-[11px]">
                    {c.contact_name && (
                      <div className="flex items-center gap-1.5 font-medium">
                        <User2 className="h-3 w-3 text-muted-foreground" />
                        {c.contact_name}
                      </div>
                    )}
                    {c.contact_email && (
                      <a
                        href={`mailto:${c.contact_email}`}
                        onClick={(e) => e.stopPropagation()}
                        className="flex items-center gap-1.5 text-muted-foreground hover:underline"
                      >
                        <Mail className="h-3 w-3" />
                        {c.contact_email}
                      </a>
                    )}
                    {c.contact_phone && (
                      <a
                        href={`tel:${c.contact_phone}`}
                        onClick={(e) => e.stopPropagation()}
                        className="flex items-center gap-1.5 text-muted-foreground hover:underline"
                      >
                        <Phone className="h-3 w-3" />
                        {c.contact_phone}
                      </a>
                    )}
                  </div>
                )}
                {exempt && c.subscription?.exempt_reason && (
                  <div className="text-[10px] text-muted-foreground mt-1.5 pt-1.5 border-t border-border">
                    {EXEMPT_REASON_LABELS[c.subscription.exempt_reason as ExemptReason] ??
                      c.subscription.exempt_reason}
                    {c.subscription.exempt_until && (
                      <>
                        {" · jusqu'au "}
                        {format(new Date(c.subscription.exempt_until), "d MMM yyyy", {
                          locale: fr,
                        })}
                      </>
                    )}
                  </div>
                )}
              </Link>
            );
          })}
      </div>
    </div>
  );
}
