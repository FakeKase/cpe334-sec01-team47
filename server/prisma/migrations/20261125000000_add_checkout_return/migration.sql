-- F-07: who handed the item over and when, and who took it back, when and in what condition.
-- Additive and nullable, so a code rollback is safe.
-- CreateEnum
CREATE TYPE "ReturnCondition" AS ENUM ('GOOD', 'DAMAGED');

-- AlterTable
ALTER TABLE "BorrowRequest" ADD COLUMN     "checkedOutAt" TIMESTAMPTZ,
ADD COLUMN     "checkedOutById" UUID,
ADD COLUMN     "returnCondition" "ReturnCondition",
ADD COLUMN     "returnNote" TEXT,
ADD COLUMN     "returnedAt" TIMESTAMPTZ,
ADD COLUMN     "returnedToId" UUID;

-- AddForeignKey
ALTER TABLE "BorrowRequest" ADD CONSTRAINT "BorrowRequest_checkedOutById_fkey" FOREIGN KEY ("checkedOutById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BorrowRequest" ADD CONSTRAINT "BorrowRequest_returnedToId_fkey" FOREIGN KEY ("returnedToId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
