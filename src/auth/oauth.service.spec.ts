import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { OAuthService } from './oauth.service';
import { AuthService, SafeUser } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';

describe('OAuthService', () => {
  let service: OAuthService;
  let prisma: {
    user: {
      findUnique: jest.Mock;
      create: jest.Mock;
    };
    providerAccount: {
      upsert: jest.Mock;
    };
  };
  let auth: {
    normalizeEmail: jest.Mock;
    issueTokens: jest.Mock;
    sanitizeUser: jest.Mock;
  };

  const oauthUser = {
    id: 'user-1',
    name: 'John Doe',
    email: 'john@example.com',
    emailVerified: true,
    password: null,
    verifiedAt: new Date(),
  };

  const safeUser: SafeUser = {
    id: 'user-1',
    name: 'John Doe',
    email: 'john@example.com',
    emailVerified: true,
  };

  const profile = {
    name: 'John Doe',
    email: 'John@Example.com',
    provider: 'GOOGLE' as const,
    providerAccountId: 'google-123',
  };

  beforeEach(async () => {
    prisma = {
      user: {
        findUnique: jest.fn(),
        create: jest.fn(),
      },
      providerAccount: {
        upsert: jest.fn(),
      },
    };

    auth = {
      normalizeEmail: jest.fn((email: string) => email.trim().toLowerCase()),
      issueTokens: jest
        .fn()
        .mockResolvedValue({ accessToken: 'access', refreshToken: 'refresh' }),
      sanitizeUser: jest.fn().mockReturnValue(safeUser),
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        OAuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuthService, useValue: auth },
      ],
    }).compile();

    service = moduleRef.get<OAuthService>(OAuthService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('throws BadRequestException when the email is missing', async () => {
    await expect(
      service.handleOAuthLogin({ ...profile, email: '' }),
    ).rejects.toThrow(BadRequestException);

    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(prisma.user.create).not.toHaveBeenCalled();
    expect(prisma.providerAccount.upsert).not.toHaveBeenCalled();
  });

  it('normalizes the profile email', async () => {
    prisma.user.findUnique.mockResolvedValue(oauthUser);
    prisma.providerAccount.upsert.mockResolvedValue({ id: 'pa-1' });

    await service.handleOAuthLogin({
      ...profile,
      provider: 'GITHUB',
      providerAccountId: 'github-123',
    });

    expect(auth.normalizeEmail).toHaveBeenCalledWith('John@Example.com');
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { email: 'john@example.com' },
    });
  });

  it('creates a new user with a null password and verified email when none exists', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.create.mockResolvedValue(oauthUser);
    prisma.providerAccount.upsert.mockResolvedValue({ id: 'pa-1' });

    const result = await service.handleOAuthLogin(profile);

    expect(prisma.user.create).toHaveBeenCalledWith({
      data: {
        name: 'John Doe',
        email: 'john@example.com',
        password: null,
        emailVerified: true,
        verifiedAt: expect.any(Date) as Date,
      },
    });
    expect(prisma.providerAccount.upsert).toHaveBeenCalledWith({
      where: {
        provider_providerAccountId: {
          provider: 'GOOGLE',
          providerAccountId: 'google-123',
        },
      },
      create: {
        userId: 'user-1',
        provider: 'GOOGLE',
        providerAccountId: 'google-123',
      },
      update: {
        userId: 'user-1',
      },
    });
    expect(result.user).toEqual(safeUser);
    expect(result.accessToken).toBe('access');
    expect(result.refreshToken).toBe('refresh');
  });

  it('links a provider account to an existing user without creating a new user', async () => {
    prisma.user.findUnique.mockResolvedValue(oauthUser);
    prisma.providerAccount.upsert.mockResolvedValue({ id: 'pa-1' });

    await service.handleOAuthLogin(profile);

    expect(prisma.user.create).not.toHaveBeenCalled();
    expect(prisma.providerAccount.upsert).toHaveBeenCalledTimes(1);
    expect(auth.issueTokens).toHaveBeenCalledWith('user-1', 'john@example.com');
    expect(auth.sanitizeUser).toHaveBeenCalledWith(oauthUser);
  });
});
