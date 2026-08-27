-- Per-user category ownership and selections, plus notifications.

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('BUDGET', 'EMERGENCY_FUND', 'SYSTEM');

-- CreateTable
CREATE TABLE "UserCategorySelection" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserCategorySelection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL DEFAULT 'SYSTEM',
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserCategorySelection_userId_categoryId_key" ON "UserCategorySelection"("userId", "categoryId");

-- CreateIndex
CREATE INDEX "Notification_userId_readAt_idx" ON "Notification"("userId", "readAt");

-- Category ownership: nullable owner (NULL = system default)
ALTER TABLE "Category" ADD COLUMN "userId" TEXT;

-- CreateIndex
CREATE INDEX "Category_userId_idx" ON "Category"("userId");

-- Allow different users to create same-named custom categories while still
-- blocking duplicate system defaults.
DROP INDEX "Category_name_type_key";
CREATE UNIQUE INDEX "Category_name_type_userId_key" ON "Category"("name", "type", "userId") NULLS NOT DISTINCT;

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserCategorySelection" ADD CONSTRAINT "UserCategorySelection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserCategorySelection" ADD CONSTRAINT "UserCategorySelection_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
