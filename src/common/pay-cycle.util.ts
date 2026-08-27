import { PayCycle } from '@prisma/client';

export interface PayCyclePeriod {
  start: Date;
  end: Date;
}

export function getPayCyclePeriod(payCycle: PayCycle): PayCyclePeriod {
  const end = new Date();
  switch (payCycle) {
    case 'WEEKLY':
      return { start: new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000), end };
    case 'BIWEEKLY':
      return { start: new Date(end.getTime() - 14 * 24 * 60 * 60 * 1000), end };
    case 'MONTHLY':
    default:
      return { start: new Date(end.getFullYear(), end.getMonth(), 1), end };
  }
}
