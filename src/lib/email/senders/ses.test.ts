import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SesSender, rewriteFromDomain } from "./ses";
import type { SendPayload } from "./types";

const payload: SendPayload = {
  to: "joueur@example.test",
  from: "Clubero <noreply@notify.clubero.app>",
  senderDomain: "notify.clubero.app",
  subject: "Convocation — U15 R1 vs Terville",
  html: "<p>Salut Adam</p>",
  text: "Salut Adam",
  unsubscribeToken: "tok-123",
  messageId: "msg-1",
};

describe("SesSender", () => {
  const OLD = { ...process.env };
  beforeEach(() => {
    process.env.AWS_SES_ACCESS_KEY_ID = "AKIA_TEST";
    process.env.AWS_SES_SECRET_ACCESS_KEY = "secret_test";
    process.env.AWS_SES_REGION = "eu-west-1";
    process.env.AWS_SES_FROM_DOMAIN = "send.clubero.app";
    process.env.SITE_URL = "https://app.clubero.app";
  });
  afterEach(() => {
    process.env = { ...OLD };
    vi.restoreAllMocks();
  });

  it("throws when credentials are missing", async () => {
    delete process.env.AWS_SES_ACCESS_KEY_ID;
    await expect(new SesSender().send(payload)).rejects.toThrow(/AWS_SES_ACCESS_KEY_ID/);
  });

  it("posts a signed SES v2 SendEmail request and returns the MessageId", async () => {
    const fetchMock = vi.fn(
      async (..._args: unknown[]) =>
        new Response(JSON.stringify({ MessageId: "ses-abc" }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const res = await new SesSender().send(payload);

    expect(res.providerMessageId).toBe("ses-abc");
    expect(fetchMock).toHaveBeenCalledOnce();
    const req = fetchMock.mock.calls[0][0] as unknown as Request;
    expect(req.url).toContain("email.eu-west-1.amazonaws.com/v2/email/outbound-emails");
    expect(req.headers.get("authorization")).toMatch(/AWS4-HMAC-SHA256/);

    const body = JSON.parse(await req.text());
    // From is rewritten onto the SES-verified domain, display name preserved.
    expect(body.FromEmailAddress).toBe("Clubero <noreply@send.clubero.app>");

    const mime = Buffer.from(body.Content.Raw.Data, "base64").toString("utf8");
    expect(mime).toContain("From: Clubero <noreply@send.clubero.app>");
    // List-Unsubscribe header preserved from the token
    expect(mime).toContain(
      "List-Unsubscribe: <https://app.clubero.app/email/unsubscribe?token=tok-123>",
    );
    expect(mime).toContain("List-Unsubscribe-Post: List-Unsubscribe=One-Click");
    // Accented subject is RFC 2047 encoded
    expect(mime).toContain("Subject: =?UTF-8?B?");
    expect(body.Destination.ToAddresses).toEqual(["joueur@example.test"]);
  });

  it("rewrites the From domain, preserving display name and local part", () => {
    expect(rewriteFromDomain("Clubero <noreply@clubero.app>", "send.clubero.app")).toBe(
      "Clubero <noreply@send.clubero.app>",
    );
    expect(rewriteFromDomain("noreply@clubero.app", "send.clubero.app")).toBe(
      "noreply@send.clubero.app",
    );
    expect(rewriteFromDomain("FC X via Clubero <notify@clubero.app>", "send.clubero.app")).toBe(
      "FC X via Clubero <notify@send.clubero.app>",
    );
    // No-op when the domain is unset (Lovable path passthrough).
    expect(rewriteFromDomain("Clubero <noreply@clubero.app>", undefined)).toBe(
      "Clubero <noreply@clubero.app>",
    );
  });

  it("maps SES throttling (400 Throttling) to a 429 so the caller backs off", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("<Error><Type>Throttling</Type></Error>", { status: 400 })),
    );
    await expect(new SesSender().send(payload)).rejects.toMatchObject({ status: 429 });
  });
});
