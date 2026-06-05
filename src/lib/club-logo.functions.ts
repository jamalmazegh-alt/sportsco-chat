import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { assertClubRole } from "@/lib/authz.server";

const ALLOWED_LOGO_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
]);

const MAX_LOGO_SIZE = 5 * 1024 * 1024;

const LogoUploadInput = z.object({
  clubId: z.string().uuid(),
  fileName: z.string().min(1).max(255),
  contentType: z.string().min(1).max(100),
  size: z.number().int().min(1).max(MAX_LOGO_SIZE),
});

const LogoPathInput = z.object({
  clubId: z.string().uuid(),
  path: z.string().min(1).max(500),
});

function safeLogoExtension(fileName: string, contentType: string) {
  const fromName = fileName
    .split(".")
    .pop()
    ?.toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  if (fromName && ["jpg", "jpeg", "png", "webp", "gif", "heic", "heif"].includes(fromName)) {
    return fromName === "jpeg" ? "jpg" : fromName;
  }
  if (contentType === "image/png") return "png";
  if (contentType === "image/webp") return "webp";
  if (contentType === "image/gif") return "gif";
  if (contentType === "image/heic") return "heic";
  if (contentType === "image/heif") return "heif";
  return "jpg";
}

export const createSignedClubLogoUpload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => LogoUploadInput.parse(input))
  .handler(async ({ data, context }) => {
    if (!ALLOWED_LOGO_MIME_TYPES.has(data.contentType)) {
      throw new Error("Format de logo non supporté");
    }

    await assertClubRole({
      supabase: context.supabase,
      userId: context.userId,
      clubId: data.clubId,
      allowedRoles: ["admin", "dirigeant"],
    });

    const ext = safeLogoExtension(data.fileName, data.contentType);
    const path = `${data.clubId}/logo-${Date.now()}-${globalThis.crypto.randomUUID()}.${ext}`;

    const { data: signed, error } = await supabaseAdmin.storage
      .from("club-logos")
      .createSignedUploadUrl(path, { upsert: true });
    if (error) throw new Error(error.message);

    return { path: signed.path, token: signed.token };
  });

export const updateClubLogoFromUpload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => LogoPathInput.parse(input))
  .handler(async ({ data, context }) => {
    if (!data.path.startsWith(`${data.clubId}/`)) {
      throw new Error("Chemin de logo invalide");
    }

    await assertClubRole({
      supabase: context.supabase,
      userId: context.userId,
      clubId: data.clubId,
      allowedRoles: ["admin", "dirigeant"],
    });

    const { data: publicUrl } = supabaseAdmin.storage.from("club-logos").getPublicUrl(data.path);
    const { error } = await supabaseAdmin
      .from("clubs")
      .update({ logo_url: publicUrl.publicUrl })
      .eq("id", data.clubId);
    if (error) throw new Error(error.message);

    return { logoUrl: publicUrl.publicUrl };
  });
