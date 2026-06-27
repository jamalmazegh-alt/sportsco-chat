import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Mail } from "lucide-react";
import coachBg from "@/assets/coach-anime-bg.jpg";

const SOCIALS = [
  {
    name: "Facebook",
    href: "https://www.facebook.com/people/Clubero/61582503005236/",
    path: "M22 12.06C22 6.51 17.52 2 12 2S2 6.51 2 12.06c0 5 3.66 9.15 8.44 9.94v-7.03H7.9v-2.9h2.54V9.85c0-2.52 1.49-3.91 3.78-3.91 1.09 0 2.24.2 2.24.2v2.47h-1.26c-1.24 0-1.63.77-1.63 1.56v1.88h2.78l-.45 2.9h-2.33V22c4.78-.79 8.43-4.94 8.43-9.94z",
  },
  {
    name: "Instagram",
    href: "https://www.instagram.com/clubero.official",
    path: "M12 2.2c3.2 0 3.58.01 4.85.07 1.17.05 1.8.25 2.23.41.56.22.96.48 1.38.9.42.42.68.82.9 1.38.16.42.36 1.06.41 2.23.06 1.27.07 1.65.07 4.85s-.01 3.58-.07 4.85c-.05 1.17-.25 1.8-.41 2.23-.22.56-.48.96-.9 1.38-.42.42-.82.68-1.38.9-.42.16-1.06.36-2.23.41-1.27.06-1.65.07-4.85.07s-3.58-.01-4.85-.07c-1.17-.05-1.8-.25-2.23-.41a3.7 3.7 0 0 1-1.38-.9 3.7 3.7 0 0 1-.9-1.38c-.16-.42-.36-1.06-.41-2.23C2.21 15.58 2.2 15.2 2.2 12s.01-3.58.07-4.85c.05-1.17.25-1.8.41-2.23.22-.56.48-.96.9-1.38.42-.42.82-.68 1.38-.9.42-.16 1.06-.36 2.23-.41C8.42 2.21 8.8 2.2 12 2.2zM12 0C8.74 0 8.33.01 7.05.07 5.78.13 4.9.34 4.14.63a5.9 5.9 0 0 0-2.13 1.39A5.9 5.9 0 0 0 .63 4.14C.34 4.9.13 5.78.07 7.05.01 8.33 0 8.74 0 12s.01 3.67.07 4.95c.06 1.27.27 2.15.56 2.91a5.9 5.9 0 0 0 1.39 2.13 5.9 5.9 0 0 0 2.13 1.39c.76.29 1.64.5 2.91.56C8.33 23.99 8.74 24 12 24s3.67-.01 4.95-.07c1.27-.06 2.15-.27 2.91-.56a5.9 5.9 0 0 0 2.13-1.39 5.9 5.9 0 0 0 1.39-2.13c.29-.76.5-1.64.56-2.91.06-1.28.07-1.69.07-4.95s-.01-3.67-.07-4.95c-.06-1.27-.27-2.15-.56-2.91a5.9 5.9 0 0 0-1.39-2.13A5.9 5.9 0 0 0 19.86.63C19.1.34 18.22.13 16.95.07 15.67.01 15.26 0 12 0zm0 5.84a6.16 6.16 0 1 0 0 12.32 6.16 6.16 0 0 0 0-12.32zm0 10.16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.4-11.85a1.44 1.44 0 1 0 0 2.88 1.44 1.44 0 0 0 0-2.88z",
  },
  {
    name: "LinkedIn",
    href: "https://www.linkedin.com/company/clubero/",
    path: "M20.45 20.45h-3.55v-5.57c0-1.33-.03-3.04-1.85-3.04-1.86 0-2.14 1.45-2.14 2.95v5.66H9.36V9h3.41v1.56h.05c.47-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28zM5.34 7.43a2.06 2.06 0 1 1 0-4.12 2.06 2.06 0 0 1 0 4.12zM7.12 20.45H3.56V9h3.56v11.45zM22.22 0H1.77C.79 0 0 .77 0 1.72v20.56C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.72V1.72C24 .77 23.2 0 22.22 0z",
  },
];

export function MarketingCtaBanner() {
  const { t } = useTranslation("marketing");

  return (
    <section className="relative overflow-hidden bg-[#070D1B] text-white">
      {/* Anime coach background */}
      <img
        src={coachBg}
        alt=""
        aria-hidden="true"
        loading="lazy"
        width={1536}
        height={1024}
        className="pointer-events-none absolute inset-0 h-full w-full object-cover object-center opacity-70"
      />
      {/* Readability overlay */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "linear-gradient(90deg, rgba(7,13,27,0.92) 0%, rgba(7,13,27,0.78) 45%, rgba(7,13,27,0.55) 100%)",
        }}
      />
      {/* Glow accents */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div
          className="absolute -left-32 -top-24 h-[520px] w-[520px] rounded-full opacity-40 blur-3xl"
          style={{ background: "radial-gradient(circle, rgba(46,107,255,.55), transparent 65%)" }}
        />
        <div
          className="absolute -right-32 top-1/3 h-[440px] w-[440px] rounded-full opacity-30 blur-3xl"
          style={{ background: "radial-gradient(circle, rgba(56,189,248,.45), transparent 65%)" }}
        />
      </div>

      <div className="relative mx-auto max-w-7xl px-5 py-16 lg:px-8 lg:py-20">
        <div className="grid gap-12 md:grid-cols-[1.5fr_1fr] md:items-center">
          {/* Slogan */}
          <div>
            <h2
              className="text-3xl font-bold leading-tight tracking-tight sm:text-4xl lg:text-5xl"
              style={{ fontFamily: "'Sora', system-ui, sans-serif" }}
            >
              {t("footer.banner.line1")}{" "}
              <span style={{ color: "#A3E635" }}>{t("footer.banner.accent")}</span>{" "}
              {t("footer.banner.line2")}
            </h2>
            <p
              className="mt-5 text-base text-[#C5D4EE] sm:text-lg"
              style={{ fontFamily: "'Sora', system-ui, sans-serif" }}
            >
              {t("footer.banner.sub")}{" "}
              <span style={{ color: "#A3E635" }}>{t("footer.banner.subAccent")}</span>
            </p>
          </div>

          {/* Contact + socials */}
          <div className="flex flex-col gap-6 md:items-end">
            <Link
              to="/contact"
              className="inline-flex h-12 items-center justify-center gap-2 rounded-xl px-6 text-sm font-semibold text-[#062014] shadow-lg transition-transform hover:-translate-y-0.5"
              style={{
                background: "linear-gradient(180deg,#14D399,#059669)",
                fontFamily: "'Sora', system-ui, sans-serif",
                boxShadow: "0 14px 30px -10px rgba(16,185,129,.6)",
              }}
            >
              <Mail className="h-4 w-4" />
              {t("footer.banner.contact")}
            </Link>

            <div className="flex flex-col gap-3 md:items-end">
              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[#8FA3C2]">
                {t("footer.banner.follow")}
              </span>
              <div className="flex items-center gap-3">
                {SOCIALS.map((s) => (
                  <a
                    key={s.name}
                    href={s.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={s.name}
                    className="flex h-11 w-11 items-center justify-center rounded-full border border-white/15 bg-white/5 text-white transition-colors hover:border-white/30 hover:bg-white/10"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      className="h-5 w-5"
                      fill="currentColor"
                      aria-hidden="true"
                    >
                      <path d={s.path} />
                    </svg>
                  </a>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
