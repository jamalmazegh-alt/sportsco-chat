import { afterEach, describe, expect, it, vi } from "vitest";
import { getEmailSender, LovableSender, SesSender } from "./index";

describe("getEmailSender", () => {
  const originalProvider = process.env.EMAIL_PROVIDER;

  afterEach(() => {
    if (originalProvider === undefined) delete process.env.EMAIL_PROVIDER;
    else process.env.EMAIL_PROVIDER = originalProvider;
  });

  it("defaults to LovableSender when EMAIL_PROVIDER is unset", () => {
    delete process.env.EMAIL_PROVIDER;
    const s = getEmailSender();
    expect(s).toBeInstanceOf(LovableSender);
    expect(s.name).toBe("lovable");
  });

  it("returns LovableSender for EMAIL_PROVIDER=lovable (case-insensitive)", () => {
    process.env.EMAIL_PROVIDER = "LOVABLE";
    expect(getEmailSender()).toBeInstanceOf(LovableSender);
  });

  it("returns SesSender for EMAIL_PROVIDER=ses", () => {
    process.env.EMAIL_PROVIDER = "ses";
    const s = getEmailSender();
    expect(s).toBeInstanceOf(SesSender);
    expect(s.name).toBe("ses");
  });

  it("falls back to LovableSender for an unknown provider (no silent drops)", () => {
    process.env.EMAIL_PROVIDER = "definitely-not-a-real-provider";
    expect(getEmailSender()).toBeInstanceOf(LovableSender);
  });
});

describe("SesSender", () => {
  it("throws explicitly instead of silently accepting", async () => {
    const ses = new SesSender();
    await expect(
      ses.send({
        to: "a@b.test",
        from: "c@d.test",
        senderDomain: "d.test",
        subject: "x",
        html: "<p>x</p>",
        text: "x",
      }),
    ).rejects.toThrow(/SES sender not yet configured/);
  });
});

describe("LovableSender", () => {
  it("throws a clear error when LOVABLE_API_KEY is missing", async () => {
    const original = process.env.LOVABLE_API_KEY;
    delete process.env.LOVABLE_API_KEY;
    try {
      const sender = new LovableSender();
      await expect(
        sender.send({
          to: "a@b.test",
          from: "c@d.test",
          senderDomain: "d.test",
          subject: "x",
          html: "<p>x</p>",
          text: "x",
        }),
      ).rejects.toThrow(/LOVABLE_API_KEY/);
    } finally {
      if (original === undefined) delete process.env.LOVABLE_API_KEY;
      else process.env.LOVABLE_API_KEY = original;
    }
  });

  it("delegates to sendLovableEmail and returns the provider message id", async () => {
    process.env.LOVABLE_API_KEY = "test-key";
    const mockSend = vi.fn().mockResolvedValue({ success: true, message_id: "prov-123" });
    vi.doMock("@lovable.dev/email-js", () => ({ sendLovableEmail: mockSend }));
    vi.resetModules();
    const { LovableSender: FreshSender } = await import("./lovable");
    const sender = new FreshSender();
    const result = await sender.send({
      to: "a@b.test",
      from: "c@d.test",
      senderDomain: "d.test",
      subject: "x",
      html: "<p>x</p>",
      text: "x",
      messageId: "biz-42",
    });
    expect(result.providerMessageId).toBe("prov-123");
    expect(mockSend).toHaveBeenCalledOnce();
    vi.doUnmock("@lovable.dev/email-js");
    vi.resetModules();
  });
});
