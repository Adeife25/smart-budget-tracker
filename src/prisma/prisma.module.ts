import { BullModule } from '@nestjs/bullmq';
import { Global, Module } from '@nestjs/common';
import { MAINTENANCE_QUEUE } from '../queues/queue.constants';
import { PrismaService } from './prisma.service';
import { TokensCleanupProcessor } from './tokens-cleanup.processor';
import { TokensCleanupService } from './tokens-cleanup.service';

@Global()
@Module({
  imports: [BullModule.registerQueue({ name: MAINTENANCE_QUEUE })],
  providers: [PrismaService, TokensCleanupService, TokensCleanupProcessor],
  exports: [PrismaService],
})
export class PrismaModule {}
