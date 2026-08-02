/**
 * 32 — Docuthèque du mur (onglet Documents)
 *
 * Couvre le parcours complet livré en V1 :
 *   - publier une pièce jointe sur le mur EXIGE un nom (bouton bloqué sinon) ;
 *   - le document apparaît dans l'onglet Documents, nom saisi accolé au fichier ;
 *   - « Voir la publication » ramène au mur sur le bon post ;
 *   - une pièce jointe publiée AVANT la V1 (sans `label`) reste listée avec son
 *     seul nom de fichier — c'est la garantie de non-régression sur l'historique.
 *
 * Le seeding passe par le client Supabase authentifié (RLS active), pas par un
 * service_role : ce que le test crée, un admin de club peut le créer.
 */
import { test, expect } from "@playwright/test";
import { admin } from "./_fixtures/admin";
import { createTestClub, type SeededClub } from "./_fixtures/club";
import { loginViaUI, tx, uniqueName } from "./_fixtures/ui";

let club: SeededClub;
const createdPosts: string[] = [];

/** Pièce jointe telle que la sérialise `AttachmentPicker`. */
function attachment(fileName: string, label?: string) {
  return [
    {
      url: `https://example.invalid/${fileName}`,
      path: `${club.admin.userId}/wall/${Date.now()}-${fileName}`,
      name: fileName,
      type: "application/pdf",
      size: 4242,
      ...(label ? { label } : {}),
    },
  ];
}

