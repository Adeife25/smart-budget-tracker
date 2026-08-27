import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { PrismaService } from '../prisma/prisma.service';

describe('DashboardService', () => {
  let service: DashboardService;
  let prisma: {
    transaction: {
      aggregate: jest.Mock;
      groupBy: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
    };
    budget: { count: jest.Mock; findMany: jest.Mock };
    user: { findUnique: jest.Mock };
    category: { findMany: jest.Mock };
    emergencyFund: { findUnique: jest.Mock };
  };

  const userId = 'user-1';

  beforeAll(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-08-15T10:00:00'));
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  beforeEach(async () => {
    prisma = {
      transaction: {
        aggregate: jest.fn(),
        groupBy: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
      },
      budget: { count: jest.fn(), findMany: jest.fn() },
      user: { findUnique: jest.fn() },
      category: { findMany: jest.fn() },
      emergencyFund: { findUnique: jest.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DashboardService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<DashboardService>(DashboardService);
  });

  describe('getSummary', () => {
    it('computes totals, savings rate and safe-to-spend without budgets', async () => {
      prisma.transaction.aggregate
        .mockResolvedValueOnce({ _sum: { amount: 100000 } })
        .mockResolvedValueOnce({ _sum: { amount: 40000 } });
      prisma.budget.count.mockResolvedValue(2);
      prisma.user.findUnique.mockResolvedValue({ currencyPreference: 'NGN' });
      prisma.budget.findMany.mockResolvedValue([]);

      const result = await service.getSummary(
        userId,
        '2026-08-01',
        '2026-08-21',
      );

      expect(result).toEqual({
        currency: 'NGN',
        totalIncome: 100000,
        totalExpense: 40000,
        netSavings: 60000,
        savingsRate: 60,
        budgetCount: 2,
        safeToSpend: 60000,
      });

      const aggregateCalls = prisma.transaction.aggregate.mock
        .calls as unknown as {
        where: { date: { gte: Date; lte: Date } };
      }[][];
      const incomeCall = aggregateCalls[0][0];
      expect(incomeCall.where.date).toEqual({
        gte: new Date('2026-08-01T00:00:00.000'),
        lte: new Date('2026-08-21T23:59:59.999'),
      });
    });

    it('subtracts remaining budget allocations for safe-to-spend', async () => {
      prisma.transaction.aggregate
        .mockResolvedValueOnce({ _sum: { amount: 100000 } })
        .mockResolvedValueOnce({ _sum: { amount: 40000 } });
      prisma.budget.count.mockResolvedValue(1);
      prisma.user.findUnique.mockResolvedValue({ currencyPreference: 'NGN' });
      prisma.budget.findMany.mockResolvedValue([
        { payCycle: 'MONTHLY', categoryId: 'cat-1', amount: 30000 },
      ]);
      prisma.transaction.groupBy.mockResolvedValue([
        { categoryId: 'cat-1', _sum: { amount: 20000 } },
      ]);

      const result = await service.getSummary(userId);

      expect(result.safeToSpend).toBe(50000);
      expect(prisma.transaction.groupBy).toHaveBeenCalledTimes(1);
    });

    it('rejects an inverted date range', async () => {
      await expect(
        service.getSummary(userId, '2026-08-21', '2026-08-01'),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects unparseable dates', async () => {
      await expect(service.getSummary(userId, 'not-a-date')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('getSpendByCategory', () => {
    it('returns totals sorted by amount with percentages', async () => {
      prisma.transaction.groupBy.mockResolvedValue([
        { categoryId: 'c1', _sum: { amount: 300 }, _count: 2 },
        { categoryId: 'c2', _sum: { amount: 100 }, _count: 1 },
      ]);
      prisma.category.findMany.mockResolvedValue([
        { id: 'c1', name: 'Food', group: 'FLEXIBLE' },
        { id: 'c2', name: 'Transport', group: 'FIXED' },
      ]);

      const result = await service.getSpendByCategory(userId);

      expect(result.totalExpense).toBe(400);
      expect(result.categories).toEqual([
        {
          categoryId: 'c1',
          categoryName: 'Food',
          categoryGroup: 'FLEXIBLE',
          totalAmount: 300,
          percentage: 75,
          transactionCount: 2,
        },
        {
          categoryId: 'c2',
          categoryName: 'Transport',
          categoryGroup: 'FIXED',
          totalAmount: 100,
          percentage: 25,
          transactionCount: 1,
        },
      ]);
    });
  });

  describe('getBudgetVsActual', () => {
    it('scopes actual spend to each pay cycle period', async () => {
      prisma.budget.findMany.mockResolvedValue([
        {
          id: 'b1',
          categoryId: 'cat-1',
          payCycle: 'MONTHLY',
          amount: 50000,
          category: { name: 'Rent', group: 'FIXED' },
        },
        {
          id: 'b2',
          categoryId: 'cat-2',
          payCycle: 'WEEKLY',
          amount: 10000,
          category: { name: 'Food', group: 'FLEXIBLE' },
        },
      ]);
      prisma.transaction.groupBy
        .mockResolvedValueOnce([
          { categoryId: 'cat-1', _sum: { amount: 40000 } },
        ])
        .mockResolvedValueOnce([]);

      const result = await service.getBudgetVsActual(userId);

      expect(result).toHaveLength(2);

      const monthly = result[0];
      expect(monthly.actualSpend).toBe(40000);
      expect(monthly.variance).toBe(10000);
      expect(monthly.percentUsed).toBe(80);
      expect(monthly.periodStart).toBe(
        new Date(2026, 7, 1, 0, 0, 0).toISOString(),
      );

      const weekly = result[1];
      expect(weekly.actualSpend).toBe(0);
      expect(weekly.percentUsed).toBe(0);
      expect(weekly.periodStart).toBe(
        new Date(2026, 7, 8, 10, 0, 0).toISOString(),
      );

      const groupByCalls = prisma.transaction.groupBy.mock.calls as unknown as {
        where: { date: { gte: Date } };
      }[][];
      const weeklyCall = groupByCalls[1][0];
      expect(weeklyCall.where.date.gte).toEqual(new Date(2026, 7, 8, 10, 0, 0));
    });

    it('returns an empty array when there are no budgets', async () => {
      prisma.budget.findMany.mockResolvedValue([]);

      const result = await service.getBudgetVsActual(userId);

      expect(result).toEqual([]);
      expect(prisma.transaction.groupBy).not.toHaveBeenCalled();
    });
  });

  describe('getTrend', () => {
    it('buckets transactions into months with net and savings rate', async () => {
      prisma.transaction.findMany.mockResolvedValue([
        { type: 'INCOME', amount: 100000, date: new Date(2026, 5, 10) },
        { type: 'EXPENSE', amount: 30000, date: new Date(2026, 5, 15) },
        { type: 'INCOME', amount: 120000, date: new Date(2026, 6, 5) },
        { type: 'EXPENSE', amount: 90000, date: new Date(2026, 6, 20) },
        { type: 'EXPENSE', amount: 5000, date: new Date(2026, 7, 1) },
      ]);

      const result = await service.getTrend(userId, 3);

      expect(result).toEqual([
        {
          month: '2026-06',
          income: 100000,
          expense: 30000,
          net: 70000,
          savingsRate: 70,
        },
        {
          month: '2026-07',
          income: 120000,
          expense: 90000,
          net: 30000,
          savingsRate: 25,
        },
        {
          month: '2026-08',
          income: 0,
          expense: 5000,
          net: -5000,
          savingsRate: 0,
        },
      ]);
    });
  });

  describe('exportTransactionsCsv', () => {
    it('builds CSV with proper escaping', async () => {
      prisma.transaction.findMany.mockResolvedValue([
        {
          date: new Date('2026-08-10T12:00:00.000Z'),
          type: 'EXPENSE',
          amount: 2500,
          subcategory: null,
          paymentMethod: 'Card "visa"',
          notes: 'Lunch, extra jollof',
          category: { name: 'Food & Drink' },
          account: { name: 'GTB' },
        },
      ]);

      const csv = await service.exportTransactionsCsv(
        userId,
        '2026-08-01',
        '2026-08-21',
      );

      const lines = csv.split('\r\n');
      expect(lines[0]).toBe(
        'Date,Type,Category,Subcategory,Account,Amount,Payment Method,Notes',
      );
      expect(lines[1]).toContain('Food & Drink');
      expect(lines[1]).toContain('"Card ""visa"""');
      expect(lines[1]).toContain('"Lunch, extra jollof"');
    });
  });

  describe('getAlerts', () => {
    beforeEach(() => {
      prisma.user.findUnique.mockResolvedValue({ currencyPreference: 'NGN' });
    });

    it('flags overspent budgets and negative cash flow', async () => {
      prisma.budget.findMany.mockResolvedValue([
        {
          id: 'b1',
          categoryId: 'cat-1',
          payCycle: 'MONTHLY',
          amount: 10000,
          category: { name: 'Food', group: 'FLEXIBLE' },
        },
      ]);
      prisma.transaction.groupBy.mockResolvedValue([
        { categoryId: 'cat-1', _sum: { amount: 12000 } },
      ]);
      prisma.transaction.aggregate
        .mockResolvedValueOnce({ _sum: { amount: 50000 } })
        .mockResolvedValueOnce({ _sum: { amount: 60000 } });
      prisma.transaction.count.mockResolvedValue(5);
      prisma.emergencyFund.findUnique.mockResolvedValue(null);

      const alerts = await service.getAlerts(userId);

      const titles = alerts.map((a) => a.title);
      expect(titles).toContain('Over budget: Food');
      expect(
        alerts.find((a) => a.title === 'Over budget: Food')?.severity,
      ).toBe('critical');
      expect(titles).toContain('Negative cash flow this month');
      expect(titles).toContain('Set up your emergency fund');
    });

    it('tips on low savings rate and emergency fund below halfway', async () => {
      prisma.budget.findMany.mockResolvedValue([]);
      prisma.transaction.aggregate
        .mockResolvedValueOnce({ _sum: { amount: 100000 } })
        .mockResolvedValueOnce({ _sum: { amount: 90000 } });
      prisma.transaction.count.mockResolvedValue(3);
      prisma.emergencyFund.findUnique.mockResolvedValue({
        targetAmount: 100000,
        currentAmount: 40000,
      });

      const alerts = await service.getAlerts(userId);

      const titles = alerts.map((a) => a.title);
      expect(titles).toContain('Low savings rate');
      expect(titles).toContain('Emergency fund below halfway');
      expect(titles).not.toContain('Negative cash flow this month');
    });
  });
});
