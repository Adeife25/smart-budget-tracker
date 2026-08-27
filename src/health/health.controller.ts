import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiExcludeEndpoint, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redisService: RedisService,
  ) {}

  @Get()
  @ApiExcludeEndpoint()
  async check(): Promise<{ status: string; database: string; redis: string }> {
    const [databaseUp, redisUp] = await Promise.all([
      this.checkDatabase(),
      this.redisService.ping(),
    ]);

    if (!databaseUp) {
      throw new ServiceUnavailableException({
        status: 'error',
        database: 'down',
        redis: redisUp ? 'up' : 'down',
      });
    }

    return {
      status: 'ok',
      database: 'up',
      redis: redisUp ? 'up' : 'down',
    };
  }

  private async checkDatabase(): Promise<boolean> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }
}
