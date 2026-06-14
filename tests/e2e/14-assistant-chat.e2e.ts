/**
 * 14 — Assistant IA conversationnel (/api/chat)
 *
 * Vérifie que l'assistant authentifié répond à un prompt simple.
 * Skippé sans E2E_REAL_AI=1 (appel IA réel coûteux/non déterministe).
 * Skippé aussi si LOVABLE_API_KEY est absente : un test LLM ne doit jamais
 * hard-fail uniquement parce que la clé n'est pas configurée (cas CI).
 */
import { test, expect } from "@playwright/test";
import { getSessionForUser } from "./_fixtures/auth";
import { createTestClub, type SeededClub } from "./_fixtures/club";

const REAL_AI = process.env.E2E_REAL_AI === "1";
const HAS_AI_KEY = Boolean(process.env.LOVABLE_API_KEY);

test.describe("Assistant chat", () => {
  let club: SeededClub;
  test.beforeAll(async () => { club = await createTestClub("assistant"); });
  test.afterAll(async () => { await club.cleanup(); });

  test("coach can chat with the AI assistant", async ({ request, baseURL }) => {
    test.skip(!REAL_AI, "E2E_REAL_AI=1 required for live AI call");
    test.skip(!HAS_AI_KEY, "LOVABLE_API_KEY not configured — skipping live AI test");
    const session = await getSessionForUser(club.coach.email, club.coach.password);

    const res = await request.post(`${baseURL}/api/chat`, {
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json",
      },
      data: {
        messages: [
          {
            id: "u1",
            role: "user",
            parts: [{ type: "text", text: "Dis simplement bonjour en un mot." }],
          },
        ],
      },
      timeout: 30_000,
    });

    expect(res.status(), await res.text().catch(() => "")).toBe(200);
    const body = await res.text();
    expect(body.length).toBeGreaterThan(0);
  });
});
