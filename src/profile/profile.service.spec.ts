import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException } from '@nestjs/common';
import { ProfileService } from './profile.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { AuthService } from '../auth/auth.service';

describe('ProfileService', () => {
  let service: ProfileService;
  let prisma: {
    user: {
      findUniqueOrThrow: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
    };
  };
  let auth: { sendEmailVerification: jest.Mock };

  const userId = 'user-1';
  const selectedUser = {
    id: userId,
    name: 'Adeife',
    email: 'ajalaadeife01@gmail.com',
    emailVerified: true,
    currencyPreference: 'NGN',
    payCyclePreference: 'MONTHLY',
    createdAt: new Date('2026-08-21T12:00:00Z'),
  };
  const dbUser = { ...selectedUser, password: 'hashed' };

  beforeEach(async () => {
    prisma = {
      user: {
        findUniqueOrThrow: jest.fn().mockResolvedValue(selectedUser),
        findUnique: jest.fn().mockResolvedValue(null),
        update: jest.fn(),
      },
    };
    auth = { sendEmailVerification: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProfileService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuthService, useValue: auth },
        { provide: RedisService, useValue: { invalidateUser: jest.fn() } },
      ],
    }).compile();

    service = module.get<ProfileService>(ProfileService);
  });

  describe('get', () => {
    it('returns profile with preferences and no password', async () => {
      const result = await service.get(userId);

      expect(result).toHaveProperty('currencyPreference', 'NGN');
      expect(result).toHaveProperty('payCyclePreference', 'MONTHLY');
      expect(result).not.toHaveProperty('password');
    });
  });

  describe('update', () => {
    it('updates the name only', async () => {
      prisma.user.update.mockResolvedValue({ ...dbUser, name: 'New Name' });

      const result = await service.update(userId, { name: '  New Name  ' });

      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: userId },
          data: { name: 'New Name' },
        }),
      );
      expect(result.message).toBeUndefined();
      expect(auth.sendEmailVerification).not.toHaveBeenCalled();
    });

    it('changes email, resets verification and sends a new email', async () => {
      prisma.user.update.mockResolvedValue({
        ...dbUser,
        email: 'new@example.com',
        emailVerified: false,
      });

      const result = await service.update(userId, {
        email: 'New@Example.com ',
      });

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { email: 'new@example.com' },
      });
      const updateArgs = (
        prisma.user.update.mock.calls as unknown as {
          data: Record<string, unknown>;
        }[][]
      )[0][0];
      expect(updateArgs.data).toMatchObject({
        email: 'new@example.com',
        emailVerified: false,
        verifiedAt: null,
      });
      expect(auth.sendEmailVerification).toHaveBeenCalledWith(
        userId,
        'new@example.com',
      );
      expect(result.message).toContain('verify your new email');
    });

    it('rejects an email already registered', async () => {
      prisma.user.findUnique.mockResolvedValueOnce({ id: 'someone-else' });

      await expect(
        service.update(userId, { email: 'taken@example.com' }),
      ).rejects.toThrow(ConflictException);
    });
  });
});
