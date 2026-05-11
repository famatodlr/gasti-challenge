import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ZodError } from 'zod';

import { sortTransactionsAscending, type Transaction, transactionsSchema } from './transaction.ts';

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const defaultTransactionsPath = resolve(currentDirectory, '../../../../../data/transactions.json');

export function loadTransactions(path = defaultTransactionsPath): Transaction[] {
  let parsedJson: unknown;

  try {
    parsedJson = JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    throw new Error(`Unable to read transactions from ${path}: ${getErrorMessage(error)}`);
  }

  try {
    return [...transactionsSchema.parse(parsedJson)].sort(sortTransactionsAscending);
  } catch (error) {
    if (error instanceof ZodError) {
      const issues = error.issues.map((issue) => `${issue.path.join('.') || 'root'}: ${issue.message}`).join('; ');
      throw new Error(`Invalid transaction data in ${path}: ${issues}`);
    }

    throw error;
  }
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
