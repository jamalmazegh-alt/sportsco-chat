import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTranslation } from "react-i18next";
import {
  Loader2,
  MessageCircleHeart,
  Download,
  Star,
  Flame,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { downloadCsv, toCsv } from "@/lib/csv";
import { QUESTIONS } from "@/lib/build-clubero-config";

export const Route = createFileRoute("/superadmin/build-clubero")({
  component: BuildCluberoDashboard,
});

interface OverviewRow {
  sessions: number;
  terminees: number;
  newsletter_leads: number;
  beta_leads: number;
  duree_min_moyenne: number | null;
}
interface OptionRow {
  question_key: string;
  question_type: string;
  option_key: string;
  n: number;
}
interface RankingRow {
  question_key: string;
  option_key: string;
  avg_position: number;
  votes: number;
}
interface NumericRow {
  question_key: string;
  question_type: string;
  moyenne: number;
  min: number;
  max: number;
  mediane: number;
  n: number;
}
interface VerbatimRow {
  question_key: string;
  answer_text: string;
  club: string | null;
  created_at: string;
}
interface LeadRow {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  club: string | null;
  newsletter_opt_in: boolean;
  newsletter_consent_at: string | null;
  beta_opt_in: boolean;
  beta_consent_at: string | null;
  completed_at: string | null;
}
interface AnswerRow {
  question_key: string;
  question_type: string;
  value: unknown;
  created_at: string;
}
interface ResponseRow {
  id: string;
  session_id: string;
  status: "in_progress" | "completed";
  locale: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  club: string | null;
  newsletter_opt_in: boolean;
  beta_opt_in: boolean;
  started_at: string;
  completed_at: string | null;
  answers: AnswerRow[];
}

interface Dashboard {
  overview: OverviewRow | null;
  options: OptionRow[];
  ranking: RankingRow[];
  numeric: NumericRow[];
  verbatims: VerbatimRow[];
  leads: LeadRow[];
  responses: ResponseRow[];
}

function BuildCluberoDashboard() {
  const { t } = useTranslation("buildClubero");
  const [data, setData] = useState<Dashboard | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [responsesErr, setResponsesErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [{ data: raw, error }, { data: rawResp, error: errResp }] = await Promise.all([
        supabase.rpc("admin_build_clubero_dashboard" as never),
        supabase.rpc("admin_build_clubero_responses" as never),
      ]);
      if (cancelled) return;
      if (error) {
        setErr(t("admin.loadError"));
      } else {
        const base = raw as unknown as Omit<Dashboard, "responses">;
        let parsed: unknown = rawResp;
        if (typeof parsed === "string") {
          try { parsed = JSON.parse(parsed); } catch { /* ignore */ }
        }
        const responses = Array.isArray(parsed) ? (parsed as ResponseRow[]) : [];
        if (errResp) {
          console.warn("[build-clubero admin] responses RPC error", errResp);
          setResponsesErr(errResp.message ?? "error");
        }
        setData({ ...base, responses });
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [t]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (err || !data) {
    return (
      <div className="p-6 text-sm text-destructive">{err ?? t("admin.loadError")}</div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6">
      <header className="flex items-center gap-2">
        <MessageCircleHeart className="h-5 w-5 text-primary" />
        <div>
          <h1 className="text-lg font-semibold">{t("admin.title")}</h1>
          <p className="text-xs text-muted-foreground">{t("admin.subtitle")}</p>
        </div>
      </header>

      <StatsGrid overview={data.overview} />

      <Section title={t("admin.sections.leads")}>
        <LeadsTable leads={data.leads} />
      </Section>

      <Section title={t("admin.sections.options")}>
        <OptionsCharts options={data.options} />
      </Section>

      <Section title={t("admin.sections.ranking")}>
        <RankingList ranking={data.ranking} />
      </Section>

      <Section title={t("admin.sections.numeric")}>
        <NumericCards numeric={data.numeric} />
      </Section>

      <Section title={t("admin.sections.verbatims")}>
        <VerbatimsList items={data.verbatims} />
      </Section>

      <CollapsibleSection title={t("admin.responses.title")} defaultOpen={false}>
        {responsesErr ? (
          <p className="text-sm text-destructive">{responsesErr}</p>
        ) : (
          <ResponsesList responses={data.responses} />
        )}
      </CollapsibleSection>
    </div>
  );
}

function StatsGrid({ overview }: { overview: OverviewRow | null }) {
  const { t } = useTranslation("buildClubero");
  const items = [
    { label: t("admin.stats.sessions"), value: overview?.sessions ?? 0 },
    { label: t("admin.stats.completed"), value: overview?.terminees ?? 0 },
    { label: t("admin.stats.newsletter"), value: overview?.newsletter_leads ?? 0 },
    { label: t("admin.stats.beta"), value: overview?.beta_leads ?? 0 },
    {
      label: t("admin.stats.duration"),
      value: overview?.duree_min_moyenne != null ? overview.duree_min_moyenne : "—",
    },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
      {items.map((it) => (
        <div key={it.label} className="rounded-xl border border-border bg-card p-4">
          <div className="text-xs text-muted-foreground">{it.label}</div>
          <div className="mt-1 text-2xl font-semibold">{it.value}</div>
        </div>
      ))}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold text-muted-foreground">{title}</h2>
      {children}
    </section>
  );
}

function OptionsCharts({ options }: { options: OptionRow[] }) {
  const { t } = useTranslation("buildClubero");
  const byQ = useMemo(() => {
    const m = new Map<string, OptionRow[]>();
    for (const r of options) {
      const arr = m.get(r.question_key) ?? [];
      arr.push(r);
      m.set(r.question_key, arr);
    }
    return m;
  }, [options]);

  if (!options.length) {
    return <p className="text-sm text-muted-foreground">{t("admin.empty")}</p>;
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {Array.from(byQ.entries()).map(([qkey, rows]) => {
        const chartData = rows.map((r) => ({
          option: t(`questions.${qkey}.options.${r.option_key}.label`, {
            defaultValue: r.option_key,
          }),
          n: r.n,
        }));
        return (
          <div key={qkey} className="rounded-xl border border-border bg-card p-4">
            <div className="mb-2 text-sm font-medium">
              {t(`questions.${qkey}.title`, { defaultValue: qkey })}
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.2} />
                <XAxis dataKey="option" fontSize={11} interval={0} angle={-15} textAnchor="end" height={60} />
                <YAxis fontSize={11} allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="n" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        );
      })}
    </div>
  );
}

function RankingList({ ranking }: { ranking: RankingRow[] }) {
  const { t } = useTranslation("buildClubero");
  const byQ = useMemo(() => {
    const m = new Map<string, RankingRow[]>();
    for (const r of ranking) {
      const arr = m.get(r.question_key) ?? [];
      arr.push(r);
      m.set(r.question_key, arr);
    }
    return m;
  }, [ranking]);
  if (!ranking.length) return <p className="text-sm text-muted-foreground">{t("admin.empty")}</p>;
  return (
    <div className="space-y-4">
      {Array.from(byQ.entries()).map(([qkey, rows]) => (
        <div key={qkey} className="rounded-xl border border-border bg-card p-4">
          <div className="mb-3 text-sm font-medium">
            {t(`questions.${qkey}.title`, { defaultValue: qkey })}
          </div>
          <ol className="space-y-2">
            {rows.map((r, i) => (
              <li key={r.option_key} className="flex items-center gap-3 text-sm">
                <span className="grid h-6 w-6 place-items-center rounded-md bg-primary/10 text-xs font-bold text-primary">
                  {i + 1}
                </span>
                <span className="flex-1">
                  {t(`questions.${qkey}.options.${r.option_key}.label`, {
                    defaultValue: r.option_key,
                  })}
                </span>
                <span className="text-xs text-muted-foreground">
                  <Star size={12} className="mr-0.5 inline" />
                  {r.avg_position} · {r.votes}
                </span>
              </li>
            ))}
          </ol>
        </div>
      ))}
    </div>
  );
}

function NumericCards({ numeric }: { numeric: NumericRow[] }) {
  const { t } = useTranslation("buildClubero");
  if (!numeric.length) return <p className="text-sm text-muted-foreground">{t("admin.empty")}</p>;
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
      {numeric.map((r) => (
        <div key={r.question_key} className="rounded-xl border border-border bg-card p-4">
          <div className="mb-2 text-sm font-medium">
            {t(`questions.${r.question_key}.title`, { defaultValue: r.question_key })}
          </div>
          <div className="grid grid-cols-4 gap-2 text-center text-xs">
            <div>
              <div className="text-muted-foreground">Moy.</div>
              <div className="text-base font-semibold">{r.moyenne}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Med.</div>
              <div className="text-base font-semibold">{Number(r.mediane).toFixed(1)}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Min–Max</div>
              <div className="text-base font-semibold">
                {r.min}–{r.max}
              </div>
            </div>
            <div>
              <div className="text-muted-foreground">n</div>
              <div className="text-base font-semibold">{r.n}</div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function VerbatimsList({ items }: { items: VerbatimRow[] }) {
  const { t } = useTranslation("buildClubero");
  if (!items.length) return <p className="text-sm text-muted-foreground">{t("admin.empty")}</p>;
  return (
    <div className="max-h-[360px] space-y-2 overflow-y-auto rounded-xl border border-border bg-card p-3">
      {items.map((v, i) => (
        <div key={i} className="rounded-lg bg-muted/40 p-3">
          <div className="text-sm">{v.answer_text}</div>
          <div className="mt-1 flex gap-2 text-xs text-muted-foreground">
            <Flame size={12} />
            <span>
              {t(`questions.${v.question_key}.title`, { defaultValue: v.question_key })}
            </span>
            {v.club && <span>· {v.club}</span>}
            <span>· {new Date(v.created_at).toLocaleDateString()}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function LeadsTable({ leads }: { leads: LeadRow[] }) {
  const { t } = useTranslation("buildClubero");
  const onExport = () => {
    const csv = toCsv(
      leads.map((l) => ({
        first_name: l.first_name ?? "",
        last_name: l.last_name ?? "",
        email: l.email ?? "",
        phone: l.phone ?? "",
        club: l.club ?? "",
        newsletter: l.newsletter_opt_in ? "yes" : "no",
        newsletter_consent_at: l.newsletter_consent_at ?? "",
        beta: l.beta_opt_in ? "yes" : "no",
        beta_consent_at: l.beta_consent_at ?? "",
        completed_at: l.completed_at ?? "",
      })),
      [
        { key: "first_name", header: t("admin.leads.firstName") },
        { key: "last_name", header: t("admin.leads.lastName") },
        { key: "email", header: t("admin.leads.email") },
        { key: "phone", header: t("admin.leads.phone") },
        { key: "club", header: t("admin.leads.club") },
        { key: "newsletter", header: t("admin.leads.newsletter") },
        { key: "newsletter_consent_at", header: "Newsletter consent" },
        { key: "beta", header: t("admin.leads.beta") },
        { key: "beta_consent_at", header: "Beta consent" },
        { key: "completed_at", header: t("admin.leads.date") },
      ],
    );
    downloadCsv("build-clubero-leads", csv);
  };

  if (!leads.length) return <p className="text-sm text-muted-foreground">{t("admin.empty")}</p>;
  return (
    <div>
      <div className="mb-3 flex justify-end">
        <button
          type="button"
          onClick={onExport}
          className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-1.5 text-sm hover:bg-muted"
        >
          <Download size={14} />
          {t("admin.leads.exportCsv")}
        </button>
      </div>
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-left text-sm">
          <thead className="bg-muted/40 text-xs text-muted-foreground">
            <tr>
              <th className="p-2">{t("admin.leads.firstName")}</th>
              <th className="p-2">{t("admin.leads.lastName")}</th>
              <th className="p-2">{t("admin.leads.email")}</th>
              <th className="p-2">{t("admin.leads.phone")}</th>
              <th className="p-2">{t("admin.leads.club")}</th>
              <th className="p-2 text-center">{t("admin.leads.newsletter")}</th>
              <th className="p-2 text-center">{t("admin.leads.beta")}</th>
              <th className="p-2">{t("admin.leads.date")}</th>
            </tr>
          </thead>
          <tbody>
            {leads.map((l) => (
              <tr key={l.id} className="border-t border-border/60">
                <td className="p-2">{l.first_name ?? "—"}</td>
                <td className="p-2">{l.last_name ?? "—"}</td>
                <td className="p-2 font-mono text-xs">{l.email ?? "—"}</td>
                <td className="p-2">{l.phone ?? "—"}</td>
                <td className="p-2">{l.club ?? "—"}</td>
                <td className="p-2 text-center">
                  {l.newsletter_opt_in ? (
                    <span title={l.newsletter_consent_at ?? ""} className="text-emerald-500">
                      ✓
                    </span>
                  ) : (
                    <span className="text-muted-foreground">·</span>
                  )}
                </td>
                <td className="p-2 text-center">
                  {l.beta_opt_in ? (
                    <span title={l.beta_consent_at ?? ""} className="text-emerald-500">
                      ✓
                    </span>
                  ) : (
                    <span className="text-muted-foreground">·</span>
                  )}
                </td>
                <td className="p-2 text-xs text-muted-foreground">
                  {l.completed_at ? new Date(l.completed_at).toLocaleDateString() : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* keep bundle import used */}
      <span className="hidden">{QUESTIONS.length}</span>
    </div>
  );
}

function ResponsesList({ responses }: { responses: ResponseRow[] }) {
  const { t } = useTranslation("buildClubero");
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());
  if (!responses.length) {
    return <p className="text-sm text-muted-foreground">{t("admin.responses.empty")}</p>;
  }
  const toggle = (id: string) => {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  return (
    <div className="space-y-2">
      {responses.map((r) => {
        const isOpen = !collapsedIds.has(r.id);
        const fullName = [r.first_name, r.last_name].filter(Boolean).join(" ").trim();
        const identity =
          fullName || r.email || r.club || `${t("admin.responses.anonymous")} · ${r.session_id.slice(0, 8)}`;

        return (
          <div key={r.id} className="rounded-xl border border-border bg-card">
            <button
              type="button"
              onClick={() => toggle(r.id)}
              className="flex w-full items-center gap-3 p-3 text-left hover:bg-muted/40"
            >
              <span
                className={`inline-flex h-6 min-w-6 items-center justify-center rounded-full px-2 text-[11px] font-semibold ${
                  r.status === "completed"
                    ? "bg-emerald-500/15 text-emerald-500"
                    : "bg-amber-500/15 text-amber-500"
                }`}
              >
                {r.status === "completed"
                  ? t("admin.responses.completedStatus")
                  : t("admin.responses.inProgressStatus")}
              </span>
              <span className="flex-1 min-w-0">
                <span className="block truncate text-sm font-medium">{identity}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {r.email ?? "—"} {r.club ? `· ${r.club}` : ""}
                </span>
              </span>
              <span className="hidden text-xs text-muted-foreground md:block">
                {t("admin.responses.started")}: {new Date(r.started_at).toLocaleString()}
              </span>
              <span className="text-xs text-primary">
                {isOpen ? t("admin.responses.hideAnswers") : t("admin.responses.viewAnswers")}
              </span>
            </button>
            {isOpen && (
              <div className="border-t border-border/60 p-3">
                {r.answers.length === 0 ? (
                  <p className="text-xs text-muted-foreground">{t("admin.empty")}</p>
                ) : (
                  <ul className="space-y-2">
                    {r.answers.map((a) => (
                      <li
                        key={a.question_key}
                        className="rounded-lg bg-muted/40 p-2 text-sm"
                      >
                        <div className="text-xs font-medium text-muted-foreground">
                          {t(`questions.${a.question_key}.title`, {
                            defaultValue: a.question_key,
                          })}
                          <span className="ml-2 opacity-60">[{a.question_type}]</span>
                        </div>
                        <div className="mt-1 whitespace-pre-wrap break-words">
                          {formatAnswerValue(a.question_key, a.question_type, a.value, t)}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function formatAnswerValue(
  qkey: string,
  qtype: string,
  value: unknown,
  t: (k: string, o?: Record<string, unknown>) => string,
): string {
  const optLabel = (id: string) =>
    t(`questions.${qkey}.options.${id}.label`, { defaultValue: id });
  if (value == null) return "—";
  if (qtype === "rank" || qtype === "multi") {
    if (!Array.isArray(value)) return String(value);
    if (qtype === "rank") return value.map((id, i) => `${i + 1}. ${optLabel(String(id))}`).join(" · ");
    return value.map((id) => optLabel(String(id))).join(", ");
  }
  if (qtype === "single" || qtype === "icon") return optLabel(String(value));
  if (qtype === "text") return String(value);
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}
