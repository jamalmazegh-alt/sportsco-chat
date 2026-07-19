/**
 * Product activity log — enum of allowed categories and action types.
 *
 * Kept as string unions (not TS enums) so they serialize directly to the DB
 * `category` / `action_type` columns. Adding a new action type is a one-line
 * change here; do not invent action types at call sites.
 */

export type ActivityCategory =
  | "team"
  | "event"
  | "convocation"
  | "camp"
  | "tournament"
  | "invite"
  | "social"
  | "wall"
  | "import"
  | "support"
  | "impersonation";

export type ActivityStatus = "success" | "warning" | "failure";

export type ActivityActionType =
  // events
  | "event.created"
  | "event.updated"
  | "event.cancelled"
  // convocations
  | "convocation.sent"
  | "convocation.email_backfill"
  | "convocation.responded"
  // teams
  | "team.created"
  | "team.updated"
  // camps
  | "camp.created"
  | "camp.published"
  | "camp.registration_received"
  // tournaments
  | "tournament.created"
  // social
  | "social.connected"
  | "social.disconnected"
  | "social.sync_succeeded"
  | "social.sync_failed"
  // wall
  | "wall.post_published"
  // invites
  | "invite.club_sent"
  | "invite.club_accepted"
  | "invite.member_sent"
  | "invite.member_accepted"
  // imports
  | "import.started"
  | "import.succeeded"
  | "import.partial"
  | "import.failed"
  // support
  | "support.ticket_opened"
  // impersonation
  | "impersonation.started";

export type ActorRole = "admin" | "coach" | "parent" | "player" | "system";
