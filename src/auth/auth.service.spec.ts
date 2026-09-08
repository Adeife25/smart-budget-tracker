import { Test, TestingModule } from '@nestjs/testing';
import {
  ConflictException,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

jest.mock('bcrypt', () => ({
  hash: jest.fn(),
  compare: jest.fn(),
}));

const mockedBcrypt = bcrypt as unknown as {
  hash: jest.Mock<Promise<string>>;
  compare: jest.Mock<Promise<boolean>>;
};

const baseUser = {
  id: 'user-1',
  name: 'John Doe',
  email: 'john@example.com',
  emailVerified: false,
  password: 'hashed-password',
};

describe('AuthService', () => {
  let service: AuthService;
  let prisma: {
    user: {
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    refreshToken: {
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
    };
    passwordResetToken: {
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    $transaction: jest.Mock;
  };
  let mail: {
    sendVerificationEmail: jest.Mock;
    sendPasswordResetEmail: jest.Mock;
  };
  let jwt: { sign: jest.Mock; verify: jest.Mock };

  beforeEach(async () => {
    prisma = {
      user: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      refreshToken: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      passwordResetToken: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
    };

    mail = {
      sendVerificationEmail: jest.fn().mockResolvedValue(undefined),
      sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
    };

    jwt = {
      sign: jest.fn().mockReturnValue('signed-token'),
      verify: jest
        .fn()
        .mockReturnValue({ sub: 'user-1', email: 'john@example.com' }),
    };

    const config = {
      get: jest.fn((_key: string, defaultValue?: unknown) => defaultValue),
    };

    mockedBcrypt.hash.mockReset();
    mockedBcrypt.compare.mockReset();
    mockedBcrypt.hash.mockResolvedValue('hashed-password');
    mockedBcrypt.compare.mockResolvedValue(true);

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: MailService, useValue: mail },
        { provide: JwtService, useValue: jwt },
        { provide: ConfigService, useValue: config },
      ],
    }).compile();

    service = moduleRef.get<AuthService>(AuthService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('register', () => {
    it('creates a user, issues tokens, and sends a verification email', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue(baseUser);
      prisma.refreshToken.create.mockResolvedValue({ id: 'rt-1' });

      const result = await service.register({
        name: '  John Doe  ',
        email: '  JOHN@EXAMPLE.COM ',
        password: 'password123',
      });

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { email: 'john@example.com' },
      });
      expect(prisma.user.create).toHaveBeenCalledWith({
        data: {
          name: 'John Doe',
          email: 'john@example.com',
          password: 'hashed-password',
        },
      });
      expect(prisma.refreshToken.create).toHaveBeenCalledTimes(1);
      expect(mail.sendVerificationEmail).toHaveBeenCalledWith(
        'john@example.com',
        expect.stringContaining('/verify-email?token='),
      );
      expect(result.user).toEqual({
        id: 'user-1',
        name: 'John Doe',
        email: 'john@example.com',
        emailVerified: false,
      });
      expect(result.accessToken).toBe('signed-token');
      expect(result.refreshToken).toBe('signed-token');
    });

    it('throws ConflictException when the email is already registered', async () => {
      prisma.user.findUnique.mockResolvedValue(baseUser);

      await expect(
        service.register({
          name: 'John Doe',
          email: 'john@example.com',
          password: 'password123',
        }),
      ).rejects.toThrow(ConflictException);

      expect(prisma.user.create).not.toHaveBeenCalled();
      expect(mail.sendVerificationEmail).not.toHaveBeenCalled();
    });
  });

  describe('login', () => {
    it('returns tokens and a sanitized user on valid credentials', async () => {
      prisma.user.findUnique.mockResolvedValue(baseUser);
      prisma.refreshToken.create.mockResolvedValue({ id: 'rt-1' });

      const result = await service.login({
        email: 'JOHN@example.com',
        password: 'password123',
      });

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { email: 'john@example.com' },
      });
      expect(mockedBcrypt.compare).toHaveBeenCalledWith(
        'password123',
        'hashed-password',
      );
      expect(result.user).not.toHaveProperty('password');
      expect(result.accessToken).toBeDefined();
      expect(result.refreshToken).toBeDefined();
    });

    it('throws UnauthorizedException for an unknown email', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.login({ email: 'nobody@example.com', password: 'password123' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException for a wrong password', async () => {
      prisma.user.findUnique.mockResolvedValue(baseUser);
      mockedBcrypt.compare.mockResolvedValue(false);

      await expect(
        service.login({ email: 'john@example.com', password: 'wrongpass' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException for a social-login user with no password', async () => {
      prisma.user.findUnique.mockResolvedValue({
        ...baseUser,
        password: null,
      });

      await expect(
        service.login({ email: 'john@example.com', password: 'password123' }),
      ).rejects.toThrow(UnauthorizedException);

      expect(mockedBcrypt.compare).not.toHaveBeenCalled();
      expect(prisma.refreshToken.create).not.toHaveBeenCalled();
    });
  });

  describe('refresh', () => {
    const validStored = {
      id: 'rt-1',
      userId: 'user-1',
      token: 'hashed-token',
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      revokedAt: null,
    };

    it('revokes the old token and issues a new pair', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue(validStored);
      prisma.refreshToken.update.mockResolvedValue(validStored);
      prisma.user.findUnique.mockResolvedValue(baseUser);
      prisma.refreshToken.create.mockResolvedValue({ id: 'rt-2' });

      const result = await service.refresh('some-refresh-token');

      expect(prisma.refreshToken.update).toHaveBeenCalledWith({
        where: { id: 'rt-1' },
        data: { revokedAt: expect.any(Date) as Date },
      });
      expect(prisma.refreshToken.create).toHaveBeenCalledTimes(1);
      expect(result.user.email).toBe('john@example.com');
      expect(result.accessToken).toBeDefined();
    });

    it('throws UnauthorizedException when the token is revoked', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue({
        ...validStored,
        revokedAt: new Date(),
      });

      await expect(service.refresh('revoked-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('throws UnauthorizedException when the token is expired', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue({
        ...validStored,
        expiresAt: new Date(Date.now() - 1000),
      });

      await expect(service.refresh('expired-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('throws UnauthorizedException when the token does not exist', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue(null);

      await expect(service.refresh('unknown-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('logout', () => {
    it('revokes matching refresh tokens', async () => {
      prisma.refreshToken.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.logout('some-refresh-token');

      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { token: expect.any(String) as string, revokedAt: null },
        data: { revokedAt: expect.any(Date) as Date },
      });
      expect(result).toEqual({ success: true });
    });
  });

  describe('verifyEmail', () => {
    it('marks the user as verified', async () => {
      prisma.user.findUnique.mockResolvedValue({
        ...baseUser,
        emailVerified: false,
      });
      prisma.user.update.mockResolvedValue({
        ...baseUser,
        emailVerified: true,
      });

      const result = await service.verifyEmail('verification-token');

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { emailVerified: true, verifiedAt: expect.any(Date) as Date },
      });
      expect(result.message).toBe('Email verified successfully');
    });

    it('throws BadRequestException for an invalid token', async () => {
      jwt.verify.mockImplementation(() => {
        throw new Error('jwt malformed');
      });

      await expect(service.verifyEmail('bad-token')).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('returns already-verified message and skips the update', async () => {
      prisma.user.findUnique.mockResolvedValue({
        ...baseUser,
        emailVerified: true,
      });

      const result = await service.verifyEmail('verification-token');

      expect(result.message).toBe('Email already verified');
      expect(prisma.user.update).not.toHaveBeenCalled();
    });
  });

  describe('forgotPassword', () => {
    it('creates a reset token and sends a reset email for an existing user', async () => {
      prisma.user.findUnique.mockResolvedValue(baseUser);
      prisma.passwordResetToken.create.mockResolvedValue({ id: 'prt-1' });

      const result = await service.forgotPassword('john@example.com');

      expect(prisma.passwordResetToken.create).toHaveBeenCalledTimes(1);
      expect(mail.sendPasswordResetEmail).toHaveBeenCalledWith(
        'john@example.com',
        expect.stringContaining('/reset-password?token='),
      );
      expect(result.message).toContain('reset link has been sent');
    });

    it('returns the same message for an unknown email (no enumeration)', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      const result = await service.forgotPassword('nobody@example.com');

      expect(result.message).toContain('reset link has been sent');
      expect(prisma.passwordResetToken.create).not.toHaveBeenCalled();
      expect(mail.sendPasswordResetEmail).not.toHaveBeenCalled();
    });
  });

  describe('resetPassword', () => {
    const validRecord = {
      id: 'prt-1',
      userId: 'user-1',
      token: 'hashed-reset-token',
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      usedAt: null,
    };

    it('updates the password, marks the token used, and revokes refresh tokens', async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue(validRecord);
      prisma.user.update.mockResolvedValue(baseUser);
      prisma.passwordResetToken.update.mockResolvedValue(validRecord);
      prisma.refreshToken.updateMany.mockResolvedValue({ count: 2 });

      const result = await service.resetPassword(
        'reset-token',
        'newpassword123',
      );

      expect(mockedBcrypt.hash).toHaveBeenCalledWith('newpassword123', 10);
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(result.message).toBe('Password reset successfully');
    });

    it('throws BadRequestException for an invalid token', async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue(null);

      await expect(
        service.resetPassword('bad-token', 'newpassword123'),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException for a used token', async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue({
        ...validRecord,
        usedAt: new Date(),
      });

      await expect(
        service.resetPassword('used-token', 'newpassword123'),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException for an expired token', async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue({
        ...validRecord,
        expiresAt: new Date(Date.now() - 1000),
      });

      await expect(
        service.resetPassword('expired-token', 'newpassword123'),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
