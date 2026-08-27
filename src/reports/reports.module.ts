import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { DashboardModule } from '../dashboard/dashboard.module';
import { REPORT_EXPORT_QUEUE } from '../queues/queue.constants';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { ReportPdfService } from './exports/report-pdf.service';
import { ReportDocxService } from './exports/report-docx.service';
import { ReportExportService } from './exports/report-export.service';
import { ReportExportProcessor } from './report-export.processor';

@Module({
  imports: [
    DashboardModule,
    BullModule.registerQueue({ name: REPORT_EXPORT_QUEUE }),
  ],
  controllers: [ReportsController],
  providers: [
    ReportsService,
    ReportPdfService,
    ReportDocxService,
    ReportExportService,
    ReportExportProcessor,
  ],
})
export class ReportsModule {}
