import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import {
  MAINTENANCE_QUEUE,
  TOKEN_CLEANUP_JOB,
} from '../queues/queue.constants';

const RUN_INTERVAL_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class TokensCleanupService implements OnModuleInit {
  private readonly logger = new Logger(TokensCleanupService.name);

  constructor(
    @InjectQueue(MAINTENANCE_QUEUE) private readonly maintenanceQueue: Queue,
  ) {}

  onModuleInit(): void {
    void this.schedule();
  }

  private async schedule(): Promise<void> {
    try {
      await this.maintenanceQueue.add(
        TOKEN_CLEANUP_JOB,
        {},
        {
          jobId: 'tokens-cleanup-boot',
          removeOnComplete: true,
          removeOnFail: true,
        },
      );
      // Idempotent (upsert): safe with multiple app instances.
      await this.maintenanceQueue.upsertJobScheduler(
        TOKEN_CLEANUP_JOB,
        { every: RUN_INTERVAL_MS },
        { name: TOKEN_CLEANUP_JOB, data: {} },
      );
      this.logger.log('Scheduled recurring token cleanup job');
    } catch (error) {
      this.logger.error(
        `Failed to schedule token cleanup: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}
