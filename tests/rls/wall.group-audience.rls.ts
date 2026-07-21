/**
 * wall_posts RLS — auteur voit toujours son propre post.
 *
 * Cas régression : un coach (non admin/dirigeant) poste vers un groupe dont
 * il n'est pas membre. La branche `group` du policy `wall_posts_select` filtre
 * les non-membres du groupe : sans bypass auteur, l'auteur perdait la vue de
 * son propre post. Le bypass `author_user_id = auth.uid()` remis en tête de
 * la policy corrige ça.
 */
import { describe, it, expect, afterAll } from "vitest";
import { admin } from "./_admin";
import { signInAs } from "./_clients";
import { getFixtures } from "./_setup";

const createdPosts: string[] = [];
const createdGroups: string[] = [];

afterAll(async () => {
  if (createdPosts.length) {
    await admin.from("wall_posts").delete().in("id", createdPosts);
  }
  if (createdGroups.length) {
    await admin.from("club_group_members").delete().in("group_id", createdGroups);
    await admin.from("club_groups").delete().in("id", createdGroups);
  }
});

describe("wall_posts RLS — group audience author bypass", () => {
  it("un coach auteur d'un post 'group' voit son post même s'il n'est pas membre du groupe", async () => {
    const fx = getFixtures();

    // 1) Créer un groupe côté service_role sans y ajouter le coach.
    const { data: group, error: gErr } = await admin
      .from("club_groups")
      .insert({
        club_id: fx.clubA,
        name: `rls-wall-group-${fx.runId}`,
        created_by: fx.users.adminA.userId,
      })
      .select("id")
      .single();
    expect(gErr).toBeNull();
    createdGroups.push(group!.id);

    // 2) Coach A crée un post ciblant ce groupe.
    const coach = await signInAs("coachA");
    const { data: post, error: pErr } = await coach
      .from("wall_posts")
      .insert({
        club_id: fx.clubA,
        author_user_id: fx.users.coachA.userId,
        body: "coach-post-to-group",
        audience_type: "group",
        audience_group_ids: [group!.id],
      })
      .select("id")
      .single();
    expect(pErr, `insert error: ${pErr?.message ?? ""}`).toBeNull();
    createdPosts.push(post!.id);

    // 3) Le coach doit toujours voir son propre post (bypass auteur).
    const { data: rows, error: sErr } = await coach
      .from("wall_posts")
      .select("id")
      .eq("id", post!.id);
    expect(sErr).toBeNull();
    expect((rows ?? []).map((r: any) => r.id)).toEqual([post!.id]);
  });
});
