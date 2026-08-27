import { Test, TestingModule } from '@nestjs/testing';
import { BudgetsService } from './budgets.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

interface GroupByArgs {
  where?: { date?: { gte: Date; lte: Date }; categoryId?: unknown };
}

describe('BudgetsService - findAll', () => {
  let service: BudgetsService;
  let prisma: {
    budget: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
    transaction: { groupBy: jest.Mock };
  };

  const userId = 'user-1';

  const groupByArgs = (callIndex: number): GroupByArgs =>
    (prisma.transaction.groupBy.mock.calls as unknown as GroupByArgs[][])[
      callIndex
    ][0];

  beforeAll(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-08-15T10:00:00'));
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  beforeEach(async () => {
    prisma = {
      budget: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      transaction: { groupBy: jest.fn().mockResolvedValue([]) },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BudgetsService,
        { provide: PrismaService, useValue: prisma },
        { provide: RedisService, useValue: { invalidateUser: jest.fn() } },
      ],
    }).compile();

    service = module.get<BudgetsService>(BudgetsService);
  });

  it('returns zeroed summary when there are no budgets', async () => {
    prisma.budget.findMany.mockResolvedValue([]);

    const result = await service.findAll(userId);

    expect(result).toEqual({
      summary: { totalBudget: 0, totalSpent: 0, remaining: 0 },
      budgets: [],
    });
  });

  it('marks 8000 of 12000 as ON_TRACK and 11000 of 12000 as NEAR_LIMIT', async () => {
    prisma.budget.findMany.mockResolvedValue([
      {
        id: 'b1',
        categoryId: 'cat-food',
        payCycle: 'MONTHLY',
        amount: 12000,
        category: { name: 'Food', group: 'FLEXIBLE' },
      },
      {
        id: 'b2',
        categoryId: 'cat-rent',
        payCycle: 'MONTHLY',
        amount: 12000,
        category: { name: 'Rent', group: 'FIXED' },
      },
    ]);
    prisma.transaction.groupBy.mockResolvedValue([
      { categoryId: 'cat-food', _sum: { amount: 8000 } },
      { categoryId: 'cat-rent', _sum: { amount: 11000 } },
    ]);

    const result = await service.findAll(userId);

    expect(result.summary).toEqual({
      totalBudget: 24000,
      totalSpent: 19000,
      remaining: 5000,
    });

    const food = result.budgets.find((b) => b.id === 'b1');
    expect(food).toBeDefined();
    expect(food!.status).toBe('ON_TRACK');
    expect(food!.percentUsed).toBe(66.67);
    expect(food!.amountLeft).toBe(4000);

    const rent = result.budgets.find((b) => b.id === 'b2');
    expect(rent).toBeDefined();
    expect(rent!.status).toBe('NEAR_LIMIT');
    expect(rent!.percentUsed).toBe(91.67);
  });

  it('flags overspent budgets and scopes spend to the pay cycle window', async () => {
    prisma.budget.findMany.mockResolvedValue([
      {
        id: 'b1',
        categoryId: 'cat-food',
        payCycle: 'MONTHLY',
        amount: 12000,
        category: { name: 'Food', group: 'FLEXIBLE' },
      },
      {
        id: 'b2',
        categoryId: 'cat-tx',
        payCycle: 'WEEKLY',
        amount: 10000,
        category: { name: 'Transport', group: 'FLEXIBLE' },
      },
    ]);
    prisma.transaction.groupBy
      .mockResolvedValueOnce([
        { categoryId: 'cat-food', _sum: { amount: 13000 } },
      ])
      .mockResolvedValueOnce([]);

    const result = await service.findAll(userId);

    const food = result.budgets.find((b) => b.id === 'b1');
    expect(food).toBeDefined();
    expect(food!.status).toBe('OVER_BUDGET');
    expect(food!.amountLeft).toBe(-1000);
    expect(food!.periodStart).toBe(new Date(2026, 7, 1, 0, 0, 0).toISOString());

    const transport = result.budgets.find((b) => b.id === 'b2');
    expect(transport).toBeDefined();
    expect(transport!.actualSpend).toBe(0);
    expect(transport!.status).toBe('ON_TRACK');
    expect(transport!.periodStart).toBe(
      new Date(2026, 7, 8, 10, 0, 0).toISOString(),
    );

    expect(groupByArgs(0).where?.date?.gte).toEqual(new Date(2026, 7, 1));
    expect(groupByArgs(1).where?.date?.gte).toEqual(
      new Date(2026, 7, 8, 10, 0, 0),
    );
  });
});
