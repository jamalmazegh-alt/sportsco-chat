import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import i18n from "@/lib/i18n";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, Loader2, MailCheck } from "lucide-react";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";

const PREFILL_KEY = "clubero:forgot_email";

export const Route = createFileRoute("/forgot-password")({
  component: ForgotPasswordPage,
  head: () => ({
    meta: [
      { title: i18n.t("meta.forgot.title") },
      { name: "description", content: i18n.t("meta.forgot.description") },
    ],
  }),
});

function ForgotPasswordPage() {
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = sessionStorage.getItem(PREFILL_KEY);
    if (saved) setEmail(saved);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (email) sessionStorage.setItem(PREFILL_KEY, email);
  }, [email]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/reset-password`,
      });
    } catch {
      // Same UX whether the address exists or sending failed.
    } finally {
      setBusy(false);
      setSent(true);
    }
  }

  const lng = (i18n.language ?? "fr").slice(0, 2);

  return (
    <div className="clubero-login">
      <style>{SHARED_CSS}</style>

      <div className="field-bg" aria-hidden="true">
        <div className="pitch">
          <svg
            viewBox="0 0 400 820"
            preserveAspectRatio="xMidYMid slice"
            fill="none"
            stroke="rgba(150,180,255,.13)"
            strokeWidth="1.6"
          >
            <line x1="-40" y1="410" x2="440" y2="410" />
            <circle cx="200" cy="410" r="78" />
            <circle cx="200" cy="410" r="3" fill="rgba(150,180,255,.13)" stroke="none" />
            <rect x="118" y="724" width="164" height="120" />
            <rect x="160" y="788" width="80" height="56" />
            <path d="M150 724a52 52 0 0 0 100 0" />
            <rect x="118" y="-24" width="164" height="120" />
            <rect x="160" y="-24" width="80" height="40" />
          </svg>
        </div>
        <div className="streaks" />
        <div className="aurora a" />
        <div className="aurora b" />
      </div>

      <div className="topbar">
        <Link to="/login" className="back">
          <ArrowLeft className="h-4 w-4" />
          {t("auth.backToLogin")}
        </Link>
        <LanguageSwitcher current={lng} onChange={(l) => i18n.changeLanguage(l)} />
      </div>

      <main className="wrap">
        <div className="brand">
          <span className="mark">
            <svg width="30" height="30" viewBox="0 0 30 30" fill="none">
              <path
                d="M21 8.5A8 8 0 1 0 21 21.5"
                stroke="#fff"
                strokeWidth="3"
                strokeLinecap="round"
              />
              <path
                d="M16 15h8m0 0-3.4-3.4M24 15l-3.4 3.4"
                stroke="#38BDF8"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          <span className="wordmark">Clubero</span>
        </div>

        <p className="tagline">{sent ? t("auth.resetSentTitle") : t("auth.forgotTitle")}</p>

        {sent ? (
          <div className="card" style={{ textAlign: "center" }}>
            <div className="success-icon">
              <MailCheck className="h-7 w-7" />
            </div>
            <p className="success-text">{t("auth.resetSent")}</p>
            <p className="success-hint">{t("auth.resetSentHint")}</p>
            <Link to="/login" className="cta cta-link">
              {t("auth.backToLogin")}
            </Link>
            <button type="button" className="forgot" onClick={() => setSent(false)}>
              {t("auth.useDifferentEmail")}
            </button>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="card">
            <p className="subtitle">{t("auth.forgotSubtitle")}</p>
            <div className="field">
              <div className="control">
                <input
                  id="email"
                  type="email"
                  required
                  autoComplete="email"
                  placeholder=" "
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
                <label htmlFor="email">{t("auth.email")}</label>
              </div>
            </div>
            <button type="submit" className="cta" disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : t("auth.sendResetLink")}
            </button>
            <Link to="/login" className="forgot">
              {t("auth.backToLogin")}
            </Link>
          </form>
        )}
      </main>
    </div>
  );
}

const SHARED_CSS = `
.clubero-login{
  --bg-deep:#070D1B;
  --bg-rise:#0B1730;
  --electric:#2E6BFF;
  --electric-bright:#5B9BFF;
  --cyan:#38BDF8;
  --green:#10B981;
  --green-deep:#059669;
  --ink:#F4F8FF;
  --muted:#8FA3C2;
  --glass:rgba(255,255,255,.045);
  --glass-line:rgba(120,160,255,.18);
  --field:rgba(8,16,34,.55);
  font-family:'Inter',system-ui,sans-serif;
  background:var(--bg-deep);
  color:var(--ink);
  min-height:100dvh;
  display:flex;flex-direction:column;align-items:center;
  padding:max(20px,env(safe-area-inset-top)) 22px max(24px,env(safe-area-inset-bottom));
  position:relative;overflow:hidden;
  -webkit-font-smoothing:antialiased;
}
.clubero-login *{box-sizing:border-box}
.clubero-login .field-bg{position:fixed;inset:0;z-index:0;overflow:hidden;
  background:
    radial-gradient(120% 80% at 50% -10%, rgba(46,107,255,.18), transparent 60%),
    radial-gradient(100% 70% at 50% 115%, rgba(16,185,129,.10), transparent 60%),
    linear-gradient(180deg,var(--bg-deep),var(--bg-rise));
  animation:cl-fadeIn 1.2s ease both;
}
.clubero-login .aurora{position:absolute;border-radius:50%;filter:blur(60px);opacity:.55;mix-blend-mode:screen}
.clubero-login .aurora.a{width:520px;height:520px;left:-120px;top:-80px;
  background:radial-gradient(circle,rgba(46,107,255,.7),transparent 65%);
  animation:cl-drift1 18s ease-in-out infinite}
