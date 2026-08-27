import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private readonly client: Redis;
  private readonly defaultTtlSeconds: number;

  constructor(private readonly configService: ConfigService) {
    const parsedTtl = Number(
      this.configService.get<string>('CACHE_TTL_SECONDS', '300'),
    );
    this.defaultTtlSeconds =
      Number.isFinite(parsedTtl) && parsedTtl > 0 ? parsedTtl : 300;

    this.client = new Redis({
      host: this.configService.get<string>('REDIS_HOST', 'localhost'),
      port:
        Number(this.configService.get<string>('REDIS_PORT', '6379')) || 6379,
      password: this.configService.get<string>('REDIS_PASSWORD') || undefined,
      // Fail fast when Redis is down so API requests degrade to cache misses
      // instead of hanging on queued commands.
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
    });

    this.client.on('error', (error) =>
      this.logger.warn(`Redis error: ${error.message}`),
    );
  }

  get ttlSeconds(): number {
    return this.defaultTtlSeconds;
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      const raw = await this.client.get(key);
      if (raw === null) return null;
      try {
        return JSON.parse(raw) as T;
      } catch {
        return raw as T;
      }
    } catch (error) {
      this.logger.warn(`Redis GET failed for ${key}: ${this.message(error)}`);
      return null;
    }
  }

  async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    try {
      const serialized =
        typeof value === 'string' ? value : JSON.stringify(value);
      await this.client.set(
        key,
        serialized,
        'EX',
        ttlSeconds ?? this.defaultTtlSeconds,
      );
    } catch (error) {
      this.logger.warn(`Redis SET failed for ${key}: ${this.message(error)}`);
    }
  }

  async getBuffer(key: string): Promise<Buffer | null> {
    try {
      return (await this.client.getBuffer(key)) ?? null;
    } catch (error) {
      this.logger.warn(
        `Redis GET (buffer) failed for ${key}: ${this.message(error)}`,
      );
      return null;
    }
  }

  async setBuffer(
    key: string,
    value: Buffer,
    ttlSeconds?: number,
  ): Promise<void> {
    try {
      await this.client.set(
        key,
        value,
        'EX',
        ttlSeconds ?? this.defaultTtlSeconds,
      );
    } catch (error) {
      this.logger.warn(
        `Redis SET (buffer) failed for ${key}: ${this.message(error)}`,
      );
    }
  }

  async del(...keys: string[]): Promise<void> {
    if (keys.length === 0) return;
    try {
      await this.client.del(...keys);
    } catch (error) {
      this.logger.warn(
        `Redis DEL failed for ${keys.join(', ')}: ${this.message(error)}`,
      );
    }
  }

  async invalidateUser(userId: string): Promise<void> {
    await this.delByPrefix(`user:${userId}:`);
  }

  async delByPrefix(prefix: string): Promise<void> {
    try {
      let cursor = '0';
      do {
        const [nextCursor, keys] = await this.client.scan(
          cursor,
          'MATCH',
          `${prefix}*`,
          'COUNT',
          100,
        );
        cursor = nextCursor;
        if (keys.length > 0) {
          await this.client.del(...keys);
        }
      } while (cursor !== '0');
    } catch (error) {
      this.logger.warn(
        `Redis SCAN/DEL failed for prefix ${prefix}: ${this.message(error)}`,
      );
    }
  }

  async ping(): Promise<boolean> {
    try {
      return (await this.client.ping()) === 'PONG';
    } catch {
      return false;
    }
  }

  onModuleDestroy(): void {
    this.client.disconnect();
  }

  private message(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
