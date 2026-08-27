-- Store money as fixed-precision DECIMAL(12,2) instead of double precision
-- to avoid floating-point rounding errors in balances and sums.
ALTER TABLE "Transaction" ALTER COLUMN "amount" TYPE DECIMAL(12,2);
ALTER TABLE "Budget" ALTER COLUMN "amount" TYPE DECIMAL(12,2);
ALTER TABLE "EmergencyFund" ALTER COLUMN "targetAmount" TYPE DECIMAL(12,2);
ALTER TABLE "EmergencyFund" ALTER COLUMN "currentAmount" TYPE DECIMAL(12,2);
