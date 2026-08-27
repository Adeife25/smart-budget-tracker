import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { CreateAccountDto } from './dto/create-account.dto';

@Injectable()
export class AccountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redisService: RedisService,
  ) {}

  async findAll(userId: string) {
    const accounts = await this.prisma.account.findMany({
      where: { userId },
      orderBy: { name: 'asc' },
    });

    if (accounts.length === 0) {
      return {
        summary: { totalBalance: 0, accountCount: 0 },
        accounts: [],
      };
    }

    const [balances, counts] = await Promise.all([
      this.prisma.transaction.groupBy({
        by: ['accountId', 'type'],
        where: { userId, deletedAt: null },
        _sum: { amount: true },
      }),
      this.prisma.transaction.groupBy({
        by: ['accountId'],
        where: { userId, deletedAt: null },
        _count: true,
      }),
    ]);

    const balanceByAccount = new Map<string, number>();
    for (const row of balances) {
      const current = balanceByAccount.get(row.accountId) ?? 0;
      const amount = Number(row._sum.amount ?? 0);
      balanceByAccount.set(
        row.accountId,
        row.type === 'INCOME' ? current + amount : current - amount,
      );
    }

    const countByAccount = new Map<string, number>(
      counts.map((row) => [row.accountId, row._count] as const),
    );

    const enriched = accounts.map((account) => ({
      id: account.id,
      userId: account.userId,
      name: account.name,
      type: account.type,
      currency: account.currency,
      balance: balanceByAccount.get(account.id) ?? 0,
      transactionCount: countByAccount.get(account.id) ?? 0,
    }));

    return {
      summary: {
        totalBalance: this.round(
          enriched.reduce((sum, account) => sum + account.balance, 0),
        ),
        accountCount: enriched.length,
      },
      accounts: enriched,
    };
  }

  async findOne(id: string, userId: string) {
    const account = await this.prisma.account.findFirst({
      where: { id, userId },
    });

    if (!account) {
      throw new NotFoundException(`Account with id ${id} not found`);
    }

    return account;
  }

  async create(userId: string, dto: CreateAccountDto) {
    try {
      const account = await this.prisma.account.create({
        data: { ...dto, userId },
      });
      void this.redisService.invalidateUser(userId);
      return account;
    } catch (error) {
      if (
        error instanceof Error &&
        'code' in error &&
        (error as { code: string }).code === 'P2002'
      ) {
        throw new ConflictException('Account with this name already exists');
      }
      throw error;
    }
  }

  async remove(id: string, userId: string) {
    await this.findOne(id, userId);
    const deleted = await this.prisma.account.delete({ where: { id } });
    void this.redisService.invalidateUser(userId);
    return deleted;
  }

  private round(value: number): number {
    return Math.round(value * 100) / 100;
  }
}
