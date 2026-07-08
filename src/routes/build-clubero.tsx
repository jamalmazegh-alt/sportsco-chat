import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useTranslation, Trans } from "react-i18next";
import i18n from "@/lib/i18n";
import {
  QUESTIONS,
  TOTAL_QUESTIONS,
  reorder,
  emailOk,
  isAnswered,
  buildContactPayload,
  isContactValid,
  type Question,
  type ContactFormValues,
} from "@/lib/build-clubero-config";
import { useBuildCluberoSession } from "@/lib/build-clubero-session";
import {
  ArrowRight,
  ArrowLeft,
  Check,
  ChevronUp,
  ChevronDown,
  Sparkles,
  Clock,
  ShieldCheck,
  Send,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/build-clubero")({
  head: () => ({
    meta: [
      { title: i18n.t("meta.title", { ns: "buildClubero" }) },
      { name: "description", content: i18n.t("meta.description", { ns: "buildClubero" }) },
      { property: "og:title", content: i18n.t("meta.title", { ns: "buildClubero" }) },
      { property: "og:description", content: i18n.t("meta.description", { ns: "buildClubero" }) },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "index,follow" },
    ],
  }),
  component: BuildCluberoPage,
});

type Phase = "welcome" | "questions" | "done";

function BuildCluberoPage() {
  const { t } = useTranslation("buildClubero");
  const [phase, setPhase] = useState<Phase>("welcome");
  const [direction, setDirection] = useState<"fwd" | "back">("fwd");

  const session = useBuildCluberoSession({
    questions: QUESTIONS,
    locale: i18n.language,
  });

  const { answers, setAnswer, index, setIndex, saveState } = session;
  const currentQ = QUESTIONS[index];
  const currentValue = currentQ ? answers[currentQ.key] : undefined;

  const canNext = currentQ ? isAnswered(currentQ, currentValue) : false;

  const goNext = () => {
    if (!canNext) return;
    setDirection("fwd");
    if (index + 1 >= TOTAL_QUESTIONS) {
      setPhase("done");
    } else {
      setIndex(index + 1);
    }
  };

  const goBack = () => {
    setDirection("back");
    if (index === 0) {
      setPhase("welcome");
    } else {
      setIndex(index - 1);
    }
  };

  return (
    <div className="bc-root relative min-h-[100dvh] overflow-x-hidden text-[#EAF0FF]">
      <BackgroundAura />
      <div className="relative z-10 mx-auto flex min-h-[100dvh] max-w-[520px] flex-col px-5 pb-[calc(env(safe-area-inset-bottom)+8px)]">
        <TopBar />
        {phase === "questions" && (
          <>
            <ProgressBar index={index} />
            <main className="flex flex-1 flex-col justify-center py-4">
              <div
                key={index}
                className={cn(
                  "rounded-[26px] border border-white/10 bg-gradient-to-b from-[rgba(23,34,92,0.66)] to-[rgba(17,26,70,0.72)] p-6 shadow-[0_24px_60px_-28px_rgba(0,0,10,0.9)] backdrop-blur",
                  direction === "fwd" ? "animate-in slide-in-from-right-4 fade-in" : "animate-in slide-in-from-left-4 fade-in",
                )}
              >
                <QuestionEyebrow index={index} />
                <h2 className="mb-1.5 font-semibold text-[23px] leading-tight tracking-tight">
                  {t(`questions.${currentQ.key}.title`)}
                </h2>
                <p className="mb-5 text-[14.5px] leading-snug text-[#93A0D4]">
                  {t(`questions.${currentQ.key}.subtitle`)}
                </p>
                <QuestionRenderer
                  q={currentQ}
                  value={currentValue}
                  onChange={(v) => setAnswer(currentQ.key, v)}
                />
              </div>
              <NavBar
                index={index}
                canNext={canNext}
                onBack={goBack}
                onNext={goNext}
                saveState={saveState}
              />
            </main>
          </>
        )}
        {phase === "welcome" && (
          <WelcomeScreen
            onStart={() => {
              setPhase("questions");
              setIndex(0);
            }}
          />
        )}
        {phase === "done" && (
          <DoneScreen
            onComplete={session.complete}
            resetLocal={session.resetLocal}
          />
        )}
      </div>
    </div>
  );
}

