import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { NotificationType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { getPayCyclePeriod } from '../common/pay-cycle.util';

export interface NotifyInput {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async findAll(userId: string, page = 1, limit = 20, unreadOnly = false) {
    const where = {
      userId,
      ...(unreadOnly && { readAt: null }),
    };

    const [data, total, unreadCount] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.notification.count({ where }),
      this.prisma.notification.count({
        where: { userId, readAt: null },
      }),
    ]);

    return {
      data,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
        unreadCount,
      },
    };
  }

  async getUnreadCount(userId: string): Promise<{ unreadCount: number }> {
    const unreadCount = await this.prisma.notification.count({
      where: { userId, readAt: null },
    });
    return { unreadCount };
  }

  async markRead(userId: string, id: string) {
    await this.findOwned(userId, id);

    const notification = await this.prisma.notification.update({
      where: { id },
      data: { readAt: new Date() },
    });

    return notification;
  }

  async markAllRead(userId: string) {
    const result = await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });

    return { success: true, updatedCount: result.count };
  }

  async remove(userId: string, id: string) {
    await this.findOwned(userId, id);
    await this.prisma.notification.delete({ where: { id } });
    return { success: true };
  }

  /**
   * Create a notification for a user. Skipped silently when an unread
   * notification with the same type + title already exists so recurring
   * events don't spam the list.
   */
  async notify(input: NotifyInput): Promise<void> {
    try {
      const existing = await this.prisma.notification.findFirst({
        where: {
          userId: input.userId,
          type: input.type,
          title: input.title,
          readAt: null,
        },
        select: { id: true },
      });

      if (existing) return;

      await this.prisma.notification.create({
        data: {
          userId: input.userId,
          type: input.type,
          title: input.title,
          message: input.message,
        },
      });
    } catch (error) {
      this.logger.warn(
        `Failed to create notification: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * After an expense is recorded for a category with a budget, raise
   * near-limit (>=80%) and over-budget (>100%) alerts for the current pay
   * cycle.
   */
  async evaluateBudgetAlerts(
    userId: string,
    categoryId: string,
  ): Promise<void> {
    try {
      const user = await this.prisma.user.findUniqueOrThrow({
        where: { id: userId },
        select: { budgetAlerts: true },
      });
      if (!user.budgetAlerts) return;

      const budget = await this.prisma.budget.findFirst({
        where: { userId, categoryId },
        include: { category: { select: { name: true } } },
      });
      if (!budget || Number(budget.amount) <= 0) return;

      const period = getPayCyclePeriod(budget.payCycle);
      const aggregate = await this.prisma.transaction.aggregate({
        where: {
          userId,
          categoryId,
          type: 'EXPENSE',
          date: { gte: period.start, lte: period.end },
          deletedAt: null,
        },
        _sum: { amount: true },
      });

      const budgetAmount = Number(budget.amount);
      const spent = Number(aggregate._sum.amount ?? 0);
      const percentUsed = (spent / budgetAmount) * 100;

      if (percentUsed > 100) {
        await this.notify({
          userId,
          type: 'BUDGET',
          title: `Over budget: ${budget.category.name}`,
          message: `You have spent ${this.round(spent)} of your ${this.round(budgetAmount)} ${budget.payCycle.toLowerCase()} budget.`,
        });
      } else if (percentUsed >= 80) {
        await this.notify({
          userId,
          type: 'BUDGET',
          title: `Close to limit: ${budget.category.name}`,
          message: `You have used ${this.round(percentUsed)}% of your ${budget.payCycle.toLowerCase()} budget.`,
        });
      }
    } catch (error) {
      this.logger.warn(
        `Failed to evaluate budget alerts: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async findOwned(userId: string, id: string) {
    const notification = await this.prisma.notification.findFirst({
      where: { id, userId },
    });
    if (!notification) {
      throw new NotFoundException(`Notification with id ${id} not found`);
    }
    return notification;
  }

  private round(value: number): number {
    return Math.round(value * 100) / 100;
  }
}
