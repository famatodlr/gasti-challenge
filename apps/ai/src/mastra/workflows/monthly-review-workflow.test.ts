import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildDeterministicMonthlyReviewAnswer,
  runMonthlyFinancialReviewWorkflow,
} from './monthly-review-workflow.ts';

const deterministicAnswerGenerator = async ({
  review,
  clarification,
}: Parameters<typeof buildDeterministicMonthlyReviewAnswer>[0]) =>
  buildDeterministicMonthlyReviewAnswer({ review, clarification });

test('monthly review workflow detects an explicit month and year', async () => {
  const result = await runMonthlyFinancialReviewWorkflow(
    { message: 'resumen financiero de mayo 2026', currentDate: '2026-05-13' },
    { answerGenerator: deterministicAnswerGenerator },
  );

  assert.equal(result.review?.period.month, 5);
  assert.equal(result.review?.period.year, 2026);
  assert.equal(result.review?.period.label, 'mayo 2026');
});

test('monthly review workflow detects "este mes" using the controlled current date', async () => {
  const result = await runMonthlyFinancialReviewWorkflow(
    { message: 'Cómo me fue este mes?', currentDate: '2026-05-06' },
    { answerGenerator: deterministicAnswerGenerator },
  );

  assert.equal(result.review?.period.month, 5);
  assert.equal(result.review?.period.year, 2026);
  assert.equal(result.review?.period.isPartial, true);
  assert.equal(result.review?.period.comparableDay, 6);
  assert.equal(result.review?.period.range.to, '2026-05-06');
  assert.equal(result.review?.comparison?.comparisonMode, 'same-day-of-month');
  assert.equal(result.review?.comparison?.baselineRange.to, '2026-04-06');
});

test('monthly review workflow produces May 2026 KPIs and drivers', async () => {
  const result = await runMonthlyFinancialReviewWorkflow(
    { message: 'Haceme un resumen financiero de mayo 2026', currentDate: '2026-05-13' },
    { answerGenerator: deterministicAnswerGenerator },
  );

  assert.equal(result.review?.kpis.totalSpending, 499698);
  assert.equal(result.review?.kpis.transactionCount, 15);
  assert.equal(result.review?.kpis.averageTransactionAmount, 33313);
  assert.equal(result.review?.topCategories[0]?.category, 'vivienda');
  assert.equal(result.review?.topCategories[0]?.amount, 250000);
  assert.equal(result.review?.topMerchants[0]?.merchant, 'Propietario');
  assert.equal(result.review?.largestExpenses[0]?.merchant, 'Propietario');
  assert.equal(result.review?.largestExpenses[0]?.amount, 250000);
});

test('monthly review workflow compares May 2026 against April 2026 same-day period', async () => {
  const result = await runMonthlyFinancialReviewWorkflow(
    { message: 'Monthly review de mayo', currentDate: '2026-05-13' },
    { answerGenerator: deterministicAnswerGenerator },
  );

  assert.equal(result.review?.comparison?.previousPeriodLabel, 'abril 2026 hasta el día 8');
  assert.equal(result.review?.comparison?.absoluteDifference, 165800);
  assert.equal(result.review?.comparison?.percentageDifference, 49.66);
  assert.equal(result.review?.comparison?.comparisonMode, 'same-day-of-month');
  assert.equal(result.review?.comparison?.baselineRange.from, '2026-04-01');
  assert.equal(result.review?.comparison?.baselineRange.to, '2026-04-08');
});

test('monthly review workflow answer uses real Markdown bullets for breakdown rows', async () => {
  const result = await runMonthlyFinancialReviewWorkflow(
    { message: 'Resumen de mayo 2026', currentDate: '2026-05-13' },
    { answerGenerator: deterministicAnswerGenerator },
  );

  assert.match(result.answer, /\n- \*\*Vivienda:\*\* ARS 250\.000/);
  assert.match(result.answer, /\n- \*\*Propietario:\*\* ARS 250\.000/);
  assert.doesNotMatch(result.answer, /(?:^|\n)\*\*[^*\n]+:\*\* ARS/m);
});

test('monthly review workflow returns a helpful clarification when the period is missing', async () => {
  const result = await runMonthlyFinancialReviewWorkflow(
    { message: 'Haceme un resumen financiero', currentDate: '2026-05-13' },
    { answerGenerator: deterministicAnswerGenerator },
  );

  assert.equal(result.review, undefined);
  assert.match(result.answer, /¿De qué mes querés que haga el resumen financiero\?/);
});
