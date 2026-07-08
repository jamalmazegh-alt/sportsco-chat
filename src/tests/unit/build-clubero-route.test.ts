/**
 * Unit tests pour les routes serveur /api/public/build-clubero/*.
 * - Priorité IP : CF-Connecting-IP > x-real-ip > x-forwarded-for (client-controllable, last resort).
 * - 429 quand la rate-limit dépasse ; la RPC N'EST PAS appelée.
 * - Body malformé → 400 avant toute DB.
 * - question_key hors config → 400.
 * - service_role key jamais présente dans la réponse renvoyée au client.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { getClientIp } from "@/lib/rate-limit.server";

// -- Mocks -------------------------------------------------------------------
const rpcMock = vi.fn();
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    rpc: (...args: unknown[]) => rpcMock(...args),
  },
}));

const rateLimitMock = vi.fn();
vi.mock("@/lib/rate-limit.server", async () => {
  const actual = await vi.importActual<typeof import("@/lib/rate-limit.server")>(
    "@/lib/rate-limit.server",
  );
  return {
    ...actual,
    checkRateLimit: (...args: unknown[]) => rateLimitMock(...args),
  };
});

// Import routes AFTER mocks are set up
async function loadRoutes() {
  const start = await import("@/routes/api/public/build-clubero/start");
  const save = await import("@/routes/api/public/build-clubero/save");
  const complete = await import("@/routes/api/public/build-clubero/complete");
  return {
    startHandler: (start.Route as any).options.server.handlers.POST,
    saveHandler: (save.Route as any).options.server.handlers.POST,
    completeHandler: (complete.Route as any).options.server.handlers.POST,
  };
}

function makeReq(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request("http://localhost/api/public/build-clubero/x", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  rpcMock.mockReset();
  rateLimitMock.mockReset();
  rateLimitMock.mockResolvedValue(true);
  rpcMock.mockResolvedValue({ data: "response-uuid", error: null });
});

// -- getClientIp priority ----------------------------------------------------

describe("getClientIp priority", () => {
  it("CF-Connecting-IP wins over x-forwarded-for", () => {
    const req = new Request("http://x", {
      headers: {
        "cf-connecting-ip": "1.2.3.4",
        "x-forwarded-for": "9.9.9.9",
      },
    });
    expect(getClientIp(req)).toBe("1.2.3.4");
  });

  it("falls back to x-real-ip when no CF header", () => {
    const req = new Request("http://x", {
      headers: { "x-real-ip": "5.6.7.8", "x-forwarded-for": "9.9.9.9" },
    });
    expect(getClientIp(req)).toBe("5.6.7.8");
  });

  it("falls back to first x-forwarded-for entry (client-controllable, last resort)", () => {
    const req = new Request("http://x", {
      headers: { "x-forwarded-for": "5.5.5.5, 9.9.9.9" },
    });
    expect(getClientIp(req)).toBe("5.5.5.5");
  });

  it("returns 'unknown' when no IP header", () => {
    const req = new Request("http://x");
    expect(getClientIp(req)).toBe("unknown");
  });
});

// -- Routes: 429 blocks DB ---------------------------------------------------

describe("build-clubero routes: rate-limit 429", () => {
  it("start returns 429 and does NOT call RPC when limit exceeded", async () => {
    rateLimitMock.mockResolvedValueOnce(false);
    const { startHandler } = await loadRoutes();
    const res: Response = await startHandler({
      request: makeReq(
        { session_id: "sess-12345678", locale: "fr" },
        { "cf-connecting-ip": "1.2.3.4" },
      ),
    });
    expect(res.status).toBe(429);
    expect(rpcMock).not.toHaveBeenCalled();
    const body = await res.json();
    expect(body).toEqual({ error: "rate_limited" });
  });

  it("save returns 429 and does NOT call RPC when limit exceeded", async () => {
    rateLimitMock.mockResolvedValueOnce(false);
    const { saveHandler } = await loadRoutes();
    const res: Response = await saveHandler({
      request: makeReq(
        {
          session_id: "sess-12345678",
          question_key: "audience",
          question_type: "single",
          value: "kids",
        },
        { "cf-connecting-ip": "1.2.3.4" },
      ),
    });
    expect(res.status).toBe(429);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("complete returns 429 and does NOT call RPC when limit exceeded", async () => {
    rateLimitMock.mockResolvedValueOnce(false);
    const { completeHandler } = await loadRoutes();
    const res: Response = await completeHandler({
      request: makeReq(
        { session_id: "sess-12345678", contact: null },
        { "cf-connecting-ip": "1.2.3.4" },
      ),
    });
    expect(res.status).toBe(429);
    expect(rpcMock).not.toHaveBeenCalled();
  });
});

// -- Validation --------------------------------------------------------------

describe("build-clubero routes: input validation", () => {
  it("start: malformed body → 400, no rate-limit checked, no DB", async () => {
    const { startHandler } = await loadRoutes();
    const res: Response = await startHandler({
      request: makeReq({ nope: 1 }, { "cf-connecting-ip": "1.2.3.4" }),
    });
    expect(res.status).toBe(400);
    expect(rpcMock).not.toHaveBeenCalled();
    expect(rateLimitMock).not.toHaveBeenCalled();
  });

  it("save: question_key hors config → 400, no DB", async () => {
    const { saveHandler } = await loadRoutes();
    const res: Response = await saveHandler({
      request: makeReq(
        {
          session_id: "sess-12345678",
          question_key: "not-a-real-key",
          question_type: "single",
          value: "x",
        },
        { "cf-connecting-ip": "1.2.3.4" },
      ),
    });
    expect(res.status).toBe(400);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("save: question_type inconnu → 400", async () => {
    const { saveHandler } = await loadRoutes();
    const res: Response = await saveHandler({
      request: makeReq(
        {
          session_id: "sess-12345678",
          question_key: "audience",
          question_type: "bogus",
          value: "x",
        },
        { "cf-connecting-ip": "1.2.3.4" },
      ),
    });
    expect(res.status).toBe(400);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("complete: opt-in sans email valide → 400, no DB", async () => {
    const { completeHandler } = await loadRoutes();
    const res: Response = await completeHandler({
      request: makeReq(
        {
          session_id: "sess-12345678",
          contact: { newsletter: true, beta: false, email: "not-an-email" },
        },
        { "cf-connecting-ip": "1.2.3.4" },
      ),
    });
    expect(res.status).toBe(400);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("complete: sans opt-in, contact null accepté", async () => {
    const { completeHandler } = await loadRoutes();
    const res: Response = await completeHandler({
      request: makeReq(
        { session_id: "sess-12345678", contact: null },
        { "cf-connecting-ip": "1.2.3.4" },
      ),
    });
    expect(res.status).toBe(200);
    expect(rpcMock).toHaveBeenCalledTimes(1);
  });
});

// -- Secret leak guard -------------------------------------------------------

describe("build-clubero routes: service_role key never in response", () => {
  it("start response body contains no SUPABASE_SERVICE_ROLE_KEY-like payload", async () => {
    const fakeKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const { startHandler } = await loadRoutes();
    const res: Response = await startHandler({
      request: makeReq(
        { session_id: "sess-12345678", locale: "fr" },
        { "cf-connecting-ip": "1.2.3.4" },
      ),
    });
    const text = await res.text();
    if (fakeKey && fakeKey.length > 10) {
      expect(text.includes(fakeKey)).toBe(false);
    }
    // Aussi : pas de fuite de champ interne suspect
    expect(text).not.toMatch(/service_role/i);
    expect(text).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY/);
  });
});

// -- RPC error mapping -------------------------------------------------------

describe("build-clubero /save: map RPC errors to HTTP", () => {
  it("response_completed → 409", async () => {
    rpcMock.mockResolvedValueOnce({
      data: null,
      error: { message: "build_clubero: response_completed" },
    });
    const { saveHandler } = await loadRoutes();
    const res: Response = await saveHandler({
      request: makeReq(
        {
          session_id: "sess-12345678",
          question_key: "audience",
          question_type: "single",
          value: "kids",
        },
        { "cf-connecting-ip": "1.2.3.4" },
      ),
    });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe("response_completed");
  });

  it("answers_limit_exceeded → 409", async () => {
    rpcMock.mockResolvedValueOnce({
      data: null,
      error: { message: "build_clubero: answers_limit_exceeded" },
    });
    const { saveHandler } = await loadRoutes();
    const res: Response = await saveHandler({
      request: makeReq(
        {
          session_id: "sess-12345678",
          question_key: "audience",
          question_type: "single",
          value: "kids",
        },
        { "cf-connecting-ip": "1.2.3.4" },
      ),
    });
    expect(res.status).toBe(409);
  });
});
