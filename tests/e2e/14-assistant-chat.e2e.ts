/**
 * 14 — Assistant IA conversationnel (/api/chat)
 *
 * Vérifie que l'assistant authentifié répond à un prompt simple.
 * Skippé sans E2E_REAL_AI=1 (appel IA réel coûteux/non déterministe).
 */
import { test, expect } from "@playwright/test";
import { getSessionForUser } from "./_fixtures/auth";
import { createTestClub, type SeededClub } from "./_fixtures/club";

const REAL_AI = process.env.E2E_REAL_AI === "1";

test.describe("Assistant chat", () => {
  let club: SeededClub;
  test.beforeAll(async () => { club = await createTestClub("assistant"); });
  test.afterAll(async () => { await club.cleanup(); });

  test("coach can chat with the AI assistant", async ({ request, baseURL }) => {
    test.skip(!REAL_AI, "E2E_REAL_AI=1 required for live AI call");
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
