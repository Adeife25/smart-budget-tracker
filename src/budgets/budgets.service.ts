import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { CreateBudgetDto } from './dto/create-budget.dto';
import { UpdateBudgetDto } from './dto/update-budget.dto';
import { getPayCyclePeriod } from '../common/pay-cycle.util';
import { assertCategoryVisible } from '../common/category-visibility';

export type BudgetStatus = 'ON_TRACK' | 'NEAR_LIMIT' | 'OVER_BUDGET';

@Injectable()
export class BudgetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redisService: RedisService,
  ) {}

  async findAll(userId: string) {
    const budgets = await this.prisma.budget.findMany({
      where: { userId },
      include: { category: true },
      orderBy: { id: 'desc' },
    });

    if (budgets.length === 0) {
      return {
        summary: { totalBudget: 0, totalSpent: 0, remaining: 0 },
        budgets: [],
      };
    }

    const categoryIds = budgets.map((b) => b.categoryId);
    const cycles = [...new Set(budgets.map((b) => b.payCycle))];
    const spendEntries = await Promise.all(
      cycles.map(async (cycle) => {
        const period = getPayCyclePeriod(cycle);
        const grouped = await this.prisma.transaction.groupBy({
          by: ['categoryId'],
          where: {
            userId,
            type: 'EXPENSE',
            date: { gte: period.start, lte: period.end },
            deletedAt: null,
            categoryId: { in: categoryIds },
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
    const spendByCycle = new Map(spendEntries);

    const enriched = budgets.map((budget) => {
      const period = getPayCyclePeriod(budget.payCycle);
      const budgetAmount = Number(budget.amount);
      const actualSpend =
        spendByCycle.get(budget.payCycle)?.get(budget.categoryId) ?? 0;
      const percentUsed =
        budgetAmount > 0 ? (actualSpend / budgetAmount) * 100 : 0;

      return {
        id: budget.id,
        categoryId: budget.categoryId,
        categoryName: budget.category.name,
        categoryGroup: budget.category.group,
        payCycle: budget.payCycle,
        budgetAmount,
        actualSpend,
        amountLeft: budgetAmount - actualSpend,
        percentUsed: Math.round(percentUsed * 100) / 100,
        status: this.resolveStatus(percentUsed),
        periodStart: period.start.toISOString(),
        periodEnd: period.end.toISOString(),
      };
    });

    const totalBudget = enriched.reduce((s, b) => s + b.budgetAmount, 0);
    const totalSpent = enriched.reduce((s, b) => s + b.actualSpend, 0);

    return {
      summary: {
        totalBudget,
        totalSpent,
        remaining: totalBudget - totalSpent,
      },
      budgets: enriched,
    };
  }

  private resolveStatus(percentUsed: number): BudgetStatus {
    if (percentUsed >= 100) return 'OVER_BUDGET';
    if (percentUsed >= 80) return 'NEAR_LIMIT';
    return 'ON_TRACK';
  }

  async findOne(id: string, userId: string) {
    const budget = await this.prisma.budget.findFirst({
      where: { id, userId },
      include: { category: true },
    });

    if (!budget) {
      throw new NotFoundException(`Budget with id ${id} not found`);
    }

    return this.serialize(budget);
  }

  async create(userId: string, dto: CreateBudgetDto) {
    await assertCategoryVisible(this.prisma, userId, dto.categoryId);

    try {
      const budget = await this.prisma.budget.create({
        data: { ...dto, userId },
        include: { category: true },
      });
      void this.redisService.invalidateUser(userId);
      return this.serialize(budget);
    } catch (error) {
      if (
        error instanceof Error &&
        'code' in error &&
        (error as { code: string }).code === 'P2002'
      ) {
        throw new ConflictException('Budget for this category already exists');
      }
      throw error;
    }
  }

  async update(id: string, userId: string, dto: UpdateBudgetDto) {
    const existing = await this.findOne(id, userId);

    const hasUpdates =
      dto.categoryId !== undefined ||
      dto.payCycle !== undefined ||
      dto.amount !== undefined;

    if (!hasUpdates) {
      return existing;
    }

    if (dto.categoryId) {
      await assertCategoryVisible(this.prisma, userId, dto.categoryId);
    }

    const budget = await this.prisma.budget.update({
      where: { id },
      data: dto,
      include: { category: true },
    });
    void this.redisService.invalidateUser(userId);
    return this.serialize(budget);
  }

  async remove(id: string, userId: string) {
    await this.findOne(id, userId);
    const deleted = await this.prisma.budget.delete({ where: { id } });
    void this.redisService.invalidateUser(userId);
    return deleted;
  }

  private serialize<T extends { amount: unknown }>(
    budget: T,
  ): Omit<T, 'amount'> & { amount: number } {
    return { ...budget, amount: Number(budget.amount) };
  }
}
