import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { UpdateTransactionDto } from './dto/update-transaction.dto';

@Injectable()
export class TransactionsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(
    userId: string,
    query: { type?: string; categoryId?: string; accountId?: string },
  ) {
    return this.prisma.transaction.findMany({
      where: {
        userId,
        deletedAt: null,
        ...(query.type && { type: query.type as 'INCOME' | 'EXPENSE' }),
        ...(query.categoryId && { categoryId: query.categoryId }),
        ...(query.accountId && { accountId: query.accountId }),
      },
      include: { category: true, account: true },
      orderBy: { date: 'desc' },
    });
  }

  async findOne(id: string, userId: string) {
    const transaction = await this.prisma.transaction.findFirst({
      where: { id, userId, deletedAt: null },
      include: { category: true, account: true },
    });

    if (!transaction) {
      throw new NotFoundException(`Transaction with id ${id} not found`);
    }

    return transaction;
  }

  async create(userId: string, dto: CreateTransactionDto) {
    return this.prisma.transaction.create({
      data: { ...dto, userId },
      include: { category: true, account: true },
    });
  }

  async update(id: string, userId: string, dto: UpdateTransactionDto) {
    const existing = await this.findOne(id, userId);

    if (existing.userId !== userId) {
      throw new ForbiddenException('You can only edit your own transactions');
    }

    return this.prisma.transaction.update({
      where: { id },
      data: dto,
      include: { category: true, account: true },
    });
  }

  async remove(id: string, userId: string) {
    const existing = await this.findOne(id, userId);

    if (existing.userId !== userId) {
      throw new ForbiddenException('You can only delete your own transactions');
    }

    return this.prisma.transaction.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }
}
