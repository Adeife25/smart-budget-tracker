import { Test, TestingModule } from '@nestjs/testing';
import { EmergencyFundService } from './emergency-fund.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { NotificationsService } from '../notifications/notifications.service';

describe('EmergencyFundService', () => {
  let service: EmergencyFundService;
  let prisma: { emergencyFund: { findUnique: jest.Mock; upsert: jest.Mock } };
  let notifications: { notify: jest.Mock };

  const userId = 'user-1';

  beforeEach(async () => {
    prisma = {
      emergencyFund: {
        findUnique: jest.fn(),
        upsert: jest.fn(),
      },
    };

    notifications = { notify: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmergencyFundService,
        { provide: PrismaService, useValue: prisma },
        { provide: NotificationsService, useValue: notifications },
        { provide: RedisService, useValue: { invalidateUser: jest.fn() } },
      ],
    }).compile();

    service = module.get<EmergencyFundService>(EmergencyFundService);
  });

  describe('get', () => {
    it('returns zeros when no fund exists', async () => {
      prisma.emergencyFund.findUnique.mockResolvedValue(null);

      await expect(service.get(userId)).resolves.toEqual({
        targetAmount: 0,
        currentAmount: 0,
        percentage: 0,
      });
    });

    it('computes the funded percentage', async () => {
      prisma.emergencyFund.findUnique.mockResolvedValue({
        id: 'f1',
        userId,
        targetAmount: 300000,
        currentAmount: 90000,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await service.get(userId);

      expect(result.percentage).toBe(30);
    });
  });

  describe('update', () => {
    it('creates a fund when none exists', async () => {
      prisma.emergencyFund.upsert.mockResolvedValue({
        id: 'f1',
        userId,
        targetAmount: 500000,
        currentAmount: 125000,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await service.update(userId, {
        targetAmount: 500000,
        currentAmount: 125000,
      });

      expect(prisma.emergencyFund.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId },
          create: { userId, targetAmount: 500000, currentAmount: 125000 },
          update: { targetAmount: 500000, currentAmount: 125000 },
        }),
      );
      expect(result.percentage).toBe(25);
    });
  });
});
