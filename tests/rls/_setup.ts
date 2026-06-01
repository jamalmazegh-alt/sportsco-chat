/**
 * Shared fixture types and accessor for RLS tests.
 *
 * Fixtures are created once by _global-setup.ts and persisted to a temp file
 * so every test suite (running in the same worker) can read the same IDs.
 */
import { readFileSync, existsSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

export type Role =
  | "adminA"
  | "coachA"
  | "playerA"
  | "parentA"
  | "adminB"
  | "coachB"
  | "playerB"
  | "superadmin";

export interface UserFixture {
  email: string;
  password: string;
  userId: string;
}

export interface Fixtures {
  runId: string;
  users: Record<Role, UserFixture>;
  clubA: string;
  clubB: string;
  teamA: string;
  teamB: string;
  playerA: string; // players.id
  playerB: string;
  eventA: string;
  eventB: string;
  convocationA: string;
  notificationA: string; // notification owned by adminA
  subscriptionA: string;
  subscriptionB: string;
  ticketA: string; // support_ticket owned by adminA
  ticketSuperOnly: string; // ticket owned by playerA
  messageA: string;
  exportRequestA: string;
  deletionRequestA: string;
  auditLogA: string;
  // Payments
  seasonA: string;
  seasonB: string;
  paymentItemA: string;
  obligationA: string; // payer = parentA
  obligationB: string; // clubB
  transactionA: string;
  paymentSettingsA: string; // = clubA (PK is club_id)
}

const FIXTURES_FILE = join(tmpdir(), "clubero-rls-fixtures.json");

export function fixturesPath(): string {
  return FIXTURES_FILE;
}

let cached: Fixtures | null = null;

export function getFixtures(): Fixtures {
  if (cached) return cached;
  if (!existsSync(FIXTURES_FILE)) {
    throw new Error(
      `RLS fixtures not found at ${FIXTURES_FILE}. Global setup probably failed.`,
    );
  }
  cached = JSON.parse(readFileSync(FIXTURES_FILE, "utf-8")) as Fixtures;
  return cached;
}

export const PASSWORD = "RlsTest!Pwd-2026";
