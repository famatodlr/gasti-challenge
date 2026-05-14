import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z, ZodError } from 'zod';

import { DEMO_USER_RESOURCE_ID } from './demo-context.ts';
import { categorySchema, dateStringSchema } from './transaction.ts';

const memorySourceSchema = z.enum(['user_stated', 'user_confirmed']);
const currencySchema = z.literal('ARS');

export const knownIncomeSchema = z
  .object({
    label: z.string().min(1),
    amount: z.number().int().positive(),
    currency: currencySchema,
    cadence: z.enum(['monthly', 'weekly', 'biweekly', 'one_time', 'unknown']),
    source: memorySourceSchema,
    notes: z.string().min(1).optional(),
  })
  .strict();

export const fixedExpenseSchema = z
  .object({
    merchant: z.string().min(1),
    category: categorySchema,
    amount: z.number().int().positive(),
    currency: currencySchema,
    cadence: z.enum(['monthly', 'weekly', 'annual', 'unknown']),
    source: memorySourceSchema,
    notes: z.string().min(1).optional(),
  })
  .strict();

export const savingGoalSchema = z
  .object({
    name: z.string().min(1),
    targetAmount: z.number().int().positive().optional(),
    currency: currencySchema,
    targetDate: dateStringSchema.optional(),
    monthlyContributionTarget: z.number().int().positive().optional(),
    source: memorySourceSchema,
    notes: z.string().min(1).optional(),
  })
  .strict();

export const recurringObservationSchema = z
  .object({
    merchant: z.string().min(1),
    category: categorySchema,
    observation: z.string().min(1),
    preference: z.enum(['watch', 'reduce', 'keep']),
    source: memorySourceSchema,
  })
  .strict();

export const financialPreferencesSchema = z
  .object({
    preferredLanguage: z.enum(['es-AR', 'en']),
    answerStyle: z.enum(['concise', 'detailed']),
    includeEvidence: z.boolean(),
  })
  .strict();

export const financialMemorySchema = z
  .object({
    schemaVersion: z.literal(1),
    resourceId: z.literal(DEMO_USER_RESOURCE_ID),
    currency: currencySchema,
    knownIncome: z.array(knownIncomeSchema),
    fixedExpenses: z.array(fixedExpenseSchema),
    savingGoals: z.array(savingGoalSchema),
    watchCategories: z.array(categorySchema),
    recurringObservations: z.array(recurringObservationSchema),
    preferences: financialPreferencesSchema,
  })
  .strict();

const knownIncomePatchSchema = z
  .object({
    label: z.string().trim().min(1).optional(),
    amount: z.number().int().positive(),
    currency: currencySchema,
    cadence: knownIncomeSchema.shape.cadence,
    source: memorySourceSchema,
    notes: z.string().trim().min(1).optional(),
  })
  .strict();

const fixedExpensePatchSchema = z
  .object({
    merchant: z.string().trim().min(1),
    category: categorySchema,
    amount: z.number().int().positive(),
    currency: currencySchema,
    cadence: fixedExpenseSchema.shape.cadence,
    source: memorySourceSchema,
    notes: z.string().trim().min(1).optional(),
  })
  .strict();

const savingGoalPatchSchema = z
  .object({
    name: z.string().trim().min(1),
    targetAmount: z.number().int().positive().optional(),
    currency: currencySchema,
    targetDate: dateStringSchema.optional(),
    monthlyContributionTarget: z.number().int().positive().optional(),
    source: memorySourceSchema,
    notes: z.string().trim().min(1).optional(),
  })
  .strict();

const recurringObservationPatchSchema = z
  .object({
    merchant: z.string().trim().min(1),
    category: categorySchema,
    observation: z.string().trim().min(1),
    preference: recurringObservationSchema.shape.preference,
    source: memorySourceSchema,
  })
  .strict();

export const financialMemoryPatchSchema = z
  .object({
    knownIncome: z.array(knownIncomePatchSchema).optional(),
    fixedExpenses: z.array(fixedExpensePatchSchema).optional(),
    savingGoals: z.array(savingGoalPatchSchema).optional(),
    watchCategories: z.array(categorySchema).optional(),
    recurringObservations: z.array(recurringObservationPatchSchema).optional(),
    preferences: financialPreferencesSchema.partial().strict().optional(),
  })
  .strict();

