type CronSecretOptions = {
  primaryEnv: string;
  legacyEnv?: string;
  headerNames: string[];
};

export function verifyCronSecret(
  request: Request,
  options: CronSecretOptions,
): { ok: true } | { ok: false; status: 403 | 503 } {
  const secrets = [
    process.env[options.primaryEnv],
    options.legacyEnv ? process.env[options.legacyEnv] : undefined,
  ].filter((value): value is string => !!value);

  if (secrets.length === 0) return { ok: false, status: 503 };

  const provided = options.headerNames
    .map((name) => request.headers.get(name))
    .find((value): value is string => !!value);

  return provided && secrets.includes(provided) ? { ok: true } : { ok: false, status: 403 };
}
