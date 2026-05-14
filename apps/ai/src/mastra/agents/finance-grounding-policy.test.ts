import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildFinanceGroundingPolicy,
  resolveBareMonthFromFinanceContext,
  type FinanceGroundingPolicy,
} from './finance-grounding-policy.ts';

function assertIncludesTools(policy: FinanceGroundingPolicy, expectedTools: readonly string[]): void {
  for (const expectedTool of expectedTools) {
    assert.ok(
      policy.acceptableFinanceTools.includes(expectedTool),
      `expected ${expectedTool} in acceptableFinanceTools: ${policy.acceptableFinanceTools.join(', ')}`,
    );
  }
}

test('dataset availability questions require finance context grounding', () => {
  const policy = buildFinanceGroundingPolicy('Que transacciones tenes registradas?');

  assert.equal(policy.questionType, 'dataset_availability');
  assert.equal(policy.requiresGrounding, true);
  assert.equal(policy.requiresFinanceContext, true);
  assert.equal(policy.bareMonthDetected, false);
  assert.equal(policy.coverageClaimsForbiddenWithoutEvidence, true);
  assertIncludesTools(policy, ['getFinanceContext']);
});

test('merchant spend questions require merchant-capable finance tools and detect bare month ambiguity', () => {
  const policy = buildFinanceGroundingPolicy('Cuánto gasté en Netflix en mayo?');

  assert.equal(policy.questionType, 'merchant_spend');
  assert.equal(policy.requiresGrounding, true);
  assert.equal(policy.requiresFinanceContext, true);
  assert.equal(policy.bareMonthDetected, true);
  assert.equal(policy.mustResolveBareMonthFromContext, true);
  assertIncludesTools(policy, ['getFinanceContext', 'findTransactionsTool']);
});

test('merchant spend questions with explicit year do not mark a bare month', () => {
  const policy = buildFinanceGroundingPolicy('Cuánto gasté en Netflix en mayo 2026?');

  assert.equal(policy.questionType, 'merchant_spend');
  assert.equal(policy.requiresGrounding, true);
  assert.equal(policy.requiresFinanceContext, false);
  assert.equal(policy.bareMonthDetected, false);
  assertIncludesTools(policy, ['findTransactionsTool']);
});

test('income-derived questions forbid unsupported income claims without current-turn evidence', () => {
  const policy = buildFinanceGroundingPolicy('Cuál es mi tasa de ahorro?');

  assert.equal(policy.questionType, 'income_sensitive');
  assert.equal(policy.requiresGrounding, true);
  assert.equal(policy.incomeClaimsForbiddenWithoutEvidence, true);
  assert.equal(policy.currentTurnEvidenceRequired, true);
});

test('bare month resolution picks the latest matching month when it is unambiguous', () => {
  const resolved = resolveBareMonthFromFinanceContext('mayo', [
    { year: 2026, month: 3, label: 'marzo de 2026' },
    { year: 2026, month: 4, label: 'abril de 2026' },
    { year: 2026, month: 5, label: 'mayo de 2026' },
  ]);

  assert.deepEqual(resolved, {
    status: 'resolved',
    year: 2026,
    month: 5,
    label: 'mayo de 2026',
  });
});

test('bare month resolution requires clarification when more than one year matches', () => {
  const resolved = resolveBareMonthFromFinanceContext('mayo', [
    { year: 2025, month: 5, label: 'mayo de 2025' },
    { year: 2026, month: 5, label: 'mayo de 2026' },
  ]);

  assert.deepEqual(resolved, {
    status: 'ambiguous',
    monthName: 'mayo',
    matchingLabels: ['mayo de 2025', 'mayo de 2026'],
  });
});
