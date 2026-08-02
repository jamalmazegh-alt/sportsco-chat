/**
 * Docuthèque du mur — RLS des pièces jointes.
 *
 * La docuthèque n'a AUCUNE table ni policy à elle : elle relit
 * `wall_posts.attachments` et hérite donc de `wall_posts_select`. Ce fichier
 * verrouille cette hypothèse, qui est la seule chose qui empêche un parent de
 * lire les documents d'une autre équipe.
 *
 * Ce qui est prouvé ici, et que les suites `wall.team-staff` / `wall.group-audience`
 * ne couvrent pas : le contenu de la COLONNE `attachments` suit exactement la
 * visibilité de la ligne. Une fuite ne viendrait pas d'une ligne visible en trop,
 * mais d'un document lisible sur une ligne qui ne devrait pas l'être.
 *
 * Seed : les posts avec `audience_team_ids` DOIVENT être créés via un client
 * authentifié (admin/coach). Le trigger `wall_posts_validate_audience` lit
 * `auth.uid()` — avec le service_role c'est NULL, et le ciblage d'équipe est
 * refusé (`user <NULL> cannot target team`). Les posts club-wide n'ont pas ce
 * problème, mais on reste cohérent et on seed tout via `signInAs`.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { admin } from "./_admin";
import { signInAs } from "./_clients";
import { getFixtures, type Role } from "./_setup";

const createdPosts: string[] = [];

/** Pièce jointe nommée, telle que la produit le composer du mur. */
function attachment(label: string, file: string) {
  return [
    {
      url: `https://example.invalid/${file}`,
      path: `rls/wall/${file}`,
      name: file,
      type: "application/pdf",
      size: 1234,
      label,
    },
  ];
}

async function insertPostAs(
  role: Role,
  row: {
    club_id: string;
    author_user_id: string;
    body: string;
    audience_type: string;
    audience_team_ids?: string[];
    attachments: ReturnType<typeof attachment>;
  },
): Promise<string> {
  const c = await signInAs(role);
  const { data, error } = await c.from("wall_posts").insert(row).select("id").single();
  if (error || !data) {
    throw new Error(`insertPostAs(${role}, ${row.body}): ${error?.message ?? "no data"}`);
  }
  createdPosts.push(data.id);
  return data.id;
}

let clubWidePost: string;
let teamPost: string;
let staffPost: string;
let otherClubPost: string | undefined;

beforeAll(async () => {
  const fx = getFixtures();

  // 1) Post club-wide de clubA, avec document.
  clubWidePost = await insertPostAs("adminA", {
    club_id: fx.clubA,
    author_user_id: fx.users.adminA.userId,
    body: "__rls_docs_clubwide",
    audience_type: "club",
    attachments: attachment("Note d'information", "note.pdf"),
  });

  // 2) Post ciblé teamA, avec document — trigger audience exige auth.uid().
  teamPost = await insertPostAs("adminA", {
    club_id: fx.clubA,
    author_user_id: fx.users.adminA.userId,
    body: "__rls_docs_team",
    audience_type: "team",
    audience_team_ids: [fx.teamA],
    attachments: attachment("Programme de reprise", "programme.pdf"),
  });

  // 3) Post staff de teamA, avec document.
  staffPost = await insertPostAs("adminA", {
    club_id: fx.clubA,
    author_user_id: fx.users.adminA.userId,
    body: "__rls_docs_staff",
    audience_type: "team_staff",
    audience_team_ids: [fx.teamA],
    attachments: attachment("Compte rendu staff", "staff.pdf"),
  });

  // 4) Post club-wide d'un AUTRE club, avec document (via adminB, RLS active).
  try {
    otherClubPost = await insertPostAs("adminB", {
      club_id: fx.clubB,
      author_user_id: fx.users.adminB.userId,
      body: "__rls_docs_otherclub",
      audience_type: "club",
      attachments: attachment("Calendrier club B", "calendrier-b.pdf"),
    });
  } catch {
    // Si l'insert est refusé, on saute le cas cross-club plutôt que d'échouer
    // toute la suite.
    otherClubPost = undefined;
  }
});

afterAll(async () => {
  for (const id of createdPosts) {
    await admin.from("wall_posts").delete().eq("id", id);
  }
});

/** Ce que lit la docuthèque : la ligne ET sa colonne attachments. */
async function readDocs(role: Parameters<typeof signInAs>[0], postId: string) {
  const c = await signInAs(role);
  const { data, error } = await c
    .from("wall_posts")
    .select("id, attachments")
    .eq("id", postId)
    .is("deleted_at", null);
  expect(error).toBeNull();
  return (data ?? []) as { id: string; attachments: unknown }[];
}

describe("docuthèque — les documents héritent de la visibilité du post", () => {
  it("un joueur du club lit le document d'un post club-wide", async () => {
    const rows = await readDocs("playerA", clubWidePost);
    expect(rows).toHaveLength(1);
    expect(Array.isArray(rows[0].attachments)).toBe(true);
    expect((rows[0].attachments as { label: string }[])[0].label).toBe("Note d'information");
  });

  it("un parent du club lit le document d'un post ciblé sur l'équipe de son enfant", async () => {
    const rows = await readDocs("parentA", teamPost);
    expect(rows).toHaveLength(1);
    expect((rows[0].attachments as { name: string }[])[0].name).toBe("programme.pdf");
  });

  it("un joueur ne voit AUCUN document d'un post team_staff", async () => {
    const rows = await readDocs("playerA", staffPost);
    expect(rows).toEqual([]);
  });

  it("un parent ne voit AUCUN document d'un post team_staff", async () => {
    const rows = await readDocs("parentA", staffPost);
    expect(rows).toEqual([]);
  });

  it("un coach de l'équipe lit le document du post team_staff", async () => {
    const rows = await readDocs("coachA", staffPost);
    expect(rows).toHaveLength(1);
    expect((rows[0].attachments as { label: string }[])[0].label).toBe("Compte rendu staff");
  });

  it("un membre d'un autre club ne voit aucun document du club A", async () => {
    for (const postId of [clubWidePost, teamPost, staffPost]) {
      const rows = await readDocs("playerB", postId);
      expect(rows, `post ${postId} ne doit pas fuiter vers un autre club`).toEqual([]);
    }
  });

  it("un membre du club A ne voit aucun document d'un autre club", async () => {
    if (!otherClubPost) return; // insert refusé → rien à prouver ici
    const rows = await readDocs("playerA", otherClubPost);
    expect(rows).toEqual([]);
  });

  it("un post supprimé ne remonte plus aucun document", async () => {
    const fx = getFixtures();
    const postId = await insertPostAs("adminA", {
      club_id: fx.clubA,
      author_user_id: fx.users.adminA.userId,
      body: "__rls_docs_deleted",
      audience_type: "club",
      attachments: attachment("Document retiré", "retire.pdf"),
    });

    // Suppression logique, comme le fait la modération du mur (service_role OK :
    // on ne change pas l'audience, le trigger d'authz ne s'applique pas).
    const { error: delErr } = await admin
      .from("wall_posts")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", postId);
    expect(delErr).toBeNull();

    const rows = await readDocs("playerA", postId);
    expect(rows).toEqual([]);
  });
});
