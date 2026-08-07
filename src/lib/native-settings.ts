/**
 * Ouverture des réglages de notification du système.
 *
 * Une permission de notification refusée ne peut plus être redemandée : iOS
 * interdit de rouvrir la boîte de dialogue système. Les réglages sont donc le
 * seul chemin de retour, et l'application doit y conduire.
 *
 * `app-settings:` — l'équivalent d'`openSettingsURLString` — n'ouvre que la
 * racine des réglages de l'app ; l'utilisateur doit encore trouver
 * « Notifications ». Apple expose depuis iOS 16 une constante qui y mène
 * directement, mais accessible uniquement depuis du code natif : d'où le petit
 * plugin déclaré dans `AppDelegate.swift`.
 *
 * On lit parfois des URL du type `app-settings:root=NOTIFICATIONS`. Elles ne
 * sont pas documentées et valent régulièrement un rejet à la revue — elles ne
 * sont donc pas utilisées ici.
 */
import { registerPlugin } from "@capacitor/core";
import { getPlatform, isNativePlatform } from "@/lib/native-platform";
import { openInSystemApp } from "@/lib/open-url";

interface NotificationSettingsPlugin {
  open(): Promise<void>;
}

const NotificationSettings = registerPlugin<NotificationSettingsPlugin>("NotificationSettings");

/**
 * `true` si l'application peut proposer un accès direct aux réglages.
 *
 * Android n'a pas d'équivalent atteignable par URL : ouvrir ses réglages de
 * notification demande un Intent explicite. Afficher le bouton y produirait un
 * clic sans effet, ce qui est pire que pas de bouton du tout.
 */
export function canOpenNotificationSettings(): boolean {
  return isNativePlatform() && getPlatform() === "ios";
}

export async function openNotificationSettings(): Promise<void> {
  if (!canOpenNotificationSettings()) return;
  try {
    await NotificationSettings.open();
  } catch (e) {
    // Repli sur la racine des réglages : un écran de trop vaut mieux qu'un
    // bouton mort si le plugin natif venait à manquer d'une build à l'autre.
    console.warn("[settings] plugin natif indisponible:", (e as Error).message);
    openInSystemApp("app-settings:");
  }
}
