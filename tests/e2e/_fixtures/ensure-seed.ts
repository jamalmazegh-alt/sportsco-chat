/**
 * Idempotent E2E seed — creates/repairs the 4 fixture users + "E2E Test Club"
 * when SUPABASE_SERVICE_ROLE_KEY is available.
 *
 * Why this exists: nightly Playwright has been hard-failing since 2026-07-12
 * with `Invalid login credentials` because the pre-created E2E users in
 * bughunt drifted from the GitHub secrets (password reset / user wipe).
 * Manual one-shot SQL is fragile; this keeps secrets as the source of truth.
 *
 * Safety: refuses to mutate auth/DB unless E2E_TARGET_PROJECT_REF matches the
 * project ref extracted from SUPABASE_URL (same pattern as RLS_TARGET_PROJECT_REF).
 */
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";

export type E2ERole = "admin" | "coach" | "player" | "parent";

export const E2E_ROLE_ENV: Record<E2ERole, { email: string; password: string }> = {
  admin: { email: "E2E_ADMIN_EMAIL", password: "E2E_ADMIN_PASSWORD" },
  coach: { email: "E2E_COACH_EMAIL", password: "E2E_COACH_PASSWORD" },
  player: { email: "E2E_PLAYER_EMAIL", password: "E2E_PLAYER_PASSWORD" },
  parent: { email: "E2E_PARENT_EMAIL", password: "E2E_PARENT_PASSWORD" },
};

export function extractProjectRef(supabaseUrl: string): string | null {
  const m = supabaseUrl.match(/^https?:\/\/([a-z0-9]+)\.supabase\.co/i);
  return m?.[1] ?? null;
}

export function assertE2ETargetGuard(opts: {
  supabaseUrl: string;
  targetRef: string | undefined;
}): string {
  const actual = extractProjectRef(opts.supabaseUrl);
  if (!opts.targetRef) {
    throw new Error(
      "[e2e-seed] ABORT: E2E_TARGET_PROJECT_REF is not set. Refusing to create/reset " +
        "E2E users (service_role must only run against the dedicated bughunt project).",
    );
  }
  if (!actual) {
    throw new Error(
      `[e2e-seed] ABORT: could not extract project ref from SUPABASE_URL (${opts.supabaseUrl || "<empty>"}).`,
    );
  }
  if (actual !== opts.targetRef) {
    throw new Error(
      `[e2e-seed] ABORT: SUPABASE_URL points at "${actual}" but E2E_TARGET_PROJECT_REF is "${opts.targetRef}". ` +
        "Refusing to mutate auth users outside the target project.",
    );
  }
  return actual;
}

type RoleCreds = { role: E2ERole; email: string; password: string };

export function collectRoleCreds(env: NodeJS.ProcessEnv = process.env): RoleCreds[] {
  const out: RoleCreds[] = [];
  for (const role of Object.keys(E2E_ROLE_ENV) as E2ERole[]) {
    const email = env[E2E_ROLE_ENV[role].email];
    const password = env[E2E_ROLE_ENV[role].password];
    if (!email || !password) {
      if (role === "admin") {
        throw new Error(
          "[e2e-seed] E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD are required when seeding.",
        );
      }
      continue;
    }
    out.push({ role, email, password });
  }
  return out;
}

