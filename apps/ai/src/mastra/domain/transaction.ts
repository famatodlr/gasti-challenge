import { z } from 'zod';

export const rawCategories = ['comida', 'transporte', 'salud', 'otros', 'entretenimiento', 'servicios', 'educacion'] as const;

export const categories = [
  'vivienda',
  'servicios',
  'suscripciones',
  'supermercado',
  'comida_fuera',
  'delivery',
  'transporte',
  'salud',
  'educacion',
  'compras',
  'ocio',
] as const;

export const rawCategorySchema = z.enum(rawCategories);
export const categorySchema = z.enum(categories);

export const dateStringSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(isValidISODate, {
  message: 'Expected a valid YYYY-MM-DD date',
});

export const dateRangeSchema = z
  .object({
    from: dateStringSchema,
    to: dateStringSchema,
  })
  .refine((range) => compareISODate(range.from, range.to) <= 0, {
    message: 'Date range "from" must be before or equal to "to"',
    path: ['from'],
  });

const transactionBaseSchema = z.object({
  id: z.string().regex(/^txn_\d{3}$/),
  date: dateStringSchema,
  amount: z.number().int().positive(),
  currency: z.literal('ARS'),
  description: z.string().min(1),
  merchant: z.string().min(1),
});

export const rawTransactionSchema = transactionBaseSchema.extend({
  category: rawCategorySchema,
});

export const transactionSchema = transactionBaseSchema.extend({
  category: categorySchema,
  rawCategory: rawCategorySchema,
});

export const rawTransactionsSchema = z.array(rawTransactionSchema);
export const transactionsSchema = z.array(transactionSchema);

export type RawCategory = z.infer<typeof rawCategorySchema>;
export type Category = z.infer<typeof categorySchema>;
export type DateRange = z.infer<typeof dateRangeSchema>;
export type RawTransaction = z.infer<typeof rawTransactionSchema>;
export type Transaction = z.infer<typeof transactionSchema>;

const serviceMerchants = new Set(['aysa', 'edenor', 'galicia', 'metrogas', 'movistar', 'personal']);
const subscriptionMerchants = new Set(['disney+', 'netflix', 'spotify']);
const supermarketMerchants = new Set(['carrefour', 'coto', 'dia', 'jumbo']);
const deliveryMerchants = new Set(['pedidosya', 'rappi']);
const eatingOutMerchants = new Set(['havanna', 'mcdonalds', 'starbucks']);
const housingMerchants = new Set(['propietario']);
const shoppingMerchants = new Set(['mercado libre']);
const leisureMerchants = new Set(['hoyts', 'mercado pago']);

export function normalizeTransactionCategory(transaction: Pick<RawTransaction, 'category' | 'merchant'>): Category {
  const merchant = normalizeMerchant(transaction.merchant);

  if (housingMerchants.has(merchant)) {
    return 'vivienda';
  }

  if (serviceMerchants.has(merchant)) {
    return 'servicios';
  }

  if (subscriptionMerchants.has(merchant)) {
    return 'suscripciones';
  }

  if (supermarketMerchants.has(merchant)) {
    return 'supermercado';
  }

  if (deliveryMerchants.has(merchant)) {
    return 'delivery';
  }

  if (eatingOutMerchants.has(merchant)) {
    return 'comida_fuera';
  }

  if (shoppingMerchants.has(merchant)) {
    return 'compras';
  }

  if (leisureMerchants.has(merchant)) {
    return 'ocio';
  }

  switch (transaction.category) {
    case 'comida':
      return 'comida_fuera';
    case 'entretenimiento':
      return 'ocio';
    case 'otros':
      return 'compras';
    case 'transporte':
    case 'salud':
    case 'servicios':
    case 'educacion':
      return transaction.category;
  }
}

export function normalizeTransaction(rawTransaction: RawTransaction): Transaction {
  return {
    ...rawTransaction,
    category: normalizeTransactionCategory(rawTransaction),
    rawCategory: rawTransaction.category,
  };
}

export function formatARS(amount: number): string {
  const roundedAmount = Math.round(amount);
  const formattedAmount = new Intl.NumberFormat('es-AR', {
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
    useGrouping: true,
  }).format(roundedAmount);

  return `ARS ${formattedAmount}`;
}

export function parseISODate(value: string): Date {
  dateStringSchema.parse(value);

  const [year, month, day] = value.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

export function compareISODate(a: string, b: string): number {
  return a.localeCompare(b);
}

export function isWithinDateRange(transaction: Pick<Transaction, 'date'>, range: DateRange): boolean {
  dateRangeSchema.parse(range);
  return compareISODate(transaction.date, range.from) >= 0 && compareISODate(transaction.date, range.to) <= 0;
}

export function getTransactionDateRange(transactions: readonly Transaction[]): DateRange {
  if (transactions.length === 0) {
    throw new Error('Cannot infer a date range from an empty transaction list');
  }

  const dates = transactions.map((transaction) => transaction.date).sort(compareISODate);
  return { from: dates[0], to: dates[dates.length - 1] };
}

export function getMonthDateRange(month: string): DateRange {
  if (!/^\d{4}-\d{2}$/.test(month)) {
    throw new Error('Expected month in YYYY-MM format');
  }

  const [year, monthNumber] = month.split('-').map(Number);
  if (monthNumber < 1 || monthNumber > 12) {
    throw new Error('Expected month in YYYY-MM format with a month from 01 to 12');
  }

  const daysInMonth = getDaysInMonth(year, monthNumber);

  return {
    from: `${month}-01`,
    to: `${month}-${String(daysInMonth).padStart(2, '0')}`,
  };
}

export function getDaysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function countInclusiveDays(range: DateRange): number {
  dateRangeSchema.parse(range);
  const from = parseISODate(range.from).getTime();
  const to = parseISODate(range.to).getTime();
  return Math.floor((to - from) / 86_400_000) + 1;
}

export function getISOWeekKey(value: string): string {
  const date = parseISODate(value);
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);

  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((date.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);

  return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

export function sortTransactionsAscending(a: Transaction, b: Transaction): number {
  const dateComparison = compareISODate(a.date, b.date);
  return dateComparison === 0 ? a.id.localeCompare(b.id) : dateComparison;
}

export function sortTransactionsDescending(a: Transaction, b: Transaction): number {
  const dateComparison = compareISODate(b.date, a.date);
  return dateComparison === 0 ? b.id.localeCompare(a.id) : dateComparison;
}

function isValidISODate(value: string): boolean {
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function normalizeMerchant(value: string): string {
  return value.trim().toLocaleLowerCase('es-AR');
}