function BackgroundAura() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-0 opacity-70"
      style={{
        background:
          "radial-gradient(60% 45% at 82% -8%, rgba(55,225,255,.16), transparent 60%),radial-gradient(55% 40% at 8% 6%, rgba(61,107,255,.22), transparent 62%),linear-gradient(180deg, #0B1030, #070A1F 60%)",
      }}
    />
  );
}

function TopBar() {
  return (
    <header className="flex items-center justify-between py-4">
      <div className="flex items-center gap-2 font-bold tracking-tight">
        <span className="grid h-[26px] w-[26px] place-items-center rounded-lg bg-gradient-to-br from-[#3D6BFF] to-[#37E1FF] shadow-[0_6px_18px_rgba(55,120,255,0.45)]">
          <Sparkles size={15} strokeWidth={2.5} className="text-[#06122e]" />
        </span>
        Clubero
      </div>
      <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.06] px-3 py-1.5 text-xs font-semibold text-[#93A0D4]">
        <Clock size={12} />
        {useTranslation("buildClubero").t("hero.badge")}
      </span>
    </header>
  );
}

function ProgressBar({ index }: { index: number }) {
  const { t } = useTranslation("buildClubero");
  const pct = Math.round((index / TOTAL_QUESTIONS) * 100);
  return (
    <div className="pt-2 pb-1">
      <div className="mb-2 flex justify-between text-xs font-semibold text-[#93A0D4]">
        <span>
          {t("progress.question", {
            current: Math.min(index + 1, TOTAL_QUESTIONS),
            total: TOTAL_QUESTIONS,
          })}
        </span>
        <span>{t("progress.percent", { pct })}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full bg-gradient-to-r from-[#3D6BFF] to-[#37E1FF] shadow-[0_0_16px_rgba(55,180,255,0.55)] transition-[width] duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function QuestionEyebrow({ index }: { index: number }) {
  return (
    <div className="mb-3 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-[#37E1FF]">
      <Sparkles size={12} />
      {String(index + 1).padStart(2, "0")}
    </div>
  );
}

function NavBar({
  index,
  canNext,
  onBack,
  onNext,
  saveState,
}: {
  index: number;
  canNext: boolean;
  onBack: () => void;
  onNext: () => void;
  saveState: string;
}) {
  const { t } = useTranslation("buildClubero");
  const isLast = index + 1 >= TOTAL_QUESTIONS;
  return (
    <div className="flex items-center gap-3 pt-4">
      <button
        type="button"
        onClick={onBack}
        aria-label={t("nav.back")}
        className="flex h-[54px] w-[54px] items-center justify-center rounded-2xl border border-white/10 bg-white/[0.06] text-[#93A0D4] transition hover:text-white"
      >
        <ArrowLeft size={20} />
      </button>
      <button
        type="button"
        onClick={onNext}
        disabled={!canNext}
        className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-gradient-to-br from-[#5B8CFF] to-[#37E1FF] px-5 py-4 font-bold text-[#06122e] shadow-[0_14px_34px_-12px_rgba(55,150,255,0.85)] transition disabled:cursor-not-allowed disabled:opacity-40 disabled:grayscale"
      >
        {t("nav.next")}
        <ArrowRight size={18} />
      </button>
      <span
        className={cn(
          "hidden text-[11px] font-semibold text-[#37E1FF] transition-opacity sm:inline-flex sm:items-center sm:gap-1",
          saveState === "saved" || saveState === "saving" ? "opacity-100" : "opacity-0",
        )}
        aria-live="polite"
      >
        {saveState === "saving" ? (
          <>
            <Loader2 size={11} className="animate-spin" />
            {t("save.saving")}
          </>
        ) : (
          <>
            <Check size={11} />
            {t("save.saved")}
          </>
        )}
      </span>
      <span className="sr-only" aria-live="polite">
        {isLast ? t("nav.send") : ""}
      </span>
    </div>
  );
}

/* -------------------- Question renderers -------------------- */

function QuestionRenderer({
  q,
  value,
  onChange,
}: {
  q: Question;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  switch (q.type) {
    case "single":
      return <SingleChoice q={q} value={value as string | undefined} onChange={onChange} />;
    case "multi":
      return <MultiChoice q={q} value={(value as string[]) ?? []} onChange={onChange} />;
    case "icon":
      return <IconGrid q={q} value={value as string | undefined} onChange={onChange} />;
    case "rating":
      return <RatingScale q={q} value={value as number | undefined} onChange={onChange} />;
    case "slider":
      return <SliderInput q={q} value={value as number | undefined} onChange={onChange} />;
    case "rank":
      return <RankList q={q} value={(value as string[]) ?? q.options.map((o) => o.id)} onChange={onChange} />;
    case "text":
      return <TextArea q={q} value={(value as string) ?? ""} onChange={onChange} />;
  }
}

function SingleChoice({
  q,
  value,
  onChange,
}: {
  q: Extract<Question, { type: "single" }>;
  value: string | undefined;
  onChange: (v: unknown) => void;
}) {
  const { t } = useTranslation("buildClubero");
  return (
    <div className="flex flex-col gap-2.5">
      {q.options.map((o) => {
        const sel = value === o.id;
        const hint = t(`questions.${q.key}.options.${o.id}.hint`, { defaultValue: "" });
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => onChange(o.id)}
            aria-pressed={sel}
            className={cn(
              "flex w-full items-center gap-3 rounded-2xl border-[1.5px] px-4 py-3.5 text-left font-semibold transition",
              sel
                ? "border-[#5B8CFF] bg-gradient-to-b from-[rgba(61,107,255,0.22)] to-[rgba(55,225,255,0.10)] shadow-[0_0_0_3px_rgba(61,107,255,0.18)]"
                : "border-white/10 bg-white/[0.04] hover:border-white/25",
            )}
          >
            <div className="flex-1">
              <div className="text-[15.5px]">{t(`questions.${q.key}.options.${o.id}.label`)}</div>
              {hint && <div className="mt-0.5 text-xs font-medium text-[#93A0D4]">{hint}</div>}
            </div>
            <Tick selected={sel} />
          </button>
        );
      })}
    </div>
  );
}

function MultiChoice({
  q,
  value,
  onChange,
}: {
  q: Extract<Question, { type: "multi" }>;
  value: string[];
  onChange: (v: unknown) => void;
}) {
  const { t } = useTranslation("buildClubero");
  const toggle = (id: string) => {
    if (value.includes(id)) {
      onChange(value.filter((v) => v !== id));
    } else if (!q.max || value.length < q.max) {
      onChange([...value, id]);
    }
  };
  return (
    <div className="flex flex-col gap-2.5">
      {q.max && (
        <p className="text-xs text-[#93A0D4]">{t("hints.multiMax", { max: q.max })}</p>
      )}
      {q.options.map((o) => {
        const sel = value.includes(o.id);
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => toggle(o.id)}
            aria-pressed={sel}
            className={cn(
              "flex w-full items-center gap-3 rounded-2xl border-[1.5px] px-4 py-3.5 text-left text-[15.5px] font-semibold transition",
              sel
                ? "border-[#5B8CFF] bg-gradient-to-b from-[rgba(61,107,255,0.22)] to-[rgba(55,225,255,0.10)] shadow-[0_0_0_3px_rgba(61,107,255,0.18)]"
                : "border-white/10 bg-white/[0.04] hover:border-white/25",
            )}
          >
            <span className="flex-1">{t(`questions.${q.key}.options.${o.id}.label`)}</span>
            <Tick selected={sel} square />
          </button>
        );
      })}
    </div>
  );
}

