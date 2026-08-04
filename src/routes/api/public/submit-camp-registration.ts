import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit.server";
import { enqueueTransactionalEmailServer } from "@/lib/email/send.server";
import { resolveEmailLocale } from "@/lib/email/locale";

const CAMP_UPLOAD_MAX_BYTES = 15 * 1024 * 1024;
const ALLOWED_MIME = new Set(["application/pdf", "image/jpeg", "image/png"]);

const FieldsSchema = z.object({
  club_slug: z.string().trim().min(1).max(120),
  camp_slug: z.string().trim().min(1).max(120),
  participant_first_name: z.string().trim().min(1).max(120),
  participant_last_name: z.string().trim().min(1).max(120),
  birth_date: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date"),
  gender: z
    .enum(["male", "female", "other"])
    .optional()
    .or(z.literal("").transform(() => undefined)),
  club_name: z.string().trim().max(200).optional().nullable(),
  age_group_id: z
    .string()
    .uuid()
    .optional()
    .nullable()
    .or(z.literal("").transform(() => null)),
  guardian_first_name: z.string().trim().min(1).max(120),
  guardian_last_name: z.string().trim().min(1).max(120),
  guardian_email: z.string().trim().email().max(255),
  guardian_phone: z.string().trim().max(40).optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
  consent: z.string().min(1),
  website: z.string().optional(), // honeypot
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

export const Route = createFileRoute("/api/public/submit-camp-registration")({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        const ip = getClientIp(request);
        if (!(await checkRateLimit(ip, "camp-registration", 5))) {
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

        // Honeypot — pretend success
        if (raw.website && raw.website.length > 0) {
          return Response.json({
            ok: true,
            registrationId: "00000000-0000-0000-0000-000000000000",
          });
        }

        let fields: z.infer<typeof FieldsSchema>;
        try {
          fields = FieldsSchema.parse(raw);
        } catch (e: any) {
          return Response.json(
            { error: "invalid_input", details: e?.errors ?? null },
            { status: 400 },
          );
        }

        const supabase = createClient(url, key);

        // Resolve club + camp
        const { data: club, error: clubErr } = await supabase
          .from("clubs")
          .select("id, name, slug, default_language")
          .eq("slug", fields.club_slug)
          .maybeSingle();
        if (clubErr || !club) {
          return Response.json({ error: "club_not_found" }, { status: 404 });
        }
        const { data: camp, error: campErr } = await supabase
          .from("club_camps")
          .select(
            "id, title, slug, status, registration_deadline, capacity, start_date, end_date, created_by, club_id",
          )
          .eq("club_id", club.id)
          .eq("slug", fields.camp_slug)
          .maybeSingle();
        if (campErr || !camp) {
          return Response.json({ error: "camp_not_found" }, { status: 404 });
        }
        if (camp.status !== "published") {
          return Response.json({ error: "registration_closed" }, { status: 400 });
        }
        if (
          camp.registration_deadline &&
          new Date(camp.registration_deadline).getTime() < Date.now()
        ) {
          return Response.json({ error: "registration_closed" }, { status: 400 });
        }

        // Capacity check — informational only. Full stage does NOT refuse.
        const { count: takenCount } = await supabase
          .from("club_camp_registrations")
          .select("id", { count: "exact", head: true })
          .eq("camp_id", camp.id)
          .in("registration_status", ["pending", "approved"]);
        const isFull = (takenCount ?? 0) >= camp.capacity;

        // Age group validation (server-side)
        const { data: ageGroups } = await supabase
          .from("club_camp_age_groups")
          .select("id, birth_year_min, birth_year_max")
          .eq("camp_id", camp.id);
        const birthYear = Number(fields.birth_date.slice(0, 4));
        const groupsWithBounds = (ageGroups ?? []).filter(
          (g) => g.birth_year_min != null || g.birth_year_max != null,
        );

        if (fields.age_group_id) {
          const chosen = (ageGroups ?? []).find((g) => g.id === fields.age_group_id);
          if (!chosen) {
            return Response.json({ error: "age_group_invalid" }, { status: 400 });
          }
          const min = chosen.birth_year_min;
          const max = chosen.birth_year_max;
          if ((min != null && birthYear < min) || (max != null && birthYear > max)) {
            return Response.json({ error: "age_mismatch" }, { status: 400 });
          }
        } else if (groupsWithBounds.length > 0) {
          // Aucune catégorie choisie mais des bornes existent : la date doit rentrer dans au moins une
          const fits = groupsWithBounds.some((g) => {
            const min = g.birth_year_min;
            const max = g.birth_year_max;
            const okMin = min == null || birthYear >= min;
            const okMax = max == null || birthYear <= max;
            return okMin && okMax;
          });
          if (!fits) {
            return Response.json({ error: "age_mismatch" }, { status: 400 });
          }
        }

        // Required documents
        const { data: requiredDocs } = await supabase
          .from("club_camp_required_documents")
          .select("id, title, required, is_sensitive")
          .eq("camp_id", camp.id);

        const filesByDoc = new Map<string, File>();
        for (const [k, v] of form.entries()) {
          if (k.startsWith("doc_") && v instanceof File && v.size > 0) {
            filesByDoc.set(k.slice(4), v);
          }
        }

        for (const doc of requiredDocs ?? []) {
          const file = filesByDoc.get(doc.id);
          if (doc.required && !file) {
            return Response.json(
              { error: "missing_required_doc", doc: doc.title },
              { status: 400 },
            );
          }
          if (file) {
            if (file.size > CAMP_UPLOAD_MAX_BYTES) {
              return Response.json({ error: "file_too_large", doc: doc.title }, { status: 400 });
            }
            const mime = file.type || extToMime(file.name) || "";
            if (!ALLOWED_MIME.has(mime)) {
              return Response.json({ error: "invalid_mime", doc: doc.title }, { status: 400 });
            }
          }
        }

        // Insert registration — anti-doublon via unique partial index (case-insensitive)
        const { data: reg, error: regErr } = await supabase
          .from("club_camp_registrations")
          .insert({
            camp_id: camp.id,
            participant_first_name: fields.participant_first_name,
            participant_last_name: fields.participant_last_name,
            birth_date: fields.birth_date,
            gender: fields.gender ?? null,
            club_name: fields.club_name || null,
            guardian_first_name: fields.guardian_first_name,
            guardian_last_name: fields.guardian_last_name,
            guardian_email: fields.guardian_email.toLowerCase(),
            guardian_phone: fields.guardian_phone || null,
            notes: fields.notes || null,
            registration_status: "pending",
            payment_status: "pending",
          })
          .select("id, access_token")
          .single();

        if (regErr || !reg) {
          if (regErr?.code === "23505") {
            return Response.json({ error: "duplicate" }, { status: 409 });
          }
          console.error("Camp registration insert failed", regErr);
          return Response.json({ error: "insert_failed" }, { status: 500 });
        }

        // Upload files + insert registration_documents rows
        const uploadErrors: string[] = [];
        for (const doc of requiredDocs ?? []) {
          const file = filesByDoc.get(doc.id);
          if (!file) continue;
          const mime = file.type || extToMime(file.name) || "application/octet-stream";
          const ext = extFor(mime);
          const objectPath = `${camp.id}/${reg.id}/${slugify(doc.title)}-${doc.id.slice(0, 8)}.${ext}`;
          const buffer = await file.arrayBuffer();
          const { error: upErr } = await supabase.storage
            .from("camp-registration-documents")
            .upload(objectPath, new Uint8Array(buffer), {
              contentType: mime,
              upsert: true,
            });
          if (upErr) {
            console.error("Camp doc upload failed", upErr);
            uploadErrors.push(doc.title);
            continue;
          }
          const { error: docInsErr } = await supabase
            .from("club_camp_registration_documents")
            .insert({
              registration_id: reg.id,
              required_document_id: doc.id,
              file_path: objectPath,
              review_status: "pending",
            });
          if (docInsErr) {
            console.error("Camp doc row insert failed", docInsErr);
            uploadErrors.push(doc.title);
          }
        }

        if (uploadErrors.length > 0) {
          return Response.json(
            { error: "upload_failed", failed: uploadErrors, registrationId: reg.id },
            { status: 500 },
          );
        }

        const origin = new URL(request.url).origin;
        const manageUrl = `${origin}/admin/stages/${camp.id}`;
        const trackingUrl = `${origin}/stages/${fields.club_slug}/${fields.camp_slug}/suivi/${(reg as any).access_token}`;

        // Family confirmation email (with tracking link + full-notice)
        try {
          const acceptLang = request.headers.get("accept-language") ?? "";
          const familyLocale = resolveEmailLocale(
            acceptLang,
            (club as { default_language?: string | null }).default_language,
          );
          await enqueueTransactionalEmailServer({
            templateName: "camp-registration-received",
            recipientEmail: fields.guardian_email,
            templateData: {
              guardianFirstName: fields.guardian_first_name,
              participantName: `${fields.participant_first_name} ${fields.participant_last_name}`,
              campTitle: camp.title,
              clubName: club.name,
              campStartDate: camp.start_date,
              campEndDate: camp.end_date,
              referenceId: reg.id.slice(0, 8).toUpperCase(),
              trackingUrl,
              isFull,
              locale: familyLocale,
            },
            idempotencyKey: `camp-reg-received:${reg.id}`,
          });
        } catch (e) {
          console.error("Family email failed", e);
        }

        try {
          const createdBy = camp.created_by;
          if (createdBy) {
            const { data: organizer } = await supabase.auth.admin.getUserById(createdBy);
            const organizerEmail = organizer?.user?.email;
            if (organizerEmail) {
              await enqueueTransactionalEmailServer({
                templateName: "camp-new-registration",
                recipientEmail: organizerEmail,
                templateData: {
                  campTitle: camp.title,
                  clubName: club.name,
                  participantName: `${fields.participant_first_name} ${fields.participant_last_name}`,
                  guardianName: `${fields.guardian_first_name} ${fields.guardian_last_name}`,
                  guardianEmail: fields.guardian_email,
                  guardianPhone: fields.guardian_phone ?? undefined,
                  manageUrl,
                },
                idempotencyKey: `camp-new-reg:${reg.id}`,
              });
            }
          }
        } catch (e) {
          console.error("Organizer notify failed", e);
        }

        return Response.json({
          ok: true,
          registrationId: reg.id,
          isFull,
        });
      },
    },
  },
});
