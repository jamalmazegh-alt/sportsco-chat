/**
 * Docuthèque du mur : projection en lecture des pièces jointes de `wall_posts`.
 *
 * Aucune table dédiée — un document EST une entrée du tableau jsonb
 * `wall_posts.attachments`. La visibilité est donc toujours celle du post
 * porteur (RLS `wall_posts_select`), sans logique de partage supplémentaire.
 *
 * Ce module ne dépend d'aucun composant : il reste testable sans DOM.
 */

export const ATTACHMENT_LABEL_MAX = 80;

/**
 * True dès qu'une pièce jointe n'a pas de nom exploitable. Utilisé par le
 * composer du mur pour bloquer la publication tant que tout n'est pas nommé.
 */
export function hasMissingLabel(items: { label?: string }[]): boolean {
  return items.some((a) => !a.label?.trim());
}

type ParsedAttachment = {
  url: string;
  path: string;
  name: string;
  type: string;
  size: number;
  label?: string;
  excludedFromLibrary?: boolean;
};

export type DocumentPost = {
  id: string;
  created_at: string;
  author_user_id: string | null;
  attachments: unknown;
  hidden_at: string | null;
  source: string | null;
};

export type WallDocument = {
  /** `${postId}:${path}` — un même fichier ne peut pas être posté deux fois (path horodaté). */
  key: string;
  postId: string;
  createdAt: string;
  authorUserId: string | null;
  hidden: boolean;
  url: string;
  path: string;
  /** Nom du fichier d'origine. */
  name: string;
  /** Nom donné par l'auteur ; absent sur les pièces jointes publiées avant la docuthèque. */
  label: string | null;
  type: string;
  size: number;
  /**
   * Retiré de la docuthèque par l'encadrement. Le document reste **entièrement
   * visible dans sa publication** : c'est du rangement, pas de la
   * confidentialité. Ne jamais s'en servir comme d'un contrôle d'accès.
   */
  excludedFromLibrary: boolean;
};

export type DocumentKind = "image" | "pdf" | "doc" | "sheet" | "other";

/**
 * `attachments` est un jsonb non contraint : une entrée sans `url`/`path`/`name`
 * exploitable est ignorée silencieusement plutôt que de faire planter la vue.
 */
function parseAttachment(raw: unknown): ParsedAttachment | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const a = raw as Record<string, unknown>;
  const url = typeof a.url === "string" ? a.url.trim() : "";
  const path = typeof a.path === "string" ? a.path.trim() : "";
  const name = typeof a.name === "string" ? a.name.trim() : "";
  if (!url || !path || !name) return null;
  return {
    url,
    path,
    name,
    type: typeof a.type === "string" ? a.type : "",
    size: typeof a.size === "number" && Number.isFinite(a.size) ? a.size : 0,
    label: typeof a.label === "string" && a.label.trim() ? a.label.trim() : undefined,
    excludedFromLibrary: a.excludedFromLibrary === true,
  };
}

/**
 * Un post relayé depuis un réseau social (instagram/facebook/twitter) n'est pas
 * un document du club. Les posts internes portent `source = 'clubero'`.
 */
export function isExternalPost(post: Pick<DocumentPost, "source">): boolean {
  return !!post.source && post.source !== "clubero";
}

/**
 * Aplatit les posts en une liste de documents, du plus récent au plus ancien.
 * Les posts externes et ceux sans pièce jointe exploitable disparaissent.
 *
 * `includeExcluded` fait remonter les documents retirés de la docuthèque, pour
 * que l'encadrement puisse les remettre — sans cette porte de sortie, retirer
 * un document serait irréversible depuis l'interface.
 */
export function flattenDocuments(
  posts: DocumentPost[],
  opts: { includeExcluded?: boolean } = {},
): WallDocument[] {
  const out: WallDocument[] = [];
  for (const post of posts) {
    if (isExternalPost(post)) continue;
    if (!Array.isArray(post.attachments)) continue;
    for (const raw of post.attachments) {
      const a = parseAttachment(raw);
      if (!a) continue;
      if (a.excludedFromLibrary && !opts.includeExcluded) continue;
      out.push({
        key: `${post.id}:${a.path}`,
        postId: post.id,
        createdAt: post.created_at,
        authorUserId: post.author_user_id,
        hidden: !!post.hidden_at,
        url: a.url,
        path: a.path,
        name: a.name,
        label: a.label ?? null,
        type: a.type,
        size: a.size,
        excludedFromLibrary: !!a.excludedFromLibrary,
      });
    }
  }
  // Anti-chronologique : contrairement à la page Événements (qui regarde vers
  // l'avenir), un document est un élément passé — le plus récent va en haut.
  out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return out;
}

export type DocumentMonthGroup = {
  /** `YYYY-MM`, utilisable comme clé de liste et pour formater l'en-tête. */
  key: string;
  /** Premier jour du mois, pour le formatage localisé côté composant. */
  date: Date;
  items: WallDocument[];
};

/** Groupe par mois de publication, mois le plus récent en premier. */
export function groupDocumentsByMonth(docs: WallDocument[]): DocumentMonthGroup[] {
  const map = new Map<string, DocumentMonthGroup>();
  for (const doc of docs) {
    const d = new Date(doc.createdAt);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    let group = map.get(key);
    if (!group) {
      group = { key, date: new Date(d.getFullYear(), d.getMonth(), 1), items: [] };
      map.set(key, group);
    }
    group.items.push(doc);
  }
  return Array.from(map.values()).sort((a, b) => b.key.localeCompare(a.key));
}

/** Famille de fichier, pour l'icône. */
export function documentKind(type: string, name: string): DocumentKind {
  const mime = (type ?? "").toLowerCase();
  if (mime.startsWith("image/")) return "image";
  if (mime === "application/pdf") return "pdf";
  if (mime.includes("word")) return "doc";
  if (mime.includes("sheet") || mime.includes("excel")) return "sheet";
  // Certains navigateurs ne renseignent pas le MIME : repli sur l'extension.
  const ext = name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1];
  if (!ext) return "other";
  if (["jpg", "jpeg", "png", "gif", "webp", "heic", "heif"].includes(ext)) return "image";
  if (ext === "pdf") return "pdf";
  if (["doc", "docx"].includes(ext)) return "doc";
  if (["xls", "xlsx", "csv"].includes(ext)) return "sheet";
  return "other";
}

export function formatFileSize(bytes: number): string {
  if (!bytes || bytes <= 0) return "";
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(/\.0$/, "")} Mo`;
}
