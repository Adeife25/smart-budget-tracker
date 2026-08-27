import { BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export async function assertCategoryVisible(
  prisma: PrismaService,
  userId: string,
  categoryId: string,
): Promise<void> {
  const category = await prisma.category.findFirst({
    where: {
      id: categoryId,
      OR: [{ userId: null }, { userId }],
    },
    select: { id: true },
  });

  if (!category) {
    throw new BadRequestException(
      'Category does not exist or is not available to you',
    );
  }
}