.clubero-login .aurora.b{width:440px;height:440px;right:-140px;top:30%;
  background:radial-gradient(circle,rgba(56,189,248,.55),transparent 65%);
  animation:cl-drift2 22s ease-in-out infinite}
.clubero-login .streaks{position:absolute;inset:-40% -10%;opacity:.10;
  background:repeating-linear-gradient(112deg,transparent 0 38px,rgba(120,170,255,.9) 38px 40px);
  -webkit-mask:radial-gradient(70% 55% at 50% 42%,#000,transparent 75%);
          mask:radial-gradient(70% 55% at 50% 42%,#000,transparent 75%);
  animation:cl-slide 14s linear infinite}
.clubero-login .pitch{position:absolute;inset:0;opacity:.55;
  -webkit-mask:radial-gradient(78% 60% at 50% 44%,#000,transparent 82%);
          mask:radial-gradient(78% 60% at 50% 44%,#000,transparent 82%)}
.clubero-login .pitch svg{width:100%;height:100%}

.clubero-login .topbar{position:relative;z-index:2;width:100%;max-width:430px;
  display:flex;align-items:center;justify-content:space-between;
  margin-bottom:4vh;animation:cl-fadeDown .7s .05s ease both}
.clubero-login .back{display:inline-flex;align-items:center;gap:6px;color:var(--muted);
  font-size:13.5px;font-weight:500;text-decoration:none;white-space:nowrap;
  transition:color .2s;background:none;border:none;cursor:pointer;padding:0}
.clubero-login .back:hover{color:#B9C8E4}

.clubero-login .wrap{position:relative;z-index:2;width:100%;max-width:430px;text-align:center;flex:1;display:flex;flex-direction:column;justify-content:center}

.clubero-login .brand{display:inline-flex;align-items:center;justify-content:center;gap:13px;margin-bottom:18px;
  animation:cl-ignite .9s .25s cubic-bezier(.2,.8,.2,1) both}
.clubero-login .mark{width:54px;height:54px;border-radius:15px;position:relative;
  background:linear-gradient(150deg,#0E1E3E,#0A1530);
  border:1px solid rgba(120,160,255,.25);
  box-shadow:0 0 0 0 rgba(46,107,255,.6);
  animation:cl-pulse 3.4s 1.2s ease-in-out infinite}
.clubero-login .mark svg{position:absolute;inset:0;margin:auto}
.clubero-login .wordmark{font-family:'Sora',system-ui,sans-serif;font-weight:700;font-size:30px;letter-spacing:-.5px;
  background:linear-gradient(90deg,#fff,#BBD3FF);-webkit-background-clip:text;background-clip:text;color:transparent}

.clubero-login .tagline{font-family:'Sora',system-ui,sans-serif;font-weight:500;font-size:18px;line-height:1.45;
  color:#C5D4EE;margin:0 0 34px;animation:cl-fadeUp .7s .45s ease both}

.clubero-login .card{position:relative;text-align:left;padding:26px 22px 24px;border-radius:24px;
  background:var(--glass);backdrop-filter:blur(22px) saturate(140%);-webkit-backdrop-filter:blur(22px) saturate(140%);
  border:1px solid var(--glass-line);
  box-shadow:0 30px 60px -28px rgba(0,0,0,.8),inset 0 1px 0 rgba(255,255,255,.06);
  animation:cl-rise .8s .55s cubic-bezier(.2,.8,.2,1) both}
.clubero-login .card::before{content:"";position:absolute;inset:0;border-radius:24px;padding:1px;
  background:linear-gradient(140deg,rgba(120,170,255,.5),transparent 40%,transparent 70%,rgba(16,185,129,.35));
  -webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);
  -webkit-mask-composite:xor;mask-composite:exclude;pointer-events:none}

.clubero-login .subtitle{margin:0 0 18px;color:var(--muted);font-size:14.5px;line-height:1.5;text-align:center}

.clubero-login .field{position:relative;margin-bottom:16px;animation:cl-fadeUp .6s .7s ease both}
.clubero-login .control{position:relative}
.clubero-login .control input{width:100%;height:58px;padding:22px 16px 8px;border-radius:14px;
  background:var(--field);border:1px solid rgba(120,160,255,.16);
  color:var(--ink);font-size:16px;font-family:inherit;outline:none;
  transition:border-color .25s,box-shadow .25s,background .25s}
.clubero-login .control input:focus{border-color:var(--electric);background:rgba(10,20,44,.8);
  box-shadow:0 0 0 4px rgba(46,107,255,.18),0 0 24px -6px rgba(46,107,255,.7)}
.clubero-login .control label{position:absolute;left:16px;top:18px;color:var(--muted);
  font-size:16px;pointer-events:none;transition:.2s ease;font-weight:400}
.clubero-login .control input:focus+label,
.clubero-login .control input:not(:placeholder-shown)+label{top:9px;font-size:11.5px;font-weight:600;
  letter-spacing:.3px;color:var(--electric-bright);text-transform:uppercase}
.clubero-login .toggle{position:absolute;right:14px;top:50%;transform:translateY(-50%);
  background:none;border:none;color:var(--muted);cursor:pointer;padding:6px;display:flex}
.clubero-login .toggle:hover{color:var(--ink)}
.clubero-login .hint{margin:8px 2px 0;font-size:12px;color:var(--muted)}
.clubero-login .hint.bad{color:#FCA5A5}

.clubero-login .cta{width:100%;height:56px;margin-top:8px;border:none;border-radius:14px;cursor:pointer;
  font-family:'Sora',system-ui,sans-serif;font-weight:600;font-size:16.5px;color:#062014;letter-spacing:.2px;
  background:linear-gradient(180deg,#14D399,var(--green-deep));
  box-shadow:0 14px 30px -10px rgba(16,185,129,.65),inset 0 1px 0 rgba(255,255,255,.4);
  position:relative;overflow:hidden;display:flex;align-items:center;justify-content:center;
  text-decoration:none;
  transition:transform .15s,box-shadow .25s;
  animation:cl-fadeUp .6s .86s ease both}
.clubero-login .cta:hover:not(:disabled){transform:translateY(-2px);box-shadow:0 20px 38px -10px rgba(16,185,129,.8)}
.clubero-login .cta:active{transform:translateY(0) scale(.99)}
.clubero-login .cta:disabled{opacity:.7;cursor:not-allowed}
.clubero-login .cta-link{text-decoration:none}

.clubero-login .forgot{display:block;text-align:center;margin-top:16px;color:var(--muted);
  font-size:14.5px;font-weight:500;text-decoration:none;transition:color .2s;
  background:none;border:none;cursor:pointer;width:100%;
  animation:cl-fadeUp .6s .92s ease both}
.clubero-login .forgot:hover{color:var(--ink)}

.clubero-login .success-icon{width:60px;height:60px;border-radius:50%;margin:0 auto 16px;
  display:flex;align-items:center;justify-content:center;
  background:linear-gradient(150deg,rgba(16,185,129,.25),rgba(16,185,129,.08));
  border:1px solid rgba(16,185,129,.35);color:#14D399}
.clubero-login .success-text{margin:0 0 6px;color:var(--ink);font-size:15px;line-height:1.45}
.clubero-login .success-hint{margin:0 0 18px;color:var(--muted);font-size:13px;line-height:1.5}

@keyframes cl-fadeIn{from{opacity:0}to{opacity:1}}
@keyframes cl-fadeDown{from{opacity:0;transform:translateY(-12px)}to{opacity:1;transform:none}}
@keyframes cl-fadeUp{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:none}}
@keyframes cl-rise{from{opacity:0;transform:translateY(28px) scale(.985)}to{opacity:1;transform:none}}
@keyframes cl-ignite{0%{opacity:0;transform:scale(.86)}60%{opacity:1}100%{transform:scale(1)}}
@keyframes cl-pulse{0%,100%{box-shadow:0 0 0 0 rgba(46,107,255,0)}50%{box-shadow:0 0 26px -2px rgba(46,107,255,.55)}}
@keyframes cl-drift1{0%,100%{transform:translate(0,0)}50%{transform:translate(70px,50px)}}
@keyframes cl-drift2{0%,100%{transform:translate(0,0)}50%{transform:translate(-60px,-40px)}}
@keyframes cl-slide{from{transform:translateX(-40px)}to{transform:translateX(40px)}}
@media (prefers-reduced-motion:reduce){
  .clubero-login *{animation:none!important}
}
`;
