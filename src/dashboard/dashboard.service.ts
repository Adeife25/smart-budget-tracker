import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getSummary(userId: string, startDate: Date, endDate: Date) {
    const [income, expense, budgetCount] = await Promise.all([
      this.prisma.transaction.aggregate({
        where: {
          userId,
          type: 'INCOME',
          date: { gte: startDate, lte: endDate },
          deletedAt: null,
        },
        _sum: { amount: true },
      }),
      this.prisma.transaction.aggregate({
        where: {
          userId,
          type: 'EXPENSE',
          date: { gte: startDate, lte: endDate },
          deletedAt: null,
        },
        _sum: { amount: true },
      }),
      this.prisma.budget.count({ where: { userId } }),
    ]);

    const totalIncome = income._sum.amount ?? 0;
    const totalExpense = expense._sum.amount ?? 0;
    const netSavings = totalIncome - totalExpense;
    const savingsRate = totalIncome > 0 ? (netSavings / totalIncome) * 100 : 0;

    return {
      totalIncome,
      totalExpense,
      netSavings,
      savingsRate: Math.round(savingsRate * 100) / 100,
      budgetCount,
    };
  }

  async getSpendByCategory(userId: string, startDate: Date, endDate: Date) {
    const results = await this.prisma.transaction.groupBy({
      by: ['categoryId'],
      where: {
        userId,
        type: 'EXPENSE',
        date: { gte: startDate, lte: endDate },
        deletedAt: null,
      },
      _sum: { amount: true },
      _count: true,
    });

    const categoryIds = results.map((r) => r.categoryId);
    const categories = await this.prisma.category.findMany({
      where: { id: { in: categoryIds } },
    });

    return results.map((r) => {
      const category = categories.find((c) => c.id === r.categoryId);
      return {
        categoryId: r.categoryId,
        categoryName: category?.name ?? 'Unknown',
        categoryGroup: category?.group ?? 'FLEXIBLE',
        totalAmount: r._sum.amount ?? 0,
        transactionCount: r._count,
      };
    });
  }

  async getBudgetVsActual(userId: string) {
    const budgets = await this.prisma.budget.findMany({
      where: { userId },
      include: { category: true },
    });

    const budgetsWithActual = await Promise.all(
      budgets.map(async (budget) => {
        const actual = await this.prisma.transaction.aggregate({
          where: {
            userId,
            categoryId: budget.categoryId,
            type: 'EXPENSE',
            deletedAt: null,
          },
          _sum: { amount: true },
        });

        const actualSpend = actual._sum.amount ?? 0;
        const variance = budget.amount - actualSpend;
        const percentUsed =
          budget.amount > 0 ? (actualSpend / budget.amount) * 100 : 0;

        return {
          id: budget.id,
          categoryName: budget.category.name,
          categoryGroup: budget.category.group,
          budgetAmount: budget.amount,
          actualSpend,
          variance,
          percentUsed: Math.round(percentUsed * 100) / 100,
          payCycle: budget.payCycle,
        };
      }),
    );

    return budgetsWithActual;
  }
}
