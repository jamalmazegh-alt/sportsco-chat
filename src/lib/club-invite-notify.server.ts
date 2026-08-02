/**
 * Server-only — prévient le staff d'une équipe qu'un joueur vient de rejoindre
 * le club via un lien / QR code, pour qu'il puisse valider la fiche.
 *
 * Best-effort et idempotent : une notification `qr_player_joined` par
 * (staff, joueur) au maximum.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendPushToUser } from "@/lib/push-send.server";

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

  const { data: staff } = await supabaseAdmin
    .from("team_members")
    .select("user_id")
    .eq("team_id", teamId)
    .in("role", ["coach", "admin"]);

  const targets = new Set<string>();
  for (const s of staff ?? []) {
    const uid = (s as { user_id: string | null }).user_id;
    if (uid && uid !== userId) targets.add(uid);
  }
  if (targets.size === 0) return { notified: 0, playerId: player.id };

  const link = `/players/${player.id}`;
  const playerName =
    [player.first_name, player.last_name].filter(Boolean).join(" ").trim() || "Un joueur";
  const title = "🆕 Nouveau joueur via QR code";
  const body = `${playerName} a rejoint ${teamName}. Vérifiez sa fiche.`;

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
  const { error } = await supabaseAdmin
    .from("notifications")
    .insert(uids.map((uid) => ({ user_id: uid, type: "qr_player_joined", title, body, link })));
  if (error) {
    console.error("[qr-join-notify] insert failed", error);
    return { notified: 0, playerId: player.id };
  }

  await Promise.allSettled(
    uids.map((uid) =>
      sendPushToUser(uid, {
        title,
        body,
        url: `${link}?from=push`,
        tag: `qr-join-${player.id}`,
      }),
    ),
  );

  return { notified: uids.length, playerId: player.id };
}
