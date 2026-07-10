import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const TeamImageUploadInput = z.object({
  clubId: z.string().uuid(),
  teamId: z.string().uuid(),
  fileName: z.string().min(1).max(255),
  contentType: z.string().min(1).max(100),
  size: z.number().int().min(1),
});

const TeamImagePathInput = z.object({
  clubId: z.string().uuid(),
  teamId: z.string().uuid(),
  path: z.string().min(1).max(500),
});

export const createSignedTeamImageUpload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => TeamImageUploadInput.parse(input))
  .handler(async ({ data, context }) => {
    const allowedMimeTypes = new Set([
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/gif",
      "image/heic",
      "image/heif",
    ]);
    if (data.size > 5 * 1024 * 1024) {
      throw new Error("Image trop lourde (max 5 Mo).");
    }
    if (!allowedMimeTypes.has(data.contentType)) {
      throw new Error("Format de fichier non supporté.");
    }

    const { assertClubRole } = await import("@/lib/authz.server");
    await assertClubRole({
      supabase: context.supabase,
      userId: context.userId,
      clubId: data.clubId,
      allowedRoles: ["admin", "dirigeant", "coach", "assistant_coach", "staff"],
    });

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const fromName = data.fileName
      .split(".")
      .pop()
      ?.toLowerCase()
      .replace(/[^a-z0-9]/g, "");
    const ext =
      fromName && ["jpg", "jpeg", "png", "webp", "gif", "heic", "heif"].includes(fromName)
        ? fromName === "jpeg"
          ? "jpg"
          : fromName
        : data.contentType === "image/png"
          ? "png"
          : data.contentType === "image/webp"
            ? "webp"
            : data.contentType === "image/gif"
              ? "gif"
              : data.contentType === "image/heic"
                ? "heic"
                : data.contentType === "image/heif"
                  ? "heif"
                  : "jpg";
    const path = `${data.clubId}/${data.teamId}-${Date.now()}-${globalThis.crypto.randomUUID()}.${ext}`;
    const { data: signed, error } = await supabaseAdmin.storage
      .from("team-images")
      .createSignedUploadUrl(path, { upsert: true });
    if (error) throw new Error(error.message);

    return { path: signed.path, token: signed.token };
  });

export const updateTeamImageFromUpload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => TeamImagePathInput.parse(input))
  .handler(async ({ data, context }) => {
    if (!data.path.startsWith(`${data.clubId}/${data.teamId}-`)) {
      throw new Error("Chemin d'image invalide");
    }

    const { assertClubRole } = await import("@/lib/authz.server");
    await assertClubRole({
      supabase: context.supabase,
      userId: context.userId,
      clubId: data.clubId,
      allowedRoles: ["admin", "dirigeant", "coach", "assistant_coach", "staff"],
    });

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: publicUrl } = supabaseAdmin.storage.from("team-images").getPublicUrl(data.path);
    const { error } = await supabaseAdmin
      .from("teams")
      .update({ image_url: publicUrl.publicUrl })
      .eq("id", data.teamId)
      .eq("club_id", data.clubId);
    if (error) throw new Error(error.message);

    return { imageUrl: publicUrl.publicUrl };
  });