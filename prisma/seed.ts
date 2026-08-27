import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const defaultCategories = [
  // Fixed Expenses
  { name: 'Rent', type: 'EXPENSE' as const, group: 'FIXED' as const },
  { name: 'Utilities', type: 'EXPENSE' as const, group: 'FIXED' as const },
  { name: 'Subscriptions', type: 'EXPENSE' as const, group: 'FIXED' as const },
  { name: 'Insurance', type: 'EXPENSE' as const, group: 'FIXED' as const },

  // Flexible Expenses
  { name: 'Food & Groceries', type: 'EXPENSE' as const, group: 'FLEXIBLE' as const },
  { name: 'Transport', type: 'EXPENSE' as const, group: 'FLEXIBLE' as const },
  { name: 'Entertainment', type: 'EXPENSE' as const, group: 'FLEXIBLE' as const },
  { name: 'Healthcare', type: 'EXPENSE' as const, group: 'FLEXIBLE' as const },
  { name: 'Education', type: 'EXPENSE' as const, group: 'FLEXIBLE' as const },
  { name: 'Personal Care', type: 'EXPENSE' as const, group: 'FLEXIBLE' as const },

  // Income
  { name: 'Salary', type: 'INCOME' as const, group: 'FLEXIBLE' as const },
  { name: 'Freelance', type: 'INCOME' as const, group: 'FLEXIBLE' as const },
  { name: 'Business', type: 'INCOME' as const, group: 'FLEXIBLE' as const },
  { name: 'Investment', type: 'INCOME' as const, group: 'FLEXIBLE' as const },
  { name: 'Bonus', type: 'INCOME' as const, group: 'FLEXIBLE' as const },
  { name: 'Other Income', type: 'INCOME' as const, group: 'FLEXIBLE' as const },

  // Flexible Expenses (continued)
  { name: 'Shopping', type: 'EXPENSE' as const, group: 'FLEXIBLE' as const },
  { name: 'Savings Contributions', type: 'EXPENSE' as const, group: 'FIXED' as const },
];

async function main() {
  console.log('Seeding default categories...');

  for (const category of defaultCategories) {
    // userId is null for system defaults; the compound unique treats NULLs
    // as distinct per user, so upsert by name+type among defaults.
    const existing = await prisma.category.findFirst({
      where: { name: category.name, type: category.type, userId: null },
    });

    if (existing) {
      await prisma.category.update({
        where: { id: existing.id },
        data: { group: category.group },
      });
    } else {
      await prisma.category.create({ data: category });
    }
  }

  console.log(`Seeded ${defaultCategories.length} categories.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
