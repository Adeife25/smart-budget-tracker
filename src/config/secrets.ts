import { ConfigService } from '@nestjs/config';

export function resolveSecret(
  configService: ConfigService,
  key: string,
): string {
  const value = configService.get<string>(key);
  if (value && value.trim()) {
    return value;
  }

  if (configService.get<string>('NODE_ENV') === 'production') {
    throw new Error(`${key} must be set when NODE_ENV=production`);
  }

  return `insecure-dev-${key.toLowerCase()}`;
}
