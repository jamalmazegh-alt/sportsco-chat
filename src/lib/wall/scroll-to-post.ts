/**
 * Amène une publication du mur dans le champ de vision et la surligne brièvement.
 *
 * Le feed se monte de façon asynchrone (fetch Supabase) : l'ancre `wall-post-<id>`
 * n'existe pas au moment où l'on navigue. D'où les tentatives espacées plutôt
 * qu'un unique `scrollIntoView`.
 *
 * Retourne une fonction d'annulation, à appeler au démontage.
 */
export function scrollToWallPost(postId: string): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let highlightTimer: ReturnType<typeof setTimeout> | undefined;
  let cancelled = false;

  const tryScroll = (attempt: number) => {
    if (cancelled) return;
    const el = document.getElementById(`wall-post-${postId}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("ring-2", "ring-primary", "ring-offset-2");
      highlightTimer = setTimeout(
        () => el.classList.remove("ring-2", "ring-primary", "ring-offset-2"),
        2400,
      );
      return;
    }
    if (attempt < 10) timer = setTimeout(() => tryScroll(attempt + 1), 250);
  };
  tryScroll(0);

  return () => {
    cancelled = true;
    if (timer) clearTimeout(timer);
    if (highlightTimer) clearTimeout(highlightTimer);
  };
}
