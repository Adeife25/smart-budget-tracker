import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateSelectionsDto } from './dto/update-selections.dto';

@Injectable()
export class CategoriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redisService: RedisService,
  ) {}

  async findAll(userId: string) {
    const [categories, selections] = await Promise.all([
      this.prisma.category.findMany({
        where: this.visibleTo(userId),
        include: { subCategories: true },
        orderBy: { name: 'asc' },
      }),
      this.prisma.userCategorySelection.findMany({
        where: { userId },
        select: { categoryId: true },
      }),
    ]);

    const selectedIds = new Set(selections.map((s) => s.categoryId));

    const withSelection = (category: (typeof categories)[number]) => ({
      ...category,
      selected: selectedIds.has(category.id),
    });

    const income = categories
      .filter((c) => c.type === 'INCOME')
      .map(withSelection);
    const expense = categories
      .filter((c) => c.type === 'EXPENSE')
      .map(withSelection);

    return {
      income: {
        total: income.length,
        selectedCount: income.filter((c) => c.selected).length,
        categories: income,
      },
      expense: {
        total: expense.length,
        selectedCount: expense.filter((c) => c.selected).length,
        categories: expense,
      },
      totalCategories: categories.length,
    };
  }

  async findByType(userId: string, type: 'INCOME' | 'EXPENSE') {
    const [categories, selections] = await Promise.all([
      this.prisma.category.findMany({
        where: { ...this.visibleTo(userId), type },
        include: { subCategories: true },
        orderBy: { name: 'asc' },
      }),
      this.prisma.userCategorySelection.findMany({
        where: { userId },
        select: { categoryId: true },
      }),
    ]);

    const selectedIds = new Set(selections.map((s) => s.categoryId));
    return categories.map((category) => ({
      ...category,
      selected: selectedIds.has(category.id),
    }));
  }

  async findOne(id: string) {
    const category = await this.prisma.category.findUnique({
      where: { id },
      include: { subCategories: true, parentCategory: true },
    });

    if (!category) {
      throw new NotFoundException(`Category with id ${id} not found`);
    }

    return category;
  }

  async create(userId: string, dto: CreateCategoryDto) {
    try {
      const category = await this.prisma.category.create({
        data: { ...dto, isCustom: true, userId },
      });

      await this.prisma.userCategorySelection.create({
        data: { userId, categoryId: category.id },
      });

      void this.redisService.invalidateUser(userId);

      return { ...category, selected: true };
    } catch (error) {
      if (
        error instanceof Error &&
        'code' in error &&
        (error as { code: string }).code === 'P2002'
      ) {
        throw new ConflictException(
          'You already have a category with this name and type',
        );
      }
      throw error;
    }
  }

  async updateSelections(
    userId: string,
    dto: UpdateSelectionsDto,
  ): Promise<{ message: string; selectedCount: number }> {
    const ids = [
      ...new Set([
        ...(dto.incomeCategoryIds ?? []),
        ...(dto.expenseCategoryIds ?? []),
      ]),
    ];

    if (ids.length > 0) {
      const visible = await this.prisma.category.count({
        where: { id: { in: ids }, OR: [{ userId: null }, { userId }] },
      });
      if (visible !== ids.length) {
        throw new BadRequestException(
          'One or more selected categories are not available',
        );
      }
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.userCategorySelection.deleteMany({ where: { userId } });
      if (ids.length > 0) {
        await tx.userCategorySelection.createMany({
          data: ids.map((categoryId) => ({ userId, categoryId })),
        });
      }
    });

    void this.redisService.invalidateUser(userId);

    return {
      message: 'Category selections updated',
      selectedCount: ids.length,
    };
  }

  async remove(id: string, userId: string) {
    const category = await this.findOne(id);

    if (!category.isCustom || category.userId !== userId) {
      throw new ForbiddenException(
        'You can only delete your own custom categories',
      );
    }

    await this.prisma.category.delete({ where: { id } });
    void this.redisService.invalidateUser(userId);
    return category;
  }

  visibleTo(userId: string) {
    return { OR: [{ userId: null }, { userId }] };
  }
}
