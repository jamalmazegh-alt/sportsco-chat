import { createFileRoute, Link, useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { CheckCircle2, XCircle, HelpCircle, Loader2, ExternalLink, MapPin, Calendar } from "lucide-react";
import { fmt } from "@/lib/date-locale";
import { cn } from "@/lib/utils";

const searchSchema = z.object({
  s: z.enum(["present", "absent", "uncertain"]).optional(),
});

export const Route = createFileRoute("/r/$token")({
  validateSearch: (search) => searchSchema.parse(search),
  component: RespondPage,
});

type Status = "present" | "absent" | "uncertain";

type ConvocationInfo = {
  convocation_id: string;
  status: Status | "pending";
  comment: string | null;
  responded_at: string | null;
  event_id: string;
  event_title: string;
  event_type: string;
  event_starts_at: string;
  event_location: string | null;
  event_opponent: string | null;
  player_first_name: string | null;
  player_last_name: string | null;
  team_name: string | null;
  club_name: string | null;
};

type StatusStyle = {
  label: string;
  icon: typeof CheckCircle2;
  // Idle (white card) styles
  border: string;
  hoverBorder: string;
  iconBg: string;
  iconText: string;
  iconHoverBg: string;
  labelText: string;
  // Active (selected) styles
  activeBorder: string;
  activeBg: string;
  activeIconBg: string;
  activeIconText: string;
  activeLabel: string;
  activeRing: string;
};

const STATUS_CONFIG: Record<Status, StatusStyle> = {
  present: {
    label: "Présent",
    icon: CheckCircle2,
    border: "border-emerald-100",
    hoverBorder: "hover:border-emerald-300",
    iconBg: "bg-emerald-50",
    iconText: "text-emerald-600",
    iconHoverBg: "group-hover:bg-emerald-100",
    labelText: "text-emerald-900",
    activeBorder: "border-emerald-500",
    activeBg: "bg-emerald-50/60",
    activeIconBg: "bg-emerald-600",
    activeIconText: "text-white",
    activeLabel: "text-emerald-900",
    activeRing: "ring-2 ring-emerald-500/30",
  },
  uncertain: {
    label: "Incertain",
    icon: HelpCircle,
    border: "border-amber-100",
    hoverBorder: "hover:border-amber-300",
    iconBg: "bg-amber-50",
    iconText: "text-amber-600",
    iconHoverBg: "group-hover:bg-amber-100",
    labelText: "text-amber-900",
    activeBorder: "border-amber-500",
    activeBg: "bg-amber-50/60",
    activeIconBg: "bg-amber-500",
    activeIconText: "text-white",
    activeLabel: "text-amber-900",
    activeRing: "ring-2 ring-amber-500/30",
  },
  absent: {
    label: "Absent",
    icon: XCircle,
    border: "border-rose-100",
    hoverBorder: "hover:border-rose-300",
    iconBg: "bg-rose-50",
    iconText: "text-rose-600",
    iconHoverBg: "group-hover:bg-rose-100",
    labelText: "text-rose-900",
    activeBorder: "border-rose-500",
    activeBg: "bg-rose-50/60",
    activeIconBg: "bg-rose-600",
    activeIconText: "text-white",
    activeLabel: "text-rose-900",
    activeRing: "ring-2 ring-rose-500/30",
  },
};

// Display order: Présent, Absent, Incertain
const STATUS_ORDER: Status[] = ["present", "absent", "uncertain"];

function RespondPage() {
  const { token } = Route.useParams();
  const search = useSearch({ from: "/r/$token" });
  const [info, setInfo] = useState<ConvocationInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<Status | null>(null);
  const [autoApplied, setAutoApplied] = useState(false);

  async function load() {
    setLoading(true);
    const { data, error: rpcError } = await supabase.rpc("get_convocation_by_token", { _token: token });
    if (rpcError || !data || data.length === 0) {
      setError("Lien invalide ou expiré.");
      setLoading(false);
      return;
    }
    setInfo(data[0] as ConvocationInfo);
    setLoading(false);
  }

  async function submit(status: Status) {
    if (!info || submitting) return;
    setSubmitting(status);
    const { error: rpcError } = await supabase.rpc("respond_via_token", {
      _token: token,
      _status: status,
    });
    setSubmitting(null);
    if (rpcError) {
      setError(rpcError.message || "Échec de l'enregistrement");
      return;
    }
    await load();
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // Auto-apply ?s=... once after load (1-tap from email)
  useEffect(() => {
    if (!info || autoApplied || !search.s) return;
    setAutoApplied(true);
    if (info.status !== search.s) submit(search.s);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [info, search.s, autoApplied]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !info) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-5">
        <div className="rounded-2xl border border-border bg-card p-8 max-w-md text-center space-y-3">
          <XCircle className="h-10 w-10 text-destructive mx-auto" />
          <h1 className="text-lg font-semibold">Lien invalide</h1>
          <p className="text-sm text-muted-foreground">
            {error ?? "Cette convocation est introuvable. Demandez un nouveau lien à votre coach."}
          </p>
          <Button asChild variant="outline" className="mt-2">
            <Link to="/">Retour à l'accueil</Link>
          </Button>
        </div>
      </div>
    );
  }

  const playerName = `${info.player_first_name ?? ""} ${info.player_last_name ?? ""}`.trim();
  const isResponded = info.status !== "pending";
  const currentConfig = isResponded ? STATUS_CONFIG[info.status as Status] : null;

  return (
    <div className="min-h-screen bg-background px-5 py-8">
      <div className="max-w-md mx-auto space-y-5">
        <header className="text-center space-y-1">
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Convocation</p>
          <h1 className="text-2xl font-bold">{info.event_title}</h1>
          {info.club_name && (
            <p className="text-sm text-muted-foreground">
              {info.team_name ? `${info.team_name} · ` : ""}
              {info.club_name}
            </p>
          )}
        </header>

        <section className="rounded-2xl border border-border bg-card p-5 space-y-2.5">
          <div className="flex items-center gap-2 text-sm">
            <Calendar className="h-4 w-4 text-primary" />
            <span>{fmt(info.event_starts_at, "EEEE d MMMM 'à' HH'h'mm")}</span>
          </div>
          {info.event_location && (
            <div className="flex items-center gap-2 text-sm">
              <MapPin className="h-4 w-4 text-primary" />
              <span>{info.event_location}</span>
            </div>
          )}
          <p className="text-sm text-muted-foreground pt-1">
            Pour <strong className="text-foreground">{playerName || "le joueur"}</strong>
          </p>
        </section>

        {isResponded && currentConfig && (
          <section
            className={cn(
              "rounded-2xl p-5 flex items-center gap-3 border",
              currentConfig.activeBg,
              currentConfig.activeBorder,
              currentConfig.activeLabel,
            )}
          >
            <div
              className={cn(
                "h-11 w-11 rounded-full flex items-center justify-center shrink-0",
                currentConfig.activeIconBg,
                currentConfig.activeIconText,
              )}
            >
              <currentConfig.icon className="h-6 w-6" />
            </div>
            <div className="min-w-0">
              <p className="font-semibold">Réponse enregistrée : {currentConfig.label}</p>
              {info.responded_at && (
                <p className="text-xs opacity-80">
                  {fmt(info.responded_at, "d MMM 'à' HH'h'mm")}
                </p>
              )}
            </div>
          </section>
        )}

        <section className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {isResponded ? "Modifier votre réponse" : "Votre réponse"}
          </p>
          <div className="flex gap-3">
            {STATUS_ORDER.map((s) => {
              const cfg = STATUS_CONFIG[s];
              const active = info.status === s;
              const isLoading = submitting === s;
              return (
                <button
                  key={s}
                  type="button"
                  disabled={!!submitting}
                  onClick={() => submit(s)}
                  className={cn(
                    "group relative flex-1 flex flex-col items-center justify-center gap-2 py-4 px-2 rounded-2xl border bg-card shadow-sm transition-all active:scale-95 cursor-pointer",
                    active
                      ? cn(cfg.activeBorder, cfg.activeBg, cfg.activeRing, "shadow-md")
                      : cn(cfg.border, cfg.hoverBorder, "hover:shadow-md"),
                    submitting && !isLoading && "opacity-50",
                  )}
                  aria-pressed={active}
                >
                  <div
                    className={cn(
                      "w-11 h-11 flex items-center justify-center rounded-full transition-colors",
                      active
                        ? cn(cfg.activeIconBg, cfg.activeIconText)
                        : cn(cfg.iconBg, cfg.iconText, cfg.iconHoverBg),
                    )}
                  >
                    {isLoading ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <cfg.icon className="h-6 w-6" strokeWidth={2.25} />
                    )}
                  </div>
                  <span className={cn("text-sm font-semibold tracking-tight", cfg.labelText)}>
                    {cfg.label}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        <div className="text-center pt-2">
          <Button asChild variant="ghost" size="sm">
            <Link to="/events/$eventId" params={{ eventId: info.event_id }}>
              <ExternalLink className="h-3.5 w-3.5" />
              Ouvrir dans Clubero
            </Link>
          </Button>
        </div>

        <p className="text-[11px] text-center text-muted-foreground pt-4">
          Vous recevez ce lien parce qu'une convocation vous a été envoyée. Vous pouvez modifier
          votre réponse à tout moment depuis ce même lien.
        </p>
      </div>
    </div>
  );
}
