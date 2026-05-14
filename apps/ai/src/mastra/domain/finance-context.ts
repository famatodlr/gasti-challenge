import { z } from 'zod';

import { getCurrentDateString } from './current-date.ts';
import {
  dateRangeSchema,
  dateStringSchema,
  getMonthDateRange,
  getTransactionDateRange,
  type Transaction,
} from './transaction.ts';

export const financeContextMonthSchema = z.object({
  year: z.number().int(),
  month: z.number().int().min(1).max(12),
  label: z.string(),
  from: dateStringSchema,
  to: dateStringSchema,
  transactionCount: z.number().int().nonnegative(),
});

export const financeContextSchema = z.object({
  today: dateStringSchema,
  currency: z.literal('ARS'),
  availableDateRange: dateRangeSchema,
  availableMonths: z.array(financeContextMonthSchema),
});

export type FinanceContextMonth = z.infer<typeof financeContextMonthSchema>;
export type FinanceContext = z.infer<typeof financeContextSchema>;

export function getFinanceContext(
  transactions: readonly Transaction[],
  { today = getCurrentDateString() }: { today?: string } = {},
): FinanceContext {
  return financeContextSchema.parse({
    today,
    currency: 'ARS',
    availableDateRange: getTransactionDateRange(transactions),
    availableMonths: buildAvailableMonths(transactions),
  });
}

function buildAvailableMonths(transactions: readonly Transaction[]): FinanceContextMonth[] {
  const countsByMonth = new Map<string, number>();

  for (const transaction of transactions) {
    const monthKey = transaction.date.slice(0, 7);
    countsByMonth.set(monthKey, (countsByMonth.get(monthKey) ?? 0) + 1);
  }

  return Array.from(countsByMonth.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([monthKey, transactionCount]) => {
      const [year, month] = monthKey.split('-').map(Number);
      const range = getMonthDateRange(monthKey);

      return {
        year,
        month,
        label: formatMonthLabel(year, month),
        from: range.from,
        to: range.to,
        transactionCount,
      };
    });
}

function formatMonthLabel(year: number, month: number): string {
  return new Intl.DateTimeFormat('es-AR', {
    month: 'long',
    timeZone: 'UTC',
    year: 'numeric',
  }).format(new Date(Date.UTC(year, month - 1, 1)));
}
