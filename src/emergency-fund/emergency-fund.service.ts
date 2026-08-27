import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { NotificationsService } from '../notifications/notifications.service';
import { UpdateEmergencyFundDto } from './dto/update-emergency-fund.dto';

@Injectable()
export class EmergencyFundService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
    private readonly redisService: RedisService,
  ) {}

  async get(userId: string) {
    const fund = await this.prisma.emergencyFund.findUnique({
      where: { userId },
    });

    if (!fund) {
      return { targetAmount: 0, currentAmount: 0, percentage: 0 };
    }

    return this.withPercentage(fund);
  }

  async update(userId: string, dto: UpdateEmergencyFundDto) {
    const existing = await this.prisma.emergencyFund.findUnique({
      where: { userId },
    });

    const fund = await this.prisma.emergencyFund.upsert({
      where: { userId },
      create: {
        userId,
        targetAmount: dto.targetAmount ?? 0,
        currentAmount: dto.currentAmount ?? 0,
      },
      update: dto,
    });

    this.evaluateMilestones(
      userId,
      Number(existing?.targetAmount ?? 0),
      Number(existing?.currentAmount ?? 0),
      Number(fund.targetAmount),
      Number(fund.currentAmount),
    );

    void this.redisService.invalidateUser(userId);

    return this.withPercentage(fund);
  }

  private evaluateMilestones(
    userId: string,
    previousTarget: number,
    previousAmount: number,
    target: number,
    amount: number,
  ): void {
    if (target <= 0 || previousTarget <= 0) return;

    const previousPercent = (previousAmount / previousTarget) * 100;
    const percent = (amount / target) * 100;

    for (const milestone of [
      {
        at: 50,
        message:
          'You have reached halfway to your emergency fund target. Keep going!',
      },
      {
        at: 100,
        message:
          'Congratulations! You have reached your emergency fund target.',
      },
    ]) {
      if (percent >= milestone.at && previousPercent < milestone.at) {
        void this.notificationsService.notify({
          userId,
          type: 'EMERGENCY_FUND',
          title: `Emergency fund ${milestone.at}% reached`,
          message: milestone.message,
        });
      }
    }
  }

  private withPercentage<
    T extends { targetAmount: unknown; currentAmount: unknown },
  >(
    fund: T,
  ): Omit<T, 'targetAmount' | 'currentAmount'> & {
    targetAmount: number;
    currentAmount: number;
    percentage: number;
  } {
    const targetAmount = Number(fund.targetAmount);
    const currentAmount = Number(fund.currentAmount);
    const percentage =
      targetAmount > 0
        ? Math.round((currentAmount / targetAmount) * 10000) / 100
        : 0;

    return { ...fund, targetAmount, currentAmount, percentage };
  }
}
