import { Injectable } from '@nestjs/common';
import { DashboardService } from '../dashboard/dashboard.service';

export interface ReportData {
  range: { months: number; start: string; end: string };
  monthlyTrends: {
    month: string;
    income: number;
    expense: number;
    net: number;
    savingsRate: number;
  }[];
  budgetPerformance: {
    categoryName: string;
    categoryGroup: string;
    payCycle: string;
    budgetAmount: number;
    actualSpend: number;
    variance: number;
    percentUsed: number;
  }[];
  categoryBreakdown: {
    totalExpense: number;
    categories: {
      categoryName: string;
      categoryGroup: string;
      totalAmount: number;
      percentage: number;
      transactionCount: number;
    }[];
  };
  monthlyNetSavings: { month: string; net: number }[];
}

@Injectable()
export class ReportsService {
  constructor(private readonly dashboardService: DashboardService) {}

  async getReport(userId: string, months = 6): Promise<ReportData> {
    const { start, end } = this.resolveRange(months);
    const startIso = this.toIsoDate(start);

    const [trend, budgetPerformance, categoryBreakdown] = await Promise.all([
      this.dashboardService.getTrend(userId, months),
      this.dashboardService.getBudgetVsActual(userId),
      this.dashboardService.getSpendByCategory(
        userId,
        startIso,
        end.toISOString(),
      ),
    ]);

    return {
      range: { months, start: startIso, end: end.toISOString() },
      monthlyTrends: trend,
      budgetPerformance: budgetPerformance.map((b) => ({
        categoryName: b.categoryName,
        categoryGroup: b.categoryGroup,
        payCycle: b.payCycle,
        budgetAmount: b.budgetAmount,
        actualSpend: b.actualSpend,
        variance: b.variance,
        percentUsed: b.percentUsed,
      })),
      categoryBreakdown,
      monthlyNetSavings: trend.map((t) => ({ month: t.month, net: t.net })),
    };
  }

  private resolveRange(months: number): { start: Date; end: Date } {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth() - (months - 1), 1);
    return { start, end: now };
  }

  private toIsoDate(date: Date): string {
    return date.toISOString();
  }
}
