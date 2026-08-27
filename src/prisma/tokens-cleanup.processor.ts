import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job } from 'bullmq';
import { PrismaService } from './prisma.service';
import {
  MAINTENANCE_QUEUE,
  TOKEN_CLEANUP_JOB,
} from '../queues/queue.constants';

const DEFAULT_RETENTION_DAYS = 7;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

@Processor(MAINTENANCE_QUEUE)
export class TokensCleanupProcessor extends WorkerHost {
  private readonly logger = new Logger(TokensCleanupProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name !== TOKEN_CLEANUP_JOB) return;
    await this.runCleanup();
  }

  private async runCleanup(): Promise<void> {
    const cutoff = new Date(Date.now() - this.retentionMs());

    try {
      const [refreshTokens, resetTokens] = await Promise.all([
        this.prisma.refreshToken.deleteMany({
          where: { expiresAt: { lt: cutoff } },
        }),
        this.prisma.passwordResetToken.deleteMany({
          where: { expiresAt: { lt: cutoff } },
        }),
      ]);

      if (refreshTokens.count > 0 || resetTokens.count > 0) {
        this.logger.log(
          `Cleaned up ${refreshTokens.count} expired refresh tokens and ${resetTokens.count} expired password-reset tokens`,
        );
      }
    } catch (error) {
      this.logger.warn(
        `Token cleanup failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private retentionMs(): number {
    const days = Number(
      this.configService.get<string>(
        'TOKEN_CLEANUP_RETENTION_DAYS',
        String(DEFAULT_RETENTION_DAYS),
      ),
    );
    return (
      (Number.isFinite(days) && days > 0 ? days : DEFAULT_RETENTION_DAYS) *
      MS_PER_DAY
    );
  }
}
