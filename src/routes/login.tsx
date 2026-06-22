import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import i18n from "@/lib/i18n";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ArrowLeft, Eye, EyeOff, Loader2, Check } from "lucide-react";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";

export const Route = createFileRoute("/login")({
  validateSearch: (search: Record<string, unknown>) => ({
    invite: typeof search.invite === "string" ? search.invite : undefined,
  }),
  component: LoginPage,
  head: () => ({
    meta: [
      { title: i18n.t("meta.login.title") },
      { name: "description", content: i18n.t("meta.login.description") },
    ],
  }),
});

function LoginPage() {
  const { t } = useTranslation();
  const search = Route.useSearch();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setBusy(false);
      toast.error(t("auth.loginError"));
      return;
    }
    if (search.invite) {
      const { error: memberErr } = await supabase.rpc("redeem_member_invite", { _token: search.invite });
      if (memberErr) {
        const { error: clubErr } = await supabase.rpc("redeem_club_invite", { _token: search.invite });
        if (clubErr) {
          setBusy(false);
          toast.error(memberErr.message || clubErr.message || t("auth.inviteInvalid"));
          return;
        }
      }
    }
    if (typeof window !== "undefined") {
      window.location.replace("/home");
    }
  }

  function rememberEmailForReset() {
    if (typeof window !== "undefined" && email) {
      sessionStorage.setItem("clubero:forgot_email", email);
    }
  }

  const lng = (i18n.language ?? "fr").slice(0, 2);

  return (
    <div className="clubero-login">
      <style>{LOGIN_CSS}</style>

      <div className="field-bg" aria-hidden="true">
        <div className="pitch">
          <svg viewBox="0 0 400 820" preserveAspectRatio="xMidYMid slice" fill="none"
               stroke="rgba(150,180,255,.13)" strokeWidth="1.6">
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
        <a className="back" href="https://www.clubero.app" target="_blank" rel="noopener noreferrer">
          <ArrowLeft className="h-4 w-4" />
          {t("auth.backToWebsite")}
        </a>
        <LanguageSwitcher current={lng} onChange={(l) => i18n.changeLanguage(l)} />
      </div>

      <main className="wrap">
        <div className="brand">
          <span className="mark">
            <svg width="30" height="30" viewBox="0 0 30 30" fill="none">
              <path d="M21 8.5A8 8 0 1 0 21 21.5" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
              <path d="M16 15h8m0 0-3.4-3.4M24 15l-3.4 3.4" stroke="#38BDF8" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <span className="wordmark">Clubero</span>
        </div>

        <p className="tagline">
          {t("app.tagline")}
        </p>

        <form onSubmit={onSubmit} className="card">
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
          <div className="field">
            <div className="control">
              <input
                id="password"
                type={showPw ? "text" : "password"}
                required
                autoComplete="current-password"
                placeholder=" "
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <label htmlFor="password">{t("auth.password")}</label>
              <button
                type="button"
                className="toggle"
                aria-label={showPw ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                onClick={() => setShowPw((v) => !v)}
              >
                {showPw ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>
          </div>
          <button type="submit" className="cta" disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : t("auth.login")}
          </button>
          <Link
            to="/forgot-password"
            onClick={rememberEmailForReset}
            className="forgot"
          >
            {t("auth.forgotPassword")}
          </Link>
        </form>

        <p className="signup">
          {t("auth.noAccount")}{" "}
          <Link to="/register">{t("auth.register")}</Link>
        </p>
      </main>
    </div>
  );
}

const LOGIN_CSS = `
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
  transition:color .2s}
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

.clubero-login .field{position:relative;margin-bottom:16px;animation:cl-fadeUp .6s ease both}
.clubero-login .field:nth-of-type(1){animation-delay:.7s}
.clubero-login .field:nth-of-type(2){animation-delay:.78s}
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

.clubero-login .cta{width:100%;height:56px;margin-top:8px;border:none;border-radius:14px;cursor:pointer;
  font-family:'Sora',system-ui,sans-serif;font-weight:600;font-size:16.5px;color:#062014;letter-spacing:.2px;
  background:linear-gradient(180deg,#14D399,var(--green-deep));
  box-shadow:0 14px 30px -10px rgba(16,185,129,.65),inset 0 1px 0 rgba(255,255,255,.4);
  position:relative;overflow:hidden;display:flex;align-items:center;justify-content:center;
  transition:transform .15s,box-shadow .25s;
  animation:cl-fadeUp .6s .86s ease both}
.clubero-login .cta:hover:not(:disabled){transform:translateY(-2px);box-shadow:0 20px 38px -10px rgba(16,185,129,.8)}
.clubero-login .cta:active{transform:translateY(0) scale(.99)}
.clubero-login .cta:disabled{opacity:.7;cursor:not-allowed}

.clubero-login .forgot{display:block;text-align:center;margin-top:16px;color:var(--muted);
  font-size:14.5px;font-weight:500;text-decoration:none;transition:color .2s;
  animation:cl-fadeUp .6s .92s ease both}
.clubero-login .forgot:hover{color:var(--ink)}

.clubero-login .signup{text-align:center;margin-top:24px;color:var(--muted);font-size:15px;
  animation:cl-fadeUp .6s 1s ease both}
.clubero-login .signup a{color:var(--green);font-weight:600;text-decoration:none}
.clubero-login .signup a:hover{text-decoration:underline}

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
