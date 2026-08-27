import { Injectable, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { AuthService } from '../auth/auth.service';
import { UpdateProfileDto } from './dto/update-profile.dto';

@Injectable()
export class ProfileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthService,
    private readonly redisService: RedisService,
  ) {}

  async get(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        emailVerified: true,
        currencyPreference: true,
        payCyclePreference: true,
        createdAt: true,
      },
    });

    return user;
  }

  async update(userId: string, dto: UpdateProfileDto) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });

    const data: {
      name?: string;
      email?: string;
      emailVerified?: boolean;
      verifiedAt?: null;
    } = {};

    if (dto.name !== undefined) {
      data.name = dto.name.trim();
    }

    let emailChanged = false;
    if (dto.email !== undefined) {
      const newEmail = dto.email.trim().toLowerCase();
      if (newEmail !== user.email) {
        const existing = await this.prisma.user.findUnique({
          where: { email: newEmail },
        });
        if (existing) {
          throw new ConflictException('Email already registered');
        }
        data.email = newEmail;
        data.emailVerified = false;
        data.verifiedAt = null;
        emailChanged = true;
      }
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data,
      select: {
        id: true,
        name: true,
        email: true,
        emailVerified: true,
        currencyPreference: true,
        payCyclePreference: true,
      },
    });

    if (emailChanged && updated.email) {
      await this.authService.sendEmailVerification(userId, updated.email);
    }

    void this.redisService.invalidateUser(userId);

    return {
      user: updated,
      ...(emailChanged && {
        message: 'Email updated. Please verify your new email address.',
      }),
    };
  }
}
