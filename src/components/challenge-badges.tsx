import { useTranslation } from "react-i18next";

type AggregateType = "record" | "cumulative";

const StarSvg = ({ color = "white", size = 15 }: { color?: string; size?: number }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill={color} aria-hidden="true">
    <path d="M12 2l2.9 6.2 6.6.7-4.9 4.5 1.3 6.6L12 17.8 6.1 20l1.3-6.6L2.5 8.9l6.6-.7z" />
  </svg>
);

const TrophySvg = ({ color = "white", size = 15 }: { color?: string; size?: number }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill={color} aria-hidden="true">
    <path d="M6 4h12v2h2v3a4 4 0 0 1-4 4h-.4A4 4 0 0 1 13 15.9V18h3v2H8v-2h3v-2.1A4 4 0 0 1 8.4 13H8a4 4 0 0 1-4-4V6h2z" />
  </svg>
);

/**
 * Medal-styled aggregate badge (Strava-inspired).
 * - record → gold family
 * - cumulative → green family (reuses existing brand palette)
 */
export function AggregateBadge({
  type,
  value,
}: {
  type: AggregateType;
  value: number | string;
}) {
  const { t } = useTranslation("challenges");
  const isRecord = type === "record";

  const pillStyle: React.CSSProperties = isRecord
    ? { background: "var(--gold-tint)" }
    : { background: "#E8F6EE" };

  const coinStyle: React.CSSProperties = {
    width: 26,
    height: 26,
    borderRadius: "50%",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    boxShadow:
      "inset 0 1px 1px rgba(255,255,255,.55), 0 1px 2px rgba(0,0,0,.12)",
    background: isRecord
      ? "linear-gradient(150deg,#F8D06A,#E7A11B)"
      : "linear-gradient(150deg,#4FCB84,#16A34A)",
    flexShrink: 0,
  };

  const labelColor = isRecord ? "var(--gold-deep)" : "#0B8A45";
  const valueColor = isRecord ? "var(--gold-ink)" : "#0B8A45";

  return (
    <span
      className="inline-flex items-center font-extrabold"
      style={{
        ...pillStyle,
        gap: 9,
        padding: "6px 13px 6px 6px",
        borderRadius: 999,
      }}
    >
      <span style={coinStyle}>
        {isRecord ? <StarSvg /> : <TrophySvg />}
      </span>
      <span style={{ display: "inline-flex", alignItems: "baseline", gap: 6 }}>
        <span
          style={{
            fontSize: 10.5,
            letterSpacing: "0.6px",
            textTransform: "uppercase",
            color: labelColor,
            fontWeight: 700,
          }}
        >
          {isRecord
            ? t("player_stats.aggregate_record")
            : t("player_stats.aggregate_cumulative")}
        </span>
        <span
          style={{
            fontSize: 16,
            letterSpacing: "-0.3px",
            color: valueColor,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {value}
        </span>
      </span>
    </span>
  );
}

/**
 * "Nouveau record" celebration badge.
 * Shine + sparkles are disabled via `prefers-reduced-motion`.
 */
export function NewRecordBadge({ value }: { value: number | string }) {
  const { t } = useTranslation("challenges");
  return (
    <span
      className="relative inline-flex items-center overflow-hidden text-white font-extrabold"
      role="status"
      aria-label={`${t("records.new")} ${value}`}
      style={{
        gap: 6,
        padding: "5px 11px 5px 5px",
        borderRadius: 999,
        background: "linear-gradient(135deg,#F8D06A,#E7A11B 55%,#B4771A)",
        boxShadow: "0 3px 8px -2px rgba(199,136,20,.55)",
      }}
    >
      <span className="new-record-shine" aria-hidden="true" />
      <span
        className="new-record-sparkle"
        aria-hidden="true"
        style={{ top: 3, right: 8, animationDelay: "0s" }}
      />
      <span
        className="new-record-sparkle"
        aria-hidden="true"
        style={{ bottom: 4, right: 18, animationDelay: "0.7s" }}
      />
      <span
        className="new-record-sparkle"
        aria-hidden="true"
        style={{ top: 6, right: 28, animationDelay: "1.3s" }}
      />
      <span
        style={{
          width: 20,
          height: 20,
          borderRadius: "50%",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          background: "rgba(255,255,255,.9)",
          flexShrink: 0,
          boxShadow: "inset 0 1px 1px rgba(255,255,255,.7)",
        }}
      >
        <StarSvg color="var(--gold-deep)" size={12} />
      </span>
      <span style={{ display: "inline-flex", alignItems: "baseline", gap: 4 }}>
        <span
          style={{
            fontSize: 9,
            letterSpacing: "0.5px",
            textTransform: "uppercase",
          }}
        >
          {t("records.new")}
        </span>
        <span
          style={{
            fontSize: 13,
            letterSpacing: "-0.2px",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {value}
        </span>
      </span>
    </span>
  );
}
