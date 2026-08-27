import { BadRequestException, Injectable } from '@nestjs/common';
import { PayCycle, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { getPayCyclePeriod, PayCyclePeriod } from '../common/pay-cycle.util';

interface ResolvedRange {
  start: Date;
  end: Date;
}

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getSummary(userId: string, startDate?: string, endDate?: string) {
    const range = this.resolveRange(startDate, endDate);

    const [income, expense, budgetCount, user] = await Promise.all([
      this.prisma.transaction.aggregate({
        where: {
          userId,
          type: 'INCOME',
          date: { gte: range.start, lte: range.end },
          deletedAt: null,
        },
        _sum: { amount: true },
      }),
      this.prisma.transaction.aggregate({
        where: {
          userId,
          type: 'EXPENSE',
          date: { gte: range.start, lte: range.end },
          deletedAt: null,
        },
        _sum: { amount: true },
      }),
      this.prisma.budget.count({ where: { userId } }),
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { currencyPreference: true },
      }),
    ]);

    const totalIncome = Number(income._sum.amount ?? 0);
    const totalExpense = Number(expense._sum.amount ?? 0);
    const netSavings = totalIncome - totalExpense;
    const savingsRate = totalIncome > 0 ? (netSavings / totalIncome) * 100 : 0;

    const safeToSpend = await this.computeSafeToSpend(
      userId,
      totalIncome,
      totalExpense,
    );

    return {
      currency: user?.currencyPreference ?? 'NGN',
      totalIncome,
      totalExpense,
      netSavings,
      savingsRate: this.round(savingsRate),
      budgetCount,
      safeToSpend,
    };
  }

  async getSpendByCategory(
    userId: string,
    startDate?: string,
    endDate?: string,
  ) {
    const range = this.resolveRange(startDate, endDate);

    const results = await this.prisma.transaction.groupBy({
      by: ['categoryId'],
      where: {
        userId,
        type: 'EXPENSE',
        date: { gte: range.start, lte: range.end },
        deletedAt: null,
      },
      _sum: { amount: true },
      _count: true,
    });

    const categoryIds = results.map((r) => r.categoryId);
    const categories = await this.prisma.category.findMany({
      where: { id: { in: categoryIds } },
    });

    const totalExpense = results.reduce(
      (sum, r) => sum + Number(r._sum.amount ?? 0),
      0,
    );

    const breakdown = results
      .map((r) => {
        const category = categories.find((c) => c.id === r.categoryId);
        const totalAmount = Number(r._sum.amount ?? 0);
        return {
          categoryId: r.categoryId,
          categoryName: category?.name ?? 'Unknown',
          categoryGroup: category?.group ?? 'FLEXIBLE',
          totalAmount,
          percentage:
            totalExpense > 0
              ? this.round((totalAmount / totalExpense) * 100)
              : 0,
          transactionCount: r._count,
        };
      })
      .sort((a, b) => b.totalAmount - a.totalAmount);

    return { totalExpense, categories: breakdown };
  }

  async getBudgetVsActual(userId: string) {
    const budgets = await this.prisma.budget.findMany({
      where: { userId },
      include: { category: true },
    });

    if (budgets.length === 0) return [];

    const spendByCycle = await this.getSpendByCycleAndCategory(userId, budgets);

    return budgets.map((budget) => {
      const period = this.getPayCyclePeriod(budget.payCycle);
      const budgetAmount = Number(budget.amount);
      const actualSpend =
        spendByCycle.get(budget.payCycle)?.get(budget.categoryId) ?? 0;
      const variance = budgetAmount - actualSpend;
      const percentUsed =
        budgetAmount > 0 ? (actualSpend / budgetAmount) * 100 : 0;

      return {
        id: budget.id,
        categoryId: budget.categoryId,
        categoryName: budget.category.name,
        categoryGroup: budget.category.group,
        budgetAmount,
        actualSpend,
        variance,
        percentUsed: this.round(percentUsed),
        payCycle: budget.payCycle,
        periodStart: period.start.toISOString(),
        periodEnd: period.end.toISOString(),
      };
    });
  }

  async getTrend(userId: string, months = 6) {
    const now = new Date();
    const firstMonthStart = new Date(
      now.getFullYear(),
      now.getMonth() - (months - 1),
      1,
    );

    const transactions = await this.prisma.transaction.findMany({
      where: {
        userId,
        date: { gte: firstMonthStart, lte: now },
        deletedAt: null,
      },
      select: { type: true, amount: true, date: true },
    });

    const buckets = new Map<string, { income: number; expense: number }>();
    for (let i = 0; i < months; i++) {
      buckets.set(this.monthKey(firstMonthStart, i), { income: 0, expense: 0 });
    }

    for (const tx of transactions) {
      const key = `${tx.date.getFullYear()}-${String(
        tx.date.getMonth() + 1,
      ).padStart(2, '0')}`;
      const bucket = buckets.get(key);
      if (!bucket) continue;
      if (tx.type === 'INCOME') bucket.income += Number(tx.amount);
      else bucket.expense += Number(tx.amount);
    }

    return Array.from(buckets.entries()).map(([month, b]) => {
      const net = b.income - b.expense;
      return {
        month,
        income: this.round(b.income),
        expense: this.round(b.expense),
        net: this.round(net),
        savingsRate: b.income > 0 ? this.round((net / b.income) * 100) : 0,
      };
    });
  }

  async getRecentTransactions(userId: string, limit = 5) {
    const transactions = await this.prisma.transaction.findMany({
      where: { userId, deletedAt: null },
      include: { category: true, account: true },
      orderBy: { date: 'desc' },
      take: limit,
    });

    return transactions.map((tx) => ({ ...tx, amount: Number(tx.amount) }));
  }

  async getAlerts(userId: string) {
    const [budgetPerformance, monthSummary, fund] = await Promise.all([
      this.getBudgetVsActual(userId),
      this.getMonthTotals(userId),
      this.prisma.emergencyFund.findUnique({ where: { userId } }),
    ]);

    const alerts: {
      type: 'alert' | 'tip';
      severity: 'info' | 'warning' | 'critical';
      title: string;
      message: string;
    }[] = [];

    for (const b of budgetPerformance) {
      if (b.percentUsed > 100) {
        alerts.push({
          type: 'alert',
          severity: 'critical',
          title: `Over budget: ${b.categoryName}`,
          message: `You have spent ${Math.abs(
            b.variance,
          ).toLocaleString()} over your ${b.payCycle.toLowerCase()} budget.`,
        });
      } else if (b.percentUsed >= 80) {
        alerts.push({
          type: 'alert',
          severity: 'warning',
          title: `Close to limit: ${b.categoryName}`,
          message: `You have used ${b.percentUsed}% of your ${b.payCycle.toLowerCase()} budget.`,
        });
      }
    }

    if (monthSummary.net < 0) {
      alerts.push({
        type: 'alert',
        severity: 'warning',
        title: 'Negative cash flow this month',
        message: 'Your expenses exceed your income so far this month.',
      });
    } else if (monthSummary.income > 0 && monthSummary.savingsRate < 20) {
      alerts.push({
        type: 'tip',
        severity: 'info',
        title: 'Low savings rate',
        message: `You are saving ${monthSummary.savingsRate}% of your income this month. Aim for at least 20%.`,
      });
    }

    if (!fund || Number(fund.targetAmount) <= 0) {
      alerts.push({
        type: 'tip',
        severity: 'info',
        title: 'Set up your emergency fund',
        message:
          'Aim to save 3-6 months of expenses. Set a target to track your progress.',
      });
    } else if (Number(fund.currentAmount) < Number(fund.targetAmount) * 0.5) {
      alerts.push({
        type: 'tip',
        severity: 'info',
        title: 'Emergency fund below halfway',
        message: `You have reached ${this.round(
          (Number(fund.currentAmount) / Number(fund.targetAmount)) * 100,
        )}% of your target. Keep going!`,
      });
    }

    if (monthSummary.transactionCount === 0) {
      alerts.push({
        type: 'tip',
        severity: 'info',
        title: 'No transactions logged this month',
        message: 'Log your income and expenses to see insights here.',
      });
    }

    return alerts;
  }

  async exportTransactionsCsv(
    userId: string,
    startDate?: string,
    endDate?: string,
  ): Promise<string> {
    const range = this.resolveRange(startDate, endDate);

    const transactions = await this.prisma.transaction.findMany({
      where: {
        userId,
        date: { gte: range.start, lte: range.end },
        deletedAt: null,
      },
      include: { category: true, account: true },
      orderBy: { date: 'asc' },
    });

    const header = [
      'Date',
      'Type',
      'Category',
      'Subcategory',
      'Account',
      'Amount',
      'Payment Method',
      'Notes',
    ];

    const rows = transactions.map((tx) =>
      [
        tx.date.toISOString(),
        tx.type,
        tx.category.name,
        tx.subcategory,
        tx.account.name,
        tx.amount,
        tx.paymentMethod,
        tx.notes,
      ]
        .map((field) => this.escapeCsv(field))
        .join(','),
    );

    return [header.join(','), ...rows].join('\r\n');
  }

  private async computeSafeToSpend(
    userId: string,
    totalIncome: number,
    totalExpense: number,
  ): Promise<number> {
    const budgets = await this.prisma.budget.findMany({ where: { userId } });
    if (budgets.length === 0) {
      return this.round(totalIncome - totalExpense);
    }

    const spendByCycle = await this.getSpendByCycleAndCategory(userId, budgets);

    const remainingAllocations = budgets.reduce((sum, budget) => {
      const spent =
        spendByCycle.get(budget.payCycle)?.get(budget.categoryId) ?? 0;
      return sum + Math.max(0, Number(budget.amount) - spent);
    }, 0);

    return this.round(totalIncome - totalExpense - remainingAllocations);
  }

  private async getSpendByCycleAndCategory(
    userId: string,
    budgets: { payCycle: PayCycle; categoryId: string }[],
  ): Promise<Map<PayCycle, Map<string, number>>> {
    const cycles = [...new Set(budgets.map((b) => b.payCycle))];
    const entries = await Promise.all(
      cycles.map(async (cycle) => {
        const period = this.getPayCyclePeriod(cycle);
        const grouped = await this.prisma.transaction.groupBy({
          by: ['categoryId'],
          where: {
            userId,
            type: 'EXPENSE',
            date: { gte: period.start, lte: period.end },
            deletedAt: null,
            categoryId: { in: budgets.map((b) => b.categoryId) },
          },
          _sum: { amount: true },
        });
        return [
          cycle,
          new Map(
            grouped.map((g) => [g.categoryId, Number(g._sum.amount ?? 0)]),
          ),
        ] as const;
      }),
    );
    return new Map(entries);
  }

  private async getMonthTotals(userId: string) {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [income, expense, count] = await Promise.all([
      this.prisma.transaction.aggregate({
        where: {
          userId,
          type: 'INCOME',
          date: { gte: monthStart },
          deletedAt: null,
        },
        _sum: { amount: true },
      }),
      this.prisma.transaction.aggregate({
        where: {
          userId,
          type: 'EXPENSE',
          date: { gte: monthStart },
          deletedAt: null,
        },
        _sum: { amount: true },
      }),
      this.prisma.transaction.count({
        where: { userId, date: { gte: monthStart }, deletedAt: null },
      }),
    ]);

    const totalIncome = Number(income._sum.amount ?? 0);
    const totalExpense = Number(expense._sum.amount ?? 0);
    const net = totalIncome - totalExpense;

    return {
      income: totalIncome,
      expense: totalExpense,
      net,
      savingsRate: totalIncome > 0 ? this.round((net / totalIncome) * 100) : 0,
      transactionCount: count,
    };
  }

  private resolveRange(startDate?: string, endDate?: string): ResolvedRange {
    let end = new Date();
    if (endDate) {
      end = new Date(
        endDate.length === 10 ? `${endDate}T23:59:59.999` : endDate,
      );
    }

    let start = new Date(end.getFullYear(), end.getMonth(), 1);
    if (startDate) {
      start = new Date(
        startDate.length === 10 ? `${startDate}T00:00:00.000` : startDate,
      );
    }

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      throw new BadRequestException('Invalid date range provided');
    }
    if (start > end) {
      throw new BadRequestException(
        'startDate must be before or equal to endDate',
      );
    }

    return { start, end };
  }

  private getPayCyclePeriod(payCycle: PayCycle): PayCyclePeriod {
    return getPayCyclePeriod(payCycle);
  }

  private monthKey(base: Date, offsetMonths: number): string {
    const d = new Date(base.getFullYear(), base.getMonth() + offsetMonths, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }

  private round(value: number): number {
    return Math.round(value * 100) / 100;
  }

  private escapeCsv(
    value: string | number | Prisma.Decimal | null | undefined,
  ): string {
    let s: string;
    if (value == null) {
      s = '';
    } else if (typeof value === 'object' && 'toFixed' in value) {
      s = value.toFixed(2);
    } else {
      s = String(value);
    }
    if (/[",\n\r]/.test(s)) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  }
}
