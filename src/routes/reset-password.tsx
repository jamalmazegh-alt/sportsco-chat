import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import i18n from "@/lib/i18n";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ArrowLeft, Eye, EyeOff, Loader2 } from "lucide-react";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { localizeAuthError } from "@/lib/auth-errors";

export const Route = createFileRoute("/reset-password")({
  component: ResetPasswordPage,
  head: () => ({
    meta: [
      { title: i18n.t("meta.reset.title") },
      { name: "description", content: i18n.t("meta.reset.description") },
    ],
  }),
});

function ResetPasswordPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") setReady(true);
    });
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;
  const passwordValid = passwordRegex.test(password);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!passwordValid) {
      toast.error(t("auth.passwordTooWeak"));
      return;
    }
    if (password !== confirm) {
      toast.error(t("auth.passwordMismatch"));
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) {
      toast.error(localizeAuthError(error, t));
      return;
    }
    toast.success(t("auth.passwordUpdated"));
    navigate({ to: "/home" });
  }

  const lng = (i18n.language ?? "fr").slice(0, 2);

  return (
    <div className="clubero-login">
      <style>{SHARED_CSS}</style>

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
              <path d="M21 8.5A8 8 0 1 0 21 21.5" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
              <path d="M16 15h8m0 0-3.4-3.4M24 15l-3.4 3.4" stroke="#38BDF8" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <span className="wordmark">Clubero</span>
        </div>

        <p className="tagline">{t("auth.resetTitle")}</p>

        <form onSubmit={onSubmit} className="card">
          <p className="subtitle">{t("auth.resetSubtitle")}</p>
          <div className="field">
            <div className="control">
              <input
                id="password"
                type={showPw ? "text" : "password"}
                required
                autoComplete="new-password"
                placeholder=" "
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <label htmlFor="password">{t("auth.newPassword")}</label>
              <button
                type="button"
                className="toggle"
                aria-label={showPw ? "Hide" : "Show"}
                onClick={() => setShowPw((v) => !v)}
              >
                {showPw ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>
            <p className={`hint ${password.length === 0 || passwordValid ? "" : "bad"}`}>
              {t("auth.passwordRequirements")}
            </p>
          </div>
          <div className="field">
            <div className="control">
              <input
                id="confirm"
                type={showConfirm ? "text" : "password"}
                required
                autoComplete="new-password"
                placeholder=" "
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
              <label htmlFor="confirm">{t("auth.confirmPassword")}</label>
              <button
                type="button"
                className="toggle"
                aria-label={showConfirm ? "Hide" : "Show"}
                onClick={() => setShowConfirm((v) => !v)}
              >
                {showConfirm ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>
          </div>
          <button type="submit" className="cta" disabled={busy || !ready}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : t("auth.updatePassword")}
          </button>
          {!ready && (
            <p className="hint" style={{ textAlign: "center", marginTop: 12 }}>
              {t("auth.resetLinkRequired")}
            </p>
          )}
        </form>
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
