import test from 'node:test';
import assert from 'node:assert/strict';

import { financeTools, gastiFinanceAgent } from './index.ts';

test('finance tools include getFinanceContext for the Gasti finance agent', () => {
  assert.equal(financeTools.getFinanceContext.id, 'getFinanceContext');
});

test('finance tools include getFinancialMemory for the Gasti finance agent', () => {
  assert.equal(financeTools.getFinancialMemory.id, 'getFinancialMemory');
});

test('finance tools include updateFinancialMemory for the Gasti finance agent', () => {
  assert.equal(financeTools.updateFinancialMemory.id, 'updateFinancialMemory');
});

test('gastiFinanceAgent registers getFinanceContext as an available tool', () => {
  const registeredTools = (gastiFinanceAgent as unknown as { tools?: Record<string, unknown> }).tools;

  assert.ok(registeredTools);
  assert.ok(registeredTools.getFinanceContext);
});

test('gastiFinanceAgent registers getFinancialMemory as an available tool', () => {
  const registeredTools = (gastiFinanceAgent as unknown as { tools?: Record<string, unknown> }).tools;

  assert.ok(registeredTools);
  assert.ok(registeredTools.getFinancialMemory);
});

test('gastiFinanceAgent registers updateFinancialMemory as an available tool', () => {
  const registeredTools = (gastiFinanceAgent as unknown as { tools?: Record<string, unknown> }).tools;

  assert.ok(registeredTools);
  assert.ok(registeredTools.updateFinancialMemory);
});
