import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit.server";

const Schema = z.object({
  token: z.string().uuid(),
  documentId: z.string().uuid(),
});

export const Route = createFileRoute("/api/public/camp-track-signed-url")({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        const ip = getClientIp(request);
        if (!(await checkRateLimit(ip, "camp-track-sign", 60))) {
          return Response.json({ error: "rate_limited" }, { status: 429 });
        }

        const url = process.env.SUPABASE_URL || import.meta.env.VITE_SUPABASE_URL;
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!url || !key) {
          return Response.json({ error: "server_misconfigured" }, { status: 500 });
        }

        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return Response.json({ error: "invalid_body" }, { status: 400 });
        }
        const parsed = Schema.safeParse(body);
        if (!parsed.success) {
          return Response.json({ error: "invalid_input" }, { status: 400 });
        }

        const supabase = createClient(url, key);
        // Verify: doc belongs to registration owning this token
        const { data: filePath, error } = await supabase.rpc(
          "resolve_camp_registration_document" as any,
          {
            _token: parsed.data.token,
            _document_id: parsed.data.documentId,
          },
        );
        if (error || !filePath || typeof filePath !== "string") {
          return Response.json({ error: "not_found" }, { status: 404 });
        }

        const { data: signed, error: signErr } = await supabase.storage
          .from("camp-registration-documents")
          .createSignedUrl(filePath, 600); // 10 min

        if (signErr || !signed?.signedUrl) {
          console.error("Signed URL error", signErr);
          return Response.json({ error: "sign_failed" }, { status: 500 });
        }

        return Response.json({ url: signed.signedUrl, expiresIn: 600 });
      },
    },
  },
});
