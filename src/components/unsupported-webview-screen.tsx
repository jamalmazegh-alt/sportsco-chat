import { useTranslation } from "react-i18next";
import { getChromeMajorVersion, MIN_CHROME_VERSION } from "@/lib/webview-support";

/**
 * Écran affiché lorsque la WebView est trop ancienne pour rendre l'app.
 *
 * Styles écrits en CSS inline, volontairement : les classes Tailwind ne
 * s'appliqueraient pas, puisque c'est précisément ce qui ne fonctionne pas.
 *
 * Deux boutons plutôt qu'un : sur certains appareils la WebView stable ne se
 * met plus à jour, et il faut alors passer par la version Beta puis la
 * sélectionner dans les options de développement. Cas rencontré sur un
 * Galaxy S10 réel.
 */
export function UnsupportedWebViewScreen() {
  const { t } = useTranslation();
  const version = getChromeMajorVersion();

  const openPlayStore = (pkg: string) => {
    window.location.href = `https://play.google.com/store/apps/details?id=${pkg}`;
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
        background: "#010E30",
        color: "#ffffff",
        fontFamily: "system-ui, -apple-system, sans-serif",
        textAlign: "center",
        boxSizing: "border-box",
      }}
    >
      <h1 style={{ fontSize: "22px", fontWeight: 700, margin: "0 0 12px" }}>
        {t("unsupportedWebview.title")}
      </h1>

      <p style={{ fontSize: "15px", lineHeight: 1.5, margin: "0 0 8px", maxWidth: "340px" }}>
        {t("unsupportedWebview.body")}
      </p>

      <p
        style={{
          fontSize: "13px",
          lineHeight: 1.5,
          margin: "0 0 24px",
          maxWidth: "340px",
          opacity: 0.7,
        }}
      >
        {version
          ? t("unsupportedWebview.versionDetected", { version, min: MIN_CHROME_VERSION })
          : t("unsupportedWebview.versionMinOnly", { min: MIN_CHROME_VERSION })}{" "}
        {t("unsupportedWebview.freeUpdate")}
      </p>

      <button
        type="button"
        onClick={() => openPlayStore("com.google.android.webview")}
        style={{
          background: "#1d7a45",
          color: "#ffffff",
          border: "none",
          borderRadius: "12px",
          padding: "14px 24px",
          fontSize: "15px",
          fontWeight: 600,
          cursor: "pointer",
          marginBottom: "12px",
          width: "100%",
          maxWidth: "320px",
        }}
      >
        {t("unsupportedWebview.updateCta")}
      </button>

      <button
        type="button"
        onClick={() => window.location.reload()}
        style={{
          background: "transparent",
          color: "#ffffff",
          border: "1px solid rgba(255,255,255,0.3)",
          borderRadius: "12px",
          padding: "12px 24px",
          fontSize: "14px",
          cursor: "pointer",
          width: "100%",
          maxWidth: "320px",
        }}
      >
        {t("unsupportedWebview.retryCta")}
      </button>

      <p
        style={{
          fontSize: "12px",
          lineHeight: 1.5,
          margin: "24px 0 0",
          maxWidth: "340px",
          opacity: 0.55,
        }}
      >
        {t("unsupportedWebview.betaHint")}
      </p>
    </div>
  );
}
