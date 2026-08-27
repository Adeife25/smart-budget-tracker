const REQUIRED_IN_PRODUCTION = [
  'DATABASE_URL',
  'JWT_SECRET',
  'JWT_REFRESH_SECRET',
  'JWT_VERIFY_SECRET',
] as const;

const KNOWN_PLACEHOLDER_SECRETS = new Set([
  '',
  'change-me-in-production',
  'change-me-refresh',
  'change-me-verify',
]);

export function validateEnv(
  config: Record<string, unknown>,
): Record<string, unknown> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const isProduction = config.NODE_ENV === 'production';

  if (isProduction) {
    for (const key of REQUIRED_IN_PRODUCTION) {
      const value = config[key];
      if (!value || (typeof value === 'string' && !value.trim())) {
        errors.push(`${key} is required when NODE_ENV=production`);
      }
    }

    for (const key of [
      'JWT_SECRET',
      'JWT_REFRESH_SECRET',
      'JWT_VERIFY_SECRET',
    ]) {
      const value = config[key];
      if (
        typeof value === 'string' &&
        KNOWN_PLACEHOLDER_SECRETS.has(value.trim())
      ) {
        errors.push(`${key} is still set to a placeholder value`);
      }
    }

    const frontendUrl = config.FRONTEND_URL;
    if (
      typeof frontendUrl !== 'string' ||
      !frontendUrl.trim() ||
      frontendUrl.includes('localhost')
    ) {
      warnings.push(
        'FRONTEND_URL should point to the public app URL in production',
      );
    }
  }

  if (warnings.length > 0) {
    console.warn(`[env] ${warnings.join('; ')}`);
  }

  if (errors.length > 0) {
    throw new Error(`Environment validation failed:\n- ${errors.join('\n- ')}`);
  }

  return config;
}