async function seedPost(
  body: string,
  atts: ReturnType<typeof attachment>,
  createdAt?: string,
): Promise<string> {
  const { data, error } = await admin
    .from("wall_posts")
    .insert({
      club_id: club.clubId,
      author_user_id: club.admin.userId,
      body,
      audience_type: "club",
      attachments: atts,
      ...(createdAt ? { created_at: createdAt } : {}),
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(`seed wall_post: ${error?.message}`);
  createdPosts.push(data.id);
  return data.id;
}

test.beforeAll(async () => {
  club = await createTestClub("walldocs");
});

test.afterAll(async () => {
  for (const id of createdPosts) {
    await admin.from("wall_posts").delete().eq("id", id);
  }
  await club.cleanup();
});

test.describe("docuthèque du mur", () => {
  test("un document nommé apparaît dans l'onglet Documents, nom accolé au fichier", async ({
    page,
  }) => {
    const label = uniqueName("Programme");
    await seedPost("doc E2E nommé", attachment("programme_reprise.pdf", label));

    await loginViaUI(page, "admin");
    await page.goto("/inbox?tab=documents");

    await expect(page.getByText(label, { exact: false }).first()).toBeVisible();
    // Le nom de fichier reste affiché à côté du nom saisi.
    await expect(page.getByText("programme_reprise.pdf").first()).toBeVisible();
  });

  test("une pièce jointe publiée avant la V1 reste listée avec son seul nom de fichier", async ({
    page,
  }) => {
    const legacyFile = `${uniqueName("legacy")}.pdf`;
    await seedPost("doc E2E historique", attachment(legacyFile)); // pas de label

    await loginViaUI(page, "admin");
    await page.goto("/inbox?tab=documents");

    await expect(page.getByText(legacyFile).first()).toBeVisible();
  });

  test("« Voir la publication » bascule sur le mur et cible le post d'origine", async ({
    page,
  }) => {
    const label = uniqueName("Calendrier");
    const postId = await seedPost("doc E2E retour au post", attachment("calendrier.pdf", label));

    await loginViaUI(page, "admin");
    await page.goto("/inbox?tab=documents");

    const row = page.locator("li").filter({ hasText: label }).first();
    await expect(row).toBeVisible();
    await row.getByRole("button", { name: tx("wall.documents.viewPost") }).click();

    // Retour sur l'onglet Mur, avec la publication ciblée dans l'URL.
    await expect(page).toHaveURL(new RegExp(`post=${postId}`));
    await expect(page.locator(`#wall-post-${postId}`)).toBeVisible();
  });

  test("« Voir la publication » atteint un post plus ancien que la fenêtre du fil", async ({
    page,
  }) => {
    // Le fil ne charge que les 50 dernières publications. Un document d'archive
    // vise donc un post absent de cette fenêtre : sans rattrapage ciblé, l'ancre
    // n'existe jamais et le scroll échoue en silence.
    const label = uniqueName("Archive");
    const postId = await seedPost(
      "doc E2E archive",
      attachment("archive.pdf", label),
      "2023-09-15T09:00:00.000Z",
    );

    await loginViaUI(page, "admin");
    await page.goto("/inbox?tab=documents");

    const row = page.locator("li").filter({ hasText: label }).first();
    await expect(row).toBeVisible();
    await row.getByRole("button", { name: tx("wall.documents.viewPost") }).click();

    await expect(page).toHaveURL(new RegExp(`post=${postId}`));
    await expect(page.locator(`#wall-post-${postId}`)).toBeVisible();
  });

  test("retirer un document le sort de la docuthèque mais le laisse dans la publication", async ({
    page,
  }) => {
    const label = uniqueName("Doublon");
    const postId = await seedPost("doc E2E retrait", attachment("doublon.pdf", label));

    await loginViaUI(page, "admin");
    await page.goto("/inbox?tab=documents");

    const row = page.locator("li").filter({ hasText: label }).first();
    await expect(row).toBeVisible();

    // Attendre la RPC : sans elle (migration absente) le bouton ne fait rien
    // d'utile et un getByText(page) restait coincé sur la carte / un toast.
    const excludeRpc = page.waitForResponse(
      (r) => r.url().includes("/rest/v1/rpc/set_wall_document_excluded") && r.ok(),
    );
    await row.getByRole("button", { name: tx("wall.documents.exclude") }).click();
    await excludeRpc;

    // La carte disparaît de la liste active (pas un getByText page entière :
    // le toast « Retiré… » ou le libellé du switch pourrait matcher).
    await expect(row).toBeHidden();

    // …mais la publication le conserve : c'est tout l'intérêt du choix.
    const { data } = await admin.from("wall_posts").select("attachments").eq("id", postId).single();
    const atts = (data?.attachments ?? []) as Record<string, unknown>[];
    expect(atts).toHaveLength(1);
    expect(atts[0].excludedFromLibrary).toBe(true);
    expect(atts[0].label).toBe(label);

    // Et il reste rattrapable par l'encadrement, sinon le retrait serait
    // irréversible depuis l'interface.
    const showExcluded = page.getByRole("checkbox", { name: tx("wall.documents.showExcluded") });
    await showExcluded.check();
    const back = page.locator("li").filter({ hasText: label }).first();
    await expect(back).toBeVisible();

    const restoreRpc = page.waitForResponse(
      (r) => r.url().includes("/rest/v1/rpc/set_wall_document_excluded") && r.ok(),
    );
    await back.getByRole("button", { name: tx("wall.documents.restore") }).click();
    await restoreRpc;

    await showExcluded.uncheck();
    await expect(page.locator("li").filter({ hasText: label }).first()).toBeVisible();
  });

  test("un joueur ne peut ni renommer ni retirer un document", async ({ page }) => {
    const label = uniqueName("Note");
    await seedPost("doc E2E droits", attachment("note.pdf", label));

    await loginViaUI(page, "player");
    await page.goto("/inbox?tab=documents");

    const row = page.locator("li").filter({ hasText: label }).first();
    await expect(row).toBeVisible();
    await expect(row.getByRole("button", { name: tx("wall.documents.rename") })).toHaveCount(0);
    await expect(row.getByRole("button", { name: tx("wall.documents.exclude") })).toHaveCount(0);
    await expect(page.getByText(tx("wall.documents.showExcluded"))).toHaveCount(0);
  });

  test("publier une pièce jointe sans nom est impossible", async ({ page }) => {
    await loginViaUI(page, "admin");
    await page.goto("/inbox");

    // Composer du mur uniquement — d'autres `input[type=file]` existent sur la page
    // (avatar, etc.) et un `.first()` global rate parfois le bon.
    const compose = page
      .locator("div.rounded-2xl")
      .filter({ has: page.getByPlaceholder(tx("wall.placeholder")) })
      .first();
    await expect(compose).toBeVisible();

    const body = `post E2E avec document ${uniqueName("body")}`;
    await compose.getByPlaceholder(tx("wall.placeholder")).fill(body);

    const upload = page.waitForResponse(
      (r) => r.url().includes("/storage/v1/object") && (r.status() === 200 || r.status() === 201),
      { timeout: 45_000 },
    );
    await compose.locator('input[type="file"]').setInputFiles({
      name: "reglement_interieur.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.4 e2e"),
    });
    await upload;

    // Champ de nom présent, publication bloquée tant qu'il est vide.
    const nameInput = compose.getByPlaceholder(tx("attachments.documentNamePlaceholder"));
    await expect(nameInput).toBeVisible({ timeout: 15_000 });
    const publish = compose.getByRole("button", { name: tx("wall.post") });
    await expect(publish).toBeDisabled();
    await expect(compose.getByText(tx("attachments.labelRequired"))).toBeVisible();

    // Une fois nommé, la publication redevient possible.
    const label = uniqueName("Reglement");
    await nameInput.fill(label);
    await expect(publish).toBeEnabled();

    const insertPost = page.waitForResponse(
      (r) => r.url().includes("/rest/v1/wall_posts") && r.request().method() === "POST" && r.ok(),
    );
    await publish.click();
    await insertPost;
    // Le composer se vide après succès — garde contre une navigation trop tôt.
    await expect(compose.getByPlaceholder(tx("wall.placeholder"))).toHaveValue("");

    // Le document nommé atterrit dans la docuthèque.
    await page.goto("/inbox?tab=documents");
    await expect(page.locator("li").filter({ hasText: label }).first()).toBeVisible({
      timeout: 15_000,
    });

    // Nettoyage : retrouver le post créé par l'UI, et surtout retirer le fichier
    // réellement téléversé dans le bucket — sinon chaque exécution en laisse un.
    const { data } = await admin
      .from("wall_posts")
      .select("id, attachments")
      .eq("club_id", club.clubId)
      .eq("body", body)
      .limit(1);
    const row = data?.[0];
    if (row) {
      createdPosts.push(row.id);
      const paths = (Array.isArray(row.attachments) ? row.attachments : [])
        .map((a) => (a as { path?: string }).path)
        .filter((p): p is string => !!p);
      if (paths.length) await admin.storage.from("attachments").remove(paths);
    }
  });

  test("le chat d'événement n'exige AUCUN nom de fichier", async ({ page }) => {
    // Garde-fou de périmètre : `requireLabel` ne doit être actif que sur le mur.
    await loginViaUI(page, "admin");
    await page.goto(`/events/${club.eventId}`);

    const fileInput = page.locator('input[type="file"]').first();
    if ((await fileInput.count()) === 0) test.skip(true, "pas de pièce jointe sur cet écran");

    await fileInput.setInputFiles({
      name: "photo_equipe.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.4 e2e chat"),
    });

    await expect(page.getByPlaceholder(tx("attachments.documentNamePlaceholder"))).toHaveCount(0);
  });
});
