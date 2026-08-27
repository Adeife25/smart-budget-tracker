import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes } from 'node:crypto';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { resolveSecret } from '../config/secrets';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface SafeUser {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly mailService: MailService,
  ) {}

  async register(dto: RegisterDto) {
    const email = this.normalizeEmail(dto.email);

    const existing = await this.prisma.user.findUnique({
      where: { email },
    });

    if (existing) {
      throw new ConflictException('Email already registered');
    }

    const hashedPassword = await bcrypt.hash(dto.password, 10);

    const user = await this.prisma.user.create({
      data: {
        name: dto.name.trim(),
        email,
        password: hashedPassword,
      },
    });

    const tokens = await this.issueTokens(user.id, user.email);
    await this.sendVerificationEmail(user);

    return {
      user: this.sanitizeUser(user),
      ...tokens,
    };
  }

  async login(dto: LoginDto) {
    const email = this.normalizeEmail(dto.email);

    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isPasswordValid = await bcrypt.compare(dto.password, user.password);

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const tokens = await this.issueTokens(user.id, user.email);

    return {
      user: this.sanitizeUser(user),
      ...tokens,
    };
  }

  async refresh(refreshToken: string) {
    const stored = await this.prisma.refreshToken.findUnique({
      where: { token: this.hashToken(refreshToken) },
    });

    if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });

    const user = await this.prisma.user.findUnique({
      where: { id: stored.userId },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const tokens = await this.issueTokens(user.id, user.email);

    return {
      user: this.sanitizeUser(user),
      ...tokens,
    };
  }

  async logout(refreshToken: string) {
    await this.prisma.refreshToken.updateMany({
      where: { token: this.hashToken(refreshToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });

    return { success: true };
  }

  async verifyEmail(token: string) {
    let payload: { sub: string; email: string };

    try {
      payload = this.jwtService.verify<{ sub: string; email: string }>(token, {
        secret: resolveSecret(this.configService, 'JWT_VERIFY_SECRET'),
      });
    } catch {
      throw new BadRequestException('Invalid or expired verification token');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
    });

    if (!user) {
      throw new BadRequestException('Invalid verification token');
    }

    if (user.emailVerified) {
      return { message: 'Email already verified' };
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { emailVerified: true, verifiedAt: new Date() },
    });

    return { message: 'Email verified successfully' };
  }

  async resendVerification(email: string) {
    const user = await this.prisma.user.findUnique({
      where: { email: this.normalizeEmail(email) },
    });

    if (user && !user.emailVerified) {
      await this.sendVerificationEmail(user);
    }

    return {
      message:
        'If the account exists and is unverified, a verification email has been sent',
    };
  }

  async sendEmailVerification(userId: string, email: string): Promise<void> {
    await this.sendVerificationEmail({ id: userId, email });
  }

  async forgotPassword(email: string) {
    const user = await this.prisma.user.findUnique({
      where: { email: this.normalizeEmail(email) },
    });

    if (!user) {
      return {
        message:
          'If an account with that email exists, a reset link has been sent',
      };
    }

    const token = randomBytes(32).toString('hex');

    await this.prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        token: this.hashToken(token),
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });

    await this.sendPasswordResetEmail(user.email, token);

    return {
      message:
        'If an account with that email exists, a reset link has been sent',
    };
  }

  async resetPassword(token: string, newPassword: string) {
    const record = await this.prisma.passwordResetToken.findUnique({
      where: { token: this.hashToken(token) },
    });

    if (!record || record.usedAt || record.expiresAt < new Date()) {
      throw new BadRequestException('Invalid or expired reset token');
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: record.userId },
        data: { password: hashedPassword },
      }),
      this.prisma.passwordResetToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      }),
      this.prisma.refreshToken.updateMany({
        where: { userId: record.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);

    return { message: 'Password reset successfully' };
  }

  private async issueTokens(
    userId: string,
    email: string,
  ): Promise<AuthTokens> {
    const accessToken = this.signAccessToken(userId, email);
    const refreshToken = this.signRefreshToken(userId, email);

    await this.prisma.refreshToken.create({
      data: {
        userId,
        token: this.hashToken(refreshToken),
        expiresAt: new Date(Date.now() + this.refreshTokenTtlMs()),
      },
    });

    return { accessToken, refreshToken };
  }

  private signAccessToken(userId: string, email: string): string {
    return this.jwtService.sign({ sub: userId, email });
  }

  private signRefreshToken(userId: string, email: string): string {
    return this.jwtService.sign(
      { sub: userId, email, jti: randomBytes(16).toString('hex') },
      {
        secret: resolveSecret(this.configService, 'JWT_REFRESH_SECRET'),
        expiresIn: this.refreshTokenTtlMs() / 1000,
      },
    );
  }

  private signVerificationToken(userId: string, email: string): string {
    return this.jwtService.sign(
      { sub: userId, email },
      {
        secret: resolveSecret(this.configService, 'JWT_VERIFY_SECRET'),
        expiresIn: 60 * 60 * 24,
      },
    );
  }

  private refreshTokenTtlMs(): number {
    const ttl = Number(
      this.configService.get<string>('JWT_REFRESH_EXPIRES_IN', '2592000'),
    );
    return Number.isFinite(ttl) && ttl > 0
      ? ttl * 1000
      : 30 * 24 * 60 * 60 * 1000;
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  private sanitizeUser(user: {
    id: string;
    name: string;
    email: string;
    emailVerified: boolean;
  }): SafeUser {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      emailVerified: user.emailVerified,
    };
  }

  private async sendVerificationEmail(user: {
    id: string;
    email: string;
  }): Promise<void> {
    const token = this.signVerificationToken(user.id, user.email);
    await this.mailService.sendVerificationEmail(
      user.email,
      this.buildVerifyLink(token),
    );
  }

  private async sendPasswordResetEmail(
    email: string,
    token: string,
  ): Promise<void> {
    await this.mailService.sendPasswordResetEmail(
      email,
      this.buildResetLink(token),
    );
  }

  private buildVerifyLink(token: string): string {
    const base = this.configService.get<string>(
      'FRONTEND_URL',
      'http://localhost:3000',
    );
    return `${base}/verify-email?token=${token}`;
  }

  private buildResetLink(token: string): string {
    const base = this.configService.get<string>(
      'FRONTEND_URL',
      'http://localhost:3000',
    );
    return `${base}/reset-password?token=${token}`;
  }
}
