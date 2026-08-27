import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
  Request,
  Res,
  StreamableFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { randomUUID } from 'node:crypto';
import type { Response } from 'express';
import { RedisCacheInterceptor } from '../common/interceptors/redis-cache.interceptor';
import { RedisService } from '../redis/redis.service';
import {
  REPORT_EXPORT_JOB,
  REPORT_EXPORT_QUEUE,
} from '../queues/queue.constants';
import { JwtAuthGuard } from '../auth/auth.guard';
import { ReportsService } from './reports.service';
import { ReportFormatQueryDto, ReportQueryDto } from './dto/report-query.dto';

const EXPORT_TTL_SECONDS = 60 * 60;

@ApiTags('Reports')
@Controller('reports')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ReportsController {
  constructor(
    private readonly reportsService: ReportsService,
    @InjectQueue(REPORT_EXPORT_QUEUE)
    private readonly reportExportQueue: Queue,
    private readonly redisService: RedisService,
  ) {}

  @Get()
  @UseInterceptors(RedisCacheInterceptor)
  @ApiOperation({
    summary:
      'Full report for the last N months: monthly trends, budget performance, category breakdown and net savings',
  })
  getReport(
    @Request() req: { user: { id: string } },
    @Query() query: ReportQueryDto,
  ) {
    return this.reportsService.getReport(req.user.id, query.months);
  }

  @Post('export')
  @ApiOperation({
    summary:
      'Queue a report export (PDF, DOCX or CSV). Returns a jobId you can poll with GET /reports/export/:jobId',
  })
  async queueExport(
    @Request() req: { user: { id: string } },
    @Body() query: ReportFormatQueryDto,
  ) {
    const format = query.format ?? 'pdf';
    const months = query.months ?? 6;
    const jobId = randomUUID();

    await this.redisService.set(
      this.statusKey(jobId),
      'processing',
      EXPORT_TTL_SECONDS,
    );
    await this.reportExportQueue.add(
      REPORT_EXPORT_JOB,
      { jobId, userId: req.user.id, months, format },
      {
        attempts: 2,
        backoff: { type: 'fixed', delay: 5_000 },
        removeOnComplete: 1_000,
        removeOnFail: 1_000,
      },
    );

    return { jobId, status: 'processing' };
  }

  @Get('export/:jobId')
  @ApiOperation({
    summary:
      'Poll for a queued export. Returns 202 while processing and the file once ready',
  })
  @ApiParam({
    name: 'jobId',
    description: 'The jobId returned by POST /reports/export',
  })
  async downloadExport(
    @Param('jobId') jobId: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile | { jobId: string; status: string }> {
    if (!jobId) {
      throw new BadRequestException('jobId is required');
    }

    const status = await this.redisService.get<string>(this.statusKey(jobId));
    if (!status) {
      throw new NotFoundException('Export not found or expired');
    }
    if (status !== 'completed') {
      res.status(202);
      return { jobId, status };
    }

    const [meta, buffer] = await Promise.all([
      this.redisService.get<{ filename: string; contentType: string }>(
        this.metaKey(jobId),
      ),
      this.redisService.getBuffer(this.fileKey(jobId)),
    ]);

    if (!meta || !buffer) {
      throw new NotFoundException('Export not found or expired');
    }

    res.set({
      'Content-Type': meta.contentType,
      'Content-Disposition': `attachment; filename="${meta.filename}"`,
      'Content-Length': String(buffer.byteLength),
    });

    await this.redisService.del(
      this.statusKey(jobId),
      this.metaKey(jobId),
      this.fileKey(jobId),
    );

    return new StreamableFile(buffer);
  }

  private statusKey(jobId: string): string {
    return `report-export:${jobId}:status`;
  }

  private metaKey(jobId: string): string {
    return `report-export:${jobId}:meta`;
  }

  private fileKey(jobId: string): string {
    return `report-export:${jobId}:file`;
  }
}