export type KnownIncome = z.infer<typeof knownIncomeSchema>;
export type FixedExpense = z.infer<typeof fixedExpenseSchema>;
export type SavingGoal = z.infer<typeof savingGoalSchema>;
export type RecurringObservation = z.infer<typeof recurringObservationSchema>;
export type FinancialPreferences = z.infer<typeof financialPreferencesSchema>;
export type FinancialMemory = z.infer<typeof financialMemorySchema>;
export type FinancialMemoryPatch = z.infer<typeof financialMemoryPatchSchema>;

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const defaultFinancialMemoryPath = resolve(currentDirectory, '../../../../../data/financial-memory.json');

export function createEmptyFinancialMemory(): FinancialMemory {
  return financialMemorySchema.parse({
    schemaVersion: 1,
    resourceId: DEMO_USER_RESOURCE_ID,
    currency: 'ARS',
    knownIncome: [],
    fixedExpenses: [],
    savingGoals: [],
    watchCategories: [],
    recurringObservations: [],
    preferences: {
      preferredLanguage: 'es-AR',
      answerStyle: 'concise',
      includeEvidence: true,
    },
  });
}

export function loadFinancialMemory(path = defaultFinancialMemoryPath): FinancialMemory {
  let parsedJson: unknown;

  try {
    parsedJson = JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    throw new Error(`Unable to read financial memory from ${path}: ${getErrorMessage(error)}`);
  }

  try {
    return financialMemorySchema.parse(parsedJson);
  } catch (error) {
    if (error instanceof ZodError) {
      const issues = error.issues.map((issue) => `${issue.path.join('.') || 'root'}: ${issue.message}`).join('; ');
      throw new Error(`Invalid financial memory data in ${path}: ${issues}`);
    }

    throw error;
  }
}

