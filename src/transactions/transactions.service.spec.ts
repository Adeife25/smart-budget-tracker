import { Test, TestingModule } from '@nestjs/testing';
import { TransactionsService } from './transactions.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { NotificationsService } from '../notifications/notifications.service';

interface FindManyArgs {
  where?: {
    userId?: string;
    status?: string;
    type?: string;
    paymentMethod?: unknown;
    date?: { gte: Date; lte: Date };
    OR?: Record<string, unknown>[];
  };
  skip?: number;
  take?: number;
}

interface CreateArgs {
  data: { date: Date; userId: string };
}

describe('TransactionsService', () => {
  let service: TransactionsService;
  let prisma: {
    transaction: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      count: jest.Mock;
    };
    category: { findFirst: jest.Mock };
  };
  let notifications: {
    evaluateBudgetAlerts: jest.Mock;
  };

  const userId = 'user-1';

  const findManyArgs = (callIndex: number): FindManyArgs =>
    (prisma.transaction.findMany.mock.calls as unknown as FindManyArgs[][])[
      callIndex
    ][0];

  const createArgs = (): CreateArgs =>
    (prisma.transaction.create.mock.calls as unknown as CreateArgs[][])[0][0];

  beforeEach(async () => {
    prisma = {
      transaction: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        count: jest.fn().mockResolvedValue(0),
      },
      category: {
        findFirst: jest.fn().mockResolvedValue({ id: 'cat-1' }),
      },
    };
    notifications = {
      evaluateBudgetAlerts: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TransactionsService,
        { provide: PrismaService, useValue: prisma },
        { provide: NotificationsService, useValue: notifications },
        { provide: RedisService, useValue: { invalidateUser: jest.fn() } },
      ],
    }).compile();

    service = module.get<TransactionsService>(TransactionsService);
  });

  describe('findAll', () => {
    it('paginates and returns meta', async () => {
      prisma.transaction.count.mockResolvedValue(45);

      const result = await service.findAll(userId, { page: 2, limit: 20 });

      expect(result.meta).toEqual({
        page: 2,
        limit: 20,
        total: 45,
        totalPages: 3,
      });
      expect(findManyArgs(0).skip).toBe(20);
      expect(findManyArgs(0).take).toBe(20);
    });

    it('builds a case-insensitive search across notes, category and account', async () => {
      await service.findAll(userId, { search: '  jollof  ' });

      const where = findManyArgs(0).where ?? {};
      const or = where.OR ?? [];

      expect(or).toHaveLength(4);
      expect(or[0]).toEqual({
        notes: { contains: 'jollof', mode: 'insensitive' },
      });
      expect(or[2]).toEqual({
        category: { name: { contains: 'jollof', mode: 'insensitive' } },
      });
      expect(where.userId).toBe(userId);
    });

    it('applies status, method and date filters together', async () => {
      await service.findAll(userId, {
        status: 'PENDING',
        paymentMethod: 'Card',
        startDate: '2026-08-01',
        endDate: '2026-08-21',
        type: 'EXPENSE',
      });

      const where = findManyArgs(0).where;

      expect(where?.status).toBe('PENDING');
      expect(where?.type).toBe('EXPENSE');
      expect(where?.paymentMethod).toEqual({
        contains: 'Card',
        mode: 'insensitive',
      });
      expect(where?.date).toEqual({
        gte: new Date('2026-08-01T00:00:00.000'),
        lte: new Date('2026-08-21T23:59:59.999'),
      });
      expect(prisma.transaction.count).toHaveBeenCalledTimes(1);
    });

    it('ignores blank search terms', async () => {
      await service.findAll(userId, { search: '   ' });

      expect(findManyArgs(0).where?.OR).toBeUndefined();
    });
  });

  describe('create', () => {
    it('normalizes a date-only string to a full Date', async () => {
      prisma.transaction.create.mockResolvedValue({ id: 't1' });

      await service.create(userId, {
        type: 'EXPENSE',
        date: '2026-08-05',
        categoryId: 'cat-1',
        accountId: 'acc-1',
        amount: 500,
      } as never);

      const args = createArgs();
      expect(args.data.date).toEqual(new Date('2026-08-05T00:00:00.000Z'));
      expect(args.data.userId).toBe(userId);
    });
  });
});
