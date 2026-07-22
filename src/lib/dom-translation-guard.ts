// Defensive patch for React vs. in-browser translators (Safari, iOS WebViews,
// Instagram/Facebook in-app browsers) that mutate the DOM under React and
// cause "Failed to execute 'removeChild'/'insertBefore' on 'Node'" crashes.
//
// The workaround (well-known in the React + Google/Safari Translate community)
// is to no-op these calls when the target node is no longer a child of the
// parent, instead of throwing. Native behaviour is preserved in all other
// cases. Runs once, client-only.

let installed = false;

export function installDomTranslationGuard(): void {
  if (installed) return;
  if (typeof window === "undefined") return;
  installed = true;

  try {
    const originalRemoveChild = Node.prototype.removeChild;
    Node.prototype.removeChild = function <T extends Node>(this: Node, child: T): T {
      if (child.parentNode !== this) {
        if (typeof console !== "undefined") {
          // eslint-disable-next-line no-console
          console.warn(
            "[dom-translation-guard] Suppressed removeChild on detached node (likely browser translation).",
          );
        }
        return child;
      }
      return originalRemoveChild.call(this, child) as T;
    } as typeof Node.prototype.removeChild;

    const originalInsertBefore = Node.prototype.insertBefore;
    Node.prototype.insertBefore = function <T extends Node>(
      this: Node,
      newNode: T,
      referenceNode: Node | null,
    ): T {
      if (referenceNode && referenceNode.parentNode !== this) {
        if (typeof console !== "undefined") {
          // eslint-disable-next-line no-console
          console.warn(
            "[dom-translation-guard] Suppressed insertBefore with detached reference node (likely browser translation).",
          );
        }
        return newNode;
      }
      return originalInsertBefore.call(this, newNode, referenceNode) as T;
    } as typeof Node.prototype.insertBefore;
  } catch {
    // If patching fails, silently keep native behaviour.
  }
}