export function updateFinancialMemory(
  resourceId: string,
  patch: unknown,
  path = defaultFinancialMemoryPath,
): FinancialMemory {
  if (resourceId !== DEMO_USER_RESOURCE_ID) {
    throw new Error(`Financial memory updates are only supported for ${DEMO_USER_RESOURCE_ID}.`);
  }

  assertPatchPayloadIsSafe(patch);

  const parsedPatch = parseFinancialMemoryPatch(patch);
  const currentMemory = loadFinancialMemory(path);
  const updatedMemory = financialMemorySchema.parse(mergeFinancialMemory(currentMemory, parsedPatch));

  writeFileSync(path, `${JSON.stringify(updatedMemory, null, 2)}\n`);

  return updatedMemory;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function parseFinancialMemoryPatch(patch: unknown): FinancialMemoryPatch {
  try {
    return financialMemoryPatchSchema.parse(patch);
  } catch (error) {
    if (error instanceof ZodError) {
      const issues = error.issues.map((issue) => `${issue.path.join('.') || 'root'}: ${issue.message}`).join('; ');
      throw new Error(`Invalid financial memory patch: ${issues}`);
    }

    throw error;
  }
}

function mergeFinancialMemory(memory: FinancialMemory, patch: FinancialMemoryPatch): FinancialMemory {
  return {
    ...memory,
    knownIncome: mergeByKey(
      memory.knownIncome,
      (patch.knownIncome ?? []).map(toKnownIncome),
      (income) => normalizeMemoryKey(`${income.label}|${income.cadence}`),
      mergeMemoryRecord,
    ),
    fixedExpenses: mergeByKey(
      memory.fixedExpenses,
      patch.fixedExpenses ?? [],
      (expense) => normalizeMemoryKey(`${expense.merchant}|${expense.category}|${expense.cadence}`),
      (existing, incoming) => ({ ...existing, ...incoming, merchant: existing.merchant }),
    ),
    savingGoals: mergeByKey(
      memory.savingGoals,
      patch.savingGoals ?? [],
      (goal) => normalizeMemoryKey(goal.name),
      (existing, incoming) => ({ ...existing, ...incoming, name: existing.name }),
    ),
    watchCategories: dedupeWatchCategories(memory.watchCategories, patch.watchCategories ?? []),
    recurringObservations: mergeByKey(
      memory.recurringObservations,
      patch.recurringObservations ?? [],
      (observation) => normalizeMemoryKey(
        `${observation.merchant}|${observation.category}|${observation.observation}`,
      ),
      (existing, incoming) => ({ ...existing, ...incoming, merchant: existing.merchant, observation: existing.observation }),
    ),
    preferences: {
      ...memory.preferences,
      ...(patch.preferences ?? {}),
    },
  };
}

function toKnownIncome(income: z.infer<typeof knownIncomePatchSchema>): KnownIncome {
  return knownIncomeSchema.parse({
    ...income,
    label: income.label ?? getDefaultIncomeLabel(income.cadence),
  });
}

function getDefaultIncomeLabel(cadence: KnownIncome['cadence']): string {
  switch (cadence) {
    case 'monthly':
      return 'Ingreso mensual';
    case 'weekly':
      return 'Ingreso semanal';
    case 'biweekly':
      return 'Ingreso quincenal';
    case 'one_time':
      return 'Ingreso puntual';
    case 'unknown':
      return 'Ingreso';
  }
}

function dedupeWatchCategories(
  existingCategories: FinancialMemory['watchCategories'],
  incomingCategories: FinancialMemory['watchCategories'],
): FinancialMemory['watchCategories'] {
  const seen = new Set(existingCategories);
  const merged = [...existingCategories];

  for (const category of incomingCategories) {
    if (seen.has(category)) {
      continue;
    }

    merged.push(category);
    seen.add(category);
  }

  return merged;
}

function mergeByKey<T>(
  existingItems: readonly T[],
  incomingItems: readonly T[],
  getKey: (item: T) => string,
  merge: (existing: T, incoming: T) => T,
): T[] {
  const merged = [...existingItems];
  const indexesByKey = new Map<string, number>();

  for (const [index, item] of merged.entries()) {
    indexesByKey.set(getKey(item), index);
  }

  for (const item of incomingItems) {
    const key = getKey(item);
    const existingIndex = indexesByKey.get(key);

    if (existingIndex === undefined) {
      indexesByKey.set(key, merged.length);
      merged.push(item);
      continue;
    }

    merged[existingIndex] = merge(merged[existingIndex], item);
  }

  return merged;
}

function mergeMemoryRecord<T>(existing: T, incoming: T): T {
  return { ...existing, ...incoming };
}

function normalizeMemoryKey(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase('es-AR');
}

const forbiddenPatchKeyPatterns = [
  /^id$/i,
  /^transactions?$/i,
  /^rawTransactions?$/i,
  /^transactionIds?$/i,
  /^transactionId$/i,
  /^api[_-]?key$/i,
  /^secret$/i,
  /^token$/i,
  /^password$/i,
  /^accessToken$/i,
  /^refreshToken$/i,
  /^bank(Account|Data)?$/i,
  /^account(Number)?$/i,
  /^routingNumber$/i,
  /^cbu$/i,
  /^cvu$/i,
  /^iban$/i,
  /^card(Number)?$/i,
];

const forbiddenStringValuePatterns = [
  /\btxn_\d{3,}\b/i,
  /\bAIza[0-9A-Za-z_-]{10,}\b/,
  /\bsk-[0-9A-Za-z_-]{10,}\b/,
  /\b(api[_ -]?key|secret|token|password|contrase(?:n|\u00f1)a|clave api)\b/i,
  /\b(CBU|CVU|IBAN)\b/i,
];

function assertPatchPayloadIsSafe(value: unknown, path: string[] = []): void {
  if (typeof value === 'string') {
    assertStringValueIsSafe(value, path);
    return;
  }

  if (!value || typeof value !== 'object') {
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => assertPatchPayloadIsSafe(item, [...path, String(index)]));
    return;
  }

  for (const [key, nestedValue] of Object.entries(value)) {
    if (forbiddenPatchKeyPatterns.some((pattern) => pattern.test(key))) {
      throw new Error(`Financial memory patch contains unsupported sensitive field ${formatPath([...path, key])}.`);
    }

    assertPatchPayloadIsSafe(nestedValue, [...path, key]);
  }
}

function assertStringValueIsSafe(value: string, path: string[]): void {
  if (forbiddenStringValuePatterns.some((pattern) => pattern.test(value))) {
    throw new Error(`Financial memory patch contains raw or sensitive data at ${formatPath(path)}.`);
  }
}

function formatPath(path: readonly string[]): string {
  return path.length ? path.join('.') : 'root';
}
