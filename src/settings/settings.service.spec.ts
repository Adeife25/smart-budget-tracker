import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { SettingsService } from './settings.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

jest.mock('bcrypt', () => ({
  hash: jest.fn(),
  compare: jest.fn(),
}));

const mockedBcrypt = bcrypt as unknown as {
  hash: jest.Mock<Promise<string>>;
  compare: jest.Mock<Promise<boolean>>;
};

describe('SettingsService', () => {
  let service: SettingsService;
  let prisma: {
    user: { findUniqueOrThrow: jest.Mock; update: jest.Mock };
    refreshToken: { updateMany: jest.Mock };
    $transaction: jest.Mock;
  };

  const userId = 'user-1';

  beforeEach(async () => {
    jest.clearAllMocks();

    prisma = {
      user: {
        findUniqueOrThrow: jest.fn(),
        update: jest.fn(),
      },
      refreshToken: { updateMany: jest.fn() },
      $transaction: jest.fn((ops: unknown[]) => Promise.all(ops)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SettingsService,
        { provide: PrismaService, useValue: prisma },
        { provide: RedisService, useValue: { invalidateUser: jest.fn() } },
      ],
    }).compile();

    service = module.get<SettingsService>(SettingsService);
  });

  describe('preferences', () => {
    it('returns current preferences', async () => {
      prisma.user.findUniqueOrThrow.mockResolvedValue({
        currencyPreference: 'NGN',
        payCyclePreference: 'MONTHLY',
      });

      await expect(service.get(userId)).resolves.toEqual({
        currencyPreference: 'NGN',
        payCyclePreference: 'MONTHLY',
      });
    });

    it('updates preferences', async () => {
      prisma.user.update.mockResolvedValue({
        currencyPreference: 'USD',
        payCyclePreference: 'BIWEEKLY',
      });

      const result = await service.update(userId, {
        currencyPreference: 'USD',
        payCyclePreference: 'BIWEEKLY',
      });

      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: userId },
          data: { currencyPreference: 'USD', payCyclePreference: 'BIWEEKLY' },
        }),
      );
      expect(result.currencyPreference).toBe('USD');
    });
  });

  describe('changePassword', () => {
    beforeEach(() => {
      prisma.user.findUniqueOrThrow.mockResolvedValue({
        id: userId,
        password: 'old-hash',
      });
    });

    it('rejects a wrong current password', async () => {
      mockedBcrypt.compare.mockResolvedValue(false);

      await expect(
        service.changePassword(userId, {
          currentPassword: 'wrong',
          newPassword: 'NewSecurePass123!',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('hashes the new password and revokes all sessions', async () => {
      mockedBcrypt.compare.mockResolvedValue(true);
      mockedBcrypt.hash.mockResolvedValue('new-hash');

      const result = await service.changePassword(userId, {
        currentPassword: 'correct',
        newPassword: 'NewSecurePass123!',
      });

      expect(mockedBcrypt.hash).toHaveBeenCalledWith('NewSecurePass123!', 10);
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { password: 'new-hash' } }),
      );
      const revokeArgs = (
        prisma.refreshToken.updateMany.mock.calls as unknown as {
          where: { userId: string; revokedAt: null };
          data: { revokedAt: Date };
        }[][]
      )[0][0];
      expect(revokeArgs.where).toEqual({ userId, revokedAt: null });
      expect(revokeArgs.data.revokedAt).toBeInstanceOf(Date);
      expect(result.message).toContain('sign in again');
    });
  });
});