function IconGrid({
  q,
  value,
  onChange,
}: {
  q: Extract<Question, { type: "icon" }>;
  value: string | undefined;
  onChange: (v: unknown) => void;
}) {
  const { t } = useTranslation("buildClubero");
  return (
    <div className="grid grid-cols-3 gap-2.5">
      {q.options.map((o) => {
        const sel = value === o.id;
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => onChange(o.id)}
            aria-pressed={sel}
            className={cn(
              "flex aspect-square flex-col items-center justify-center gap-2 rounded-2xl border-[1.5px] text-[13px] font-semibold transition",
              sel
                ? "-translate-y-0.5 border-[#5B8CFF] bg-gradient-to-b from-[rgba(61,107,255,0.24)] to-[rgba(55,225,255,0.10)] shadow-[0_0_0_3px_rgba(61,107,255,0.18)]"
                : "border-white/10 bg-white/[0.04] hover:border-white/25",
            )}
          >
            <span className="text-[32px] leading-none drop-shadow-[0_4px_10px_rgba(0,0,0,0.4)]">
              {o.emoji}
            </span>
            <span>{t(`questions.${q.key}.options.${o.id}.label`)}</span>
          </button>
        );
      })}
    </div>
  );
}

function RatingScale({
  q,
  value,
  onChange,
}: {
  q: Extract<Question, { type: "rating" }>;
  value: number | undefined;
  onChange: (v: unknown) => void;
}) {
  const { t } = useTranslation("buildClubero");
  return (
    <div className="flex justify-between gap-1.5">
      {q.scale.map((s) => {
        const sel = value === s.v;
        const label = t(`questions.${q.key}.scale.${s.v}`);
        return (
          <button
            key={s.v}
            type="button"
            onClick={() => onChange(s.v)}
            aria-pressed={sel}
            aria-label={label}
            className={cn(
              "flex flex-1 flex-col items-center gap-2 rounded-xl px-1 py-2 transition",
              sel ? "text-white" : "text-[#5C6AA6]",
            )}
          >
            <span
              className={cn(
                "text-[30px] transition-all",
                sel ? "scale-125" : "scale-90 opacity-60 grayscale",
              )}
            >
              {s.emoji}
            </span>
            <span
              className={cn(
                "min-h-[26px] text-center text-[10.5px] font-semibold leading-tight transition-opacity",
                sel ? "opacity-100" : "opacity-0",
              )}
            >
              {label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function SliderInput({
  q,
  value,
  onChange,
}: {
  q: Extract<Question, { type: "slider" }>;
  value: number | undefined;
  onChange: (v: unknown) => void;
}) {
  const { t } = useTranslation("buildClubero");
  const v = typeof value === "number" ? value : q.defaultValue;
  useEffect(() => {
    if (value === undefined) onChange(q.defaultValue);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const pct = ((v - q.min) / (q.max - q.min)) * 100;
  const label = v >= q.max ? t("slider.valueMax") : t("slider.value", { value: v });
  return (
    <div>
      <div className="mb-4 bg-gradient-to-br from-[#5B8CFF] to-[#37E1FF] bg-clip-text text-center text-[44px] font-extrabold tracking-tight text-transparent">
        {label}
      </div>
      <input
        type="range"
        min={q.min}
        max={q.max}
        step={q.step}
        value={v}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label={t(`questions.${q.key}.title`)}
        className="h-2.5 w-full cursor-pointer appearance-none rounded-full border border-white/10 outline-none"
        style={{
          background: `linear-gradient(90deg, #3D6BFF, #37E1FF) no-repeat`,
          backgroundSize: `${pct}% 100%`,
          backgroundColor: "rgba(125,150,255,0.15)",
        }}
      />
      <div className="mt-3 flex justify-between text-xs font-semibold text-[#93A0D4]">
        <span>{t(`questions.${q.key}.min`)}</span>
        <span>{t(`questions.${q.key}.max`)}</span>
      </div>
    </div>
  );
}

function RankList({
  q,
  value,
  onChange,
}: {
  q: Extract<Question, { type: "rank" }>;
  value: string[];
  onChange: (v: unknown) => void;
}) {
  const { t } = useTranslation("buildClubero");
  const order = value.length === q.options.length ? value : q.options.map((o) => o.id);
  const move = (from: number, to: number) => {
    if (to < 0 || to >= order.length) return;
    onChange(reorder(order, from, to));
  };
  useEffect(() => {
    if (value.length !== q.options.length) onChange(order);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <ol className="flex flex-col gap-2.5" aria-label={t(`questions.${q.key}.title`)}>
      {order.map((id, i) => {
        const opt = q.options.find((o) => o.id === id);
        if (!opt) return null;
        return (
          <li
            key={id}
            className="flex items-center gap-3 rounded-2xl border-[1.5px] border-white/10 bg-white/[0.06] px-3 py-3"
          >
            <span className="grid h-6 w-6 flex-none place-items-center rounded-lg bg-gradient-to-br from-[#3D6BFF] to-[#37E1FF] text-[13px] font-extrabold text-[#06122e]">
              {i + 1}
            </span>
            <span className="text-xl">{opt.emoji}</span>
            <span className="flex-1 text-[14.5px] font-semibold">
              {t(`questions.${q.key}.options.${id}.label`)}
            </span>
            <div className="flex flex-col gap-0.5">
              <button
                type="button"
                onClick={() => move(i, i - 1)}
                disabled={i === 0}
                aria-label={t("nav.rankUp")}
                className="grid h-5 w-[26px] place-items-center rounded-md border border-white/10 bg-white/10 text-[#93A0D4] disabled:opacity-30"
              >
                <ChevronUp size={14} />
              </button>
              <button
                type="button"
                onClick={() => move(i, i + 1)}
                disabled={i === order.length - 1}
                aria-label={t("nav.rankDown")}
                className="grid h-5 w-[26px] place-items-center rounded-md border border-white/10 bg-white/10 text-[#93A0D4] disabled:opacity-30"
              >
                <ChevronDown size={14} />
              </button>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function TextArea({
  q,
  value,
  onChange,
}: {
  q: Extract<Question, { type: "text" }>;
  value: string;
  onChange: (v: unknown) => void;
}) {
  const { t } = useTranslation("buildClubero");
  return (
    <div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value.slice(0, q.maxLength))}
        placeholder={t(`questions.${q.key}.placeholder`)}
        maxLength={q.maxLength}
        className="min-h-[120px] w-full resize-none rounded-2xl border-[1.5px] border-white/10 bg-white/[0.04] px-4 py-3.5 text-base leading-relaxed text-white outline-none transition focus:border-[#5B8CFF] focus:ring-[3px] focus:ring-[#3D6BFF]/20"
      />
      <div className="mt-2 text-right text-xs text-[#93A0D4]">
        {t("text.count", { count: value.length, max: q.maxLength })}
      </div>
    </div>
  );
}

function Tick({ selected, square }: { selected: boolean; square?: boolean }) {
  return (
    <span
      className={cn(
        "grid h-6 w-6 flex-none place-items-center border-[1.5px] transition",
        square ? "rounded-md" : "rounded-full",
        selected
          ? "border-transparent bg-gradient-to-br from-[#3D6BFF] to-[#37E1FF]"
          : "border-white/25",
      )}
    >
      <Check
        size={14}
        className={cn(
          "text-[#06122e] transition",
          selected ? "scale-100 opacity-100" : "scale-50 opacity-0",
        )}
      />
    </span>
  );
}

/* -------------------- Welcome / Done -------------------- */

function WelcomeScreen({ onStart }: { onStart: () => void }) {
  const { t } = useTranslation("buildClubero");
  return (
    <section className="flex flex-1 flex-col justify-center py-6">
      <span className="mb-6 inline-flex w-fit items-center gap-1.5 rounded-full border border-[#37E1FF]/25 bg-[#37E1FF]/10 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-[#37E1FF]">
        <Sparkles size={12} />
        {t("hero.badge")}
      </span>
      <h1 className="mb-4 text-[33px] font-extrabold leading-[1.12] tracking-tight">
        <Trans
          i18nKey="hero.title"
          ns="buildClubero"
          components={{
            accent: (
              <span className="bg-gradient-to-r from-[#5B8CFF] to-[#37E1FF] bg-clip-text text-transparent" />
            ),
          }}
        />
      </h1>
      <p className="mb-3 text-base font-semibold leading-relaxed">{t("hero.lead")}</p>
      <p className="mb-5 text-base leading-relaxed text-[#93A0D4]">{t("hero.body")}</p>
      <p className="mb-6 flex items-center gap-2 text-[13.5px] font-semibold text-[#93A0D4]">
        <ShieldCheck size={14} />
        {t("hero.meta")}
      </p>
      <button
        type="button"
        onClick={onStart}
        className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-br from-[#5B8CFF] to-[#37E1FF] px-6 py-4 text-base font-bold text-[#06122e] shadow-[0_14px_34px_-12px_rgba(55,150,255,0.85)]"
      >
        {t("hero.cta")}
        <ArrowRight size={18} />
      </button>
    </section>
  );
}

function DoneScreen({
  onComplete,
  resetLocal,
}: {
  onComplete: (contact: ReturnType<typeof buildContactPayload>) => Promise<void>;
  resetLocal: () => void;
}) {
  const { t } = useTranslation("buildClubero");
  const [values, setValues] = useState<ContactFormValues>({
    first_name: "",
    email: "",
    phone: "",
    club: "",
    newsletter: false,
    beta: false,
  });
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [emailTouched, setEmailTouched] = useState(false);

  const contactRequested = values.newsletter || values.beta;
  const emailInvalid = contactRequested && emailTouched && !emailOk(values.email);
  const canSubmit = !sending && isContactValid(values);

  const submit = async (withContact: boolean) => {
    setErr(null);
    if (withContact) setEmailTouched(true);
    const payload = withContact ? buildContactPayload(values) : null;
    if (withContact && !isContactValid(values)) return;
    setSending(true);
    try {
      await onComplete(payload);
      resetLocal();
      setSent(true);
    } catch (e) {
      setErr(e instanceof Error ? e.message : t("errors.submit"));
    } finally {
      setSending(false);
    }
  };

  if (sent) {
    return (
      <section className="flex flex-1 flex-col justify-center py-8 text-center">
        <div className="mx-auto mb-4 grid h-[76px] w-[76px] place-items-center rounded-full bg-gradient-to-br from-[#3D6BFF] to-[#37E1FF] shadow-[0_16px_40px_-12px_rgba(55,150,255,0.8)]">
          <Check size={32} className="text-[#06122e]" strokeWidth={3} />
        </div>
        <h1 className="mb-3 text-[28px] font-extrabold tracking-tight">{t("done.thanksTitle")}</h1>
        <p className="mx-auto max-w-[340px] text-[15px] leading-relaxed text-[#93A0D4]">
          {t("done.thanksBody")}
        </p>
      </section>
    );
  }

  return (
    <section className="flex flex-1 flex-col justify-center py-6">
      <div className="mb-2 animate-bounce text-center text-[56px]">{t("done.emoji")}</div>
      <h1 className="mb-3 text-center text-[28px] font-extrabold tracking-tight">
        {t("done.title")}
      </h1>
      <p className="mx-auto mb-6 max-w-[340px] text-center text-[15px] leading-relaxed text-[#93A0D4]">
        {t("done.body")}
      </p>

      <div className="rounded-3xl border border-white/10 bg-gradient-to-b from-[rgba(23,34,92,0.66)] to-[rgba(17,26,70,0.72)] p-6">
        <h2 className="mb-4 text-sm font-bold uppercase tracking-wider text-[#37E1FF]">
          {t("done.contactTitle")}
        </h2>
        <div className="flex flex-col gap-3">
          <Field label={t("done.form.firstName")}>
            <input
              type="text"
              value={values.first_name}
              onChange={(e) => setValues((v) => ({ ...v, first_name: e.target.value }))}
              className="bc-input"
            />
          </Field>
          <Field
            label={contactRequested ? t("done.form.emailRequired") : t("done.form.email")}
            error={emailInvalid ? t("done.form.errorEmail") : null}
          >
            <input
              type="email"
              inputMode="email"
              autoComplete="email"
              value={values.email}
              onChange={(e) => setValues((v) => ({ ...v, email: e.target.value }))}
              onBlur={() => setEmailTouched(true)}
              className={cn("bc-input", emailInvalid && "border-[#ff6b81]")}
            />
          </Field>
          <Field label={t("done.form.phone")}>
            <input
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              value={values.phone}
              onChange={(e) => setValues((v) => ({ ...v, phone: e.target.value }))}
              className="bc-input"
            />
          </Field>
          <Field label={t("done.form.club")}>
            <input
              type="text"
              value={values.club}
              onChange={(e) => setValues((v) => ({ ...v, club: e.target.value }))}
              className="bc-input"
            />
          </Field>
          <label className="mt-2 flex items-start gap-3 text-sm text-white/80">
            <input
              type="checkbox"
              checked={values.newsletter}
              onChange={(e) => setValues((v) => ({ ...v, newsletter: e.target.checked }))}
              className="mt-0.5 h-4 w-4 flex-none accent-[#37E1FF]"
            />
            <span>{t("done.form.newsletter")}</span>
          </label>
          <label className="flex items-start gap-3 text-sm text-white/80">
            <input
              type="checkbox"
              checked={values.beta}
              onChange={(e) => setValues((v) => ({ ...v, beta: e.target.checked }))}
              className="mt-0.5 h-4 w-4 flex-none accent-[#37E1FF]"
            />
            <span>{t("done.form.beta")}</span>
          </label>
          <p className="text-xs text-[#5C6AA6]">{t("done.form.consentHint")}</p>
        </div>

        {err && (
          <p role="alert" className="mt-4 rounded-lg border border-[#ff6b81]/40 bg-[#ff6b81]/10 px-3 py-2 text-sm text-[#ffb8c3]">
            {err}
          </p>
        )}

        <button
          type="button"
          onClick={() => submit(true)}
          disabled={!canSubmit}
          className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-br from-[#5B8CFF] to-[#37E1FF] px-5 py-4 font-bold text-[#06122e] shadow-[0_14px_34px_-12px_rgba(55,150,255,0.85)] transition disabled:cursor-not-allowed disabled:opacity-40"
        >
          {sending ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
          {sending ? t("nav.sending") : t("done.send")}
        </button>

        <button
          type="button"
          onClick={() => submit(false)}
          disabled={sending}
          className="mx-auto mt-2 block text-sm font-semibold text-[#93A0D4] underline underline-offset-4 hover:text-white"
        >
          {t("done.skip")}
        </button>
      </div>
    </section>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string | null;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-[12.5px] font-bold tracking-wide text-[#93A0D4]">
        {label}
      </label>
      {children}
      {error && <p className="mt-1 text-xs text-[#ff8fa1]">{error}</p>}
    </div>
  );
}

// Local class helper used above to keep inputs consistent.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-empty-interface
  interface CSSStyleDeclaration {}
}
