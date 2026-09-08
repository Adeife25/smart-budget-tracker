import { Injectable, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { UpdateSettingsDto } from './dto/update-settings.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { UpdateNotificationPreferencesDto } from './dto/update-notification-preferences.dto';

@Injectable()
export class SettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redisService: RedisService,
  ) {}

  async get(userId: string) {
    return this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        currencyPreference: true,
        payCyclePreference: true,
      },
    });
  }

  async update(userId: string, dto: UpdateSettingsDto) {
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: dto,
      select: {
        currencyPreference: true,
        payCyclePreference: true,
      },
    });
    void this.redisService.invalidateUser(userId);
    return updated;
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });

    if (!user.password) {
      throw new UnauthorizedException(
        'This account uses social login. Please sign in with Google or GitHub.',
      );
    }

    const isCurrentValid = await bcrypt.compare(
      dto.currentPassword,
      user.password,
    );
    if (!isCurrentValid) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    const hashedPassword = await bcrypt.hash(dto.newPassword, 10);

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { password: hashedPassword },
      }),
      this.prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);

    return {
      message:
        'Password changed successfully. Please sign in again on other devices.',
    };
  }

  async getNotificationPreferences(userId: string) {
    return this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        budgetAlerts: true,
        weeklyDigest: true,
        moneyTips: true,
      },
    });
  }

  async updateNotificationPreferences(
    userId: string,
    dto: UpdateNotificationPreferencesDto,
  ) {
    return this.prisma.user.update({
      where: { id: userId },
      data: dto,
      select: {
        budgetAlerts: true,
        weeklyDigest: true,
        moneyTips: true,
      },
    });
  }

  async deleteAccount(userId: string) {
    await this.prisma.$transaction([
      this.prisma.refreshToken.deleteMany({ where: { userId } }),
      this.prisma.passwordResetToken.deleteMany({ where: { userId } }),
      this.prisma.notification.deleteMany({ where: { userId } }),
      this.prisma.transaction.deleteMany({ where: { userId } }),
      this.prisma.account.deleteMany({ where: { userId } }),
      this.prisma.budget.deleteMany({ where: { userId } }),
      this.prisma.userCategorySelection.deleteMany({ where: { userId } }),
      this.prisma.category.deleteMany({ where: { userId } }),
      this.prisma.emergencyFund.deleteMany({ where: { userId } }),
      this.prisma.user.delete({ where: { id: userId } }),
    ]);

    await this.redisService.invalidateUser(userId);

    return { message: 'Account deleted successfully' };
  }
}
