import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

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
  { name: 'Other Income', type: 'INCOME' as const, group: 'FLEXIBLE' as const },
];

async function main() {
  console.log('Seeding default categories...');

  for (const category of defaultCategories) {
    await prisma.category.upsert({
      where: { name_type: { name: category.name, type: category.type } },
      update: {},
      create: category,
    });
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
