import { Injectable } from '@nestjs/common';
import {
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';

import { ReportData } from '../reports.service';

const MONEY = new Intl.NumberFormat('en-NG', {
  style: 'currency',
  currency: 'NGN',
  maximumFractionDigits: 2,
});

@Injectable()
export class ReportDocxService {
  async generate(report: ReportData): Promise<Buffer> {
    const children: (Paragraph | Table)[] = [
      new Paragraph({
        text: 'Smart Budget Tracker — Report',
        heading: HeadingLevel.HEADING_1,
      }),
      new Paragraph({
        children: [
          new TextRun({
            text: `Period: ${report.range.start.slice(0, 10)} to ${report.range.end.slice(0, 10)} (${report.range.months} month${report.range.months > 1 ? 's' : ''})`,
            italics: true,
          }),
        ],
        spacing: { after: 300 },
      }),

      this.section('Monthly Trends (Income vs Expense)'),
      this.table(
        ['Month', 'Income', 'Expense', 'Net', 'Savings %'],
        report.monthlyTrends.map((t) => [
          t.month,
          MONEY.format(t.income),
          MONEY.format(t.expense),
          MONEY.format(t.net),
          `${t.savingsRate}%`,
        ]),
      ),

      this.section('Budget Performance'),
      this.table(
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
      ),

      this.section(
        `Category Breakdown (total ${MONEY.format(report.categoryBreakdown.totalExpense)})`,
      ),
      this.table(
        ['Category', 'Group', 'Amount', '% of spend', 'Transactions'],
        report.categoryBreakdown.categories.map((c) => [
          c.categoryName,
          c.categoryGroup.toLowerCase(),
          MONEY.format(c.totalAmount),
          `${c.percentage}%`,
          String(c.transactionCount),
        ]),
      ),

      this.section('Monthly Net Savings'),
      this.table(
        ['Month', 'Net savings'],
        report.monthlyNetSavings.map((m) => [m.month, MONEY.format(m.net)]),
      ),
    ];

    const doc = new Document({
      sections: [{ children }],
    });

    return Packer.toBuffer(doc);
  }

  private section(title: string): Paragraph {
    return new Paragraph({
      text: title,
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 240, after: 120 },
    });
  }

  private table(headers: string[], rows: string[][]): Table {
    const headerRow = new TableRow({
      tableHeader: true,
      children: headers.map(
        (header) =>
          new TableCell({
            children: [
              new Paragraph({
                children: [new TextRun({ text: header, bold: true })],
              }),
            ],
          }),
      ),
    });

    const bodyRows =
      rows.length === 0
        ? [
            new TableRow({
              children: [
                new TableCell({
                  children: [new Paragraph('No data for this period')],
                }),
              ],
            }),
          ]
        : rows.map(
            (cells) =>
              new TableRow({
                children: cells.map(
                  (cell) =>
                    new TableCell({
                      children: [new Paragraph(cell)],
                    }),
                ),
              }),
          );

    return new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [headerRow, ...bodyRows],
    });
  }
}
