import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';

import { ReportData } from '../reports.service';

const MONEY = new Intl.NumberFormat('en-NG', {
  style: 'currency',
  currency: 'NGN',
  maximumFractionDigits: 2,
});

const PAGE_WIDTH = 595;
const MARGIN = 48;
const CONTENT_WIDTH = PAGE_WIDTH - 2 * MARGIN;

@Injectable()
export class ReportPdfService {
  async generate(report: ReportData): Promise<Buffer> {
    const doc = new PDFDocument({ size: 'A4', margin: MARGIN });

    return new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      this.render(doc, report);

      doc.end();
    });
  }

  private render(doc: PDFKit.PDFDocument, report: ReportData): void {
    doc
      .fontSize(20)
      .fillColor('#0d47a1')
      .text('Smart Budget Tracker — Report', { continued: false })
      .moveDown(0.2)
      .fontSize(10)
      .fillColor('#333333')
      .text(
        `Period: ${report.range.start.slice(0, 10)} to ${report.range.end.slice(0, 10)} (${report.range.months} month${report.range.months > 1 ? 's' : ''})`,
      )
      .moveDown(1);

    this.table(
      doc,
      'Monthly Trends (Income vs Expense)',
      ['Month', 'Income', 'Expense', 'Net', 'Savings %'],
      report.monthlyTrends.map((t) => [
        t.month,
        MONEY.format(t.income),
        MONEY.format(t.expense),
        MONEY.format(t.net),
        `${t.savingsRate}%`,
      ]),
      [0.16, 0.24, 0.24, 0.22, 0.14],
    );

    this.table(
      doc,
      'Budget Performance',
      ['Category', 'Cycle', 'Budget', 'Spent', 'Used %', 'Status'],
      report.budgetPerformance.map((b) => [
        b.categoryName,
        b.payCycle.toLowerCase(),
        MONEY.format(b.budgetAmount),
        MONEY.format(b.actualSpend),
        `${b.percentUsed}%`,
        b.percentUsed > 100
          ? 'Over'
          : b.percentUsed >= 80
            ? 'Near limit'
            : 'On track',
      ]),
      [0.28, 0.12, 0.2, 0.18, 0.1, 0.12],
    );

    this.table(
      doc,
      `Category Breakdown (total ${MONEY.format(report.categoryBreakdown.totalExpense)})`,
      ['Category', 'Group', 'Amount', '% of spend', 'Transactions'],
      report.categoryBreakdown.categories.map((c) => [
        c.categoryName,
        c.categoryGroup.toLowerCase(),
        MONEY.format(c.totalAmount),
        `${c.percentage}%`,
        String(c.transactionCount),
      ]),
      [0.3, 0.15, 0.25, 0.15, 0.15],
    );

    this.table(
      doc,
      'Monthly Net Savings',
      ['Month', 'Net savings'],
      report.monthlyNetSavings.map((m) => [m.month, MONEY.format(m.net)]),
      [0.4, 0.6],
    );
  }

  private table(
    doc: PDFKit.PDFDocument,
    title: string,
    headers: string[],
    rows: string[][],
    columnRatios: number[],
  ): void {
    const widths = columnRatios.map((r) => r * CONTENT_WIDTH);
    const cellSize = 8.5;

    doc
      .moveDown(0.5)
      .fontSize(13)
      .fillColor('#0d47a1')
      .text(title)
      .moveDown(0.3);

    if (rows.length === 0) {
      doc
        .fontSize(cellSize)
        .fillColor('#555555')
        .text('No data for this period')
        .moveDown(0.5);
      return;
    }

    this.drawRow(doc, headers, widths, cellSize + 0.5, true);

    for (const rowCells of rows) {
      this.drawRow(doc, rowCells, widths, cellSize, false);
    }

    doc.moveDown(0.7);
  }

  private drawRow(
    doc: PDFKit.PDFDocument,
    cells: string[],
    widths: number[],
    fontSize: number,
    isHeader: boolean,
  ): void {
    const y = doc.y;
    const rowHeight = fontSize + 6;
    let x = MARGIN;

    if (y + rowHeight > doc.page.height - MARGIN) {
      doc.addPage();
    }

    doc.fontSize(fontSize).fillColor(isHeader ? '#0d47a1' : '#222222');
    if (isHeader) {
      doc.font('Helvetica-Bold');
    } else {
      doc.font('Helvetica');
    }

    cells.forEach((cell, i) => {
      doc.text(this.truncate(cell, widths[i]), x, y, {
        width: widths[i] - 6,
        lineBreak: false,
        ellipsis: true,
      });
      x += widths[i];
    });

    doc.x = MARGIN;
    doc.y = y + rowHeight;
  }

  private truncate(value: string, maxWidth: number): string {
    const maxChars = Math.max(4, Math.floor(maxWidth / 4.6));
    return value.length > maxChars ? `${value.slice(0, maxChars - 1)}…` : value;
  }
}