async function findUserByEmail(service: SupabaseClient, email: string): Promise<User | null> {
  const normalized = email.toLowerCase();
  // GoTrue admin list supports email filter via query string on recent stacks;
  // fall back to a bounded page scan for older gateways.
  try {
    const { data, error } = await service.auth.admin.listUsers({ page: 1, perPage: 200 });
    if (error) throw error;
    const hit = (data.users ?? []).find((u) => (u.email ?? "").toLowerCase() === normalized);
    if (hit) return hit;
  } catch (e) {
    console.warn(
      `[e2e-seed] listUsers page1 failed: ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  // Paginate a bit further — bughunt stays small; avoid unbounded loops.
  for (let page = 2; page <= 10; page += 1) {
    const { data, error } = await service.auth.admin.listUsers({ page, perPage: 200 });
    if (error) {
      console.warn(`[e2e-seed] listUsers page ${page}: ${error.message}`);
      break;
    }
    const users = data.users ?? [];
    const hit = users.find((u) => (u.email ?? "").toLowerCase() === normalized);
    if (hit) return hit;
    if (users.length < 200) break;
  }
  return null;
}

async function ensureUser(
  service: SupabaseClient,
  creds: RoleCreds,
): Promise<{ userId: string; created: boolean; passwordReset: boolean }> {
  const existing = await findUserByEmail(service, creds.email);
  if (existing) {
    const { error } = await service.auth.admin.updateUserById(existing.id, {
      password: creds.password,
      email_confirm: true,
      user_metadata: { ...(existing.user_metadata ?? {}), e2e_role: creds.role },
    });
    if (error) {
      throw new Error(
        `[e2e-seed] updateUserById(${creds.role}/${creds.email}) failed: ${error.message}`,
      );
    }
    return { userId: existing.id, created: false, passwordReset: true };
  }

  const { data, error } = await service.auth.admin.createUser({
    email: creds.email,
    password: creds.password,
    email_confirm: true,
    user_metadata: { e2e_role: creds.role },
  });
  if (error || !data.user) {
    throw new Error(
      `[e2e-seed] createUser(${creds.role}/${creds.email}) failed: ${error?.message ?? "no user"}`,
    );
  }
  return { userId: data.user.id, created: true, passwordReset: false };
}

async function ensureProfiles(
  service: SupabaseClient,
  users: Array<{ userId: string; role: E2ERole; email: string }>,
): Promise<void> {
  const rows = users.map((u) => {
    const label = u.role.charAt(0).toUpperCase() + u.role.slice(1);
    return {
      id: u.userId,
      full_name: `E2E ${label}`,
      first_name: "E2E",
      last_name: label,
    };
  });
  const { error } = await service.from("profiles").upsert(rows);
  if (error) throw new Error(`[e2e-seed] profiles upsert: ${error.message}`);
}

async function ensureClubAndMemberships(
  service: SupabaseClient,
  opts: {
    clubName: string;
    users: Array<{ userId: string; role: E2ERole }>;
  },
): Promise<string> {
  const adminUser = opts.users.find((u) => u.role === "admin");
  if (!adminUser) throw new Error("[e2e-seed] admin user missing — cannot create club");

  const { data: existing, error: findErr } = await service
    .from("clubs")
    .select("id, name")
    .eq("name", opts.clubName)
    .maybeSingle();
  if (findErr) throw new Error(`[e2e-seed] clubs lookup: ${findErr.message}`);

  let clubId = existing?.id as string | undefined;
  if (!clubId) {
    const { data: created, error: createErr } = await service
      .from("clubs")
      .insert({ name: opts.clubName, created_by: adminUser.userId, is_personal: false })
      .select("id")
      .single();
    if (createErr || !created) {
      throw new Error(`[e2e-seed] clubs insert: ${createErr?.message ?? "no row"}`);
    }
    clubId = created.id;
    console.log(`[e2e-seed] created club "${opts.clubName}" (${clubId})`);
  } else {
    console.log(`[e2e-seed] found club "${opts.clubName}" (${clubId})`);
  }

  for (const u of opts.users) {
    const { data: member, error: memErr } = await service
      .from("club_members")
      .select("id, role, roles")
      .eq("club_id", clubId)
      .eq("user_id", u.userId)
      .maybeSingle();
    if (memErr) throw new Error(`[e2e-seed] club_members lookup (${u.role}): ${memErr.message}`);

    if (!member) {
      const { error } = await service.from("club_members").insert({
        club_id: clubId,
        user_id: u.userId,
        role: u.role,
        roles: [u.role],
      });
      if (error) {
        throw new Error(`[e2e-seed] club_members insert (${u.role}): ${error.message}`);
      }
      continue;
    }

    const roles = Array.isArray(member.roles) ? member.roles : [];
    const needsRole = member.role !== u.role || !roles.includes(u.role);
    if (needsRole) {
      const { error } = await service
        .from("club_members")
        .update({ role: u.role, roles: [u.role] })
        .eq("id", member.id);
      if (error) {
        throw new Error(`[e2e-seed] club_members update (${u.role}): ${error.message}`);
      }
    }
  }

  return clubId;
}

export type EnsureSeedResult =
  | { skipped: true; reason: string }
  | {
      skipped: false;
      projectRef: string;
      clubId: string;
      users: Array<{ role: E2ERole; email: string; userId: string; created: boolean }>;
    };

/**
 * Ensure E2E users + club exist and passwords match env secrets.
 * No-op (skipped) when SERVICE_ROLE_KEY is absent — caller falls back to
 * sign-in against pre-seeded users.
 */
export async function ensureE2ESeed(
  env: NodeJS.ProcessEnv = process.env,
): Promise<EnsureSeedResult> {
  const url = env.SUPABASE_URL ?? env.VITE_SUPABASE_URL;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) {
    return { skipped: true, reason: "SUPABASE_URL missing" };
  }
  if (!serviceKey) {
    return {
      skipped: true,
      reason: "SUPABASE_SERVICE_ROLE_KEY absent — relying on pre-seeded users",
    };
  }

  // Require an explicit target ref before mutating auth. Missing ref → skip
  // (local .env may carry a service key for other scripts). Mismatch → hard abort.
  if (!env.E2E_TARGET_PROJECT_REF) {
    return {
      skipped: true,
      reason:
        "E2E_TARGET_PROJECT_REF unset — refusing to auto-seed; set it to the bughunt project ref",
    };
  }

  const projectRef = assertE2ETargetGuard({
    supabaseUrl: url,
    targetRef: env.E2E_TARGET_PROJECT_REF,
  });

  const creds = collectRoleCreds(env);
  const service = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const users: Array<{
    role: E2ERole;
    email: string;
    userId: string;
    created: boolean;
  }> = [];

  for (const c of creds) {
    const result = await ensureUser(service, c);
    users.push({
      role: c.role,
      email: c.email,
      userId: result.userId,
      created: result.created,
    });
    console.log(
      `[e2e-seed] ${c.role} ${c.email}: ${result.created ? "created" : "password reset"} (${result.userId})`,
    );
  }

  await ensureProfiles(
    service,
    users.map((u) => ({ userId: u.userId, role: u.role, email: u.email })),
  );

  const clubName = env.E2E_CLUB_NAME ?? "E2E Test Club";
  const clubId = await ensureClubAndMemberships(service, {
    clubName,
    users: users.map((u) => ({ userId: u.userId, role: u.role })),
  });

  return { skipped: false, projectRef, clubId, users };
}
