/**
 * Docuthèque — RPC `rename_wall_document` et `set_wall_document_excluded`.
 *
 * Ces deux fonctions sont `SECURITY DEFINER` : elles contournent la RLS de
 * `wall_posts` par construction. Leur contrôle d'accès est donc entièrement
 * porté par le code de la fonction, et c'est exactement ce que ce fichier
 * vérifie — un joueur ou un parent ne doit pouvoir ni renommer ni retirer le
 * document d'un autre.
 *
 * Rappel de périmètre : `excludedFromLibrary` est de la CURATION. Un document
 * retiré reste lisible dans sa publication — on ne teste donc pas une
 * quelconque confidentialité, qui n'est pas ce que ce drapeau apporte.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { admin } from "./_admin";
import { signInAs } from "./_clients";
import { getFixtures } from "./_setup";

const createdPosts: string[] = [];
let clubPost: string;
const PATH = "rls/wall/doc-actions.pdf";

function attachment() {
  return [
    {
      url: `https://example.invalid/doc-actions.pdf`,
      path: PATH,
      name: "doc-actions.pdf",
      type: "application/pdf",
      size: 1234,
      label: "Programme initial",
    },
  ];
}

async function readAttachments(postId: string) {
  const { data, error } = await admin
    .from("wall_posts")
    .select("attachments")
    .eq("id", postId)
    .single();
  expect(error).toBeNull();
  return (data?.attachments ?? []) as Record<string, unknown>[];
}

beforeAll(async () => {
  const fx = getFixtures();
  const { data, error } = await admin
    .from("wall_posts")
    .insert({
      club_id: fx.clubA,
      author_user_id: fx.users.adminA.userId,
      body: "__rls_doc_actions",
      audience_type: "club",
      attachments: attachment(),
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(`seed post: ${error?.message}`);
  clubPost = data.id;
  createdPosts.push(data.id);
});

afterAll(async () => {
  for (const id of createdPosts) {
    await admin.from("wall_posts").delete().eq("id", id);
  }
});

describe("rename_wall_document", () => {
  it("refuse un joueur du club — ni auteur ni encadrement", async () => {
    const c = await signInAs("playerA");
    const { error } = await c.rpc("rename_wall_document", {
      _post_id: clubPost,
      _path: PATH,
      _label: "Piraté",
    });
    expect(error).not.toBeNull();
    expect(error?.message).toContain("forbidden");
    // Et surtout : la donnée n'a pas bougé.
    expect((await readAttachments(clubPost))[0].label).toBe("Programme initial");
  });

  it("refuse un parent du club", async () => {
    const c = await signInAs("parentA");
    const { error } = await c.rpc("rename_wall_document", {
      _post_id: clubPost,
      _path: PATH,
      _label: "Piraté",
    });
    expect(error?.message).toContain("forbidden");
  });

  it("refuse un membre d'un autre club", async () => {
    const c = await signInAs("adminB");
    const { error } = await c.rpc("rename_wall_document", {
      _post_id: clubPost,
      _path: PATH,
      _label: "Piraté",
    });
    expect(error?.message).toContain("forbidden");
  });

  it("autorise l'admin du club et écrit le nouveau nom", async () => {
    const c = await signInAs("adminA");
    const { error } = await c.rpc("rename_wall_document", {
      _post_id: clubPost,
      _path: PATH,
      _label: "Programme de reprise",
    });
    expect(error).toBeNull();
    expect((await readAttachments(clubPost))[0].label).toBe("Programme de reprise");
  });

  it("rejette un libellé vide ou uniquement composé d'espaces", async () => {
    const c = await signInAs("adminA");
    for (const label of ["", "   "]) {
      const { error } = await c.rpc("rename_wall_document", {
        _post_id: clubPost,
        _path: PATH,
        _label: label,
      });
      expect(error?.message).toContain("label_required");
    }
  });

  it("rejette un libellé de plus de 80 caractères", async () => {
    const c = await signInAs("adminA");
    const { error } = await c.rpc("rename_wall_document", {
      _post_id: clubPost,
      _path: PATH,
      _label: "x".repeat(81),
    });
    expect(error?.message).toContain("label_too_long");
  });

  it("échoue explicitement sur un chemin inconnu, au lieu de réussir sans rien faire", async () => {
    const c = await signInAs("adminA");
    const { error } = await c.rpc("rename_wall_document", {
      _post_id: clubPost,
      _path: "rls/wall/inexistant.pdf",
      _label: "Fantôme",
    });
    expect(error?.message).toContain("attachment_not_found");
  });

  it("échoue sur un post inexistant", async () => {
    const c = await signInAs("adminA");
    const { error } = await c.rpc("rename_wall_document", {
      _post_id: "00000000-0000-0000-0000-000000000000",
      _path: PATH,
      _label: "Fantôme",
    });
    expect(error?.message).toContain("post_not_found");
  });
});

describe("set_wall_document_excluded", () => {
  it("refuse un joueur du club, sans modifier la publication", async () => {
    const c = await signInAs("playerA");
    const { error } = await c.rpc("set_wall_document_excluded", {
      _post_id: clubPost,
      _path: PATH,
      _excluded: true,
    });
    expect(error?.message).toContain("forbidden");
    expect((await readAttachments(clubPost))[0].excludedFromLibrary).toBeUndefined();
  });

  it("refuse un parent du club", async () => {
    const c = await signInAs("parentA");
    const { error } = await c.rpc("set_wall_document_excluded", {
      _post_id: clubPost,
      _path: PATH,
      _excluded: true,
    });
    expect(error?.message).toContain("forbidden");
  });

  it("l'admin retire le document SANS toucher au reste de la pièce jointe", async () => {
    const c = await signInAs("adminA");
    const { error } = await c.rpc("set_wall_document_excluded", {
      _post_id: clubPost,
      _path: PATH,
      _excluded: true,
    });
    expect(error).toBeNull();

    const att = (await readAttachments(clubPost))[0];
    expect(att.excludedFromLibrary).toBe(true);
    // Le point central du choix de conception : la publication garde son
    // fichier, son nom et son URL. Retirer n'est pas supprimer.
    expect(att.path).toBe(PATH);
    expect(att.url).toBe("https://example.invalid/doc-actions.pdf");
    expect(att.label).toBe("Programme de reprise");
  });

  it("remettre efface le drapeau plutôt que d'écrire false", async () => {
    const c = await signInAs("adminA");
    const { error } = await c.rpc("set_wall_document_excluded", {
      _post_id: clubPost,
      _path: PATH,
      _excluded: false,
    });
    expect(error).toBeNull();
    expect((await readAttachments(clubPost))[0].excludedFromLibrary).toBeUndefined();
  });

  it("échoue explicitement sur un chemin inconnu", async () => {
    const c = await signInAs("adminA");
    const { error } = await c.rpc("set_wall_document_excluded", {
      _post_id: clubPost,
      _path: "rls/wall/inexistant.pdf",
      _excluded: true,
    });
    expect(error?.message).toContain("attachment_not_found");
  });

  it("ne laisse plus appeler l'ancienne suppression destructive", async () => {
    const c = await signInAs("adminA");
    const { error } = await c.rpc(
      "delete_wall_document" as never,
      { _post_id: clubPost, _path: PATH } as never,
    );
    // La fonction a été supprimée par la migration : PostgREST ne la résout plus.
    expect(error).not.toBeNull();
  });
});
