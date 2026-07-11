// Client-safe Zod schemas for the "View as" support mode.
// Do NOT import server-only modules here.
import { z } from "zod";

export const SUPPORT_VIEW_PERSONAS = [
  "club_admin",
  "coach",
  "player",
  "parent",
  "member",
] as const;
export type SupportViewPersona = (typeof SUPPORT_VIEW_PERSONAS)[number];

export const CreateSupportViewSessionInput = z.object({
  target_user_id: z.string().uuid(),
  club_id: z.string().uuid(),
  persona: z.enum(SUPPORT_VIEW_PERSONAS),
  reason: z.string().trim().min(3).max(500),
  duration_minutes: z.number().int().min(1).max(60).optional(),
});
export type CreateSupportViewSessionInputT = z.infer<typeof CreateSupportViewSessionInput>;

export const EndSupportViewSessionInput = z.object({
  session_id: z.string().uuid(),
});

export const ReadSupportViewInput = z.object({
  session_id: z.string().uuid(),
});

export type SupportViewSessionDTO = {
  id: string;
  superadmin_id: string;
  target_user_id: string;
  club_id: string;
  club_name: string | null;
  target_full_name: string | null;
  persona: SupportViewPersona;
  reason: string;
  started_at: string;
  expires_at: string;
};
