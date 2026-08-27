import { Injectable } from '@nestjs/common';
import { ReportData } from '../reports.service';
import { ReportDocxService } from './report-docx.service';
import { ReportPdfService } from './report-pdf.service';

export type ReportFormat = 'pdf' | 'docx' | 'csv';

export interface ReportExportFile {
  buffer: Buffer;
  contentType: string;
  filename: string;
}

@Injectable()
export class ReportExportService {
  constructor(
    private readonly pdfService: ReportPdfService,
    private readonly docxService: ReportDocxService,
  ) {}

  async generate(
    report: ReportData,
    format: ReportFormat,
  ): Promise<ReportExportFile> {
    const period = report.range.end.slice(0, 10);

    switch (format) {
      case 'docx':
        return {
          buffer: await this.docxService.generate(report),
          contentType:
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          filename: `budget-report-${period}.docx`,
        };
      case 'csv':
        return {
          buffer: Buffer.from(this.toCsv(report), 'utf8'),
          contentType: 'text/csv; charset=utf-8',
          filename: `budget-report-${period}.csv`,
        };
      default:
        return {
          buffer: await this.pdfService.generate(report),
          contentType: 'application/pdf',
          filename: `budget-report-${period}.pdf`,
        };
    }
  }

  private toCsv(report: ReportData): string {
    const lines: string[] = [];
    const pushSection = (title: string, rows: Record<string, unknown>[]) => {
      lines.push(title);
      if (rows.length === 0) {
        lines.push('No data');
        lines.push('');
        return;
      }
      lines.push(Object.keys(rows[0]).join(','));
      for (const row of rows) {
        lines.push(
          Object.values(row)
            .map((v) => this.escape(v))
            .join(','),
        );
      }
      lines.push('');
    };

    lines.push(`Smart Budget Tracker report,${report.range.months} months`, '');
    pushSection('Monthly trends', report.monthlyTrends);
    pushSection('Budget performance', report.budgetPerformance);
    pushSection('Category breakdown', report.categoryBreakdown.categories);
    pushSection('Monthly net savings', report.monthlyNetSavings);

    return lines.join('\r\n');
  }

  private escape(value: unknown): string {
    let s: string;
    if (typeof value === 'string') {
      s = value;
    } else if (typeof value === 'number' || typeof value === 'boolean') {
      s = String(value);
    } else {
      s = JSON.stringify(value) ?? '';
    }
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }
}
