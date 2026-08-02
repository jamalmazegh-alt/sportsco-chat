/**
 * Server-only — prévient le staff d'une équipe qu'un joueur vient de rejoindre
 * le club via un lien / QR code, pour qu'il puisse valider la fiche.
 *
 * Best-effort et idempotent : une notification `qr_player_joined` par
 * (staff, joueur) au maximum.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendPushToUser } from "@/lib/push-send.server";

/** Rôles considérés comme staff d'équipe (aligné sur le reste de l'app). */
export const QR_STAFF_ROLES = ["coach", "assistant_coach", "admin"] as const;

type QrLang = "fr" | "en" | "es" | "de" | "it" | "nl" | "pt";

const I18N: Record<QrLang, { title: string; body: (p: string, t: string) => string }> = {
  fr: {
    title: "🆕 Nouveau joueur via QR code",
    body: (p, t) => `${p} a rejoint ${t}. Vérifiez sa fiche.`,
  },
  en: {
    title: "🆕 New player via QR code",
    body: (p, t) => `${p} joined ${t}. Please review their profile.`,
  },
  es: {
    title: "🆕 Nuevo jugador por código QR",
    body: (p, t) => `${p} se ha unido a ${t}. Revisa su ficha.`,
  },
  de: {
    title: "🆕 Neuer Spieler über QR-Code",
    body: (p, t) => `${p} ist ${t} beigetreten. Bitte Profil prüfen.`,
  },
  it: {
    title: "🆕 Nuovo giocatore tramite QR code",
    body: (p, t) => `${p} si è unito a ${t}. Controlla la sua scheda.`,
  },
  nl: {
    title: "🆕 Nieuwe speler via QR-code",
    body: (p, t) => `${p} is lid geworden van ${t}. Controleer het profiel.`,
  },
  pt: {
    title: "🆕 Novo jogador via QR code",
    body: (p, t) => `${p} juntou-se a ${t}. Verifique a ficha.`,
  },
};

/** Message localisé pour la notif "joueur rejoint via QR". */
export function qrJoinMessage(
  lang: string | null | undefined,
  playerName: string,
  teamName: string,
): { title: string; body: string } {
  const key = (lang ?? "fr").slice(0, 2).toLowerCase() as QrLang;
  const t = I18N[key] ?? I18N.fr;
  return { title: t.title, body: t.body(playerName, teamName) };
}

/** Destinataires staff, dédupliqués et sans l'auteur du join. */
export function pickStaffTargets(
  rows: Array<{ user_id: string | null; role?: string | null }>,
  actorUserId: string,
): string[] {
  const out = new Set<string>();
  for (const r of rows) {
    if (r.role && !(QR_STAFF_ROLES as readonly string[]).includes(r.role)) continue;
    if (r.user_id && r.user_id !== actorUserId) out.add(r.user_id);
  }
  return Array.from(out);
}

export interface QrJoinNotifyResult {
  notified: number;
  playerId: string | null;
}

/** Retrouve le joueur créé/rattaché par ce user lors du redeem du token. */
async function resolvePlayerForUser(
  teamId: string,
  userId: string,
): Promise<{ id: string; first_name: string | null; last_name: string | null } | null> {
  const { data: rosterRows } = await supabaseAdmin
    .from("team_members")
    .select("player_id")
    .eq("team_id", teamId);
  const playerIds = (rosterRows ?? [])
    .map((r) => (r as { player_id: string | null }).player_id)
    .filter((x): x is string => !!x);
  if (playerIds.length === 0) return null;

  // Joueur = le user lui-même…
  const { data: own } = await supabaseAdmin
    .from("players")
    .select("id, first_name, last_name, created_at")
    .in("id", playerIds)
    .eq("user_id", userId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(1);
  if (own && own.length > 0) return own[0] as never;

  // … ou son enfant.
  const { data: links } = await supabaseAdmin
    .from("player_parents")
    .select("player_id")
    .eq("parent_user_id", userId)
    .in("player_id", playerIds);
  const childIds = (links ?? []).map((l) => (l as { player_id: string }).player_id);
  if (childIds.length === 0) return null;

  const { data: child } = await supabaseAdmin
    .from("players")
    .select("id, first_name, last_name, created_at")
    .in("id", childIds)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(1);
  return child && child.length > 0 ? (child[0] as never) : null;
}

export async function notifyTeamStaffOfQrJoin(
  token: string,
  userId: string,
): Promise<QrJoinNotifyResult> {
  const { data: invite } = await supabaseAdmin
    .from("club_invites")
    .select("club_id, team_id")
    .eq("token", token)
    .maybeSingle();
  const teamId = (invite as { team_id: string | null } | null)?.team_id ?? null;
  if (!teamId) return { notified: 0, playerId: null };

  const player = await resolvePlayerForUser(teamId, userId);
  if (!player) return { notified: 0, playerId: null };

  const { data: team } = await supabaseAdmin
    .from("teams")
    .select("name")
    .eq("id", teamId)
    .maybeSingle();
  const teamName = (team as { name: string } | null)?.name ?? "l'équipe";

  // NB: on ne filtre pas le rôle côté SQL — `assistant_coach` n'existe pas dans
  // l'enum `app_role`, un `.in()` provoquerait une erreur de cast. Filtrage en TS.
  const { data: staff } = await supabaseAdmin
    .from("team_members")
    .select("user_id, role")
    .eq("team_id", teamId)
    .not("user_id", "is", null);

  const targets = new Set<string>(
    pickStaffTargets(
      (staff ?? []) as Array<{ user_id: string | null; role: string | null }>,
      userId,
    ),
  );
  if (targets.size === 0) return { notified: 0, playerId: player.id };

  const link = `/players/${player.id}`;
  const playerName =
    [player.first_name, player.last_name].filter(Boolean).join(" ").trim() || "Un joueur";

  // Idempotence : on ne renotifie pas un staff déjà prévenu pour ce joueur.
  const { data: already } = await supabaseAdmin
    .from("notifications")
    .select("user_id")
    .eq("type", "qr_player_joined")
    .eq("link", link)
    .in("user_id", Array.from(targets));
  for (const a of already ?? []) targets.delete((a as { user_id: string }).user_id);
  if (targets.size === 0) return { notified: 0, playerId: player.id };

  const uids = Array.from(targets);
  const { data: profs } = await supabaseAdmin
    .from("profiles")
    .select("id, preferred_language")
    .in("id", uids);
  const langByUser = new Map<string, string | null>(
    (profs ?? []).map((p) => [
      (p as { id: string }).id,
      (p as { preferred_language: string | null }).preferred_language,
    ]),
  );
  const msgFor = (uid: string) => qrJoinMessage(langByUser.get(uid), playerName, teamName);

  const { error } = await supabaseAdmin.from("notifications").insert(
    uids.map((uid) => {
      const m = msgFor(uid);
      return { user_id: uid, type: "qr_player_joined", title: m.title, body: m.body, link };
    }),
  );
  if (error) {
    console.error("[qr-join-notify] insert failed", error);
    return { notified: 0, playerId: player.id };
  }

  await Promise.allSettled(
    uids.map((uid) =>
      sendPushToUser(uid, {
        ...msgFor(uid),
        url: `${link}?from=push`,
        tag: `qr-join-${player.id}`,
      }),
    ),
  );

  return { notified: uids.length, playerId: player.id };
}
