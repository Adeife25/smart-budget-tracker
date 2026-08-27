import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { RedisService } from '../redis/redis.service';
import {
  REPORT_EXPORT_JOB,
  REPORT_EXPORT_QUEUE,
} from '../queues/queue.constants';
import { ReportsService } from './reports.service';
import {
  ReportExportService,
  ReportFormat,
} from './exports/report-export.service';

export interface ReportExportJobData {
  jobId: string;
  userId: string;
  months: number;
  format: ReportFormat;
}

const EXPORT_TTL_SECONDS = 60 * 60;

@Processor(REPORT_EXPORT_QUEUE)
export class ReportExportProcessor extends WorkerHost {
  private readonly logger = new Logger(ReportExportProcessor.name);

  constructor(
    private readonly reportsService: ReportsService,
    private readonly exportService: ReportExportService,
    private readonly redisService: RedisService,
  ) {
    super();
  }

  async process(job: Job<ReportExportJobData>): Promise<void> {
    if (job.name !== REPORT_EXPORT_JOB) return;

    const { jobId, userId, months, format } = job.data;

    try {
      const report = await this.reportsService.getReport(userId, months);
      const file = await this.exportService.generate(report, format);

      await this.redisService.setBuffer(
        this.fileKey(jobId),
        file.buffer,
        EXPORT_TTL_SECONDS,
      );
      await this.redisService.set(
        this.metaKey(jobId),
        {
          filename: file.filename,
          contentType: file.contentType,
        },
        EXPORT_TTL_SECONDS,
      );
      await this.redisService.set(
        this.statusKey(jobId),
        'completed',
        EXPORT_TTL_SECONDS,
      );
    } catch (error) {
      this.logger.error(
        `Report export failed for job ${jobId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      throw error;
    }
  }

  fileKey(jobId: string): string {
    return `report-export:${jobId}:file`;
  }

  metaKey(jobId: string): string {
    return `report-export:${jobId}:meta`;
  }

  statusKey(jobId: string): string {
    return `report-export:${jobId}:status`;
  }
}
