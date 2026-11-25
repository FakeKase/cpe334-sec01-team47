-- F-06: when a Borrower cancelled the request. Additive and nullable, so a code rollback is safe.
ALTER TABLE "BorrowRequest" ADD COLUMN "cancelledAt" TIMESTAMPTZ;
