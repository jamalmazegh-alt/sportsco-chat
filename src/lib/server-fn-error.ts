/** Stable machine-readable error code in a thrown server-fn Response body. */
export type ServerFnErrorBody = { error: string };

export function serverFnError(code: string, status: number): Response {
  const body: ServerFnErrorBody = { error: code };
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** Read `{ error }` from a client-side server-fn failure — never match on message text. */
export function getServerFnErrorCode(err: unknown): string | null {
  if (err == null) return null;
  if (typeof err === "string") return parseServerFnErrorCodeFromPayload(err);
  if (typeof err === "object") {
    const record = err as Record<string, unknown>;
    if (typeof record.error === "string") return record.error;
    if (typeof record.message === "string") {
      const fromMessage = parseServerFnErrorCodeFromPayload(record.message);
      if (fromMessage) return fromMessage;
    }
  }
  if (err instanceof Error) return parseServerFnErrorCodeFromPayload(err.message);
  return null;
}

function parseServerFnErrorCodeFromPayload(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed.startsWith("{")) return null;
  try {
    const parsed = JSON.parse(trimmed) as ServerFnErrorBody;
    return typeof parsed.error === "string" ? parsed.error : null;
  } catch {
    return null;
  }
}
