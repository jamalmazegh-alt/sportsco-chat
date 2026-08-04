import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit.server";
import { enqueueTransactionalEmailServer } from "@/lib/email/send.server";
import { resolveEmailLocale } from "@/lib/email/locale";

const CAMP_UPLOAD_MAX_BYTES = 15 * 1024 * 1024;
const ALLOWED_MIME = new Set(["application/pdf", "image/jpeg", "image/png"]);

const FieldsSchema = z.object({
  token: z.string().uuid(),
  required_document_id: z.string().uuid(),
});

function extToMime(name: string): string | null {
  const lower = name.toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".png")) return "image/png";
  return null;
}
function extFor(mime: string): string {
  if (mime === "application/pdf") return "pdf";
  if (mime === "image/png") return "png";
  return "jpg";
}
function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "doc"
  );
}

export const Route = createFileRoute("/api/public/camp-track-upload")({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        const ip = getClientIp(request);
        if (!(await checkRateLimit(ip, "camp-track-upload", 20))) {
          return Response.json({ error: "rate_limited" }, { status: 429 });
        }
        const url = process.env.SUPABASE_URL || import.meta.env.VITE_SUPABASE_URL;
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!url || !key) {
          return Response.json({ error: "server_misconfigured" }, { status: 500 });
        }
        let form: FormData;
        try {
          form = await request.formData();
        } catch {
          return Response.json({ error: "invalid_body" }, { status: 400 });
        }

        const raw: Record<string, string> = {};
        for (const [k, v] of form.entries()) {
          if (typeof v === "string") raw[k] = v;
        }
        const parsed = FieldsSchema.safeParse(raw);
        if (!parsed.success) {
          return Response.json({ error: "invalid_input" }, { status: 400 });
        }

        const file = form.get("file");
        if (!(file instanceof File) || file.size === 0) {
          return Response.json({ error: "missing_file" }, { status: 400 });
        }
        if (file.size > CAMP_UPLOAD_MAX_BYTES) {
          return Response.json({ error: "file_too_large" }, { status: 400 });
        }
        const mime = file.type || extToMime(file.name) || "";
        if (!ALLOWED_MIME.has(mime)) {
          return Response.json({ error: "invalid_mime" }, { status: 400 });
        }

        const supabase = createClient(url, key);

        // Resolve: token → registration + verify required_document belongs to same camp
        const { data: resolved, error: resolveErr } = await supabase.rpc(
          "resolve_camp_registration_for_upload" as any,
          {
            _token: parsed.data.token,
            _required_document_id: parsed.data.required_document_id,
          },
        );
        if (resolveErr || !resolved) {
          return Response.json({ error: "not_found" }, { status: 404 });
        }
        const registrationId = (resolved as any).registration_id as string;
        const campId = (resolved as any).camp_id as string;

        // Get required document title (for filename slug)
        const { data: reqDoc } = await supabase
          .from("club_camp_required_documents")
          .select("title")
          .eq("id", parsed.data.required_document_id)
          .maybeSingle();
        const title = reqDoc?.title ?? "doc";

        const ext = extFor(mime);
        const objectPath = `${campId}/${registrationId}/${slugify(title)}-${parsed.data.required_document_id.slice(0, 8)}.${ext}`;

        const buffer = await file.arrayBuffer();
        const { error: upErr } = await supabase.storage
          .from("camp-registration-documents")
          .upload(objectPath, new Uint8Array(buffer), {
            contentType: mime,
            upsert: true,
          });
        if (upErr) {
          console.error("Upload failed", upErr);
          return Response.json({ error: "upload_failed" }, { status: 500 });
        }

        // Upsert doc row: replace existing (any status) → set pending, clear rejection.
        const { data: existing } = await supabase
          .from("club_camp_registration_documents")
          .select("id, review_status")
          .eq("registration_id", registrationId)
          .eq("required_document_id", parsed.data.required_document_id)
          .maybeSingle();

        if (existing?.id) {
          const { error: updErr } = await supabase
            .from("club_camp_registration_documents")
            .update({
              file_path: objectPath,
              review_status: "pending",
              rejection_reason: null,
              uploaded_at: new Date().toISOString(),
            })
            .eq("id", existing.id);
          if (updErr) {
            console.error("Doc row update failed", updErr);
            return Response.json({ error: "db_failed" }, { status: 500 });
          }
        } else {
          const { error: insErr } = await supabase.from("club_camp_registration_documents").insert({
            registration_id: registrationId,
            required_document_id: parsed.data.required_document_id,
            file_path: objectPath,
            review_status: "pending",
          });
          if (insErr) {
            console.error("Doc row insert failed", insErr);
            return Response.json({ error: "db_failed" }, { status: 500 });
          }
        }

        // Notify camp organizer that a document was (re)submitted and is pending review
        try {
          const wasRejected = existing?.review_status === "rejected";
          const { data: reg } = await supabase
            .from("club_camp_registrations")
            .select(
              "participant_first_name, participant_last_name, camp_id, club_camps:camp_id(title, created_by, club:clubs(name, default_language))",
            )
            .eq("id", registrationId)
            .maybeSingle();
          const camp = (reg as any)?.club_camps;
          const createdBy = camp?.created_by;
          if (createdBy) {
            const { data: organizer } = await supabase.auth.admin.getUserById(createdBy);
            const organizerEmail = organizer?.user?.email;
            if (organizerEmail) {
              const { data: organizerProfile } = await supabase
                .from("profiles")
                .select("preferred_language")
                .eq("id", createdBy)
                .maybeSingle();
              const origin = new URL(request.url).origin;
              await enqueueTransactionalEmailServer({
                templateName: "camp-document-resubmitted",
                recipientEmail: organizerEmail,
                templateData: {
                  campTitle: camp?.title ?? "",
                  clubName: camp?.club?.name,
                  participantName:
                    `${(reg as any)?.participant_first_name ?? ""} ${(reg as any)?.participant_last_name ?? ""}`.trim(),
                  documentTitle: title,
                  wasRejected,
                  manageUrl: `${origin}/admin/stages/${campId}`,
                  locale: resolveEmailLocale(
                    (organizerProfile as { preferred_language?: string | null } | null)
                      ?.preferred_language,
                    camp?.club?.default_language,
                  ),
                },
                idempotencyKey:
                  `camp-doc-resub:${registrationId}:${parsed.data.required_document_id}:${Date.now()}`.slice(
                    0,
                    80,
                  ),
              });
            }
          }
        } catch (e) {
          console.error("Organizer resubmit notify failed", e);
        }

        return Response.json({ ok: true });
      },
    },
  },
});
