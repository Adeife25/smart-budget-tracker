import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { NotificationsService } from '../notifications/notifications.service';
import { assertCategoryVisible } from '../common/category-visibility';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { UpdateTransactionDto } from './dto/update-transaction.dto';
import { ListTransactionsQueryDto } from './dto/list-transactions-query.dto';

@Injectable()
export class TransactionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
    private readonly redisService: RedisService,
  ) {}

  async findAll(userId: string, query: ListTransactionsQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    let dateFilter: Prisma.DateTimeFilter | undefined;
    if (query.startDate || query.endDate) {
      dateFilter = {};
      if (query.startDate) {
        dateFilter.gte = new Date(
          query.startDate.length === 10
            ? `${query.startDate}T00:00:00.000`
            : query.startDate,
        );
      }
      if (query.endDate) {
        dateFilter.lte = new Date(
          query.endDate.length === 10
            ? `${query.endDate}T23:59:59.999`
            : query.endDate,
        );
      }
    }

    let searchFilter: Prisma.TransactionWhereInput | undefined;
    if (query.search && query.search.trim()) {
      const term = query.search.trim();
      searchFilter = {
        OR: [
          { notes: { contains: term, mode: 'insensitive' } },
          { subcategory: { contains: term, mode: 'insensitive' } },
          { category: { name: { contains: term, mode: 'insensitive' } } },
          { account: { name: { contains: term, mode: 'insensitive' } } },
        ],
      };
    }

    const where: Prisma.TransactionWhereInput = {
      userId,
      deletedAt: null,
      ...(query.type && { type: query.type }),
      ...(query.categoryId && { categoryId: query.categoryId }),
      ...(query.accountId && { accountId: query.accountId }),
      ...(query.status && { status: query.status }),
      ...(query.paymentMethod && {
        paymentMethod: { contains: query.paymentMethod, mode: 'insensitive' },
      }),
      ...(dateFilter && { date: dateFilter }),
      ...(searchFilter && searchFilter),
    };

    const [data, total] = await Promise.all([
      this.prisma.transaction.findMany({
        where,
        include: { category: true, account: true },
        orderBy: { date: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.transaction.count({ where }),
    ]);

    return {
      data: data.map((tx) => this.serialize(tx)),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  async findOne(id: string, userId: string) {
    const transaction = await this.prisma.transaction.findFirst({
      where: { id, userId, deletedAt: null },
      include: { category: true, account: true },
    });

    if (!transaction) {
      throw new NotFoundException(`Transaction with id ${id} not found`);
    }

    return this.serialize(transaction);
  }

  async create(userId: string, dto: CreateTransactionDto) {
    await assertCategoryVisible(this.prisma, userId, dto.categoryId);

    const transaction = await this.prisma.transaction.create({
      data: {
        ...dto,
        ...(dto.date && { date: new Date(dto.date) }),
        userId,
      },
      include: { category: true, account: true },
    });

    if (dto.type === 'EXPENSE') {
      void this.notificationsService.evaluateBudgetAlerts(
        userId,
        dto.categoryId,
      );
    }

    void this.redisService.invalidateUser(userId);

    return this.serialize(transaction);
  }

  async update(id: string, userId: string, dto: UpdateTransactionDto) {
    const existing = await this.findOne(id, userId);

    if (existing.userId !== userId) {
      throw new ForbiddenException('You can only edit your own transactions');
    }

    if (dto.categoryId) {
      await assertCategoryVisible(this.prisma, userId, dto.categoryId);
    }

    const updated = await this.prisma.transaction.update({
      where: { id },
      data: {
        ...dto,
        ...(dto.date && { date: new Date(dto.date) }),
      },
      include: { category: true, account: true },
    });

    const type = dto.type ?? existing.type;
    const categoryId = dto.categoryId ?? existing.categoryId;
    if (type === 'EXPENSE') {
      void this.notificationsService.evaluateBudgetAlerts(userId, categoryId);
    }

    void this.redisService.invalidateUser(userId);

    return this.serialize(updated);
  }

  async remove(id: string, userId: string) {
    const existing = await this.findOne(id, userId);

    if (existing.userId !== userId) {
      throw new ForbiddenException('You can only delete your own transactions');
    }

    const removed = await this.prisma.transaction.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    void this.redisService.invalidateUser(userId);

    return this.serialize(removed);
  }

  private serialize<T extends { amount: unknown }>(
    transaction: T,
  ): Omit<T, 'amount'> & { amount: number } {
    return { ...transaction, amount: Number(transaction.amount) };
  }
}
