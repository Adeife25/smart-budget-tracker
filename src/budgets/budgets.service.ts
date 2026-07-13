import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateBudgetDto } from './dto/create-budget.dto';

@Injectable()
export class BudgetsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(userId: string) {
    return this.prisma.budget.findMany({
      where: { userId },
      include: { category: true },
      orderBy: { id: 'desc' },
    });
  }

  async findOne(id: string, userId: string) {
    const budget = await this.prisma.budget.findFirst({
      where: { id, userId },
      include: { category: true },
    });

    if (!budget) {
      throw new NotFoundException(`Budget with id ${id} not found`);
    }

    return budget;
  }

  async create(userId: string, dto: CreateBudgetDto) {
    try {
      return await this.prisma.budget.create({
        data: { ...dto, userId },
        include: { category: true },
      });
    } catch (error) {
      if (
        error instanceof Error &&
        'code' in error &&
        (error as { code: string }).code === 'P2002'
      ) {
        throw new ConflictException('Budget for this category already exists');
      }
      throw error;
    }
  }

  async update(id: string, userId: string, dto: Partial<CreateBudgetDto>) {
    await this.findOne(id, userId);
    return this.prisma.budget.update({
      where: { id },
      data: dto,
      include: { category: true },
    });
  }

  async remove(id: string, userId: string) {
    await this.findOne(id, userId);
    return this.prisma.budget.delete({ where: { id } });
  }
}
