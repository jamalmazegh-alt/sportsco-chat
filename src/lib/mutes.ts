/**
 * Filtres de masquage personnel (« bloquer » au sens Google Play / App Store).
 *
 * Le masquage ne s'applique qu'aux contenus sociaux — mur (posts, commentaires,
 * réactions) et chat d'événement — filtrés côté client au rendu. Les
 * communications officielles (convocations, événements, notifications) ne
 * passent pas par ces filtres et restent visibles.
 */

type CommentLike = { author_user_id: string; reactions?: { user_id: string }[] };
type PostLike = {
  author_user_id: string | null;
  comments?: CommentLike[];
  reactions?: { user_id: string }[];
};

/**
 * Retire les posts dont l'auteur est masqué, ainsi que les commentaires et
 * réactions (de posts et de commentaires) émis par des personnes masquées.
 */
export function filterMutedWallPosts<P extends PostLike>(
  posts: P[],
  muted: ReadonlySet<string>,
): P[] {
  if (muted.size === 0) return posts;
  return posts
    .filter((p) => !p.author_user_id || !muted.has(p.author_user_id))
    .map((p) => ({
      ...p,
      comments: p.comments
        ?.filter((c) => !muted.has(c.author_user_id))
        .map((c) =>
          c.reactions ? { ...c, reactions: c.reactions.filter((r) => !muted.has(r.user_id)) } : c,
        ),
      reactions: p.reactions?.filter((r) => !muted.has(r.user_id)),
    }));
}

/** Retire les messages de chat dont l'auteur est masqué. */
export function filterMutedMessages<M extends { author_user_id: string }>(
  messages: M[],
  muted: ReadonlySet<string>,
): M[] {
  if (muted.size === 0) return messages;
  return messages.filter((m) => !muted.has(m.author_user_id));
}
